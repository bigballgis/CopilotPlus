/** Build-level transcript — R-WF-9.5 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { COPILOT_PLUS_HOME } from '../shared/constants';

export function buildTranscriptPath(workspaceRoot: string, buildId: string): string {
  return path.join(workspaceRoot, COPILOT_PLUS_HOME, 'builds', buildId, 'build.log');
}

export async function appendBuildTranscript(
  workspaceRoot: string,
  buildId: string,
  line: string
): Promise<void> {
  const file = buildTranscriptPath(workspaceRoot, buildId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const stamp = new Date().toISOString();
  await fs.appendFile(file, `[${stamp}] ${line}\n`, 'utf8');
}

export async function readBuildTranscript(workspaceRoot: string, buildId: string): Promise<string> {
  try {
    return await fs.readFile(buildTranscriptPath(workspaceRoot, buildId), 'utf8');
  } catch {
    return '';
  }
}
