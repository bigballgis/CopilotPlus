import type { DocTreeNodeWire, TabWorkspaceLabels } from '@shared/tabWorkspaceWebviewProtocol';
import { Icon } from './Icon';

interface DocTreePickerProps {
  nodes: DocTreeNodeWire[];
  selectedPath?: string;
  ariaLabel: string;
  depth?: number;
  labels: Pick<TabWorkspaceLabels, 'staleBadge' | 'compactSubtree' | 'compactSubtreeAria'>;
  onSelect: (path: string) => void;
  onCompactSubtree?: (path: string) => void;
}

function ReviewBadge({ badge }: { badge?: 'green' | 'yellow' | 'red' }): JSX.Element | null {
  if (!badge) {
    return null;
  }
  return <span className={`review-${badge}`}> ●</span>;
}

export function DocTreePicker({
  nodes,
  selectedPath,
  ariaLabel,
  depth = 0,
  labels,
  onSelect,
  onCompactSubtree,
}: DocTreePickerProps): JSX.Element {
  return (
    <div className="cp-doc-tree" role="tree" aria-label={ariaLabel}>
      {nodes.map((node) => (
        <div key={node.path} role="treeitem" aria-expanded="true" aria-level={depth + 1}>
          <div className="cp-doc-tree-row" style={{ paddingLeft: depth * 12 + 8 }}>
            <button
              type="button"
              className={`cp-doc-tree-item ${selectedPath === node.path ? 'cp-doc-tree-item--selected' : ''}`}
              aria-label={node.title}
              aria-selected={selectedPath === node.path}
              onClick={() => onSelect(node.path)}
            >
              <Icon name="file" />
              {node.title}
              <ReviewBadge badge={node.reviewBadge} />
              {node.stale ? <span className="cp-stale-badge">{labels.staleBadge}</span> : null}
              <span className="cp-meta"> ({node.level})</span>
            </button>
            {node.stale && onCompactSubtree ? (
              <button
                type="button"
                className="cp-doc-tree-compact"
                aria-label={labels.compactSubtreeAria.replace('{0}', node.title)}
                onClick={() => onCompactSubtree(node.path)}
              >
                {labels.compactSubtree}
              </button>
            ) : null}
          </div>
          {node.children.length > 0 ? (
            <DocTreePicker
              nodes={node.children}
              selectedPath={selectedPath}
              ariaLabel={ariaLabel}
              depth={depth + 1}
              labels={labels}
              onSelect={onSelect}
              onCompactSubtree={onCompactSubtree}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
