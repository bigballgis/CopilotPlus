/** Background task identifiers and pure scheduling logic — R-AG-9 */

import type { WorkflowStage } from '../shared/types';
import type { BuildStatus } from '../workflow/buildTypes';

export const BACKGROUND_TASK_IDS = [
  'doc_drift_scan',
  'flaky_test_scan',
  'dead_code_scan',
  'dependency_audit',
  'agents_md_proposal',
  'lateral_link_proposal',
  'index_rebuild',
] as const;

export type BackgroundTaskId = (typeof BACKGROUND_TASK_IDS)[number];

export const DEFAULT_BACKGROUND_TASKS: BackgroundTaskId[] = [
  'doc_drift_scan',
  'index_rebuild',
  'dependency_audit',
];

export type BackgroundPhase = 'disabled' | 'waiting_idle' | 'running' | 'paused';

export interface BackgroundTaskBudget {
  maxToolCalls: number;
  maxDurationSec: number;
}

export interface BackgroundTaskResult {
  taskId: BackgroundTaskId;
  ok: boolean;
  summary: string;
  proposal?: string;
  partial?: boolean;
}

export interface BackgroundStatusSnapshot {
  enabled: boolean;
  phase: BackgroundPhase;
  idleThresholdSec: number;
  idleForSec: number;
  currentTask?: BackgroundTaskId;
  elapsedSec: number;
  lastFinding?: string;
  lastCompletedTask?: BackgroundTaskId;
  pausedTask?: BackgroundTaskId;
  enabledTasks: BackgroundTaskId[];
}

export function isBackgroundTaskId(value: string): value is BackgroundTaskId {
  return (BACKGROUND_TASK_IDS as readonly string[]).includes(value);
}

export function filterEnabledTasks(tasks: string[]): BackgroundTaskId[] {
  const seen = new Set<BackgroundTaskId>();
  const out: BackgroundTaskId[] = [];
  for (const task of tasks) {
    if (isBackgroundTaskId(task) && !seen.has(task)) {
      seen.add(task);
      out.push(task);
    }
  }
  return out;
}

export function isUserIdle(lastActivityMs: number, nowMs: number, idleThresholdSec: number): boolean {
  if (lastActivityMs <= 0) {
    return false;
  }
  return nowMs - lastActivityMs >= idleThresholdSec * 1000;
}

export function shouldBlockBackground(stage: WorkflowStage, buildStatus: BuildStatus): boolean {
  const activeBuild = buildStatus === 'Running' || buildStatus === 'Paused';
  return activeBuild && (stage === 'Build' || stage === 'Deploy');
}

export function shouldScheduleBackground(opts: {
  enabled: boolean;
  offline: boolean;
  stage: WorkflowStage;
  buildStatus: BuildStatus;
  phase: BackgroundPhase;
}): boolean {
  if (!opts.enabled || opts.offline) {
    return false;
  }
  if (shouldBlockBackground(opts.stage, opts.buildStatus)) {
    return false;
  }
  return opts.phase === 'waiting_idle' || opts.phase === 'paused';
}

export function pickNextBackgroundTask(
  enabledTasks: BackgroundTaskId[],
  lastCompleted?: BackgroundTaskId,
  pausedTask?: BackgroundTaskId
): BackgroundTaskId | undefined {
  if (pausedTask && enabledTasks.includes(pausedTask)) {
    return pausedTask;
  }
  if (enabledTasks.length === 0) {
    return undefined;
  }
  if (!lastCompleted) {
    return enabledTasks[0];
  }
  const idx = enabledTasks.indexOf(lastCompleted);
  if (idx < 0) {
    return enabledTasks[0];
  }
  return enabledTasks[(idx + 1) % enabledTasks.length];
}

export function elapsedSec(startedAtMs: number | undefined, nowMs: number): number {
  if (!startedAtMs) {
    return 0;
  }
  return Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
}

export function idleForSec(lastActivityMs: number, nowMs: number): number {
  if (lastActivityMs <= 0) {
    return 0;
  }
  return Math.max(0, Math.floor((nowMs - lastActivityMs) / 1000));
}
