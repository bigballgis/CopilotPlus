import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';
import type { DocTreeNodeWire, TabWorkspaceLabels } from '@shared/tabWorkspaceWebviewProtocol';
import { ActionBar } from './ActionBar';
import { DocTreePicker } from './DocTreePicker';
import { MarkdownBody } from './MarkdownBody';
import { postToHost } from '../vscode';

interface RequirementPreviewPanelProps {
  labels: TabWorkspaceLabels;
  panel: { heading: string; docCount: number; tree: DocTreeNodeWire[]; emptyText: string };
  selectedPath?: string;
  previewTitle?: string;
  previewMarkdown?: string;
  onSelectDoc: (path: string) => void;
}

export function RequirementPreviewPanel({
  labels,
  panel,
  selectedPath,
  previewTitle,
  previewMarkdown,
  onSelectDoc,
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
            <ActionBar>
              <VSCodeButton
                appearance="secondary"
                aria-label={labels.editDoc}
                onClick={() => postToHost({ type: 'editDoc', path: selectedPath })}
              >
                {labels.editDoc}
              </VSCodeButton>
              <VSCodeButton
                appearance="secondary"
                aria-label={labels.openDoc}
                onClick={() => postToHost({ type: 'openDoc', path: selectedPath })}
              >
                {labels.openDoc}
              </VSCodeButton>
            </ActionBar>
          ) : null}
        </div>
        {previewTitle && previewMarkdown ? (
          <>
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
