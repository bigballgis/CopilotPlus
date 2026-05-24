/** Tab Workspace — R-INT-3 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import type { BuildSnapshot } from '../workflow/buildExecutor';
import { getTabWorkspaceWebviewHtml } from './webviewBundle';
import { buildTabWorkspaceStateSync } from './tabWorkspaceSnapshot';
import type { TabId, TabWorkspaceWebviewMessage } from '../shared/tabWorkspaceWebviewProtocol';
import { t } from '../platform/l10n';

export class TabWorkspaceProvider {
  private panel: vscode.WebviewPanel | undefined;
  private activeTab: TabId = 'requirement';
  private buildSnapshot: BuildSnapshot | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly app: AppServices
  ) {
    this.app.composer.onChange(() => void this.syncWebviewState());
    this.app.buildExecutor.onChange(() => void this.syncWebviewState());
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
      if (msg.type === 'buildAction') {
        await this.handleBuildAction(msg.action, msg.taskId);
        return;
      }
      if (msg.type === 'composerAction') {
        await this.handleComposerAction(msg.action, msg.goal, msg.files);
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

  private async syncWebviewState(): Promise<void> {
    if (!this.panel) {
      return;
    }
    this.buildSnapshot = await this.app.buildExecutor.getSnapshotAsync();
    const latest = this.app.deploy.getRuns()[0];
    await this.app.deploy.readLogTail(latest?.logPath, 12);
    this.postMessage(buildTabWorkspaceStateSync(this.app, this.activeTab, this.buildSnapshot));
  }

  private postMessage(msg: unknown): void {
    void this.panel?.webview.postMessage(msg);
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

  private async handleBuildAction(action: string, taskId?: string): Promise<void> {
    if (action === 'start') {
      await this.app.stages.transition('Build');
      await this.app.buildExecutor.start();
    } else if (action === 'stop') {
      this.app.buildExecutor.stop();
    } else if (action === 'create') {
      await this.app.buildExecutor.createBuild();
    } else if (action === 'rollback' && taskId) {
      await this.app.buildExecutor.rollbackTask(taskId);
    } else if (action === 'deployGenerate') {
      await vscode.commands.executeCommand('copilotPlus.deploy.generateManifest');
    } else if (action === 'deployApply') {
      await vscode.commands.executeCommand('copilotPlus.deploy.applyManifest');
    } else if (action === 'deployRollback' && taskId) {
      await vscode.commands.executeCommand('copilotPlus.deploy.rollback', taskId);
    }
    await this.syncWebviewState();
  }
}
