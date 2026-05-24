import type { ReviewBadge as ReviewBadgeKind } from '@shared/tabWorkspaceWebviewProtocol';

interface ReviewBadgeProps {
  badge?: ReviewBadgeKind;
  label?: string;
}

export function ReviewBadge({ badge, label }: ReviewBadgeProps): JSX.Element | null {
  if (!badge) {
    return null;
  }
  return (
    <span className={`cp-review-badge review-${badge}`} title={label} aria-label={label}>
      ●
    </span>
  );
}
