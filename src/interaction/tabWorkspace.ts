/** Tab Workspace — R-INT-3 */

import * as vscode from 'vscode';
import type { PlatformServices } from '../platform/services';
import { getWebviewHtml } from './webviewHtml';

type TabId = 'task' | 'architecture' | 'requirement' | 'commit' | 'deploy';

const TABS: { id: TabId; label: string }[] = [
  { id: 'task', label: 'Task' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'requirement', label: 'Requirement' },
  { id: 'commit', label: 'Commit' },
  { id: 'deploy', label: 'Deploy' },
];

export class TabWorkspaceProvider {
  private panel: vscode.WebviewPanel | undefined;
  private activeTab: TabId = 'requirement';

  constructor(
    private readonly extensionUri: vscode.Uri,
    _services: PlatformServices
  ) {}

  async show(column: vscode.ViewColumn): Promise<void> {
    if (this.panel) {
      this.panel.reveal(column);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'copilotPlus.tabWorkspace',
      'Copilot Plus — Workspace',
      column,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel.webview.html = this.render();
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.onDidReceiveMessage((msg: { type: string; tab?: TabId }) => {
      if (msg.type === 'selectTab' && msg.tab) {
        this.activeTab = msg.tab;
        this.panel!.webview.html = this.render();
      }
    });
  }

  focusTab(tab: TabId): void {
    this.activeTab = tab;
    if (this.panel) {
      this.panel.webview.html = this.render();
    }
  }

  private render(): string {
    const tabsHtml = TABS.map(
      (t, i) =>
        `<button role="tab" type="button" aria-selected="${t.id === this.activeTab}" aria-label="${t.label} panel" id="tab-${t.id}" onclick="selectTab('${t.id}')">${i + 1}. ${t.label}</button>`
    ).join('');

    const body = `
      <div role="tablist" aria-label="Copilot Plus workspace tabs">${tabsHtml}</div>
      <div role="tabpanel" aria-labelledby="tab-${this.activeTab}" class="section" style="margin-top:8px">
        <h3>${TABS.find((t) => t.id === this.activeTab)?.label} Panel</h3>
        <p id="panel-content">${panelPlaceholder(this.activeTab)}</p>
      </div>
      <script nonce="">
        const vscode = acquireVsCodeApi();
        function selectTab(tab) {
          vscode.postMessage({ type: 'selectTab', tab });
        }
      </script>`;
    return getWebviewHtml(this.panel!.webview, this.extensionUri, body);
  }
}

function panelPlaceholder(tab: TabId): string {
  switch (tab) {
    case 'task':
      return 'Task DAG and build execution — Phase 5 (WF).';
    case 'architecture':
      return 'Document tree diagram — Phase 3 (DOCS).';
    case 'requirement':
      return 'Requirement document preview — Phase 3 (DOCS).';
    case 'commit':
      return 'AI commit history — Phase 6 (EDIT) + Phase 5.';
    case 'deploy':
      return 'Deployment status — Phase 9 (DEP).';
  }
}
