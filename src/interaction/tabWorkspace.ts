/** Tab Workspace — R-INT-3 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import type { DocTreeNode } from '../docs/documentTreeService';
import type { BuildSnapshot } from '../workflow/buildExecutor';
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
  private buildSnapshot: BuildSnapshot | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly app: AppServices
  ) {
    this.app.composer.onChange(() => void this.refresh());
    this.app.buildExecutor.onChange(() => void this.refresh());
  }

  async show(column: vscode.ViewColumn): Promise<void> {
    if (this.panel) {
      this.panel.reveal(column);
      await this.refresh();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'copilotPlus.tabWorkspace',
      'Copilot Plus — Workspace',
      column,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    await this.refresh();

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.onDidReceiveMessage(
      (msg: {
        type: string;
        tab?: TabId;
        path?: string;
        action?: string;
        taskId?: string;
        goal?: string;
        files?: string[];
      }) => {
        if (msg.type === 'selectTab' && msg.tab) {
          this.activeTab = msg.tab;
          void this.refresh();
        }
        if (msg.type === 'openDoc' && msg.path) {
          void this.app.docs.openInEditor(msg.path);
        }
        if (msg.type === 'buildAction' && msg.action) {
          void this.handleBuildAction(msg.action, msg.taskId);
        }
        if (msg.type === 'composerAction' && msg.action) {
          void this.handleComposerAction(msg.action, msg.goal, msg.files);
        }
      }
    );
  }

  focusTab(tab: TabId): void {
    this.activeTab = tab;
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.buildSnapshot = await this.app.buildExecutor.getSnapshotAsync();
    const latest = this.app.deploy.getRuns()[0];
    await this.app.deploy.readLogTail(latest?.logPath, 12);
    if (this.panel) {
      this.panel.webview.html = this.render();
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
    await this.refresh();
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
    await this.refresh();
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
        <div id="panel-content">${panelContent(this.activeTab, this.app, this.buildSnapshot)}</div>
      </div>
      <script nonce="">
        const vscode = acquireVsCodeApi();
        function selectTab(tab) {
          vscode.postMessage({ type: 'selectTab', tab });
        }
        function openDoc(path) {
          vscode.postMessage({ type: 'openDoc', path });
        }
        function buildAction(action, taskId) {
          vscode.postMessage({ type: 'buildAction', action, taskId });
        }
        function composerAction(action, goal, files) {
          vscode.postMessage({ type: 'composerAction', action, goal, files });
        }
        function syncComposerGoal(el) {
          composerAction('setGoal', el.value);
        }
        function syncComposerFiles() {
          const items = [...document.querySelectorAll('#composer-files li')].map((li) => li.dataset.path).filter(Boolean);
          composerAction('setFiles', null, items);
        }
        function removeComposerFile(path) {
          const items = [...document.querySelectorAll('#composer-files li')]
            .map((li) => li.dataset.path)
            .filter((p) => p && p !== path);
          composerAction('setFiles', null, items);
        }
      </script>`;
    return getWebviewHtml(this.panel!.webview, this.extensionUri, body);
  }
}

function panelContent(tab: TabId, app: AppServices, build?: BuildSnapshot): string {
  switch (tab) {
    case 'task':
      return renderTaskPanel(build, app);
    case 'architecture':
      return renderDocTreePanel(app, 'Architecture documents');
    case 'requirement':
      return renderDocTreePanel(app, 'Requirement documents');
    case 'commit':
      return '<p>AI commit history — Phase 6 (EDIT) + Phase 5.</p>';
    case 'deploy':
      return renderDeployPanel(app);
  }
}

function renderDeployPanel(app: AppServices): string {
  const cfg = app.deploy.getConfig();
  const runs = app.deploy.getRuns().slice(0, 5);
  const commands = app.deploy.recommendedCommands();
  const status = escapeHtml(app.deployOrchestrator.getLastStatus());
  const runRows = runs
    .map((r) => {
      const rollback =
        r.status === 'Completed' || r.status === 'Failed'
          ? `<button type="button" onclick="buildAction('deployRollback','${escapeHtml(r.id)}')">Rollback</button>`
          : '';
      return `<tr><td>${escapeHtml(r.id)}</td><td>${escapeHtml(r.target)}</td><td>${escapeHtml(r.status)}</td><td>${rollback}</td></tr>`;
    })
    .join('');
  const applyBtn =
    cfg.mode === 'Auto'
      ? `<button type="button" onclick="buildAction('deployApply')">Apply Manifest</button>`
      : '';
  const logBlock = runs[0]?.logPath
    ? `<pre style="font-size:11px;max-height:120px;overflow:auto;background:var(--vscode-textBlockQuote-background);padding:6px">${escapeHtml(
        app.deploy.getCachedLogTail().slice(0, 2000)
      )}</pre>`
    : '';
  return `
    <p><strong>Target</strong> ${escapeHtml(cfg.target)} · <strong>Mode</strong> ${escapeHtml(cfg.mode)}</p>
    <p style="font-size:12px;opacity:0.85">${status || 'Ready.'}</p>
    <div style="display:flex;gap:8px;margin:8px 0">
      <button type="button" onclick="buildAction('deployGenerate')">Generate Manifest</button>
      ${applyBtn}
    </div>
    <p style="font-size:12px;opacity:0.85">Manual commands:</p>
    <ul>${commands.map((c) => `<li><code>${escapeHtml(c)}</code></li>`).join('')}</ul>
    ${logBlock}
    ${
      runs.length
        ? `<table style="width:100%;font-size:12px"><thead><tr><th>Run</th><th>Target</th><th>Status</th><th>Actions</th></tr></thead><tbody>${runRows}</tbody></table>`
        : '<p>No deploy runs yet.</p>'
    }
  `;
}

function renderTaskPanel(build?: BuildSnapshot, app?: AppServices): string {
  const status = build?.status ?? 'Idle';
  const buildId = build?.buildId ?? '(none)';
  const message = escapeHtml(build?.lastMessage ?? '');
  const running = build?.runningTaskIds?.length
    ? `<p>Running: ${build.runningTaskIds.map(escapeHtml).join(', ')}</p>`
    : '';

  const composer = app?.composer.getSnapshot();
  const composerSection = app
    ? renderComposerSection(composer)
    : '';

  const tasks = build?.dag?.tasks ?? [];
  const taskRows = tasks
    .map((t) => {
      const rollback =
        t.status === 'Done' || t.status === 'Failed'
          ? `<button type="button" onclick="buildAction('rollback','${escapeHtml(t.id)}')">Rollback</button>`
          : '';
      return `<tr><td>${escapeHtml(t.id)}</td><td>${escapeHtml(t.title)}</td><td>${escapeHtml(t.agent)}</td><td>${escapeHtml(t.status)}</td><td>${rollback}</td></tr>`;
    })
    .join('');

  const table =
    tasks.length > 0
      ? `<table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr><th align="left">Id</th><th align="left">Title</th><th align="left">Agent</th><th align="left">Status</th><th align="left">Actions</th></tr></thead>
      <tbody>${taskRows}</tbody></table>`
      : '<p>No tasks yet. Create a build or run Task_Planner during Design.</p>';

  return `
    <p><strong>Build</strong> ${escapeHtml(buildId)} · <strong>Status</strong> ${escapeHtml(status)}</p>
    <p style="opacity:0.85;font-size:12px">${message}</p>
    ${running}
    <div style="display:flex;gap:8px;margin:8px 0">
      <button type="button" onclick="buildAction('create')">New Build</button>
      <button type="button" onclick="buildAction('start')">Start Build</button>
      <button type="button" onclick="buildAction('stop')">Stop</button>
    </div>
    ${composerSection}
    ${table}
  `;
}

function renderComposerSection(
  composer: ReturnType<AppServices['composer']['getSnapshot']>
): string {
  const goal = escapeHtml(composer.goal);
  const files = composer.attachedFiles
    .map(
      (f) =>
        `<li data-path="${escapeHtml(f)}">${escapeHtml(f)} <button type="button" onclick="removeComposerFile('${escapeHtml(f)}')">×</button></li>`
    )
    .join('');
  const log = composer.messages
    .slice(-8)
    .map((m) => escapeHtml(m))
    .join('\n');
  const err = composer.lastError
    ? `<p style="color:var(--vscode-errorForeground);font-size:12px">${escapeHtml(composer.lastError)}</p>`
    : '';
  const cancelBtn =
    composer.status === 'generating'
      ? `<button type="button" onclick="composerAction('cancel')">Cancel</button>`
      : '';
  return `
    <div style="border:1px solid var(--vscode-panel-border);padding:8px;margin:8px 0;border-radius:4px">
      <h4 style="margin:0 0 8px">Composer (multi-file)</h4>
      <p style="font-size:12px;opacity:0.85">Status: ${escapeHtml(composer.status)}</p>
      ${err}
      <textarea id="composer-goal" rows="3" style="width:100%;box-sizing:border-box" oninput="syncComposerGoal(this)" placeholder="Describe coordinated edits (Build stage)…">${goal}</textarea>
      <div style="display:flex;gap:8px;margin:8px 0;flex-wrap:wrap">
        <button type="button" onclick="composerAction('pickFiles')">Attach files</button>
        <button type="button" onclick="composerAction('attachOpen')">Attach open editors</button>
        <button type="button" onclick="composerAction('submit')">Run Composer</button>
        ${cancelBtn}
      </div>
      <ul id="composer-files" style="font-size:12px;padding-left:18px">${files || '<li style="opacity:0.7">No files attached</li>'}</ul>
      <pre style="font-size:11px;max-height:100px;overflow:auto;background:var(--vscode-textBlockQuote-background);padding:6px">${log || 'Composer transcript…'}</pre>
    </div>
  `;
}

function renderDocTreePanel(app: AppServices, heading: string): string {
  const tree = app.docs.getTree();
  if (!tree.length) {
    return `<p>${heading}: no documents yet. Open a workspace folder to initialize the default system doc.</p>`;
  }
  return `<p>${heading} (${countNodes(tree)} docs)</p>${renderDocTree(tree, 0, app)}`;
}

function countNodes(nodes: DocTreeNode[]): number {
  return nodes.reduce((n, node) => n + 1 + countNodes(node.children), 0);
}

function renderDocTree(nodes: DocTreeNode[], depth = 0, app?: AppServices): string {
  return nodes
    .map((node) => {
      const indent = depth * 12;
      const childHtml = renderDocTree(node.children, depth + 1, app);
      const docPath = escapeHtml(node.path);
      const title = escapeHtml(node.title);
      const entry = app?.docs.getByPath(node.path);
      const badge = entry && app ? reviewBadgeHtml(app.docs.reviewBadge(entry)) : '';
      return `<div style="margin-left:${indent}px;margin-bottom:4px">
        <button type="button" onclick="openDoc('${docPath}')">${title}</button>${badge}
        <span style="opacity:0.7;font-size:11px"> (${node.level})</span>
      </div>${childHtml}`;
    })
    .join('');
}

function reviewBadgeHtml(badge: 'green' | 'yellow' | 'red'): string {
  const colors = { green: '#3fb950', yellow: '#d29922', red: '#f85149' };
  return ` <span style="font-size:10px;color:${colors[badge]}">●</span>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
