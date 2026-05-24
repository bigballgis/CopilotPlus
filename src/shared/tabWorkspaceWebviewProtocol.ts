/** Host ↔ Tab Workspace webview message protocol — R-INT-3 */

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
  generateManifest: string;
  applyManifest: string;
  manualCommands: string;
  ready: string;
  noDeployRuns: string;
}

export interface DocTreeNodeWire {
  path: string;
  title: string;
  level: string;
  reviewBadge?: 'green' | 'yellow' | 'red';
  children: DocTreeNodeWire[];
}

export interface TaskRowWire {
  id: string;
  title: string;
  agent: string;
  status: string;
  canRollback: boolean;
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
  tasks: TaskRowWire[];
  composer: ComposerSnapshotWire;
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

export interface DocPanelWire {
  heading: string;
  docCount: number;
  tree: DocTreeNodeWire[];
  emptyText: string;
}

export interface TabWorkspaceStateSync {
  type: 'stateSync';
  activeTab: TabId;
  labels: TabWorkspaceLabels;
  task: TaskPanelWire;
  architecture: DocPanelWire;
  requirement: DocPanelWire;
  commitPlaceholder: string;
  deploy: DeployPanelWire;
}

export type TabWorkspaceHostMessage = TabWorkspaceStateSync;

export type TabWorkspaceWebviewMessage =
  | { type: 'ready' }
  | { type: 'selectTab'; tab: TabId }
  | { type: 'openDoc'; path: string }
  | { type: 'buildAction'; action: string; taskId?: string }
  | {
      type: 'composerAction';
      action: string;
      goal?: string;
      files?: string[];
    };

export const TAB_IDS: TabId[] = ['task', 'architecture', 'requirement', 'commit', 'deploy'];
