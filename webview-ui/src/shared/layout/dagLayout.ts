/** DAG layer layout for Task panel — R-INT-4 */

export interface DagLayoutNode {
  id: string;
  title: string;
  status: string;
  x: number;
  y: number;
}

export interface DagLayoutEdge {
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const NODE_W = 120;
const NODE_H = 44;
const GAP_X = 24;
const GAP_Y = 56;

export function layoutTaskDag(
  tasks: { id: string; title: string; status: string; dependsOn: string[] }[],
  edges: { from: string; to: string }[]
): { nodes: DagLayoutNode[]; edges: DagLayoutEdge[]; width: number; height: number } {
  if (tasks.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  const layers = new Map<string, number>();
  const byId = new Map(tasks.map((t) => [t.id, t]));

  const layerOf = (id: string, visiting = new Set<string>()): number => {
    if (layers.has(id)) {
      return layers.get(id)!;
    }
    if (visiting.has(id)) {
      return 0;
    }
    visiting.add(id);
    const task = byId.get(id);
    const deps = task?.dependsOn ?? [];
    const layer = deps.length === 0 ? 0 : Math.max(...deps.map((d) => layerOf(d, visiting))) + 1;
    layers.set(id, layer);
    return layer;
  };

  for (const task of tasks) {
    layerOf(task.id);
  }

  const grouped = new Map<number, typeof tasks>();
  for (const task of tasks) {
    const layer = layers.get(task.id) ?? 0;
    const list = grouped.get(layer) ?? [];
    list.push(task);
    grouped.set(layer, list);
  }

  const nodes: DagLayoutNode[] = [];
  let maxLayer = 0;
  for (const [layer, list] of grouped) {
    maxLayer = Math.max(maxLayer, layer);
    list.forEach((task, index) => {
      nodes.push({
        id: task.id,
        title: task.title,
        status: task.status,
        x: layer * (NODE_W + GAP_X) + 8,
        y: index * (NODE_H + GAP_Y) + 8,
      });
    });
  }

  const pos = new Map(nodes.map((n) => [n.id, n]));
  const layoutEdges: DagLayoutEdge[] = edges
    .map((edge) => {
      const from = pos.get(edge.from);
      const to = pos.get(edge.to);
      if (!from || !to) {
        return undefined;
      }
      return {
        from: edge.from,
        to: edge.to,
        x1: from.x + NODE_W,
        y1: from.y + NODE_H / 2,
        x2: to.x,
        y2: to.y + NODE_H / 2,
      };
    })
    .filter((e): e is DagLayoutEdge => e !== undefined);

  const width = (maxLayer + 1) * (NODE_W + GAP_X) + 16;
  const height =
    Math.max(...[...grouped.values()].map((list) => list.length), 1) * (NODE_H + GAP_Y) + 16;

  return { nodes, edges: layoutEdges, width, height };
}

export const TASK_DAG_NODE_W = NODE_W;
export const TASK_DAG_NODE_H = NODE_H;
