import { existsSync } from "node:fs";
import {
  compile as typespecCompile,
  createSuppressCodeFixes,
  NodeHost,
  Program,
  resolveCompilerOptions,
  applyCodeFixes,
  formatTypeSpec,
  CompilerOptions,
  Diagnostic,
  NoTarget,
} from "@typespec/compiler";

interface NodeLike {
  kind: number;
  parent?: {
    decorators?: readonly unknown[];
  };
}

function isNodeLike(value: unknown): value is NodeLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    typeof value.kind === "number"
  );
}

function hasNode(value: unknown): value is { node: NodeLike } {
  return (
    typeof value === "object" &&
    value !== null &&
    "node" in value &&
    isNodeLike(value.node)
  );
}

export function deduplicateDecoratorDiagnostics(
  diagnostics: readonly Diagnostic[],
): Diagnostic[] {
  const seenCodesByDeclaration = new Map<object, Set<string>>();

  return diagnostics.filter((diagnostic) => {
    const target = diagnostic.target;
    if (target === NoTarget) {
      return true;
    }

    const node = isNodeLike(target)
      ? target
      : hasNode(target)
        ? target.node
        : undefined;
    const declaration = node?.parent;
    if (
      declaration === undefined ||
      declaration.decorators === undefined ||
      !declaration.decorators.some((decorator) => decorator === node)
    ) {
      return true;
    }

    const seenCodes = seenCodesByDeclaration.get(declaration) ?? new Set();
    if (seenCodes.has(diagnostic.code)) {
      return false;
    }

    seenCodes.add(diagnostic.code);
    seenCodesByDeclaration.set(declaration, seenCodes);
    return true;
  });
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
  const codeFixes = createSuppressCodeFixes(
    deduplicateDecoratorDiagnostics(p.diagnostics),
    options.message || "Warnings auto-suppressed by @binkylabs/muzzle.",
  );
  await applyCodeFixes(p.host, codeFixes);
}

async function compile(
  entryPoint: string,
  compilerOptions: CompilerOptions,
): Promise<Program> {
  /* We prevent the compiler from writing files to disk by overriding the writeFile method on the NodeHost. */
  const originalWriteFile = NodeHost.writeFile;
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    NodeHost.writeFile = (_path: string, _content: string) => Promise.resolve();
    return await typespecCompile(NodeHost, entryPoint, compilerOptions);
  } finally {
    /* Restore the original writeFile method after compilation. */
    NodeHost.writeFile = originalWriteFile;
  }
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
  if (options.ruleSets.length === 0 && options.emitters.length === 0) {
    throw new Error("At least one rule set or emitter must be provided.");
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
      emit: options.emitters,
      linter: {
        extends: options.ruleSets,
      },
    },
  });

  // Create the TypeSpec program
  const program = await compile(options.entryPoint, compilerOptions);

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

  const sourceFiles = program.sourceFiles
    .keys()
    .filter((f) => !f.includes("node_modules"));
  await Promise.all(sourceFiles.map(formatSourceFile));
}

/** Options for suppressing TypeSpec diagnostics */
export interface SuppressionOptions {
  /** The entry point file for the TypeSpec program */
  entryPoint: string;
  /** The rule sets to apply. At least one rule or one emitter must be provided. */
  ruleSets: `${string}/${string}`[];
  /** The emitters to apply. At least one rule or one emitter must be provided. */
  emitters: string[];
  /** The message to include with each suppression directive */
  message?: string;
}
