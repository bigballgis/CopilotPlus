/** Build serializable Tab Workspace snapshot for React webview — R-INT-3 */

import type { AppServices } from '../app/appServices';
import type { DocTreeNode } from '../docs/documentTreeService';
import type { BuildSnapshot } from '../workflow/buildExecutor';
import { computeTaskElapsedMs, resolveTaskActions } from '../workflow/taskControls';
import { t } from '../platform/l10n';
import type {
  ComposerSnapshotWire,
  DeployPanelWire,
  DocDiagramEdgeWire,
  DocPanelWire,
  DocTreeNodeWire,
  TabId,
  TabWorkspaceLabels,
  TabWorkspaceStateSync,
  TaskEdgeWire,
  TaskPanelWire,
  CommitPanelWire,
  CodeLayerPathWire,
} from '../shared/tabWorkspaceWebviewProtocol';
import { isDocumentStale } from '../docs/docLifecycle';
import { resolveCodeLayerPath } from '../docs/codeLayerPath';
import * as vscode from 'vscode';

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
    stopAll: t('tabWorkspace.stopAll'),
    buildLimits: t('tabWorkspace.buildLimits', '{0}', '{1}', '{2}', '{3}'),
    workPath: t('tabWorkspace.workPath'),
    fallbackNotice: t('tabWorkspace.fallbackNotice'),
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
    commitFilter: t('tabWorkspace.commitFilter'),
    commitNoEntries: t('tabWorkspace.commitNoEntries'),
    commitDiffEmpty: t('tabWorkspace.commitDiffEmpty'),
    commitRolledBackBadge: t('tabWorkspace.commitRolledBackBadge'),
    commitConfirmRollback: t('tabWorkspace.commitConfirmRollback'),
    commitFilesChanged: t('tabWorkspace.commitFilesChanged'),
    generateManifest: t('tabWorkspace.generateManifest'),
    applyManifest: t('tabWorkspace.applyManifest'),
    manualCommands: t('tabWorkspace.manualCommands'),
    ready: t('tabWorkspace.ready'),
    noDeployRuns: t('tabWorkspace.noDeployRuns'),
    taskDagTitle: t('tabWorkspace.taskDagTitle'),
    taskListTitle: t('tabWorkspace.taskListTitle'),
    architectureDiagram: t('tabWorkspace.architectureDiagram'),
    zoomIn: t('tabWorkspace.zoomIn'),
    zoomOut: t('tabWorkspace.zoomOut'),
    fitView: t('tabWorkspace.fitView'),
    requirementTree: t('tabWorkspace.requirementTree'),
    requirementPreview: t('tabWorkspace.requirementPreview'),
    editDoc: t('tabWorkspace.editDoc'),
    selectDocHint: t('tabWorkspace.selectDocHint'),
    docBreadcrumb: t('tabWorkspace.docBreadcrumb'),
    childDocsHeading: t('tabWorkspace.childDocsHeading'),
    lateralLinksHeading: t('tabWorkspace.lateralLinksHeading'),
    lateralEdge: t('tabWorkspace.lateralEdge'),
    hierarchicalEdge: t('tabWorkspace.hierarchicalEdge'),
    columnId: t('tabWorkspace.columnId'),
    columnTitle: t('tabWorkspace.columnTitle'),
    columnAgent: t('tabWorkspace.columnAgent'),
    columnStatus: t('tabWorkspace.columnStatus'),
    columnActions: t('tabWorkspace.columnActions'),
    columnElapsed: t('tabWorkspace.columnElapsed'),
    pause: t('tabWorkspace.pause'),
    resume: t('tabWorkspace.resume'),
    skip: t('tabWorkspace.skip'),
    retry: t('tabWorkspace.retry'),
    viewLogs: t('tabWorkspace.viewLogs'),
    taskLogTitle: t('tabWorkspace.taskLogTitle'),
    closeLog: t('tabWorkspace.closeLog'),
    noTaskLog: t('tabWorkspace.noTaskLog'),
    openDoc: t('tabWorkspace.openDoc'),
    selectModel: t('models.selectModel'),
    selectModelAria: t('models.selectModelAria'),
    noModelsAvailable: t('models.noModelsAvailable'),
    activeCodeLayer: t('tabWorkspace.activeCodeLayer'),
    activeCodeLayerOrphan: t('tabWorkspace.activeCodeLayerOrphan'),
    staleBadge: t('docs.staleBadge'),
    compactSubtree: t('docs.compactSubtree'),
    compactSubtreeAria: t('docs.compactSubtreeAria'),
  };
}

export function buildTabWorkspaceStateSync(
  app: AppServices,
  activeTab: TabId,
  build?: BuildSnapshot
): TabWorkspaceStateSync {
  const labels = buildTabWorkspaceLabels();
  const tree = app.docs.getTree();
  const idToPath = buildIdToPathMap(tree);
  return {
    type: 'stateSync',
    activeTab,
    labels,
    ...app.platform.models.getHeaderState(),
    task: buildTaskPanel(app, build),
    architecture: buildDocPanel(tree, labels.architectureDocs, app, labels, idToPath, true),
    requirement: buildDocPanel(tree, labels.requirementDocs, app, labels, idToPath, false),
    commit: buildCommitPanel(app, labels),
    deploy: buildDeployPanel(app, labels),
  };
}

function buildTaskPanel(app: AppServices, build: BuildSnapshot | undefined): TaskPanelWire {
  const composer = app.composer.getSnapshot();
  const tasks = build?.dag?.tasks ?? [];
  const runningSet = new Set(build?.runningTaskIds ?? []);
  const edges: TaskEdgeWire[] = [];
  for (const task of tasks) {
    for (const dep of task.depends_on) {
      edges.push({ from: dep, to: task.id });
    }
  }
  return {
    buildId: build?.buildId ?? '(none)',
    status: build?.status ?? 'Idle',
    lastMessage: build?.lastMessage ?? '',
    runningTaskIds: build?.runningTaskIds ?? [],
    validationErrors: build?.validationErrors ?? [],
    tasks: tasks.map((task) => {
      const actions = resolveTaskActions(task, runningSet.has(task.id));
      return {
        id: task.id,
        title: task.title,
        agent: task.agent,
        status: task.status,
        dependsOn: task.depends_on,
        elapsedMs: computeTaskElapsedMs(task),
        canPause: actions.canPause,
        canResume: actions.canResume,
        canSkip: actions.canSkip,
        canRetry: actions.canRetry,
        hasLogs: Boolean(task.started_at),
        canRollback: task.status === 'Done' || task.status === 'Failed',
      };
    }),
    edges,
    composer: buildComposerSnapshot(composer),
    limits: build?.limits,
    workPath: build?.workPath,
    fallbackNotice: build?.fallbackNotice,
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
  labels: TabWorkspaceLabels,
  idToPath: Map<string, string>,
  includeCodeLayer: boolean
): DocPanelWire {
  const docCount = countNodes(tree);
  const threshold = app.platform.getSettings().staleThresholdDays;
  const serialized = serializeDocTree(tree, app, idToPath, threshold);
  return {
    heading,
    docCount,
    tree: serialized.tree,
    diagramEdges: serialized.edges,
    emptyText: labels.noDocTree.replace('{0}', heading),
    activeCodeLayer: includeCodeLayer ? buildActiveCodeLayer(app) : undefined,
  };
}

function buildActiveCodeLayer(app: AppServices): CodeLayerPathWire | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.uri.scheme !== 'file') {
    return undefined;
  }
  const rel = vscode.workspace.asRelativePath(editor.document.uri).replace(/\\/g, '/');
  if (rel.startsWith('.copilotPlus/')) {
    return undefined;
  }
  const layerPath = resolveCodeLayerPath(rel, app.docs.getEntries(), app.indexManager.resolveOwnership(rel));
  if (layerPath.orphan) {
    return { file: rel, segments: '', orphan: true };
  }
  if (!layerPath.component) {
    return undefined;
  }
  const segments = [
    layerPath.system?.title,
    layerPath.module?.title,
    layerPath.feature?.title,
    layerPath.component.title,
    ...(layerPath.coComponents?.map((c) => c.title) ?? []),
  ]
    .filter(Boolean)
    .join(' › ');
  return {
    file: rel,
    segments,
    orphan: false,
    componentPath: layerPath.component.path,
    coOwnerTitles: layerPath.coComponents?.map((c) => c.title),
  };
}

function buildCommitPanel(app: AppServices, labels: TabWorkspaceLabels): CommitPanelWire {
  return {
    commits: app.commitHistory.list().map((entry) => ({
      hash: entry.hash,
      timestamp: entry.timestamp,
      message: entry.message,
      stage: entry.stage,
      taskId: entry.taskId,
      filesChanged: entry.filesChanged,
      rolledBackAt: entry.rolledBackAt,
      canRollback: !entry.rolledBackAt,
    })),
    emptyText: labels.commitNoEntries,
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

function serializeDocTree(
  nodes: DocTreeNode[],
  app: AppServices,
  idToPath: Map<string, string>,
  staleThresholdDays: number
): { tree: DocTreeNodeWire[]; edges: DocDiagramEdgeWire[] } {
  const edges: DocDiagramEdgeWire[] = [];

  const walk = (node: DocTreeNode, parentPath?: string): DocTreeNodeWire => {
    if (parentPath) {
      edges.push({ from: parentPath, to: node.path, kind: 'hierarchical' });
    }
    for (const link of node.lateral ?? []) {
      const targetPath = idToPath.get(link.target);
      if (targetPath && targetPath !== node.path) {
        edges.push({ from: node.path, to: targetPath, kind: 'lateral' });
      }
    }
    const entry = app.docs.getByPath(node.path);
    const reviewBadge = entry ? app.docs.reviewBadge(entry) : undefined;
    const stale = entry ? isDocumentStale(entry, staleThresholdDays) : false;
    const lateralLinks = (node.lateral ?? [])
      .map((link) => {
        const targetPath = idToPath.get(link.target);
        if (!targetPath) {
          return undefined;
        }
        const targetEntry = app.docs.getByPath(targetPath);
        return {
          targetPath,
          targetTitle: targetEntry?.frontmatter.title ?? link.target,
          linkType: link.type,
        };
      })
      .filter((l): l is NonNullable<typeof l> => l !== undefined);

    return {
      path: node.path,
      title: node.title,
      level: node.level,
      reviewBadge,
      stale,
      lateralLinks,
      children: node.children.map((child) => walk(child, node.path)),
    };
  };

  return {
    tree: nodes.map((node) => walk(node)),
    edges,
  };
}

function buildIdToPathMap(nodes: DocTreeNode[]): Map<string, string> {
  const map = new Map<string, string>();
  const visit = (node: DocTreeNode) => {
    map.set(node.id, node.path);
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return map;
}

function countNodes(nodes: DocTreeNode[]): number {
  return nodes.reduce((n, node) => n + 1 + countNodes(node.children), 0);
}
