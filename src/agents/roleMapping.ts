/** Map Sub_Agent_Role identifiers to bundled prompt filenames — R-AG-2.2 */

const ROLE_TO_PROMPT: Record<string, string> = {
  Requirement_Clarifier: 'requirement_clarifier',
  Architect: 'architect',
  Designer: 'designer',
  Task_Planner: 'task_planner',
  Explorer: 'explorer',
  Coder: 'coder',
  Tester: 'tester',
  Reviewer: 'reviewer',
  Committer: 'committer',
  Rollback_Operator: 'rollback_operator',
  Deployer: 'deployer',
  Arbiter: 'arbiter',
  Background: 'background',
};

export function roleToPromptFile(role: string): string {
  return ROLE_TO_PROMPT[role] ?? role.toLowerCase().replace(/ /g, '_');
}

export const BUILD_PIPELINE = ['Coder', 'Tester', 'Reviewer', 'Committer'] as const;
