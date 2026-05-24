/** Task DAG validation — R-WF-3 */

import { SUB_AGENT_ALLOWLISTS } from '../tools/registry';
import { isBuildTaskAgent } from './buildTaskAgents';

export type TaskStatus =
  | 'Pending'
  | 'Ready'
  | 'Running'
  | 'Blocked'
  | 'Done'
  | 'Failed'
  | 'Skipped'
  | 'RolledBack';

export interface TaskNode {
  id: string;
  title: string;
  description: string;
  agent: string;
  inputs: Record<string, unknown>;
  depends_on: string[];
  status: TaskStatus;
  scope_doc: string;
  /** User paused via Task_Panel — R-INT-4 */
  user_paused?: boolean;
  /** Originating task when forked — R-INT-12 */
  parent_task_id?: string;
  /** Iteration index the fork branched from — R-INT-12 */
  forked_from_iteration?: number;
  started_at?: string;
  completed_at?: string;
}

export interface TaskDagFile {
  tasks: TaskNode[];
}

export interface DagValidationError {
  taskId?: string;
  message: string;
}

export interface TaskDagValidationContext {
  knownScopeDocs?: Set<string>;
}

export function validateTaskDag(
  dag: TaskDagFile,
  context?: TaskDagValidationContext
): DagValidationError[] {
  const errors: DagValidationError[] = [];
  const ids = new Set<string>();

  for (const task of dag.tasks) {
    if (ids.has(task.id)) {
      errors.push({ taskId: task.id, message: 'duplicate task id' });
    }
    ids.add(task.id);
  }

  for (const task of dag.tasks) {
    if (!SUB_AGENT_ALLOWLISTS[task.agent]) {
      errors.push({ taskId: task.id, message: `unknown agent role: ${task.agent}` });
    } else if (!isBuildTaskAgent(task.agent)) {
      errors.push({
        taskId: task.id,
        message: `agent ${task.agent} is not a Build-stage role`,
      });
    }
    if (!task.scope_doc.startsWith('.copilotPlus/docs/')) {
      errors.push({ taskId: task.id, message: 'invalid scope_doc path' });
    } else if (context?.knownScopeDocs && !context.knownScopeDocs.has(task.scope_doc)) {
      errors.push({
        taskId: task.id,
        message: `scope_doc not found in document tree: ${task.scope_doc}`,
      });
    }
    for (const dep of task.depends_on) {
      if (!ids.has(dep)) {
        errors.push({ taskId: task.id, message: `missing dependency: ${dep}` });
      }
    }
  }

  if (hasCycle(dag.tasks)) {
    errors.push({ message: 'task DAG contains a cycle' });
  }

  return errors;
}

function hasCycle(tasks: TaskNode[]): boolean {
  const graph = new Map(tasks.map((t) => [t.id, t.depends_on]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (id: string): boolean => {
    if (visited.has(id)) {
      return false;
    }
    if (visiting.has(id)) {
      return true;
    }
    visiting.add(id);
    for (const dep of graph.get(id) ?? []) {
      if (dfs(dep)) {
        return true;
      }
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };

  for (const id of graph.keys()) {
    if (dfs(id)) {
      return true;
    }
  }
  return false;
}

export function computeReadyTasks(tasks: TaskNode[]): TaskNode[] {
  const done = new Set(tasks.filter((t) => t.status === 'Done').map((t) => t.id));
  const blockedDeps = new Set(
    tasks
      .filter((t) => t.status === 'Failed' || t.status === 'Blocked')
      .map((t) => t.id)
  );

  return tasks.filter(
    (t) =>
      t.status === 'Ready' &&
      t.depends_on.every((d) => done.has(d)) &&
      !t.depends_on.some((d) => blockedDeps.has(d))
  );
}

export function markReadyStatuses(tasks: TaskNode[]): TaskNode[] {
  const done = new Set(tasks.filter((t) => t.status === 'Done').map((t) => t.id));
  const failed = new Set(
    tasks.filter((t) => t.status === 'Failed' || t.status === 'Blocked').map((t) => t.id)
  );

  return tasks.map((task) => {
    if (task.status !== 'Pending') {
      return task;
    }
    if (task.depends_on.some((dep) => failed.has(dep))) {
      return { ...task, status: 'Blocked' as TaskStatus };
    }
    if (task.depends_on.every((dep) => done.has(dep))) {
      return { ...task, status: 'Ready' as TaskStatus };
    }
    return task;
  });
}

export function hasSchedulableWork(tasks: TaskNode[]): boolean {
  return tasks.some(
    (t) => t.status === 'Pending' || t.status === 'Ready' || t.status === 'Running'
  );
}

export function allTasksTerminal(tasks: TaskNode[]): boolean {
  return tasks.every((t) =>
    ['Done', 'Skipped', 'RolledBack', 'Failed', 'Blocked'].includes(t.status)
  );
}

/** R-WF-5.4 — dependency-first topological order for task ids */
export function topologicalSortTaskIds(tasks: TaskNode[]): string[] {
  if (tasks.length === 0) {
    return [];
  }
  const inDegree = new Map(tasks.map((task) => [task.id, task.depends_on.length]));
  const dependents = new Map<string, string[]>();
  for (const task of tasks) {
    for (const dep of task.depends_on) {
      const list = dependents.get(dep) ?? [];
      list.push(task.id);
      dependents.set(dep, list);
    }
  }

  const queue = tasks.filter((task) => (inDegree.get(task.id) ?? 0) === 0).map((task) => task.id);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const child of dependents.get(id) ?? []) {
      const next = (inDegree.get(child) ?? 0) - 1;
      inDegree.set(child, next);
      if (next === 0) {
        queue.push(child);
      }
    }
  }

  if (order.length !== tasks.length) {
    return tasks.map((task) => task.id);
  }
  return order;
}

/** R-WF-5.4 — reverse DAG order for build-wide rollback (dependents before dependencies) */
export function rollbackOrderTaskIds(tasks: TaskNode[]): string[] {
  return [...topologicalSortTaskIds(tasks)].reverse();
}

export function tasksRollbackable(tasks: TaskNode[]): TaskNode[] {
  return tasks.filter((task) => task.status === 'Done' || task.status === 'Failed');
}
