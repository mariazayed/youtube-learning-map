import type { MindMapNode } from '@learnmap/contracts';
import type { Edge } from '@xyflow/react';

export function mindMapEdges(nodes: MindMapNode[]): Edge[] {
  return nodes
    .filter((node): node is MindMapNode & { parentId: string } => node.parentId !== null)
    .map((node) => ({
      id: `${node.parentId}-${node.id}`,
      source: node.parentId,
      target: node.id,
    }));
}

export function ancestorIds(nodes: MindMapNode[], nodeId: string): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ancestors: string[] = [];
  const seen = new Set<string>();
  let parentId = byId.get(nodeId)?.parentId ?? null;
  while (parentId && !seen.has(parentId)) {
    ancestors.push(parentId);
    seen.add(parentId);
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return ancestors;
}

export function visibleMindMapNodes(
  nodes: MindMapNode[],
  collapsedIds: ReadonlySet<string>,
): MindMapNode[] {
  return nodes.filter(
    (node) => !ancestorIds(nodes, node.id).some((ancestor) => collapsedIds.has(ancestor)),
  );
}

export function matchingMindMapNodes(
  nodes: MindMapNode[],
  search: string,
): MindMapNode[] {
  const normalized = search.trim().toLocaleLowerCase();
  if (!normalized) return [];
  return nodes.filter((node) =>
    `${node.title} ${node.explanation}`.toLocaleLowerCase().includes(normalized),
  );
}

export function formatTimestamp(seconds: number): string {
  const bounded = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(bounded / 3_600);
  const minutes = Math.floor((bounded % 3_600) / 60);
  const remaining = bounded % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
    : `${minutes}:${String(remaining).padStart(2, '0')}`;
}
