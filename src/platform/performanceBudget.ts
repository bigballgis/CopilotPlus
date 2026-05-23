/** Performance budget constants — R-PLAT-5 */

export const PLAT5 = {
  activationTargetMs: 2_000,
  activationHardLimitMs: 5_000,
  inlineEditFirstTokenMs: 250,
  inlineEditTimeoutMs: 5_000,
  tabCompletionUiBudgetMs: 16,
  tabCompletionTimeoutDefaultMs: 1_500,
  tabCompletionTimeoutMinMs: 500,
  tabCompletionTimeoutMaxMs: 10_000,
  backgroundUiSliceMs: 50,
  backgroundProgressIntervalMs: 1_000,
  sessionReleaseMs: 1_000,
} as const;

export function clampTabCompletionTimeoutMs(value: number): number {
  return Math.min(
    PLAT5.tabCompletionTimeoutMaxMs,
    Math.max(PLAT5.tabCompletionTimeoutMinMs, Math.trunc(value))
  );
}
