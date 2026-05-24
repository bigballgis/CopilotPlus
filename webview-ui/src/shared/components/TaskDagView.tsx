import { layoutTaskDag, TASK_DAG_NODE_H, TASK_DAG_NODE_W } from '../layout/dagLayout';
import type { TaskEdgeWire, TaskRowWire } from '@shared/tabWorkspaceWebviewProtocol';

interface TaskDagViewProps {
  title: string;
  tasks: TaskRowWire[];
  edges: TaskEdgeWire[];
  runningTaskIds: string[];
}

function statusClass(status: string): string {
  switch (status) {
    case 'Running':
      return 'cp-dag-node--running';
    case 'Done':
      return 'cp-dag-node--done';
    case 'Failed':
      return 'cp-dag-node--failed';
    case 'Blocked':
      return 'cp-dag-node--blocked';
    default:
      return '';
  }
}

export function TaskDagView({ title, tasks, edges, runningTaskIds }: TaskDagViewProps): JSX.Element | null {
  if (tasks.length === 0) {
    return null;
  }

  const layout = layoutTaskDag(tasks, edges);
  const running = new Set(runningTaskIds);

  return (
    <div className="cp-viz-panel">
      <h4 className="cp-viz-title">{title}</h4>
      <div className="cp-viz-scroll">
        <svg
          className="cp-dag-svg"
          width={layout.width}
          height={layout.height}
          role="img"
          aria-label={title}
        >
          {layout.edges.map((edge) => (
            <g key={`${edge.from}-${edge.to}-${edge.kind ?? 'dependency'}`}>
              <line
                className={edge.kind === 'fork' ? 'cp-dag-edge cp-dag-edge--fork' : 'cp-dag-edge'}
                x1={edge.x1}
                y1={edge.y1}
                x2={edge.x2}
                y2={edge.y2}
                markerEnd={edge.kind === 'fork' ? 'url(#cp-dag-arrow-fork)' : 'url(#cp-dag-arrow)'}
              />
            </g>
          ))}
          <defs>
            <marker id="cp-dag-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" className="cp-dag-arrowhead" />
            </marker>
            <marker id="cp-dag-arrow-fork" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" className="cp-dag-arrowhead-fork" />
            </marker>
          </defs>
          {layout.nodes.map((node) => (
            <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
              <rect
                className={`cp-dag-node ${statusClass(node.status)} ${running.has(node.id) ? 'cp-dag-node--active' : ''}`}
                width={TASK_DAG_NODE_W}
                height={TASK_DAG_NODE_H}
                rx="6"
              />
              <text className="cp-dag-node-id" x={8} y={16}>
                {node.id}
              </text>
              <text className="cp-dag-node-title" x={8} y={32}>
                {node.title.length > 14 ? `${node.title.slice(0, 14)}…` : node.title}
              </text>
              <text className="cp-dag-node-status" x={TASK_DAG_NODE_W - 8} y={16} textAnchor="end">
                {node.status}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
