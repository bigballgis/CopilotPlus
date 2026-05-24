/** Doc tree column layout for Architecture diagram — R-INT-5 */

export interface DocDiagramNodeLayout {
  path: string;
  title: string;
  level: string;
  stale?: boolean;
  x: number;
  y: number;
}

export interface DocDiagramEdgeLayout {
  from: string;
  to: string;
  kind: 'hierarchical' | 'lateral';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const LEVEL_COL: Record<string, number> = {
  system: 0,
  module: 1,
  feature: 2,
  component: 3,
};

const BOX_W = 128;
const BOX_H = 40;
const COL_GAP = 40;
const ROW_GAP = 12;

export function layoutDocDiagram(
  nodes: { path: string; title: string; level: string; stale?: boolean }[],
  edges: { from: string; to: string; kind: 'hierarchical' | 'lateral' }[]
): { nodes: DocDiagramNodeLayout[]; edges: DocDiagramEdgeLayout[]; width: number; height: number } {
  if (nodes.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  const byCol = new Map<number, typeof nodes>();
  for (const node of nodes) {
    const col = LEVEL_COL[node.level] ?? 0;
    const list = byCol.get(col) ?? [];
    list.push(node);
    byCol.set(col, list);
  }

  const layoutNodes: DocDiagramNodeLayout[] = [];
  let maxRows = 0;
  for (const [col, list] of byCol) {
    maxRows = Math.max(maxRows, list.length);
    list.forEach((node, row) => {
      layoutNodes.push({
        ...node,
        x: col * (BOX_W + COL_GAP) + 8,
        y: row * (BOX_H + ROW_GAP) + 8,
      });
    });
  }

  const pos = new Map(layoutNodes.map((n) => [n.path, n]));
  const layoutEdges: DocDiagramEdgeLayout[] = edges
    .map((edge) => {
      const from = pos.get(edge.from);
      const to = pos.get(edge.to);
      if (!from || !to) {
        return undefined;
      }
      return {
        ...edge,
        x1: from.x + BOX_W / 2,
        y1: from.y + BOX_H,
        x2: to.x + BOX_W / 2,
        y2: to.y,
      };
    })
    .filter((e): e is DocDiagramEdgeLayout => e !== undefined);

  const maxCol = Math.max(...[...byCol.keys()], 0);
  const width = (maxCol + 1) * (BOX_W + COL_GAP) + 16;
  const height = maxRows * (BOX_H + ROW_GAP) + 16;

  return { nodes: layoutNodes, edges: layoutEdges, width, height };
}

export const DOC_DIAGRAM_BOX_W = BOX_W;
export const DOC_DIAGRAM_BOX_H = BOX_H;
