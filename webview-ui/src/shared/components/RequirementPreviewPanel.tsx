import type {
  DocTreeNodeWire,
  DocBreadcrumbWire,
  DocNavLinkWire,
  DocTreePanelAction,
  TabWorkspaceLabels,
} from '@shared/tabWorkspaceWebviewProtocol';
import { DocPreviewContent } from './DocPreviewContent';
import { DocTreePicker } from './DocTreePicker';
import { postToHost } from '../vscode';

interface RequirementPreviewPanelProps {
  labels: TabWorkspaceLabels;
  panel: { heading: string; docCount: number; tree: DocTreeNodeWire[]; emptyText: string };
  selectedPath?: string;
  previewTitle?: string;
  previewMarkdown?: string;
  breadcrumb?: DocBreadcrumbWire[];
  children?: DocNavLinkWire[];
  lateralByType?: Record<string, DocNavLinkWire[]>;
  hasChildren?: boolean;
  canCreateChild?: boolean;
  missingSummary?: boolean;
  reviewBadge?: 'green' | 'yellow' | 'red';
  onSelectDoc: (path: string) => void;
  onDocTreeAction: (action: DocTreePanelAction) => void;
}

export function RequirementPreviewPanel({
  labels,
  panel,
  selectedPath,
  previewTitle,
  previewMarkdown,
  breadcrumb,
  children,
  lateralByType,
  hasChildren,
  canCreateChild,
  missingSummary,
  reviewBadge,
  onSelectDoc,
  onDocTreeAction,
}: RequirementPreviewPanelProps): JSX.Element {
  if (panel.docCount === 0) {
    return <p className="cp-meta">{panel.emptyText}</p>;
  }

  return (
    <div className="cp-req-split">
      <div className="cp-req-tree">
        <h4 className="cp-viz-title">{labels.requirementTree}</h4>
        <DocTreePicker
          nodes={panel.tree}
          selectedPath={selectedPath}
          ariaLabel={labels.requirementTree}
          labels={labels}
          onSelect={onSelectDoc}
          onCompactSubtree={(path) => postToHost({ type: 'compactDocSubtree', path })}
        />
      </div>
      <div className="cp-req-preview">
        <div className="cp-viz-header">
          <h4 className="cp-viz-title">{labels.requirementPreview}</h4>
        </div>
        <DocPreviewContent
          labels={labels}
          selectedPath={selectedPath}
          previewTitle={previewTitle}
          previewMarkdown={previewMarkdown}
          breadcrumb={breadcrumb}
          children={children}
          lateralByType={lateralByType}
          hasChildren={hasChildren}
          canCreateChild={canCreateChild}
          missingSummary={missingSummary}
          reviewBadge={reviewBadge}
          onSelectDoc={onSelectDoc}
          onDocTreeAction={onDocTreeAction}
        />
      </div>
    </div>
  );
}
