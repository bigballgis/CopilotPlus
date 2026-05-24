/** Task transcript reader — R-INT-4.6 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { COPILOT_PLUS_HOME } from '../shared/constants';

interface TranscriptEntry {
  role: string;
  content: string;
  toolName?: string;
  ts?: number;
}

export function taskTranscriptPath(
  workspaceRoot: string,
  buildId: string,
  taskId: string
): string {
  return path.join(workspaceRoot, COPILOT_PLUS_HOME, 'builds', buildId, taskId, 'messages.jsonl');
}

export async function taskTranscriptExistsAt(
  workspaceRoot: string,
  buildId: string,
  taskId: string
): Promise<boolean> {
  try {
    await fs.access(taskTranscriptPath(workspaceRoot, buildId, taskId));
    return true;
  } catch {
    return false;
  }
}

export async function readTaskTranscriptAt(
  workspaceRoot: string,
  buildId: string,
  taskId: string
): Promise<string> {
  const file = taskTranscriptPath(workspaceRoot, buildId, taskId);
  try {
    const raw = await fs.readFile(file, 'utf8');
    return formatTranscript(raw);
  } catch {
    return '';
  }
}

export interface DecisionTranscriptEntry {
  question: string;
  options: string[];
  selected: string;
  timedOut: boolean;
}

/** R-INT-10.3 — record decision Q/A in task transcript */
export async function appendDecisionTranscript(
  workspaceRoot: string,
  buildId: string,
  taskId: string,
  entry: DecisionTranscriptEntry
): Promise<void> {
  const file = taskTranscriptPath(workspaceRoot, buildId, taskId);
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const timeoutNote = entry.timedOut ? ' (timed out)' : '';
  const content = [
    `Decision${timeoutNote}`,
    `Q: ${entry.question}`,
    `Options: ${entry.options.join(' | ')}`,
    `A: ${entry.selected}`,
  ].join('\n');
  const line = JSON.stringify({
    role: 'decision',
    content,
    ts: Date.now(),
  });
  await fs.appendFile(file, `${line}\n`, 'utf8');
}

export function formatTranscript(raw: string): string {
  const lines = raw.split('\n').filter((line) => line.trim().length > 0);
  const parts: string[] = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as TranscriptEntry;
      const role = entry.role === 'tool' && entry.toolName ? `tool:${entry.toolName}` : entry.role;
      const stamp =
        entry.ts !== undefined ? new Date(entry.ts).toISOString().slice(11, 19) : undefined;
      const header = stamp ? `[${stamp}] ${role}` : `[${role}]`;
      parts.push(`${header}\n${entry.content}`);
    } catch {
      parts.push(line);
    }
  }
  return parts.join('\n\n');
}
