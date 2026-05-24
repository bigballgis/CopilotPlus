/** Drift and layer consistency types — R-DOCS-12, R-DOCS-13 */

export type DriftType =
  | 'Doc_Update_Recommended'
  | 'Code_Mismatch_Suspected'
  | 'Orphan_Code'
  | 'Ownership_Conflict'
  | 'Dangling_Link'
  | 'Stale_Summary'
  | 'Missing_Summary';

export interface DriftItem {
  id: string;
  type: DriftType;
  layer: string;
  target: string;
  detail?: string;
  detectedAt: string;
}

export interface LayerConsistencyCounts {
  consistent: number;
  updatePending: number;
  driftSuspected: number;
  orphanCode: number;
  ownershipConflict: number;
  pendingQueue: number;
}

export interface DriftDismissal {
  driftId: string;
  target: string;
  rationale: string;
  dismissedAt: string;
}

export interface DriftStateFile {
  items: DriftItem[];
  updatedAt: string;
}

export interface DriftHistoryFile {
  dismissals: DriftDismissal[];
}
