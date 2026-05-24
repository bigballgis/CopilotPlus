/** Per-task Task_Panel action flags — R-INT-4 */

import type { TaskNode, TaskStatus } from './taskDag';

export interface TaskActionFlags {
  canPause: boolean;
  canResume: boolean;
  canSkip: boolean;
  canRetry: boolean;
}

const PAUSABLE: TaskStatus[] = ['Pending', 'Ready', 'Running'];
const SKIPPABLE: TaskStatus[] = ['Pending', 'Ready', 'Blocked', 'Failed'];

export function resolveTaskActions(task: TaskNode, isRunningInExecutor: boolean): TaskActionFlags {
  const running = task.status === 'Running' || isRunningInExecutor;
  return {
    canPause: PAUSABLE.includes(task.status) && (task.status !== 'Running' || running),
    canResume: task.status === 'Blocked' && task.user_paused === true,
    canSkip: SKIPPABLE.includes(task.status) && !running,
    canRetry: task.status === 'Failed',
  };
}

export function computeTaskElapsedMs(task: TaskNode, nowMs = Date.now()): number | undefined {
  if (!task.started_at) {
    return undefined;
  }
  const started = Date.parse(task.started_at);
  if (Number.isNaN(started)) {
    return undefined;
  }
  if (task.status === 'Running') {
    return Math.max(0, nowMs - started);
  }
  if (task.completed_at) {
    const completed = Date.parse(task.completed_at);
    if (!Number.isNaN(completed)) {
      return Math.max(0, completed - started);
    }
  }
  return undefined;
}

export function formatElapsedMs(ms: number | undefined): string {
  if (ms === undefined) {
    return '—';
  }
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) {
    return `${totalSec}s`;
  }
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) {
    return `${min}m ${sec}s`;
  }
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hr}h ${remMin}m`;
}
