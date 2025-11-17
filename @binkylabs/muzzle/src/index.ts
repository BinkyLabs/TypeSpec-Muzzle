import { existsSync } from "node:fs";
import {
  compile,
  createSuppressCodeFix,
  DiagnosticTarget,
  NodeHost,
  NoTarget,
  Program,
  resolveCompilerOptions,
  applyCodeFixes,
  formatTypeSpec,
} from "@typespec/compiler";

import { findSuppressTarget } from "./typespec-imports.js";

/**
 * Adds suppress directives for all warnings in the TypeSpec program.
 * @param p The TypeSpec program
 * @param options Options for suppressing warnings
 * @returns A promise that resolves when suppressions have been applied
 */
export async function suppressEverything(p: Program, options: Partial<Omit<SuppressionOptions, "entryPoint" | "ruleSets">> = {}) {
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
              options.message || "Warnings auto-suppressed by @binkylabs/muzzle.",
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
/**
 * Parses a TypeSpec program from the given entry point and applies suppressions for all warnings.
 * @param options Options for suppressing warnings
 */
export async function parseTypeSpecAndSuppressEverything(options: SuppressionOptions) {
  if (options.ruleSets.length === 0) {
    throw new Error("At least one rule set must be provided.");
  }

  if (!options.entryPoint) {
    throw new Error("A valid TypeSpec entry point must be provided.");
  }

  if (!existsSync(options.entryPoint)) {
    throw new Error(`Error: Entry file not found at path: ${options.entryPoint}`);
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
      (d) => d.severity === "error" && d.code === "unknown-rule-set"
    )
  ) {
    console.error(
      "Error: Unknown rule set. Please check your linter configuration."
    );
    process.exit(1);
  }

  await suppressEverything(program, options);

  const sourceFiles = program.sourceFiles
    .keys()
    .filter((f) => !f.includes("node_modules"));
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
