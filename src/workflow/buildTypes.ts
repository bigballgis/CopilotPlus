/** Build operation types — R-WF-3 */

export type BuildStatus = 'Idle' | 'Running' | 'Paused' | 'Completed' | 'Failed';

export interface BuildManifest {
  id: string;
  status: BuildStatus;
  startedAt?: string;
  completedAt?: string;
}

export function newBuildId(): string {
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  return `build-${ts}`;
}
