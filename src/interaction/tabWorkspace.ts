/** Tab Workspace — R-INT-3 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { buildDocBreadcrumb, buildDocPreviewNav } from '../docs/scopeResolution';
import { childLevelFor } from '../docs/treeOps';
import { collectSubtreeDocPaths } from '../docs/docLifecycle';
import { isSummaryMissingOrInvalid } from '../docs/summarySection';
import type { BuildSnapshot } from '../workflow/buildExecutor';
import { getTabWorkspaceWebviewHtml } from './webviewBundle';
import { buildTabWorkspaceStateSync } from './tabWorkspaceSnapshot';
import type { TabId, TabWorkspaceWebviewMessage } from '../shared/tabWorkspaceWebviewProtocol';
import { runDocCompact } from '../docs/compactFlow';
import { runDocTreeAction } from '../docs/docTreeCommands';
import { t } from '../platform/l10n';

export class TabWorkspaceProvider {
  private panel: vscode.WebviewPanel | undefined;
  private activeTab: TabId = 'requirement';
  private buildSnapshot: BuildSnapshot | undefined;
  private tickTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly app: AppServices
  ) {
    this.app.composer.onChange(() => void this.syncWebviewState());
    this.app.buildExecutor.onChange(() => void this.syncWebviewState());
    this.app.platform.models.onDidChange(() => void this.syncWebviewState());
    this.app.drift.onChange(() => void this.syncWebviewState());
    this.app.commitHistory.onChange(() => void this.syncWebviewState());
  }

  bindEditorRefresh(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => void this.syncWebviewState())
    );
  }

  async show(column: vscode.ViewColumn): Promise<void> {
    if (this.panel) {
      this.panel.reveal(column);
      await this.syncWebviewState();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'copilotPlus.tabWorkspace',
      t('tabWorkspace.panelTitle'),
      column,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [this.extensionUri] }
    );

    this.panel.webview.html = getTabWorkspaceWebviewHtml(this.panel.webview, this.extensionUri, {
      title: t('tabWorkspace.panelTitle'),
    });

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      if (this.tickTimer) {
        clearInterval(this.tickTimer);
        this.tickTimer = undefined;
      }
    });

    this.panel.webview.onDidReceiveMessage(async (msg: TabWorkspaceWebviewMessage) => {
      if (msg.type === 'ready') {
        await this.syncWebviewState();
        return;
      }
      if (msg.type === 'selectTab') {
        this.activeTab = msg.tab;
        await this.syncWebviewState();
        return;
      }
      if (msg.type === 'openDoc') {
        void this.app.docs.openInEditor(msg.path);
        return;
      }
      if (msg.type === 'selectDoc') {
        this.postDocPreview(msg.path);
        return;
      }
      if (msg.type === 'editDoc') {
        void this.app.docs.openInEditor(msg.path);
        return;
      }
      if (msg.type === 'buildAction') {
        await this.handleBuildAction(msg.action, msg.taskId, msg.iteration);
        return;
      }
      if (msg.type === 'composerAction') {
        await this.handleComposerAction(msg.action, msg.goal, msg.files);
        return;
      }
      if (msg.type === 'compactDocSubtree') {
        await runDocCompact(this.app, msg.path);
        await this.syncWebviewState();
        return;
      }
      if (msg.type === 'docTreeAction') {
        await runDocTreeAction(this.app, msg.action, msg.path);
        await this.syncWebviewState();
        if (this.app.docs.getByPath(msg.path)) {
          this.postDocPreview(msg.path);
        }
        return;
      }
      if (msg.type === 'selectModel' && msg.modelId) {
        await this.app.platform.models.pickModel(msg.modelId);
        await this.syncWebviewState();
        return;
      }
      if (msg.type === 'commitAction') {
        await this.handleCommitAction(msg.action, msg.hash);
        return;
      }
      if (msg.type === 'exportArchitectureDiagram') {
        await this.handleExportArchitectureDiagram(msg.format, msg.content);
      }
    });

    await this.syncWebviewState();
  }

  focusTab(tab: TabId): void {
    this.activeTab = tab;
    void this.syncWebviewState();
  }

  async refresh(): Promise<void> {
    await this.syncWebviewState();
  }

  previewDoc(relativePath: string): void {
    this.postDocPreview(relativePath);
  }

  private async syncWebviewState(): Promise<void> {
    if (!this.panel) {
      return;
    }
    this.buildSnapshot = await this.app.buildExecutor.getSnapshotAsync();
    const latest = this.app.deploy.getRuns()[0];
    await this.app.deploy.readLogTail(latest?.logPath, 12);
    this.postMessage(buildTabWorkspaceStateSync(this.app, this.activeTab, this.buildSnapshot));
    this.scheduleElapsedTick();
  }

  private scheduleElapsedTick(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = undefined;
    }
    if (!this.panel || !this.app.buildExecutor.hasRunningTasks()) {
      return;
    }
    this.tickTimer = setInterval(() => {
      void this.syncWebviewState();
    }, 1000);
  }

  private postMessage(msg: unknown): void {
    void this.panel?.webview.postMessage(msg);
  }

  private postDocPreview(relativePath: string): void {
    const entry = this.app.docs.getByPath(relativePath);
    if (!entry) {
      return;
    }
    const entries = this.app.docs.getEntries();
    const resolveId = (id: string) => this.app.namingAliases.resolve(id);
    const nav = buildDocPreviewNav(relativePath, entries, resolveId);
    const childLevel = childLevelFor(entry.frontmatter.level);
    const subtreeDocCount = collectSubtreeDocPaths(relativePath, entries).length;
    this.postMessage({
      type: 'docPreview',
      path: relativePath,
      title: entry.frontmatter.title,
      markdown: entry.body,
      breadcrumb: buildDocBreadcrumb(relativePath, entries),
      children: nav.children,
      lateralByType: nav.lateralByType,
      hasChildren: (entry.frontmatter.children?.length ?? 0) > 0,
      canCreateChild: !!childLevel,
      reviewBadge: this.app.docs.reviewBadge(entry),
      subtreeDocCount,
      missingSummary:
        entry.frontmatter.level !== 'system' && isSummaryMissingOrInvalid(entry.body),
    });
  }

  private async handleCommitAction(action: 'select' | 'rollback', hash: string): Promise<void> {
    if (action === 'select') {
      const diff = await this.app.commitHistory.fetchDiff(hash);
      this.postMessage({ type: 'commitDiff', hash, diff });
      return;
    }
    const entry = this.app.commitHistory.get(hash);
    if (!entry) {
      return;
    }
    const confirm = await vscode.window.showWarningMessage(
      t('tabWorkspace.commitConfirmRollback', entry.hash.slice(0, 7), entry.message),
      { modal: true },
      t('tabWorkspace.rollback')
    );
    if (confirm !== t('tabWorkspace.rollback')) {
      return;
    }
    const result = await this.app.commitHistory.rollbackCommit(hash, this.app.checkpoints);
    if (result.ok) {
      await this.app.hooks.fire('rollback.completed', { hash, taskId: entry.taskId });
      void vscode.window.showInformationMessage(t('tabWorkspace.commitRollbackDone', entry.hash.slice(0, 7)));
    } else {
      void vscode.window.showErrorMessage(result.reason ?? 'rollback_failed');
    }
    await this.syncWebviewState();
  }

  private async handleExportArchitectureDiagram(format: 'svg' | 'png', content: string): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    const defaultUri = folder
      ? vscode.Uri.joinPath(folder, format === 'png' ? 'architecture-diagram.png' : 'architecture-diagram.svg')
      : undefined;
    const filters =
      format === 'png'
        ? { PNG: ['png'] }
        : { SVG: ['svg'] };
    const target = await vscode.window.showSaveDialog({
      defaultUri,
      filters,
      saveLabel: format === 'png' ? t('tabWorkspace.exportPng') : t('tabWorkspace.exportSvg'),
    });
    if (!target) {
      return;
    }
    try {
      const bytes =
        format === 'png'
          ? Buffer.from(content, 'base64')
          : Buffer.from(content, 'utf8');
      await vscode.workspace.fs.writeFile(target, bytes);
      void vscode.window.showInformationMessage(t('tabWorkspace.exportDiagramDone', target.fsPath));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(t('tabWorkspace.exportDiagramFailed', reason));
    }
  }

  private async handleComposerAction(action: string, goal?: string, files?: string[]): Promise<void> {
    if (action === 'setGoal' && typeof goal === 'string') {
      this.app.composer.setGoal(goal);
    } else if (action === 'setFiles' && Array.isArray(files)) {
      this.app.composer.setAttachedFiles(files);
    } else if (action === 'pickFiles') {
      await this.app.composer.attachFromPicker();
    } else if (action === 'attachOpen') {
      this.app.composer.attachOpenEditors();
    } else if (action === 'submit') {
      await this.app.stages.transition('Build');
      await this.app.composer.submit();
    } else if (action === 'cancel') {
      this.app.composer.cancel();
    }
    await this.syncWebviewState();
  }

  private async handleBuildAction(
    action: string,
    taskId?: string,
    iteration?: number
  ): Promise<void> {
    if (action === 'start') {
      await this.app.stages.transition('Build');
      await this.app.buildExecutor.start();
    } else if (action === 'stop' || action === 'stopAll') {
      await this.app.buildExecutor.stopAll();
    } else if (action === 'create') {
      await this.app.buildExecutor.createBuild();
    } else if (action === 'rollback' && taskId) {
      await this.app.buildExecutor.rollbackTask(taskId);
    } else if (action === 'pause' && taskId) {
      await this.app.buildExecutor.pauseTask(taskId);
    } else if (action === 'resume' && taskId) {
      await this.app.buildExecutor.resumeTask(taskId);
    } else if (action === 'skip' && taskId) {
      await this.app.buildExecutor.skipTask(taskId);
    } else if (action === 'retry' && taskId) {
      await this.app.buildExecutor.retryTask(taskId);
    } else if (action === 'viewLogs' && taskId) {
      await this.postTaskLog(taskId);
    } else if (action === 'forkFromHere' && taskId && iteration !== undefined) {
      const instruction = await vscode.window.showInputBox({
        title: t('tabWorkspace.forkPromptTitle'),
        prompt: t('tabWorkspace.forkPrompt'),
        placeHolder: t('tabWorkspace.forkPromptPlaceholder'),
      });
      if (instruction !== undefined) {
        await this.app.buildExecutor.forkTask(taskId, iteration, instruction.trim() || undefined);
        await this.postTaskLog(taskId);
      }
    } else if (action === 'deployGenerate') {
      await vscode.commands.executeCommand('copilotPlus.deploy.generateManifest');
    } else if (action === 'deployApply') {
      await vscode.commands.executeCommand('copilotPlus.deploy.applyManifest');
    } else if (action === 'deployRollback' && taskId) {
      await vscode.commands.executeCommand('copilotPlus.deploy.rollback', taskId);
    }
    await this.syncWebviewState();
  }

  private async postTaskLog(taskId: string): Promise<void> {
    const structured = await this.app.buildExecutor.getStructuredTaskLog(taskId);
    this.postMessage({
      type: 'taskLog',
      taskId,
      content: structured.formatted,
      iterations: structured.iterations.map((entry) => ({
        iteration: entry.iteration,
        preview: entry.preview,
      })),
    });
  }
}
