import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';
import type { DocTreeNodeWire, DocBreadcrumbWire, DocNavLinkWire, TabWorkspaceLabels } from '@shared/tabWorkspaceWebviewProtocol';
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
  breadcrumb?: DocBreadcrumbWire[];
  children?: DocNavLinkWire[];
  lateralByType?: Record<string, DocNavLinkWire[]>;
  onSelectDoc: (path: string) => void;
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
            {breadcrumb && breadcrumb.length > 0 ? (
              <nav className="cp-breadcrumb" aria-label={labels.docBreadcrumb}>
                {breadcrumb.map((seg, i) => (
                  <span key={seg.path} className="cp-breadcrumb-segment">
                    {i > 0 ? <span className="cp-breadcrumb-sep" aria-hidden="true"> › </span> : null}
                    <button
                      type="button"
                      className={`cp-breadcrumb-link${seg.path === selectedPath ? ' cp-breadcrumb-current' : ''}`}
                      onClick={() => onSelectDoc(seg.path)}
                    >
                      {seg.title}
                    </button>
                  </span>
                ))}
              </nav>
            ) : null}
            {children && children.length > 0 ? (
              <div className="cp-doc-nav">
                <h5 className="cp-doc-nav-title">{labels.childDocsHeading}</h5>
                <ul className="cp-doc-nav-list">
                  {children.map((child) => (
                    <li key={child.path}>
                      <button type="button" className="cp-breadcrumb-link" onClick={() => onSelectDoc(child.path)}>
                        {child.title}
                      </button>
                      <span className="cp-meta"> ({child.level})</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {lateralByType && Object.keys(lateralByType).length > 0 ? (
              <div className="cp-doc-nav">
                <h5 className="cp-doc-nav-title">{labels.lateralLinksHeading}</h5>
                {Object.entries(lateralByType).map(([type, links]) => (
                  <div key={type} className="cp-doc-nav-group">
                    <p className="cp-meta">{type}</p>
                    <ul className="cp-doc-nav-list">
                      {links.map((link) => (
                        <li key={`${type}-${link.path}`}>
                          <button type="button" className="cp-breadcrumb-link" onClick={() => onSelectDoc(link.path)}>
                            {link.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}
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
