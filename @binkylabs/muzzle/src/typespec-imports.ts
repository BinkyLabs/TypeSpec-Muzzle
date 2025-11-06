import {
  DiagnosticTarget,
  getSourceLocation,
  SourceLocation,
} from "@typespec/compiler";

import { getNodeForTarget, Node, SyntaxKind } from "@typespec/compiler/ast";

export function findSuppressTarget(
  target: DiagnosticTarget
): SourceLocation | undefined {
  if ("file" in target) {
    return target;
  }

  const nodeTarget = getNodeForTarget(target);
  if (!nodeTarget) return undefined;

  const node = findSuppressNode(nodeTarget);
  return getSourceLocation(node);
}

/** Find the node where the suppression should be applied */
function findSuppressNode(node: Node): Node {
  switch (node.kind) {
    case SyntaxKind.Identifier:
    case SyntaxKind.TypeReference:
    case SyntaxKind.UnionExpression:
    case SyntaxKind.ModelExpression:
      return findSuppressNode(node.parent!);
    default:
      return node;
  }
}
