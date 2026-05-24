/** Codicon helper — requires codicon.css loaded by host. */

interface IconProps {
  name: string;
  className?: string;
}

export function Icon({ name, className }: IconProps): JSX.Element {
  return <span className={`codicon codicon-${name} cp-icon ${className ?? ''}`.trim()} aria-hidden="true" />;
}
