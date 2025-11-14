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

async function suppressEverything(p: Program) {
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

// Path to your TypeSpec file or project
const entryPoint = resolvePath(
  process.argv[2]
);

if (!entryPoint) {
  console.error("Error: Please provide a valid TypeSpec file path.");
  process.exit(1);
}

if (!existsSync(entryPoint)) {
  console.error(`Error: Entry file not found at path: ${entryPoint}`);
  process.exit(1);
}

async function formatSourceFile(filePath: string) {
  const sourceCode = await NodeHost.readFile(filePath);
  const formattedSource = await formatTypeSpec(sourceCode.text);
  await NodeHost.writeFile(filePath, formattedSource);
}

async function parseTypeSpec() {
  // Load TypeSpec config (optional, for full project context)
  const [options, _] = await resolveCompilerOptions(NodeHost, {
    cwd: process.cwd(),
    entrypoint: entryPoint,
    overrides: {
      linter: {
        extends: ["@azure-tools/typespec-azure-rulesets/data-plane"],
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

try {
  await parseTypeSpec();
} catch (err) {
  console.error("An error occurred while parsing TypeSpec:", err);
  process.exit(1);
}
