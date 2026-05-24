/** Build-stage task DAG agents — R-AG-2.1, R-WF-3 */

export const BUILD_TASK_AGENTS = [
  'Coder',
  'Tester',
  'Reviewer',
  'Committer',
  'Rollback_Operator',
] as const;

export type BuildTaskAgent = (typeof BUILD_TASK_AGENTS)[number];

export function isBuildTaskAgent(agent: string): agent is BuildTaskAgent {
  return (BUILD_TASK_AGENTS as readonly string[]).includes(agent);
}

/** Task statuses that block dependents from becoming Ready */
export const DEPENDENCY_BLOCKING_STATUSES = new Set(['Failed', 'Blocked']);

/** Terminal statuses that end scheduling for a task subtree */
export const TERMINAL_TASK_STATUSES = new Set([
  'Done',
  'Skipped',
  'RolledBack',
  'Failed',
  'Blocked',
]);
