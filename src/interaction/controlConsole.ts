/** Control Console activity bar webview — R-INT-9, R-CTX-5 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { AppServices } from '../app/appServices';
import { getControlConsoleWebviewHtml } from './webviewBundle';
import { buildControlConsoleStateSync } from './controlConsoleSnapshot';
import type { ControlConsoleWebviewMessage } from '../shared/controlConsoleWebviewProtocol';
import { t } from '../platform/l10n';

export class ControlConsoleProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'copilotPlus.controlConsole';

  private webviewView: vscode.WebviewView | undefined;
  readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly app: AppServices
  ) {
    this.disposables.push(
      app.backgroundAgent.onChange(() => this.syncWebviewState()),
      app.platform.config.onDidChange(() => this.syncWebviewState()),
      app.stages.onTransition(() => this.syncWebviewState())
    );
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.webviewView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.html = getControlConsoleWebviewHtml(webviewView.webview, this.extensionUri, {
      title: t('webview.title'),
    });

    webviewView.onDidDispose(() => {
      this.webviewView = undefined;
    });

    webviewView.webview.onDidReceiveMessage((msg: ControlConsoleWebviewMessage) => {
      void this.handleMessage(msg);
    });
  }

  private async handleMessage(msg: ControlConsoleWebviewMessage): Promise<void> {
    if (msg.type === 'ready') {
      this.syncWebviewState();
      return;
    }
    if (msg.type === 'openSettings') {
      void vscode.commands.executeCommand('copilotPlus.openSettings');
      return;
    }
    if (msg.type === 'selectModel') {
      await this.app.platform.models.pickModel();
      this.syncWebviewState();
      return;
    }
    if (msg.type === 'rebuildIndex') {
      await this.app.indexManager.rebuildAll();
      this.syncWebviewState();
      return;
    }
    if (msg.type === 'downloadEmbeddingAddon') {
      const result = await this.app.localEmbeddingAddon.download();
      if (result.ok) {
        void vscode.window.showInformationMessage(t('controlConsole.addonInstalled'));
        await this.app.indexManager.rebuildAll();
      } else {
        void vscode.window.showErrorMessage(
          t('controlConsole.addonDownloadFailed', result.reason ?? t('common.unknown'))
        );
      }
      this.syncWebviewState();
      return;
    }
    if (msg.type === 'createSkill') {
      await this.createSkill();
      return;
    }
    if (msg.type === 'toggleSkill') {
      const skill = this.app.skills.getSkills().find((s) => s.id === msg.id);
      if (skill) {
        await this.app.skills.setEnabled(skill.id, !skill.enabled);
        this.syncWebviewState();
      }
      return;
    }
    if (msg.type === 'reconnectMcp') {
      await this.app.mcp.reconnect(msg.id);
      this.syncWebviewState();
      return;
    }
    if (msg.type === 'initAgents') {
      await this.app.knowledge.initAgentsMd(this.app);
      this.syncWebviewState();
      return;
    }
    if (msg.type === 'removeMemory') {
      await this.app.knowledge.removeSessionMemory(msg.id);
      this.syncWebviewState();
      return;
    }
    if (msg.type === 'pinMemory') {
      await this.app.knowledge.togglePinSessionMemory(msg.id);
      this.syncWebviewState();
      return;
    }
    if (msg.type === 'setAutonomy') {
      const allowed = ['Manual', 'Approve_Edits', 'Approve_Commands', 'Full_Auto'] as const;
      if (!(allowed as readonly string[]).includes(msg.level)) {
        return;
      }
      await vscode.workspace
        .getConfiguration('copilotPlus')
        .update('workflow.autonomyLevel', msg.level, vscode.ConfigurationTarget.Workspace);
      this.syncWebviewState();
    }
  }

  private async createSkill(): Promise<void> {
    const id = await vscode.window.showInputBox({
      prompt: t('controlConsole.skillIdPrompt'),
      validateInput: (v) => (/^[a-z][a-z0-9-]{2,63}$/.test(v) ? undefined : t('skills.invalidId')),
    });
    if (!id) {
      return;
    }
    const title = await vscode.window.showInputBox({ prompt: t('controlConsole.skillTitlePrompt') });
    if (!title) {
      return;
    }
    const scopePick = await vscode.window.showQuickPick(
      ['workspace', 'module:example', 'feature:example', 'component:example'],
      { placeHolder: t('controlConsole.skillScopePlaceHolder') }
    );
    if (!scopePick) {
      return;
    }
    try {
      const rel = await this.app.skills.createSkill(id, title, scopePick);
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (folder) {
        const uri = vscode.Uri.file(path.join(folder.uri.fsPath, rel.replace(/\//g, path.sep)));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
      }
      this.syncWebviewState();
    } catch (e) {
      void vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
    }
  }

  private syncWebviewState(): void {
    this.webviewView?.webview.postMessage(buildControlConsoleStateSync(this.app));
  }
}
