import type { DocTreeNodeWire } from '@shared/tabWorkspaceWebviewProtocol';
import { Icon } from './Icon';

interface DocTreePickerProps {
  nodes: DocTreeNodeWire[];
  selectedPath?: string;
  ariaLabel: string;
  depth?: number;
  onSelect: (path: string) => void;
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
  onSelect,
}: DocTreePickerProps): JSX.Element {
  return (
    <div className="cp-doc-tree" role="tree" aria-label={ariaLabel}>
      {nodes.map((node) => (
        <div key={node.path} role="treeitem" aria-expanded="true" aria-level={depth + 1}>
          <button
            type="button"
            className={`cp-doc-tree-item ${selectedPath === node.path ? 'cp-doc-tree-item--selected' : ''}`}
            style={{ paddingLeft: depth * 12 + 8 }}
            aria-label={node.title}
            aria-selected={selectedPath === node.path}
            onClick={() => onSelect(node.path)}
          >
            <Icon name="file" />
            {node.title}
            <ReviewBadge badge={node.reviewBadge} />
            <span className="cp-meta"> ({node.level})</span>
          </button>
          {node.children.length > 0 ? (
            <DocTreePicker
              nodes={node.children}
              selectedPath={selectedPath}
              ariaLabel={ariaLabel}
              depth={depth + 1}
              onSelect={onSelect}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
