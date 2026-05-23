/** Tab Workspace — R-INT-3 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import type { DocTreeNode } from '../docs/documentTreeService';
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
    private readonly app: AppServices
  ) {}

  async show(column: vscode.ViewColumn): Promise<void> {
    if (this.panel) {
      this.panel.reveal(column);
      this.refresh();
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

    this.panel.webview.onDidReceiveMessage((msg: { type: string; tab?: TabId; path?: string }) => {
      if (msg.type === 'selectTab' && msg.tab) {
        this.activeTab = msg.tab;
        this.panel!.webview.html = this.render();
      }
      if (msg.type === 'openDoc' && msg.path) {
        void this.app.docs.openInEditor(msg.path);
      }
    });
  }

  focusTab(tab: TabId): void {
    this.activeTab = tab;
    this.refresh();
  }

  refresh(): void {
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
        <div id="panel-content">${panelContent(this.activeTab, this.app)}</div>
      </div>
      <script nonce="">
        const vscode = acquireVsCodeApi();
        function selectTab(tab) {
          vscode.postMessage({ type: 'selectTab', tab });
        }
        function openDoc(path) {
          vscode.postMessage({ type: 'openDoc', path });
        }
      </script>`;
    return getWebviewHtml(this.panel!.webview, this.extensionUri, body);
  }
}

function panelContent(tab: TabId, app: AppServices): string {
  switch (tab) {
    case 'task':
      return '<p>Task DAG and build execution — Phase 5 (WF).</p>';
    case 'architecture':
      return renderDocTreePanel(app, 'Architecture documents');
    case 'requirement':
      return renderDocTreePanel(app, 'Requirement documents');
    case 'commit':
      return '<p>AI commit history — Phase 6 (EDIT) + Phase 5.</p>';
    case 'deploy':
      return '<p>Deployment status — Phase 9 (DEP).</p>';
  }
}

function renderDocTreePanel(app: AppServices, heading: string): string {
  const tree = app.docs.getTree();
  if (!tree.length) {
    return `<p>${heading}: no documents yet. Open a workspace folder to initialize the default system doc.</p>`;
  }
  return `<p>${heading} (${countNodes(tree)} docs)</p>${renderDocTree(tree)}`;
}

function countNodes(nodes: DocTreeNode[]): number {
  return nodes.reduce((n, node) => n + 1 + countNodes(node.children), 0);
}

function renderDocTree(nodes: DocTreeNode[], depth = 0): string {
  return nodes
    .map((node) => {
      const indent = depth * 12;
      const childHtml = renderDocTree(node.children, depth + 1);
      const path = escapeHtml(node.path);
      const title = escapeHtml(node.title);
      return `<div style="margin-left:${indent}px;margin-bottom:4px">
        <button type="button" onclick="openDoc('${path}')">${title}</button>
        <span style="opacity:0.7;font-size:11px"> (${node.level})</span>
      </div>${childHtml}`;
    })
    .join('');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
