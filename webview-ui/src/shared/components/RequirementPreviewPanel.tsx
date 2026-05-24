import type {
  DocTreeNodeWire,
  DocBreadcrumbWire,
  DocNavLinkWire,
  DocTreePanelAction,
  TabWorkspaceLabels,
} from '@shared/tabWorkspaceWebviewProtocol';
import { DocNavPreview } from './DocNavPreview';
import { DocTreeActionBar } from './DocTreeActionBar';
import { DocTreePicker } from './DocTreePicker';
import { MarkdownBody } from './MarkdownBody';
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
          {selectedPath ? (
            <DocTreeActionBar
              labels={labels}
              selectedPath={selectedPath}
              hasChildren={hasChildren}
              canCreateChild={canCreateChild}
              onAction={onDocTreeAction}
              onEdit={() => postToHost({ type: 'editDoc', path: selectedPath })}
              onOpen={() => postToHost({ type: 'openDoc', path: selectedPath })}
            />
          ) : null}
        </div>
        {previewTitle && previewMarkdown ? (
          <>
            <DocNavPreview
              labels={labels}
              selectedPath={selectedPath}
              breadcrumb={breadcrumb}
              children={children}
              lateralByType={lateralByType}
              onSelectDoc={onSelectDoc}
            />
            <p className="cp-meta">{previewTitle}</p>
            <div className="cp-req-preview-body">
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
        ) : (
          <p className="cp-meta">{labels.selectDocHint}</p>
        )}
      </div>
    </div>
  );
}
