import { compile, NodeHost, resolveCompilerOptions, getSourceLocation } from "@typespec/compiler";
import { getNodeForTarget, SyntaxKind } from "@typespec/compiler/ast";

// Inline findSuppressNode to debug
function findSuppressNode(node) {
  console.log("  findSuppressNode called with kind:", node.kind, "=>", SyntaxKind[node.kind]);
  
  switch (node.kind) {
    case SyntaxKind.Identifier:
    case SyntaxKind.TypeReference:
    case SyntaxKind.UnionExpression:
    case SyntaxKind.ModelExpression:
      console.log("  -> Walking up to parent");
      return findSuppressNode(node.parent);
    default:
      console.log("  -> In default case");
      // Check if this node is the 'is' or 'extends' expression of a ModelStatement or ScalarStatement
      if (node.parent) {
        console.log("  -> Has parent, kind:", node.parent.kind, "=>", SyntaxKind[node.parent.kind]);
        if (node.parent.kind === SyntaxKind.ModelStatement) {
          const modelParent = node.parent;
          console.log("  -> Parent is ModelStatement");
          console.log("  -> modelParent.is === node?", modelParent.is === node);
          console.log("  -> modelParent.extends === node?", modelParent.extends === node);
          if (modelParent.is === node || modelParent.extends === node) {
            console.log("  -> Returning ModelStatement!");
            return node.parent;
          }
        }
      }
      console.log("  -> Returning current node");
      return node;
  }
}

function findSuppressTarget(target) {
  if ("file" in target) {
    return target;
  }
  
  const nodeTarget = getNodeForTarget(target);
  if (!nodeTarget) return undefined;
  
  const node = findSuppressNode(nodeTarget);
  return getSourceLocation(node);
}

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
    console.log("Finding suppress target...");
    const suppressTarget = findSuppressTarget(diag.target);
    console.log("\nFinal suppress target pos:", suppressTarget.pos, "end:", suppressTarget.end);
  }
}
