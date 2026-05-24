/** Monthly document tree size telemetry — R-DOCS-8.5, R-PLAT-7 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { COPILOT_PLUS_HOME } from '../shared/constants';
import type { DocTreeStats } from './docTreeStats';

export interface DocTreeTelemetrySink {
  emit(name: 'docs.tree.size', fields: Record<string, string | number | boolean>): void;
}

const STATE_REL = 'telemetry/doc_tree_monthly.json';
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

interface MonthlyState {
  lastEmittedAt: string;
}

export async function maybeEmitDocTreeTelemetry(
  workspaceRoot: string | undefined,
  telemetry: DocTreeTelemetrySink,
  stats: DocTreeStats
): Promise<boolean> {
  if (!workspaceRoot) {
    return false;
  }

  const stateFile = path.join(workspaceRoot, COPILOT_PLUS_HOME, STATE_REL);
  const now = Date.now();
  try {
    const raw = await fs.readFile(stateFile, 'utf8');
    const parsed = JSON.parse(raw) as MonthlyState;
    const last = Date.parse(parsed.lastEmittedAt);
    if (Number.isFinite(last) && now - last < MONTH_MS) {
      return false;
    }
  } catch {
    /* first emit */
  }

  const docCount = stats.byLevel.reduce((sum, row) => sum + row.docs, 0);
  telemetry.emit('docs.tree.size', {
    count: docCount,
    tokenEstimate: stats.totalTokens,
    softLimitExceeded: stats.softLimitExceeded,
  });

  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  await fs.writeFile(stateFile, JSON.stringify({ lastEmittedAt: new Date(now).toISOString() }, null, 2), 'utf8');
  return true;
}
