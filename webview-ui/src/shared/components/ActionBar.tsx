import type { ReactNode } from 'react';

interface ActionBarProps {
  children: ReactNode;
  className?: string;
}

export function ActionBar({ children, className }: ActionBarProps): JSX.Element {
  return <div className={`cp-actions ${className ?? ''}`.trim()}>{children}</div>;
}
