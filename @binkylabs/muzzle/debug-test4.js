import { compile, NodeHost, resolveCompilerOptions, createSuppressCodeFix, getSourceLocation } from "@typespec/compiler";
import { getNodeForTarget, SyntaxKind } from "@typespec/compiler/ast";
import { findSuppressTarget } from "./dist/src/typespec-imports.js";

const testFile = "./manual-test/test.tsp";

const [options] = await resolveCompilerOptions(NodeHost, {
  cwd: process.cwd(),
  entrypoint: testFile,
  overrides: {
    linter: {
      extends: ["@azure-tools/typespec-azure-rulesets/data-plane"],
    },
  },
});

const program = await compile(NodeHost, testFile, options);

console.log("Diagnostics:");
for (const diag of program.diagnostics) {
  if (diag.severity === "warning" && diag.code.includes("union")) {
    console.log("\nDiagnostic:", diag.code);
    console.log("Original target:", diag.target);
    
    const originalNode = getNodeForTarget(diag.target);
    console.log("\nOriginal node location:", getSourceLocation(originalNode));
    
    const suppressTarget = findSuppressTarget(diag.target);
    console.log("\nSuppress target location:", suppressTarget);
    
    const fix = createSuppressCodeFix(diag.target, diag.code, "Test message");
    console.log("\nCode fix:", JSON.stringify(fix, null, 2));
  }
}
