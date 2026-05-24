/** Build isolation types — R-WF-9 */

export type BuildIsolationMode = 'inline' | 'worktree' | 'worktree_branch';

export interface BuildIsolationState {
  requestedMode: BuildIsolationMode;
  effectiveMode: BuildIsolationMode;
  workspaceRoot: string;
  toolRoot: string;
  worktreePath?: string;
  branch?: string;
  fallbackReason?: string;
  displayPath: string;
}

export function buildIsolationBranchName(buildId: string): string {
  return `copilot-plus/build/${buildId}`;
}

export function formatIsolationDisplayPath(state: Pick<BuildIsolationState, 'effectiveMode' | 'branch'>): string {
  if (state.effectiveMode === 'inline') {
    return 'inline';
  }
  if (state.branch) {
    return `worktree:${state.branch}`;
  }
  return 'worktree:detached';
}

export type BuildCompletionDecision =
  | 'merge'
  | 'cherry_pick'
  | 'keep'
  | 'discard'
  | 'pause';

export function interpretBuildCompletionDecision(
  selected: string,
  timedOut: boolean
): BuildCompletionDecision {
  if (timedOut || selected === 'Keep_Isolated') {
    return 'keep';
  }
  if (selected === 'Merge_To_Main') {
    return 'merge';
  }
  if (selected === 'Cherry_Pick_Selected_Tasks') {
    return 'cherry_pick';
  }
  if (selected === 'Discard') {
    return 'discard';
  }
  return 'keep';
}
