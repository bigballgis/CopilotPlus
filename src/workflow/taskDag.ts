/** Task DAG validation — R-WF-3 */

import { SUB_AGENT_ALLOWLISTS } from '../tools/registry';

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
}

export interface TaskDagFile {
  tasks: TaskNode[];
}

export interface DagValidationError {
  taskId?: string;
  message: string;
}

export function validateTaskDag(dag: TaskDagFile): DagValidationError[] {
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
    }
    if (!task.scope_doc.startsWith('.copilotPlus/docs/')) {
      errors.push({ taskId: task.id, message: 'invalid scope_doc path' });
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
  return tasks.filter(
    (t) =>
      (t.status === 'Pending' || t.status === 'Ready') &&
      t.depends_on.every((d) => done.has(d))
  );
}

export function markReadyStatuses(tasks: TaskNode[]): TaskNode[] {
  const done = new Set(tasks.filter((t) => t.status === 'Done').map((t) => t.id));
  return tasks.map((task) => {
    if (task.status === 'Pending' && task.depends_on.every((dep) => done.has(dep))) {
      return { ...task, status: 'Ready' as TaskStatus };
    }
    return task;
  });
}
