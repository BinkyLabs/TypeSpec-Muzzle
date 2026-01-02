import { compile, NodeHost, resolveCompilerOptions } from "@typespec/compiler";
import { getNodeForTarget, SyntaxKind } from "@typespec/compiler/ast";

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
    const node = getNodeForTarget(diag.target);
    
    console.log("Node kind:", node?.kind, "=>", SyntaxKind[node?.kind]);
    console.log("Parent kind:", node?.parent?.kind, "=>", SyntaxKind[node?.parent?.kind]);
    
    if (node?.parent?.parent) {
      const grandParent = node.parent.parent;
      console.log("GrandParent kind:", grandParent.kind, "=>", SyntaxKind[grandParent.kind]);
      console.log("GrandParent has 'is'?", 'is' in grandParent);
      console.log("GrandParent.is === node.parent?", grandParent.is === node.parent);
      console.log("GrandParent.is:", grandParent.is);
      console.log("node.parent:", node.parent);
      console.log("Are they same?", grandParent.is === node.parent);
    }
  }
}
