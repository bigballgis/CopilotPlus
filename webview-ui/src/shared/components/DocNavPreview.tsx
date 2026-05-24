import type { DocBreadcrumbWire, DocNavLinkWire, TabWorkspaceLabels } from '@shared/tabWorkspaceWebviewProtocol';

interface DocNavPreviewProps {
  labels: Pick<TabWorkspaceLabels, 'docBreadcrumb' | 'childDocsHeading' | 'lateralLinksHeading'>;
  selectedPath?: string;
  breadcrumb?: DocBreadcrumbWire[];
  children?: DocNavLinkWire[];
  lateralByType?: Record<string, DocNavLinkWire[]>;
  onSelectDoc: (path: string) => void;
}

export function DocNavPreview({
  labels,
  selectedPath,
  breadcrumb,
  children,
  lateralByType,
  onSelectDoc,
}: DocNavPreviewProps): JSX.Element | null {
  const hasBreadcrumb = breadcrumb && breadcrumb.length > 0;
  const hasChildren = children && children.length > 0;
  const hasLateral = lateralByType && Object.keys(lateralByType).length > 0;
  if (!hasBreadcrumb && !hasChildren && !hasLateral) {
    return null;
  }

  return (
    <>
      {hasBreadcrumb ? (
        <nav className="cp-breadcrumb" aria-label={labels.docBreadcrumb}>
          {breadcrumb!.map((seg, i) => (
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
      {hasChildren ? (
        <div className="cp-doc-nav">
          <h5 className="cp-doc-nav-title">{labels.childDocsHeading}</h5>
          <ul className="cp-doc-nav-list">
            {children!.map((child) => (
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
      {hasLateral ? (
        <div className="cp-doc-nav">
          <h5 className="cp-doc-nav-title">{labels.lateralLinksHeading}</h5>
          {Object.entries(lateralByType!).map(([type, links]) => (
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
    </>
  );
}
