/** Agent task forking — R-INT-12 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { COPILOT_PLUS_HOME } from '../shared/constants';
import type { TaskDagFile, TaskNode } from './taskDag';
import {
  groupTranscriptIterations,
  loadTranscriptLines,
  type TranscriptLine,
} from './taskTranscript';

export interface ForkRecord {
  parentTaskId: string;
  childTaskId: string;
  iteration: number;
  instruction?: string;
  createdAt: string;
}

export interface ForksFile {
  forks: ForkRecord[];
}

export function forksPath(workspaceRoot: string, buildId: string): string {
  return path.join(workspaceRoot, COPILOT_PLUS_HOME, 'builds', buildId, 'forks.json');
}

export async function loadForks(workspaceRoot: string, buildId: string): Promise<ForksFile> {
  try {
    const raw = await fs.readFile(forksPath(workspaceRoot, buildId), 'utf8');
    return JSON.parse(raw) as ForksFile;
  } catch {
    return { forks: [] };
  }
}

export async function saveForks(
  workspaceRoot: string,
  buildId: string,
  file: ForksFile
): Promise<void> {
  const filePath = forksPath(workspaceRoot, buildId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(file, null, 2), 'utf8');
}

export function truncateTranscriptAtIteration(
  lines: TranscriptLine[],
  iteration: number
): TranscriptLine[] {
  const groups = groupTranscriptIterations(lines);
  const target = groups.find((g) => g.iteration === iteration);
  if (!target) {
    return lines;
  }
  const prefix = lines.slice(0, target.endIndex + 1);
  return prefix;
}

export function appendForkInstruction(
  lines: TranscriptLine[],
  instruction: string | undefined
): TranscriptLine[] {
  const trimmed = instruction?.trim();
  if (!trimmed) {
    return lines;
  }
  return [
    ...lines,
    {
      role: 'user',
      content: trimmed,
      ts: Date.now(),
    },
  ];
}

export async function writeForkMessages(
  workspaceRoot: string,
  buildId: string,
  childTaskId: string,
  lines: TranscriptLine[]
): Promise<void> {
  const dir = path.join(workspaceRoot, COPILOT_PLUS_HOME, 'builds', buildId, childTaskId);
  await fs.mkdir(dir, { recursive: true });
  const body = lines.map((line) => JSON.stringify(line)).join('\n') + '\n';
  await fs.writeFile(path.join(dir, 'messages.jsonl'), body, 'utf8');
}

export function buildForkTask(
  parent: TaskNode,
  childId: string,
  iteration: number,
  instruction?: string
): TaskNode {
  const suffix = instruction?.trim() ? `: ${instruction.trim().slice(0, 40)}` : '';
  return {
    id: childId,
    title: `${parent.title} (fork @${iteration}${suffix ? suffix : ''})`.slice(0, 120),
    description: parent.description,
    agent: parent.agent,
    inputs: { ...parent.inputs },
    depends_on: [...parent.depends_on],
    status: 'Pending',
    scope_doc: parent.scope_doc,
    parent_task_id: parent.id,
    forked_from_iteration: iteration,
  };
}

export async function createTaskFork(input: {
  workspaceRoot: string;
  buildId: string;
  parent: TaskNode;
  iteration: number;
  instruction?: string;
}): Promise<{ childTask: TaskNode; record: ForkRecord }> {
  const sourceLines = await loadTranscriptLines(
    input.workspaceRoot,
    input.buildId,
    input.parent.id
  );
  if (sourceLines.length === 0) {
    throw new Error('no_transcript');
  }

  const truncated = truncateTranscriptAtIteration(sourceLines, input.iteration);
  const seeded = appendForkInstruction(truncated, input.instruction);
  const childId = `${input.parent.id}-fork-${Date.now().toString(36)}`;
  const childTask = buildForkTask(input.parent, childId, input.iteration, input.instruction);

  await writeForkMessages(input.workspaceRoot, input.buildId, childId, seeded);

  const record: ForkRecord = {
    parentTaskId: input.parent.id,
    childTaskId: childId,
    iteration: input.iteration,
    instruction: input.instruction?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };

  const forks = await loadForks(input.workspaceRoot, input.buildId);
  forks.forks.push(record);
  await saveForks(input.workspaceRoot, input.buildId, forks);

  return { childTask, record };
}

export function forkEdgesFromTasks(tasks: TaskNode[]): Array<{ from: string; to: string }> {
  return tasks
    .filter((task) => task.parent_task_id)
    .map((task) => ({ from: task.parent_task_id!, to: task.id }));
}

export function countForkTasks(tasks: TaskNode[]): number {
  return tasks.filter((task) => task.parent_task_id).length;
}

/** R-INT-12.8 — restore fork metadata / missing fork tasks from forks.json */
export function reconcileForkDag(
  dag: TaskDagFile,
  forks: ForksFile
): { dag: TaskDagFile; added: number; patched: number } {
  if (forks.forks.length === 0) {
    return { dag, added: 0, patched: 0 };
  }

  const tasks = [...dag.tasks];
  const byId = new Map(tasks.map((task) => [task.id, task]));
  let added = 0;
  let patched = 0;

  for (const fork of forks.forks) {
    const parent = byId.get(fork.parentTaskId);
    if (!parent) {
      continue;
    }

    let child = byId.get(fork.childTaskId);
    if (!child) {
      child = buildForkTask(parent, fork.childTaskId, fork.iteration, fork.instruction);
      tasks.push(child);
      byId.set(child.id, child);
      added++;
      continue;
    }

    if (
      child.parent_task_id !== fork.parentTaskId ||
      child.forked_from_iteration !== fork.iteration
    ) {
      const index = tasks.findIndex((task) => task.id === child!.id);
      if (index >= 0) {
        tasks[index] = {
          ...child,
          parent_task_id: fork.parentTaskId,
          forked_from_iteration: fork.iteration,
        };
        byId.set(child.id, tasks[index]!);
        patched++;
      }
    }
  }

  return { dag: { tasks }, added, patched };
}

export async function reconcileForkDagOnDisk(
  workspaceRoot: string,
  buildId: string,
  dag: TaskDagFile
): Promise<{ dag: TaskDagFile; changed: boolean }> {
  const forks = await loadForks(workspaceRoot, buildId);
  const result = reconcileForkDag(dag, forks);
  return { dag: result.dag, changed: result.added > 0 || result.patched > 0 };
}
