/** Host ↔ Control Console webview message protocol — R-INT-9 */

export type ControlConsoleSectionId =
  | 'status'
  | 'workflow'
  | 'hierarchy'
  | 'indexing'
  | 'skills'
  | 'mcp'
  | 'memory'
  | 'models'
  | 'settings';

export interface ControlConsoleLabels {
  expandSection: string;
  collapseSection: string;
  labelModel: string;
  labelContextTier: string;
  labelOffline: string;
  labelPerfBudget: string;
  labelBackground: string;
  backgroundIdle: string;
  backgroundRunning: string;
  backgroundPaused: string;
  backgroundDisabled: string;
  labelAutonomy: string;
  selectAutonomy: string;
  selectAutonomyAria: string;
  labelMode: string;
  labelAddon: string;
  labelEmbeddedChunks: string;
  labelCode: string;
  labelDocs: string;
  toolsCount: string;
  invalidSkill: string;
  ariaStatus: string;
  ariaWorkflow: string;
  ariaHierarchy: string;
  ariaIndexing: string;
  ariaSkills: string;
  ariaMcp: string;
  ariaMemory: string;
  ariaModels: string;
  ariaSettings: string;
  initAgents: string;
  rebuildIndex: string;
  downloadAddon: string;
  mirrorUrlHint: string;
  noSkills: string;
  createSkill: string;
  disableSkill: string;
  enableSkill: string;
  configureMcp: string;
  reconnectMcp: string;
  noMemory: string;
  pinMemory: string;
  unpinMemory: string;
  removeMemory: string;
  reflectionSummary: string;
  noReflection: string;
  selectModel: string;
  selectModelAria: string;
  openSettings: string;
  openSettingsAria: string;
  runConsistencyCheck: string;
  runConsistencyCheckAria: string;
  openDriftView: string;
  openDriftViewAria: string;
  resolveAllDrift: string;
  labelPendingQueue: string;
  labelUpdatePending: string;
  labelDriftSuspected: string;
  labelOrphanCode: string;
  labelOwnershipConflict: string;
  noDriftItems: string;
  yes: string;
  no: string;
}

export interface DriftItemWire {
  id: string;
  type: string;
  layer: string;
  target: string;
  detail?: string;
}

export interface HierarchyWire {
  counts: {
    updatePending: number;
    driftSuspected: number;
    orphanCode: number;
    ownershipConflict: number;
    pendingQueue: number;
  };
  items: DriftItemWire[];
}

export interface SkillWire {
  id: string;
  title: string;
  scope: string;
  enabled: boolean;
  valid: boolean;
}

export interface McpServerWire {
  id: string;
  state: string;
  toolCount: number;
  lastError?: string;
  canReconnect: boolean;
}

export interface MemoryEntryWire {
  id: string;
  text: string;
  scope: string;
  pinned: boolean;
}

export interface ControlConsoleStateSync {
  type: 'stateSync';
  labels: ControlConsoleLabels;
  status: {
    model: string;
    contextTier: string;
    offline: boolean;
    nesStatus: string;
    perfBudgetMs: number;
    backgroundEnabled: boolean;
    backgroundPhase: string;
    backgroundTask?: string;
    backgroundElapsedSec: number;
    backgroundIdleForSec: number;
    backgroundLastFinding?: string;
  };
  workflow: {
    stage: string;
    autonomy: string;
    autonomyLevels: string[];
  };
  hierarchy: HierarchyWire;
  indexing: {
    embeddingMode: string;
    embeddingModelId?: string;
    embeddingAddonVersion?: string;
    embeddedChunks?: number;
    embeddingNotice?: string;
    codeStatus: string;
    codeChunks: number;
    docsStatus: string;
    docChunks: number;
    lastError?: string;
    showDownloadAddon: boolean;
  };
  skills: SkillWire[];
  mcp: McpServerWire[];
  memory: MemoryEntryWire[];
  reflections: string[];
}

export type ControlConsoleHostMessage = ControlConsoleStateSync;

export type ControlConsoleWebviewMessage =
  | { type: 'ready' }
  | { type: 'openSettings' }
  | { type: 'selectModel' }
  | { type: 'rebuildIndex' }
  | { type: 'downloadEmbeddingAddon' }
  | { type: 'createSkill' }
  | { type: 'toggleSkill'; id: string }
  | { type: 'reconnectMcp'; id: string }
  | { type: 'initAgents' }
  | { type: 'removeMemory'; id: string }
  | { type: 'pinMemory'; id: string }
  | { type: 'setAutonomy'; level: string }
  | { type: 'runConsistencyCheck' }
  | { type: 'openDriftView' }
  | { type: 'resolveDrift'; id: string }
  | { type: 'dismissDrift'; id: string }
  | { type: 'resolveAllDrift' };
