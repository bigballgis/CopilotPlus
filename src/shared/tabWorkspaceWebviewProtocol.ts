/** Host ↔ Tab Workspace webview message protocol — R-INT-3 */

import type { ModelOptionWire } from './types';

export type TabId = 'task' | 'architecture' | 'requirement' | 'commit' | 'deploy';

export interface TabWorkspaceLabels {
  tablistAria: string;
  tabAria: string;
  tabTask: string;
  tabArchitecture: string;
  tabRequirement: string;
  tabCommit: string;
  tabDeploy: string;
  newBuild: string;
  startBuild: string;
  stop: string;
  stopAll: string;
  buildLimits: string;
  workPath: string;
  fallbackNotice: string;
  rollback: string;
  noTasks: string;
  composerTitle: string;
  composerGoalPlaceholder: string;
  attachFiles: string;
  attachOpen: string;
  runComposer: string;
  cancelComposer: string;
  noFilesAttached: string;
  composerTranscript: string;
  removeAttachment: string;
  architectureDocs: string;
  requirementDocs: string;
  noDocTree: string;
  commitPlaceholder: string;
  commitFilter: string;
  commitNoEntries: string;
  commitDiffEmpty: string;
  commitRolledBackBadge: string;
  commitConfirmRollback: string;
  commitFilesChanged: string;
  generateManifest: string;
  applyManifest: string;
  manualCommands: string;
  ready: string;
  noDeployRuns: string;
  taskDagTitle: string;
  taskListTitle: string;
  architectureDiagram: string;
  zoomIn: string;
  zoomOut: string;
  fitView: string;
  requirementTree: string;
  requirementPreview: string;
  editDoc: string;
  selectDocHint: string;
  docBreadcrumb: string;
  lateralEdge: string;
  hierarchicalEdge: string;
  columnId: string;
  columnTitle: string;
  columnAgent: string;
  columnStatus: string;
  columnActions: string;
  columnElapsed: string;
  pause: string;
  resume: string;
  skip: string;
  retry: string;
  viewLogs: string;
  taskLogTitle: string;
  closeLog: string;
  noTaskLog: string;
  openDoc: string;
  selectModel: string;
  selectModelAria: string;
  noModelsAvailable: string;
  activeCodeLayer: string;
  activeCodeLayerOrphan: string;
  staleBadge: string;
  compactSubtree: string;
  compactSubtreeAria: string;
}

export interface DocLateralLinkWire {
  targetPath: string;
  targetTitle: string;
  linkType: string;
}

export interface DocTreeNodeWire {
  path: string;
  title: string;
  level: string;
  reviewBadge?: 'green' | 'yellow' | 'red';
  stale?: boolean;
  lateralLinks: DocLateralLinkWire[];
  children: DocTreeNodeWire[];
}

export interface DocDiagramEdgeWire {
  from: string;
  to: string;
  kind: 'hierarchical' | 'lateral';
}

export interface TaskRowWire {
  id: string;
  title: string;
  agent: string;
  status: string;
  dependsOn: string[];
  elapsedMs?: number;
  canPause: boolean;
  canResume: boolean;
  canSkip: boolean;
  canRetry: boolean;
  hasLogs: boolean;
  canRollback: boolean;
}

export interface TaskEdgeWire {
  from: string;
  to: string;
}

export interface ComposerSnapshotWire {
  goal: string;
  attachedFiles: string[];
  status: string;
  lastError?: string;
  messages: string[];
}

export interface TaskPanelWire {
  buildId: string;
  status: string;
  lastMessage: string;
  runningTaskIds: string[];
  validationErrors: Array<{ taskId?: string; message: string }>;
  tasks: TaskRowWire[];
  edges: TaskEdgeWire[];
  composer: ComposerSnapshotWire;
  limits?: {
    toolCallCount: number;
    maxToolCalls: number;
    elapsedSec: number;
    maxDurationSec: number;
  };
  workPath?: string;
  fallbackNotice?: string;
}

export interface DeployRunWire {
  id: string;
  target: string;
  status: string;
  canRollback: boolean;
}

export interface DeployPanelWire {
  target: string;
  mode: string;
  status: string;
  commands: string[];
  logTail: string;
  runs: DeployRunWire[];
  showApply: boolean;
}

export interface CodeLayerPathWire {
  file: string;
  segments: string;
  orphan: boolean;
  componentPath?: string;
  coOwnerTitles?: string[];
}

export interface DocPanelWire {
  heading: string;
  docCount: number;
  tree: DocTreeNodeWire[];
  diagramEdges: DocDiagramEdgeWire[];
  emptyText: string;
  activeCodeLayer?: CodeLayerPathWire;
}

export interface CommitEntryWire {
  hash: string;
  timestamp: string;
  message: string;
  stage: string;
  taskId?: string;
  filesChanged: number;
  rolledBackAt?: string;
  canRollback: boolean;
}

export interface CommitPanelWire {
  commits: CommitEntryWire[];
  emptyText: string;
}

export interface TabWorkspaceStateSync {
  type: 'stateSync';
  activeTab: TabId;
  labels: TabWorkspaceLabels;
  models: ModelOptionWire[];
  selectedModelId: string;
  modelsAvailable: boolean;
  modelUnavailableNotice?: string;
  task: TaskPanelWire;
  architecture: DocPanelWire;
  requirement: DocPanelWire;
  commit: CommitPanelWire;
  deploy: DeployPanelWire;
}

export interface DocBreadcrumbWire {
  path: string;
  title: string;
  level: string;
}

export type TabWorkspaceHostMessage =
  | TabWorkspaceStateSync
  | { type: 'docPreview'; path: string; title: string; markdown: string; breadcrumb?: DocBreadcrumbWire[] }
  | { type: 'taskLog'; taskId: string; content: string }
  | { type: 'commitDiff'; hash: string; diff: string };

export type TabWorkspaceWebviewMessage =
  | { type: 'ready' }
  | { type: 'selectTab'; tab: TabId }
  | { type: 'openDoc'; path: string }
  | { type: 'selectDoc'; path: string }
  | { type: 'editDoc'; path: string }
  | { type: 'buildAction'; action: string; taskId?: string }
  | {
      type: 'composerAction';
      action: string;
      goal?: string;
      files?: string[];
    }
  | { type: 'compactDocSubtree'; path: string }
  | { type: 'selectModel'; modelId: string }
  | { type: 'commitAction'; action: 'select' | 'rollback'; hash: string };

export const TAB_IDS: TabId[] = ['task', 'architecture', 'requirement', 'commit', 'deploy'];
