import type { ReactNode } from 'react';

interface PanelShellProps {
  title?: string;
  header?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function PanelShell({ title, header, children, className }: PanelShellProps): JSX.Element {
  return (
    <section className={`cp-panel ${className ?? ''}`.trim()}>
      {header}
      {title ? <h3 className="cp-panel-title">{title}</h3> : null}
      {children}
    </section>
  );
}
