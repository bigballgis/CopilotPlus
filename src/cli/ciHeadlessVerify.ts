/** CI run artifact verification — R-DEP-7 headless integration checks */

import * as fs from 'fs/promises';
import * as path from 'path';
import { CI_STARTUP_NOTICE } from './ciTranscript';
import type { CiTranscriptEvent } from './ciTranscript';

export interface CiVerifyResult {
  ok: boolean;
  errors: string[];
}

const REQUIRED_EVENT_TYPES = new Set(['notice', 'status']);

export function verifyTranscriptLines(lines: string[]): CiVerifyResult {
  const errors: string[] = [];
  if (lines.length === 0) {
    return { ok: false, errors: ['transcript is empty'] };
  }

  const seenTypes = new Set<string>();
  let hasStartupNotice = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch {
      errors.push(`line ${i + 1}: invalid JSON`);
      continue;
    }

    if (typeof parsed.ts !== 'string') {
      errors.push(`line ${i + 1}: missing ts`);
    }
    if (typeof parsed.type !== 'string') {
      errors.push(`line ${i + 1}: missing type`);
      continue;
    }

    seenTypes.add(parsed.type);
    if (parsed.type === 'notice' && typeof parsed.message === 'string') {
      if (parsed.message.includes('Copilot Plus CI mode')) {
        hasStartupNotice = true;
      }
    }

    if (!isValidEventShape(parsed)) {
      errors.push(`line ${i + 1}: invalid event shape for type ${String(parsed.type)}`);
    }
  }

  for (const required of REQUIRED_EVENT_TYPES) {
    if (!seenTypes.has(required)) {
      errors.push(`missing required event type: ${required}`);
    }
  }
  if (!hasStartupNotice) {
    errors.push('missing CI startup notice (R-DEP-7.10)');
  }

  return { ok: errors.length === 0, errors };
}

export async function verifyRunDirectory(runDir: string): Promise<CiVerifyResult> {
  const errors: string[] = [];

  const transcriptPath = path.join(runDir, 'transcript.jsonl');
  const metaPath = path.join(runDir, 'meta.json');

  let transcriptRaw: string;
  try {
    transcriptRaw = await fs.readFile(transcriptPath, 'utf8');
  } catch {
    return { ok: false, errors: [`missing transcript: ${transcriptPath}`] };
  }

  const lines = transcriptRaw.split('\n').filter((l) => l.trim().length > 0);
  const transcriptResult = verifyTranscriptLines(lines);
  errors.push(...transcriptResult.errors);

  try {
    const metaRaw = await fs.readFile(metaPath, 'utf8');
    const meta = JSON.parse(metaRaw) as Record<string, unknown>;
    if (typeof meta.runId !== 'string') {
      errors.push('meta.json: missing runId');
    }
    if (typeof meta.exitCode !== 'number') {
      errors.push('meta.json: missing exitCode');
    }
  } catch {
    errors.push(`missing or invalid meta: ${metaPath}`);
  }

  return { ok: errors.length === 0, errors };
}

export function assertCiStartupNotice(): string {
  return CI_STARTUP_NOTICE;
}

function isValidEventShape(event: Record<string, unknown>): boolean {
  const type = event.type;
  switch (type) {
    case 'notice':
      return typeof event.message === 'string';
    case 'status':
      return typeof event.message === 'string';
    case 'task.started':
      return (
        typeof event.buildId === 'string' &&
        typeof event.taskId === 'string' &&
        typeof event.agent === 'string'
      );
    case 'task.completed':
      return (
        typeof event.buildId === 'string' &&
        typeof event.taskId === 'string' &&
        typeof event.ok === 'boolean'
      );
    case 'file.diff':
      return (
        typeof event.path === 'string' &&
        typeof event.operation === 'string' &&
        typeof event.before === 'string' &&
        typeof event.after === 'string'
      );
    case 'decision':
      return typeof event.question === 'string' && typeof event.selected === 'string';
    case 'run.completed':
      return typeof event.runId === 'string' && typeof event.ok === 'boolean';
    case 'run.failed':
      return typeof event.runId === 'string' && typeof event.reason === 'string';
    default:
      return false;
  }
}

export type { CiTranscriptEvent };
