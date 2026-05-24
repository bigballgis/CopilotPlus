import type {
  DocBreadcrumbWire,
  DocNavLinkWire,
  DocTreePanelAction,
  TabWorkspaceLabels,
} from '@shared/tabWorkspaceWebviewProtocol';
import { DocNavPreview } from './DocNavPreview';
import { DocTreeActionBar } from './DocTreeActionBar';
import { MarkdownBody } from './MarkdownBody';
import { ReviewBadge } from './ReviewBadge';
import { postToHost } from '../vscode';

export interface DocPreviewContentProps {
  labels: TabWorkspaceLabels;
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

function reviewBadgeLabel(
  labels: Pick<TabWorkspaceLabels, 'reviewBadgeGreen' | 'reviewBadgeYellow' | 'reviewBadgeRed'>,
  badge?: 'green' | 'yellow' | 'red'
): string | undefined {
  if (!badge) {
    return undefined;
  }
  if (badge === 'green') {
    return labels.reviewBadgeGreen;
  }
  if (badge === 'yellow') {
    return labels.reviewBadgeYellow;
  }
  return labels.reviewBadgeRed;
}

export function DocPreviewContent({
  labels,
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
}: DocPreviewContentProps): JSX.Element {
  if (!previewTitle || !previewMarkdown) {
    return <p className="cp-meta">{labels.selectDocHint}</p>;
  }

  return (
    <>
      {selectedPath ? (
        <DocTreeActionBar
          labels={labels}
          selectedPath={selectedPath}
          hasChildren={hasChildren}
          canCreateChild={canCreateChild}
          missingSummary={missingSummary}
          onAction={onDocTreeAction}
          onEdit={() => postToHost({ type: 'editDoc', path: selectedPath })}
          onOpen={() => postToHost({ type: 'openDoc', path: selectedPath })}
        />
      ) : null}
      <DocNavPreview
        labels={labels}
        selectedPath={selectedPath}
        breadcrumb={breadcrumb}
        children={children}
        lateralByType={lateralByType}
        onSelectDoc={onSelectDoc}
      />
      <p className="cp-meta cp-preview-title">
        <ReviewBadge badge={reviewBadge} label={reviewBadgeLabel(labels, reviewBadge)} />
        {previewTitle}
      </p>
      <div className="cp-doc-preview-body">
        <MarkdownBody
          text={previewMarkdown}
          onLinkClick={(href) => {
            if (href.startsWith('.copilotPlus/docs/') || href.includes('.copilotPlus/docs/')) {
              const path = href.startsWith('.') ? href : `.copilotPlus/docs/${href.split('.copilotPlus/docs/')[1]}`;
              onSelectDoc(path.replace(/^\.\//, ''));
            }
          }}
        />
      </div>
    </>
  );
}
