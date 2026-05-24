/** Pure commit history parsers — unit-testable without vscode */

export function parseGitCommitHash(stdout: string): string | undefined {
  const bracket = stdout.match(/\[[^\s\]]+\s+([0-9a-f]{7,40})\]/i);
  if (bracket?.[1]) {
    return bracket[1];
  }
  const loose = stdout.match(/\b([0-9a-f]{40})\b/i);
  return loose?.[1];
}

export function extractTaskId(message: string): string | undefined {
  const match = message.match(/\b(task-[a-z0-9-]+)\b/i);
  return match?.[1];
}

export function parseFilesChangedFromStat(stdout: string): number {
  const match = stdout.match(/(\d+)\s+files? changed/i);
  return match ? Number(match[1]) : 0;
}
