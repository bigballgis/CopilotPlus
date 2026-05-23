/** Pure stage transition rules — R-WF-1.4 */

import type { WorkflowStage } from '../shared/types';

const ALLOWED: Record<WorkflowStage, WorkflowStage[]> = {
  Design: ['Build'],
  Build: ['Design', 'Deploy'],
  Deploy: ['Build', 'Design'],
};

export function canTransition(from: WorkflowStage, to: WorkflowStage): boolean {
  return ALLOWED[from].includes(to);
}
