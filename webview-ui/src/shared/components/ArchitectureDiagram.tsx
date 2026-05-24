import { useMemo, useState } from 'react';
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';
import type { DocDiagramEdgeWire, DocTreeNodeWire, TabWorkspaceLabels } from '@shared/tabWorkspaceWebviewProtocol';
import {
  DOC_DIAGRAM_BOX_H,
  DOC_DIAGRAM_BOX_W,
  layoutDocDiagram,
} from '../layout/docDiagramLayout';
import { ActionBar } from './ActionBar';
import { postToHost } from '../vscode';

interface ArchitectureDiagramProps {
  labels: TabWorkspaceLabels;
  tree: DocTreeNodeWire[];
  edges: DocDiagramEdgeWire[];
}

function flattenNodes(nodes: DocTreeNodeWire[]): { path: string; title: string; level: string }[] {
  const out: { path: string; title: string; level: string }[] = [];
  const visit = (node: DocTreeNodeWire) => {
    out.push({ path: node.path, title: node.title, level: node.level });
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return out;
}

export function ArchitectureDiagram({ labels, tree, edges }: ArchitectureDiagramProps): JSX.Element {
  const [scale, setScale] = useState(1);
  const flatNodes = useMemo(() => flattenNodes(tree), [tree]);
  const layout = useMemo(() => layoutDocDiagram(flatNodes, edges), [flatNodes, edges]);

  return (
    <div className="cp-viz-panel">
      <div className="cp-viz-header">
        <h4 className="cp-viz-title">{labels.architectureDiagram}</h4>
        <ActionBar>
          <VSCodeButton appearance="icon" aria-label={labels.zoomIn} onClick={() => setScale((s) => Math.min(s + 0.15, 2))}>
            +
          </VSCodeButton>
          <VSCodeButton appearance="icon" aria-label={labels.zoomOut} onClick={() => setScale((s) => Math.max(s - 0.15, 0.5))}>
            −
          </VSCodeButton>
          <VSCodeButton appearance="secondary" aria-label={labels.fitView} onClick={() => setScale(1)}>
            {labels.fitView}
          </VSCodeButton>
        </ActionBar>
      </div>
      <p className="cp-meta">
        <span className="cp-legend-line cp-legend-line--hier">{labels.hierarchicalEdge}</span>
        {' · '}
        <span className="cp-legend-line cp-legend-line--lat">{labels.lateralEdge}</span>
      </p>
      <div className="cp-viz-scroll">
        <div className="cp-viz-scale" style={{ transform: `scale(${scale})`, width: layout.width, height: layout.height }}>
          <svg
            className="cp-arch-svg"
            width={layout.width}
            height={layout.height}
            role="img"
            aria-label={labels.architectureDiagram}
          >
          {layout.edges.map((edge) => (
            <line
              key={`${edge.kind}-${edge.from}-${edge.to}`}
              className={edge.kind === 'lateral' ? 'cp-arch-edge cp-arch-edge--lateral' : 'cp-arch-edge'}
              x1={edge.x1}
              y1={edge.y1}
              x2={edge.x2}
              y2={edge.y2}
            />
          ))}
          {layout.nodes.map((node) => (
            <g
              key={node.path}
              className="cp-arch-node-group"
              onClick={() => postToHost({ type: 'openDoc', path: node.path })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  postToHost({ type: 'openDoc', path: node.path });
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={node.title}
            >
              <rect
                className={`cp-arch-node cp-arch-node--${node.level}`}
                x={node.x}
                y={node.y}
                width={DOC_DIAGRAM_BOX_W}
                height={DOC_DIAGRAM_BOX_H}
                rx="6"
              />
              <text className="cp-arch-node-level" x={node.x + 8} y={node.y + 14}>
                {node.level}
              </text>
              <text className="cp-arch-node-title" x={node.x + 8} y={node.y + 30}>
                {node.title.length > 16 ? `${node.title.slice(0, 16)}…` : node.title}
              </text>
            </g>
          ))}
        </svg>
        </div>
      </div>
    </div>
  );
}
