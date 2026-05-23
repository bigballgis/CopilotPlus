/** CI JSONL transcript — R-DEP-7.8 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { COPILOT_PLUS_HOME } from '../shared/constants';

export type CiTranscriptEvent =
  | { type: 'notice'; message: string }
  | { type: 'status'; message: string; buildId?: string; taskId?: string }
  | { type: 'task.started'; buildId: string; taskId: string; agent: string }
  | { type: 'task.completed'; buildId: string; taskId: string; ok: boolean; reason?: string }
  | { type: 'file.diff'; path: string; operation: string; before: string; after: string }
  | { type: 'decision'; question: string; selected: string }
  | { type: 'run.completed'; ok: boolean; runId: string; reason?: string }
  | { type: 'run.failed'; runId: string; reason: string };

export function newCiRunId(): string {
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  return `ci-${ts}`;
}

export class CiTranscript {
  private readonly lines: string[] = [];

  constructor(private readonly runDir: string) {}

  static runDirFor(workspaceRoot: string, runId: string): string {
    return path.join(workspaceRoot, COPILOT_PLUS_HOME, 'ci-runs', runId);
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.runDir, { recursive: true });
  }

  emit(event: CiTranscriptEvent): void {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event });
    this.lines.push(line);
    console.log(line);
  }

  async flush(): Promise<string> {
    const file = path.join(this.runDir, 'transcript.jsonl');
    await fs.writeFile(file, `${this.lines.join('\n')}\n`, 'utf8');
    return file;
  }

  async writeMeta(meta: Record<string, unknown>): Promise<void> {
    await fs.writeFile(path.join(this.runDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  }
}

export const CI_STARTUP_NOTICE = [
  'Copilot Plus CI mode — headless automation subset (R-DEP-7)',
  'Disabled: Diff Review UI, Decision Center UI, Design-stage agents (Architect, Designer, Task_Planner, etc.)',
  'Enabled agents: Coder, Tester, Committer, Deployer',
  'File writes: auto-applied with Checkpoint; review diffs in .copilotPlus/ci-runs/<run-id>/transcript.jsonl',
].join('\n');
