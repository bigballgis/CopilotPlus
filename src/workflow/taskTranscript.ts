/** Task transcript reader — R-INT-4.6 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { COPILOT_PLUS_HOME } from '../shared/constants';

interface TranscriptEntry {
  role: string;
  content: string;
  toolName?: string;
  ts?: number;
  iteration?: number;
}

export interface TranscriptLine {
  role: string;
  content: string;
  toolName?: string;
  ts?: number;
  iteration?: number;
}

export interface TranscriptIteration {
  iteration: number;
  lines: TranscriptLine[];
  startIndex: number;
  endIndex: number;
  preview: string;
}

export interface StructuredTaskTranscript {
  formatted: string;
  iterations: TranscriptIteration[];
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
  const structured = await readStructuredTaskTranscript(workspaceRoot, buildId, taskId);
  return structured.formatted;
}

export async function loadTranscriptLines(
  workspaceRoot: string,
  buildId: string,
  taskId: string
): Promise<TranscriptLine[]> {
  const file = taskTranscriptPath(workspaceRoot, buildId, taskId);
  try {
    const raw = await fs.readFile(file, 'utf8');
    return parseTranscriptLines(raw);
  } catch {
    return [];
  }
}

export async function readStructuredTaskTranscript(
  workspaceRoot: string,
  buildId: string,
  taskId: string
): Promise<StructuredTaskTranscript> {
  const file = taskTranscriptPath(workspaceRoot, buildId, taskId);
  try {
    const raw = await fs.readFile(file, 'utf8');
    const lines = parseTranscriptLines(raw);
    return {
      formatted: formatTranscript(raw),
      iterations: groupTranscriptIterations(lines),
    };
  } catch {
    return { formatted: '', iterations: [] };
  }
}

export function parseTranscriptLines(raw: string): TranscriptLine[] {
  const out: TranscriptLine[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    try {
      out.push(JSON.parse(line) as TranscriptLine);
    } catch {
      out.push({ role: 'raw', content: line });
    }
  }
  return out;
}

/** R-INT-12 — group persisted messages into Agent_Loop_Iteration blocks */
export function groupTranscriptIterations(lines: TranscriptLine[]): TranscriptIteration[] {
  if (lines.length === 0) {
    return [];
  }

  const markerIndices = lines
    .map((line, index) => (line.role === 'iteration' ? index : -1))
    .filter((index) => index >= 0);

  if (markerIndices.length > 0) {
    const groups: TranscriptIteration[] = [];
    let start = 0;
    let iterNum = 1;
    for (const markerIndex of markerIndices) {
      const slice = lines.slice(start, markerIndex + 1);
      if (slice.length > 0) {
        groups.push(buildIterationGroup(iterNum, slice, start, markerIndex));
        iterNum += 1;
      }
      start = markerIndex + 1;
    }
    if (start < lines.length) {
      groups.push(buildIterationGroup(iterNum, lines.slice(start), start, lines.length - 1));
    }
    return groups;
  }

  const groups: TranscriptIteration[] = [];
  let iterNum = 0;
  let start = 0;
  let sawSetup = false;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (!sawSetup) {
      if (line.role === 'assistant') {
        sawSetup = true;
        iterNum = 1;
        start = index;
      }
      continue;
    }
    if (line.role === 'assistant' && index > start) {
      groups.push(buildIterationGroup(iterNum, lines.slice(start, index), start, index - 1));
      iterNum += 1;
      start = index;
    }
  }

  if (sawSetup) {
    groups.push(buildIterationGroup(iterNum, lines.slice(start), start, lines.length - 1));
  }

  return groups;
}

function buildIterationGroup(
  iteration: number,
  slice: TranscriptLine[],
  startIndex: number,
  endIndex: number
): TranscriptIteration {
  return {
    iteration,
    lines: slice,
    startIndex,
    endIndex,
    preview: formatTranscript(slice.map((line) => JSON.stringify(line)).join('\n')),
  };
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
      if (entry.role === 'iteration') {
        parts.push(`--- Agent iteration ${entry.iteration ?? entry.content} ---`);
        continue;
      }
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
