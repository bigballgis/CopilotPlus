/** Session memory persistence — R-KNOW-4 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { COPILOT_PLUS_HOME } from '../shared/constants';
import { scanMemoryText } from './memoryPrivacy';

export type SessionMemoryScope = 'workspace' | 'task';

export interface SessionMemoryEntry {
  id: string;
  text: string;
  created_at: string;
  last_used_at: string;
  scope: SessionMemoryScope;
  taskId?: string;
  pinned?: boolean;
}

export interface SessionMemoryFile {
  entries: SessionMemoryEntry[];
}

const MAX_ENTRIES = 200;
const PROMPT_CAP = 5_000;
const MIN_TEXT = 1;
const MAX_TEXT = 500;

export function sessionMemoryPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, COPILOT_PLUS_HOME, 'memory', 'session.json');
}

export async function loadSessionMemory(workspaceRoot: string): Promise<SessionMemoryFile> {
  try {
    const raw = await fs.readFile(sessionMemoryPath(workspaceRoot), 'utf8');
    const parsed = JSON.parse(raw) as SessionMemoryFile;
    if (!Array.isArray(parsed.entries)) {
      return { entries: [] };
    }
    return parsed;
  } catch {
    return { entries: [] };
  }
}

export async function saveSessionMemory(
  workspaceRoot: string,
  file: SessionMemoryFile
): Promise<void> {
  const target = sessionMemoryPath(workspaceRoot);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(file, null, 2), 'utf8');
}

export function evictSessionMemory(entries: SessionMemoryEntry[]): SessionMemoryEntry[] {
  const pinned = entries.filter((e) => e.pinned);
  let rest = entries.filter((e) => !e.pinned);
  rest.sort((a, b) => Date.parse(a.last_used_at) - Date.parse(b.last_used_at));
  const combined = [...pinned, ...rest];
  while (combined.length > MAX_ENTRIES) {
    const removable = combined.findIndex((e) => !e.pinned);
    if (removable < 0) {
      break;
    }
    combined.splice(removable, 1);
  }
  return combined;
}

export function formatSessionMemoryForPrompt(
  entries: SessionMemoryEntry[],
  taskId?: string,
  cap = PROMPT_CAP
): { text: string; usedIds: string[] } {
  const candidates = entries
    .filter((e) => e.scope === 'workspace' || (e.scope === 'task' && e.taskId === taskId))
    .sort((a, b) => Date.parse(b.last_used_at) - Date.parse(a.last_used_at));

  const lines: string[] = [];
  const usedIds: string[] = [];
  let size = 0;
  for (const entry of candidates) {
    const line = `- ${entry.text}`;
    if (size + line.length + 1 > cap) {
      break;
    }
    lines.push(line);
    usedIds.push(entry.id);
    size += line.length + 1;
  }

  if (lines.length === 0) {
    return { text: '', usedIds: [] };
  }
  return { text: `## Session memory\n${lines.join('\n')}`, usedIds };
}

export function validateMemoryText(text: string): string | undefined {
  const trimmed = text.trim();
  if (trimmed.length < MIN_TEXT || trimmed.length > MAX_TEXT) {
    return 'memory_text_length';
  }
  const privacy = scanMemoryText(trimmed);
  if (privacy.blocked) {
    return `memory_secret_${privacy.pattern}`;
  }
  return undefined;
}

export function newMemoryEntry(
  text: string,
  scope: SessionMemoryScope,
  taskId?: string
): SessionMemoryEntry {
  const now = new Date().toISOString();
  return {
    id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: text.trim(),
    created_at: now,
    last_used_at: now,
    scope,
    taskId,
  };
}
