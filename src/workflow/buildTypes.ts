/** Build operation types — R-WF-3, R-WF-9 */

import type { BuildIsolationMode } from './buildIsolationTypes';

export type BuildStatus = 'Idle' | 'Running' | 'Paused' | 'Completed' | 'Failed';

export interface BuildManifest {
  id: string;
  status: BuildStatus;
  startedAt?: string;
  completedAt?: string;
  verificationDisable?: boolean;
  isolation?: BuildIsolationMode;
  effectiveIsolation?: BuildIsolationMode;
  worktreePath?: string;
  branch?: string;
  fallbackReason?: string;
}

export function newBuildId(): string {
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  return `build-${ts}`;
}
