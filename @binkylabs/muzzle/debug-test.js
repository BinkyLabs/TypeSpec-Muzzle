import { compile, NodeHost, resolveCompilerOptions } from "@typespec/compiler";
import { getNodeForTarget } from "@typespec/compiler/ast";
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
    console.log("Target:", diag.target);
    const node = getNodeForTarget(diag.target);
    console.log("Node kind:", node?.kind);
    console.log("Node parent kind:", node?.parent?.kind);
    console.log("Node parent parent kind:", node?.parent?.parent?.kind);
    
    const suppressTarget = findSuppressTarget(diag.target);
    console.log("Suppress target:", suppressTarget);
  }
}
