import { existsSync } from "node:fs";
import {
  compile,
  createSuppressCodeFix,
  DiagnosticTarget,
  NodeHost,
  NoTarget,
  Program,
  resolveCompilerOptions,
  resolvePath,
  applyCodeFixes,
  formatTypeSpec,
} from "@typespec/compiler";

import { findSuppressTarget } from "./typespec-imports.js";

/**
 * Adds suppress directives for all warnings in the TypeSpec program.
 * @param p The TypeSpec program
 * @returns A promise that resolves when suppressions have been applied
 */
export async function suppressEverything(p: Program) {
  const codeFixes = Array.from(
    Map.groupBy(
      p.diagnostics
        .filter(
          (diag) => diag.severity === "warning" && diag.target !== NoTarget
        )
        .map((diag) => {
          const suppressTarget = findSuppressTarget(
            diag.target as DiagnosticTarget
          );
          const groupingKey = suppressTarget
            ? `${diag.code}-${suppressTarget.file.path}-${suppressTarget.pos}-${suppressTarget.end}`
            : `no-target-${diag.code}`;
          return {
            groupingKey: groupingKey,
            fix: createSuppressCodeFix(
              diag.target as DiagnosticTarget,
              diag.code,
              "Auto-suppressed warnings non-applicable rules during import."
            ),
          };
        }),
      (fix) => fix.groupingKey
    )
    .entries()
    .map((group) => group[1][0].fix)
  );
  await applyCodeFixes(p.host, codeFixes);
}

async function formatSourceFile(filePath: string) {
  const sourceCode = await NodeHost.readFile(filePath);
  const formattedSource = await formatTypeSpec(sourceCode.text);
  await NodeHost.writeFile(filePath, formattedSource);
}

async function parseTypeSpec(entryPoint: string, ruleSets: `${string}/${string}`[]) {
  if (ruleSets.length === 0) {
    throw new Error("At least one rule set must be provided.");
  }

  if (!entryPoint) {
    throw new Error("A valid TypeSpec entry point must be provided.");
  }

  if (!existsSync(entryPoint)) {
    throw new Error(`Error: Entry file not found at path: ${entryPoint}`);
  }

  // Load TypeSpec config (optional, for full project context)
  const [options, _] = await resolveCompilerOptions(NodeHost, {
    cwd: process.cwd(),
    entrypoint: entryPoint,
    overrides: {
      linter: {
        extends: ruleSets,
      },
    },
  });

  // Create the TypeSpec program
  const program = await compile(NodeHost, entryPoint, options);

  if (
    program.diagnostics.some(
      (d) => d.severity === "error" && d.code === "unknown-rule-set"
    )
  ) {
    console.error(
      "Error: Unknown rule set. Please check your linter configuration."
    );
    process.exit(1);
  }

  await suppressEverything(program);

  const sourceFiles = program.sourceFiles
    .keys()
    .filter((f) => !f.includes("node_modules"));
  await Promise.all(sourceFiles.map(formatSourceFile));
}

function parseCliArguments(args: string[]): {
  entryPoint: string | undefined;
  ruleSets: `${string}/${string}`[];
} {
  let entryPoint: string | undefined;
  const ruleSets: `${string}/${string}`[] = [];

  for (let i = 0; i < args.length; ) {
    const arg = args[i];
    
    if (arg === "--rule-set" || arg === "-r") {
      const ruleSet = args[i + 1];
      if (!ruleSet || ruleSet.startsWith("-")) {
        console.error(`Error: ${arg} requires a value`);
        process.exit(1);
      }
      ruleSets.push(ruleSet as `${string}/${string}`);
      i += 2; // Skip both the flag and its value
    } else if (arg.startsWith("-")) {
      console.error(`Error: Unknown argument: ${arg}`);
      process.exit(1);
    } else {
      // First non-flag argument is the entry point
      if (!entryPoint) {
        entryPoint = resolvePath(arg);
      }
      i++;
    }
  }

  return { entryPoint, ruleSets };
}

// Only run CLI code when executed directly, not when imported
if (import.meta.url === `file://${process.argv[1]}`.replaceAll("\\", "/")) {
  const { entryPoint, ruleSets } = parseCliArguments(process.argv.slice(2));

  try {
    await parseTypeSpec(entryPoint!, ruleSets);
  } catch (err) {
    console.error("An error occurred while parsing TypeSpec:", err);
    process.exit(1);
  }
}
