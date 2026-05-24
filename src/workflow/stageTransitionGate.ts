/** Stage transition gates — R-WF-6 */

import type { WorkflowStage } from '../shared/types';
import type { DesignWorkflowStep } from './designSteps';
import {
  checkDesignStepArtifacts,
  type DocArtifactSummary,
} from './designArtifactCheck';
import type { TaskDagFile, TaskNode } from './taskDag';

export interface StageTransitionContext {
  designStep: DesignWorkflowStep;
  docs: DocArtifactSummary[];
  tasksDag?: TaskDagFile;
  runningTaskCount: number;
}

export interface StageTransitionGateResult {
  allowed: boolean;
  reasonKey?: string;
  reasonArgs?: string[];
  needsConfirm?: boolean;
  confirmKey?: string;
  pauseRunningTasks?: boolean;
}

function incompleteTasks(tasks: TaskNode[]): TaskNode[] {
  return tasks.filter((task) => task.status !== 'Done' && task.status !== 'RolledBack');
}

export function evaluateStageTransition(
  from: WorkflowStage,
  to: WorkflowStage,
  ctx: StageTransitionContext
): StageTransitionGateResult {
  if (from === 'Design' && to === 'Build') {
    if (ctx.designStep !== 'Task_List_Generation') {
      return {
        allowed: false,
        reasonKey: 'stage.designBuildWrongStep',
        reasonArgs: [ctx.designStep],
      };
    }
    const artifact = checkDesignStepArtifacts(ctx.designStep, ctx.docs, ctx.tasksDag);
    if (!artifact.complete) {
      return {
        allowed: false,
        reasonKey: 'design.continueBlocked',
        reasonArgs: [artifact.missing.join(', ')],
      };
    }
  }

  if (from === 'Build' && to === 'Design') {
    if (ctx.runningTaskCount > 0) {
      return {
        allowed: true,
        needsConfirm: true,
        confirmKey: 'stage.buildDesignRunningConfirm',
        pauseRunningTasks: true,
      };
    }
  }

  if (from === 'Build' && to === 'Deploy') {
    const tasks = ctx.tasksDag?.tasks ?? [];
    if (tasks.length === 0) {
      return { allowed: false, reasonKey: 'stage.buildDeployNoTasks' };
    }
    const pending = incompleteTasks(tasks);
    if (pending.length > 0) {
      return {
        allowed: false,
        reasonKey: 'stage.buildDeployIncomplete',
        reasonArgs: [String(pending.length)],
      };
    }
  }

  return { allowed: true };
}
