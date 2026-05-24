import { useCallback, useMemo, useRef, useState } from 'react';
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';
import type { DocDiagramEdgeWire, DocTreeNodeWire, TabWorkspaceLabels } from '@shared/tabWorkspaceWebviewProtocol';
import {
  DOC_DIAGRAM_BOX_H,
  DOC_DIAGRAM_BOX_W,
  layoutDocDiagram,
} from '../layout/docDiagramLayout';
import { serializeSvgElement, svgMarkupToPngBase64 } from '../utils/diagramExport';
import { ActionBar } from './ActionBar';
import { postToHost } from '../vscode';

interface ArchitectureDiagramProps {
  labels: TabWorkspaceLabels;
  tree: DocTreeNodeWire[];
  edges: DocDiagramEdgeWire[];
}

function flattenNodes(nodes: DocTreeNodeWire[]): { path: string; title: string; level: string; stale?: boolean }[] {
  const out: { path: string; title: string; level: string; stale?: boolean }[] = [];
  const visit = (node: DocTreeNodeWire) => {
    out.push({ path: node.path, title: node.title, level: node.level, stale: node.stale });
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return out;
}

export function ArchitectureDiagram({ labels, tree, edges }: ArchitectureDiagramProps): JSX.Element {
  const [scale, setScale] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const flatNodes = useMemo(() => flattenNodes(tree), [tree]);
  const layout = useMemo(() => layoutDocDiagram(flatNodes, edges), [flatNodes, edges]);

  const fitToView = useCallback(() => {
    const container = scrollRef.current;
    if (!container || layout.width <= 0 || layout.height <= 0) {
      setScale(1);
      return;
    }
    const pad = 24;
    const sx = (container.clientWidth - pad) / layout.width;
    const sy = (container.clientHeight - pad) / layout.height;
    const next = Math.min(sx, sy);
    setScale(Math.min(Math.max(next, 0.25), 2));
  }, [layout.height, layout.width]);

  const exportDiagram = useCallback(
    async (format: 'svg' | 'png') => {
      const svg = svgRef.current;
      if (!svg) {
        return;
      }
      const markup = serializeSvgElement(svg);
      if (format === 'svg') {
        postToHost({ type: 'exportArchitectureDiagram', format: 'svg', content: markup });
        return;
      }
      try {
        const base64 = await svgMarkupToPngBase64(markup, layout.width, layout.height);
        postToHost({ type: 'exportArchitectureDiagram', format: 'png', content: base64 });
      } catch {
        postToHost({ type: 'exportArchitectureDiagram', format: 'svg', content: markup });
      }
    },
    [layout.height, layout.width]
  );

  return (
    <div className="cp-viz-panel">
      <div className="cp-viz-header">
        <h4 className="cp-viz-title">{labels.architectureDiagram}</h4>
        <ActionBar>
          <VSCodeButton appearance="icon" aria-label={labels.zoomIn} onClick={() => setScale((s) => Math.min(s + 0.15, 2))}>
            +
          </VSCodeButton>
          <VSCodeButton appearance="icon" aria-label={labels.zoomOut} onClick={() => setScale((s) => Math.max(s - 0.15, 0.25))}>
            −
          </VSCodeButton>
          <VSCodeButton appearance="secondary" aria-label={labels.fitView} onClick={fitToView}>
            {labels.fitView}
          </VSCodeButton>
          <VSCodeButton appearance="secondary" aria-label={labels.exportSvg} onClick={() => void exportDiagram('svg')}>
            {labels.exportSvg}
          </VSCodeButton>
          <VSCodeButton appearance="secondary" aria-label={labels.exportPng} onClick={() => void exportDiagram('png')}>
            {labels.exportPng}
          </VSCodeButton>
        </ActionBar>
      </div>
      <p className="cp-meta">
        <span className="cp-legend-line cp-legend-line--hier">{labels.hierarchicalEdge}</span>
        {' · '}
        <span className="cp-legend-line cp-legend-line--lat">{labels.lateralEdge}</span>
      </p>
      <div className="cp-viz-scroll" ref={scrollRef}>
        <div className="cp-viz-scale" style={{ transform: `scale(${scale})`, width: layout.width, height: layout.height }}>
          <svg
            ref={svgRef}
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
                  className={`cp-arch-node cp-arch-node--${node.level}${node.stale ? ' cp-arch-node--stale' : ''}`}
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
