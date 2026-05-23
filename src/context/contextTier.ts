/** Context tier classification — R-CTX-8 */

import type { ContextTier } from '../shared/types';

export function resolveContextTier(
  maxInputTokens: number | undefined,
  override: 'auto' | 's' | 'm' | 'l'
): ContextTier {
  if (override === 's') {
    return 'S';
  }
  if (override === 'm') {
    return 'M';
  }
  if (override === 'l') {
    return 'L';
  }
  const tokens = maxInputTokens ?? 100_000;
  if (tokens > 500_000) {
    return 'L';
  }
  if (tokens >= 100_000) {
    return 'M';
  }
  return 'S';
}
