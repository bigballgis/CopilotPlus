/** Bash tool runner — R-TOOL-4 */

import { exec } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface BashResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  timed_out: boolean;
}

export async function runBash(
  command: string,
  workspaceRoot: string,
  timeoutMs = 60_000,
  cwd?: string
): Promise<BashResult> {
  const workDir = cwd ? path.join(workspaceRoot, cwd) : workspaceRoot;

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workDir,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    return {
      stdout: truncate(stdout),
      stderr: truncate(stderr),
      exit_code: 0,
      timed_out: false,
    };
  } catch (err: unknown) {
    const e = err as { code?: number; killed?: boolean; stdout?: string; stderr?: string };
    return {
      stdout: truncate(String(e.stdout ?? '')),
      stderr: truncate(String(e.stderr ?? '')),
      exit_code: typeof e.code === 'number' ? e.code : 1,
      timed_out: e.killed === true,
    };
  }
}

function truncate(s: string, max = 100_000): string {
  if (s.length <= max) {
    return s;
  }
  return s.slice(0, max) + '\n...[truncated]';
}
