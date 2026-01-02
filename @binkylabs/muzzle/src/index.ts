import { existsSync } from "node:fs";
import {
  compile,
  DiagnosticTarget,
  NodeHost,
  NoTarget,
  Program,
  resolveCompilerOptions,
  applyCodeFixes,
  formatTypeSpec,
  CodeFix,
  SourceLocation,
} from "@typespec/compiler";

import { findSuppressTarget } from "./typespec-imports.js";

/** A fix item with a grouping key and the actual code fix */
interface FixItem {
  groupingKey: string;
  fix: CodeFix;
}

/**
 * Creates a custom suppress code fix that places the suppression at a specific location.
 * @param suppressTarget The location where the suppression should be placed
 * @param code The diagnostic code to suppress
 * @param message The suppression message
 * @returns A CodeFix that adds the suppression directive
 */
function createCustomSuppressCodeFix(
  suppressTarget: SourceLocation,
  code: string,
  message: string,
): CodeFix {
  return {
    id: "suppress-custom",
    label: `Suppress warning: "${code}"`,
    fix: (context) => {
      const directive = `#suppress "${code}" "${message}"\n`;
      return context.prependText(suppressTarget, directive);
    },
  };
}

/**
 * Adds suppress directives for all warnings in the TypeSpec program.
 * @param p The TypeSpec program
 * @param options Options for suppressing warnings
 * @returns A promise that resolves when suppressions have been applied
 */
export async function suppressEverything(
  p: Program,
  options: Partial<Omit<SuppressionOptions, "entryPoint" | "ruleSets">> = {},
) {
  const fixes = p.diagnostics
    .filter((diag) => diag.severity === "warning" && diag.target !== NoTarget)
    .map((diag) => {
      const suppressTarget = findSuppressTarget(
        diag.target as DiagnosticTarget,
      );
      if (!suppressTarget) {
        return null;
      }
      const groupingKey = `${diag.code}-${suppressTarget.file.path}-${suppressTarget.pos}-${suppressTarget.end}`;
      return {
        groupingKey: groupingKey,
        fix: createCustomSuppressCodeFix(
          suppressTarget,
          diag.code,
          options.message || "Warnings auto-suppressed by @binkylabs/muzzle.",
        ),
      };
    })
    .filter((fix): fix is FixItem => fix !== null);

  // Group fixes by groupingKey and take first fix from each group
  const groupedFixes = new Map<string, FixItem>();
  for (const fix of fixes) {
    if (!groupedFixes.has(fix.groupingKey)) {
      groupedFixes.set(fix.groupingKey, fix);
    }
  }

  const codeFixes = Array.from(groupedFixes.values()).map((item) => item.fix);
  await applyCodeFixes(p.host, codeFixes);
}

async function formatSourceFile(filePath: string) {
  const sourceCode = await NodeHost.readFile(filePath);
  const formattedSource = await formatTypeSpec(sourceCode.text);
  await NodeHost.writeFile(filePath, formattedSource);
}
/**
 * Parses a TypeSpec program from the given entry point and applies suppressions for all warnings.
 * @param options Options for suppressing warnings
 */
export async function parseTypeSpecAndSuppressEverything(
  options: SuppressionOptions,
) {
  if (options.ruleSets.length === 0) {
    throw new Error("At least one rule set must be provided.");
  }

  if (!options.entryPoint) {
    throw new Error("A valid TypeSpec entry point must be provided.");
  }

  if (!existsSync(options.entryPoint)) {
    throw new Error(
      `Error: Entry file not found at path: ${options.entryPoint}`,
    );
  }

  // Load TypeSpec config (optional, for full project context)
  const [compilerOptions] = await resolveCompilerOptions(NodeHost, {
    cwd: process.cwd(),
    entrypoint: options.entryPoint,
    overrides: {
      linter: {
        extends: options.ruleSets,
      },
    },
  });

  // Create the TypeSpec program
  const program = await compile(NodeHost, options.entryPoint, compilerOptions);

  if (
    program.diagnostics.some(
      (d) => d.severity === "error" && d.code === "unknown-rule-set",
    )
  ) {
    console.error(
      "Error: Unknown rule set. Please check your linter configuration.",
    );
    process.exit(1);
  }

  await suppressEverything(program, options);

  const sourceFiles = Array.from(program.sourceFiles.keys()).filter(
    (f) => !f.includes("node_modules"),
  );
  await Promise.all(sourceFiles.map(formatSourceFile));
}

/** Options for suppressing TypeSpec diagnostics */
export interface SuppressionOptions {
  /** The entry point file for the TypeSpec program */
  entryPoint: string;
  /** The rule sets to apply. At least one rule set must be provided. */
  ruleSets: `${string}/${string}`[];
  /** The message to include with each suppression directive */
  message?: string;
}
