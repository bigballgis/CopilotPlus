/** Decision Center persistence — R-INT-11.5 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { COPILOT_PLUS_HOME } from '../shared/constants';
import type { DecisionRequest } from './decisionCenter';

export interface StoredDecision extends DecisionRequest {
  createdAt: string;
  remainingSecAtSave?: number;
}

export interface DecisionsFile {
  pending: StoredDecision[];
  savedAt: string;
}

export function decisionsStatePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, COPILOT_PLUS_HOME, 'state', 'decisions.json');
}

export async function loadDecisionsFile(workspaceRoot: string): Promise<DecisionsFile | undefined> {
  try {
    const raw = await fs.readFile(decisionsStatePath(workspaceRoot), 'utf8');
    const parsed = JSON.parse(raw) as DecisionsFile;
    if (!Array.isArray(parsed.pending)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export async function saveDecisionsFile(
  workspaceRoot: string,
  pending: StoredDecision[]
): Promise<void> {
  const file = decisionsStatePath(workspaceRoot);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const payload: DecisionsFile = {
    pending,
    savedAt: new Date().toISOString(),
  };
  await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf8');
}

export function remainingSecFromStored(decision: StoredDecision): number {
  if (typeof decision.remainingSecAtSave === 'number') {
    return Math.max(0, decision.remainingSecAtSave);
  }
  const elapsed = (Date.now() - new Date(decision.createdAt).getTime()) / 1000;
  return Math.max(0, Math.floor(decision.timeoutSec - elapsed));
}
