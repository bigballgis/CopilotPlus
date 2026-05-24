/** Autonomy approval gating — R-WF-7 */

import type { AutonomyLevel, ToolPermission, WorkflowStage } from '../shared/types';

/** Maps R-WF-7 edit/create/delete tool names to built-in registry ids. */
export const EDIT_TOOLS = new Set(['write_file', 'apply_patch', 'delete_file']);

/** Maps R-WF-7 run_terminal_command / deploy tools to built-in registry ids. */
export const COMMAND_TOOLS = new Set(['bash', 'deploy_apply', 'deploy_rollback']);

/**
 * Returns true when a Decision_Notification must precede tool invocation.
 * Complements tool permission resolution (R-PLAT-10) with stage/level rules.
 */
export function requiresAutonomyApproval(
  stage: WorkflowStage,
  autonomyLevel: AutonomyLevel,
  toolId: string,
  effectivePermission: ToolPermission
): boolean {
  if (effectivePermission === 'deny') {
    return false;
  }
  if (effectivePermission === 'ask') {
    return true;
  }

  if (autonomyLevel === 'Manual' && (stage === 'Build' || stage === 'Deploy')) {
    return toolId !== 'question';
  }

  if (autonomyLevel === 'Approve_Edits' && EDIT_TOOLS.has(toolId)) {
    return true;
  }

  if (autonomyLevel === 'Approve_Commands' && COMMAND_TOOLS.has(toolId)) {
    return true;
  }

  return false;
}

export function shouldBypassDiffReview(autonomyLevel: AutonomyLevel): boolean {
  return autonomyLevel === 'Full_Auto';
}
