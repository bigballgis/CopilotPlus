/** Background Agent configuration — R-AG-9 */

import * as vscode from 'vscode';
import {
  DEFAULT_BACKGROUND_TASKS,
  filterEnabledTasks,
  type BackgroundTaskBudget,
  type BackgroundTaskId,
  BACKGROUND_TASK_IDS,
} from './backgroundTasks';

export interface BackgroundAgentConfig {
  enabled: boolean;
  idleThresholdSec: number;
  enabledTasks: BackgroundTaskId[];
  taskBudgets: Record<BackgroundTaskId, BackgroundTaskBudget>;
}

const DEFAULT_BUDGET: BackgroundTaskBudget = {
  maxToolCalls: 30,
  maxDurationSec: 600,
};

export function readBackgroundAgentConfig(): BackgroundAgentConfig {
  const cfg = vscode.workspace.getConfiguration('copilotPlus');
  const enabled = cfg.get<boolean>('background.enabled', false);
  const idleThresholdSec = clampInt(cfg.get('background.idleThreshold'), 60, 3600, 300);
  const rawTasks = cfg.get<string[]>('background.tasks', DEFAULT_BACKGROUND_TASKS);
  const enabledTasks = filterEnabledTasks(rawTasks);

  const taskBudgets = {} as Record<BackgroundTaskId, BackgroundTaskBudget>;
  for (const taskId of BACKGROUND_TASK_IDS) {
    const block = cfg.get<Partial<BackgroundTaskBudget>>(`background.${taskId}`, {});
    taskBudgets[taskId] = {
      maxToolCalls: clampInt(block.maxToolCalls, 5, 200, DEFAULT_BUDGET.maxToolCalls),
      maxDurationSec: clampInt(block.maxDurationSec, 60, 3600, DEFAULT_BUDGET.maxDurationSec),
    };
  }

  return { enabled, idleThresholdSec, enabledTasks, taskBudgets };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : fallback;
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
