/** Build serializable Tab Workspace snapshot for React webview — R-INT-3 */

import type { AppServices } from '../app/appServices';
import type { DocTreeNode } from '../docs/documentTreeService';
import type { BuildSnapshot } from '../workflow/buildExecutor';
import { t } from '../platform/l10n';
import type {
  ComposerSnapshotWire,
  DeployPanelWire,
  DocPanelWire,
  DocTreeNodeWire,
  TabId,
  TabWorkspaceLabels,
  TabWorkspaceStateSync,
  TaskPanelWire,
} from '../shared/tabWorkspaceWebviewProtocol';

export function buildTabWorkspaceLabels(): TabWorkspaceLabels {
  return {
    tablistAria: t('tabWorkspace.tablistAria'),
    tabAria: t('tabWorkspace.tabAria', '{0}'),
    tabTask: t('tabWorkspace.tabTask'),
    tabArchitecture: t('tabWorkspace.tabArchitecture'),
    tabRequirement: t('tabWorkspace.tabRequirement'),
    tabCommit: t('tabWorkspace.tabCommit'),
    tabDeploy: t('tabWorkspace.tabDeploy'),
    newBuild: t('tabWorkspace.newBuild'),
    startBuild: t('tabWorkspace.startBuild'),
    stop: t('tabWorkspace.stop'),
    rollback: t('tabWorkspace.rollback'),
    noTasks: t('tabWorkspace.noTasks'),
    composerTitle: t('tabWorkspace.composerTitle'),
    composerGoalPlaceholder: t('tabWorkspace.composerGoalPlaceholder'),
    attachFiles: t('tabWorkspace.attachFiles'),
    attachOpen: t('tabWorkspace.attachOpen'),
    runComposer: t('tabWorkspace.runComposer'),
    cancelComposer: t('tabWorkspace.cancelComposer'),
    noFilesAttached: t('tabWorkspace.noFilesAttached'),
    composerTranscript: t('tabWorkspace.composerTranscript'),
    removeAttachment: t('conversation.removeAttachment'),
    architectureDocs: t('tabWorkspace.architectureDocs'),
    requirementDocs: t('tabWorkspace.requirementDocs'),
    noDocTree: t('tabWorkspace.noDocTree', '{0}'),
    commitPlaceholder: t('tabWorkspace.commitPlaceholder'),
    generateManifest: t('tabWorkspace.generateManifest'),
    applyManifest: t('tabWorkspace.applyManifest'),
    manualCommands: t('tabWorkspace.manualCommands'),
    ready: t('tabWorkspace.ready'),
    noDeployRuns: t('tabWorkspace.noDeployRuns'),
  };
}

export function buildTabWorkspaceStateSync(
  app: AppServices,
  activeTab: TabId,
  build?: BuildSnapshot
): TabWorkspaceStateSync {
  const labels = buildTabWorkspaceLabels();
  const tree = app.docs.getTree();
  return {
    type: 'stateSync',
    activeTab,
    labels,
    task: buildTaskPanel(app, build),
    architecture: buildDocPanel(tree, labels.architectureDocs, app, labels),
    requirement: buildDocPanel(tree, labels.requirementDocs, app, labels),
    commitPlaceholder: labels.commitPlaceholder,
    deploy: buildDeployPanel(app, labels),
  };
}

function buildTaskPanel(app: AppServices, build: BuildSnapshot | undefined): TaskPanelWire {
  const composer = app.composer.getSnapshot();
  return {
    buildId: build?.buildId ?? '(none)',
    status: build?.status ?? 'Idle',
    lastMessage: build?.lastMessage ?? '',
    runningTaskIds: build?.runningTaskIds ?? [],
    tasks: (build?.dag?.tasks ?? []).map((task) => ({
      id: task.id,
      title: task.title,
      agent: task.agent,
      status: task.status,
      canRollback: task.status === 'Done' || task.status === 'Failed',
    })),
    composer: buildComposerSnapshot(composer),
  };
}

function buildComposerSnapshot(
  composer: ReturnType<AppServices['composer']['getSnapshot']>
): ComposerSnapshotWire {
  return {
    goal: composer.goal,
    attachedFiles: composer.attachedFiles,
    status: composer.status,
    lastError: composer.lastError,
    messages: composer.messages.slice(-8),
  };
}

function buildDocPanel(
  tree: DocTreeNode[],
  heading: string,
  app: AppServices,
  labels: TabWorkspaceLabels
): DocPanelWire {
  const docCount = countNodes(tree);
  return {
    heading,
    docCount,
    tree: serializeDocTree(tree, app),
    emptyText: labels.noDocTree.replace('{0}', heading),
  };
}

function buildDeployPanel(app: AppServices, labels: TabWorkspaceLabels): DeployPanelWire {
  const cfg = app.deploy.getConfig();
  const runs = app.deploy.getRuns().slice(0, 5);
  return {
    target: cfg.target,
    mode: cfg.mode,
    status: app.deployOrchestrator.getLastStatus() || labels.ready,
    commands: app.deploy.recommendedCommands(),
    logTail: app.deploy.getCachedLogTail().slice(0, 2000),
    runs: runs.map((r) => ({
      id: r.id,
      target: r.target,
      status: r.status,
      canRollback: r.status === 'Completed' || r.status === 'Failed',
    })),
    showApply: cfg.mode === 'Auto',
  };
}

function serializeDocTree(nodes: DocTreeNode[], app: AppServices): DocTreeNodeWire[] {
  return nodes.map((node) => {
    const entry = app.docs.getByPath(node.path);
    const reviewBadge = entry ? app.docs.reviewBadge(entry) : undefined;
    return {
      path: node.path,
      title: node.title,
      level: node.level,
      reviewBadge,
      children: serializeDocTree(node.children, app),
    };
  });
}

function countNodes(nodes: DocTreeNode[]): number {
  return nodes.reduce((n, node) => n + 1 + countNodes(node.children), 0);
}
