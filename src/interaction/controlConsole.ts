/** Control Console activity bar webview — R-INT-9, R-CTX-5 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { AppServices } from '../app/appServices';
import { getWebviewHtml } from './webviewHtml';
import { resolveContextTier } from '../context/contextTier';
import { PLAT5 } from '../platform/performanceBudget';

export class ControlConsoleProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'copilotPlus.controlConsole';

  constructor(private readonly app: AppServices) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.render(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg: { type: string }) => {
      if (msg.type === 'openSettings') {
        void vscode.commands.executeCommand('copilotPlus.openSettings');
      }
      if (msg.type === 'selectModel') {
        void this.app.platform.models.pickModel();
      }
      if (msg.type === 'rebuildIndex') {
        void this.app.indexManager.rebuildAll().then(() => {
          webviewView.webview.html = this.render(webviewView.webview);
        });
      }
      if (msg.type === 'downloadEmbeddingAddon') {
        void this.app.localEmbeddingAddon.download().then((result) => {
          if (result.ok) {
            void vscode.window.showInformationMessage('Embedding add-on installed.');
            void this.app.indexManager.rebuildAll();
          } else {
            void vscode.window.showErrorMessage(`Add-on download failed: ${result.reason ?? 'unknown'}`);
          }
          webviewView.webview.html = this.render(webviewView.webview);
        });
      }
      if (msg.type === 'createSkill') {
        void this.createSkill(webviewView);
      }
      if (msg.type === 'toggleSkill' && typeof (msg as { id?: string }).id === 'string') {
        const skill = this.app.skills.getSkills().find((s) => s.id === (msg as { id: string }).id);
        if (skill) {
          void this.app.skills.setEnabled(skill.id, !skill.enabled).then(() => {
            webviewView.webview.html = this.render(webviewView.webview);
          });
        }
      }
      if (msg.type === 'reconnectMcp' && typeof (msg as { id?: string }).id === 'string') {
        void this.app.mcp.reconnect((msg as { id: string }).id).then(() => {
          webviewView.webview.html = this.render(webviewView.webview);
        });
      }
      if (msg.type === 'initAgents') {
        void this.app.knowledge.initAgentsMd(this.app).then(() => {
          webviewView.webview.html = this.render(webviewView.webview);
        });
      }
      if (msg.type === 'removeMemory' && typeof (msg as { id?: string }).id === 'string') {
        void this.app.knowledge.removeSessionMemory((msg as { id: string }).id).then(() => {
          webviewView.webview.html = this.render(webviewView.webview);
        });
      }
      if (msg.type === 'pinMemory' && typeof (msg as { id?: string }).id === 'string') {
        void this.app.knowledge.togglePinSessionMemory((msg as { id: string }).id).then(() => {
          webviewView.webview.html = this.render(webviewView.webview);
        });
      }
    });
  }

  private async createSkill(webviewView: vscode.WebviewView): Promise<void> {
    const id = await vscode.window.showInputBox({
      prompt: 'Skill id (lowercase, 3-64 chars)',
      validateInput: (v) => (/^[a-z][a-z0-9-]{2,63}$/.test(v) ? undefined : 'Invalid id'),
    });
    if (!id) {
      return;
    }
    const title = await vscode.window.showInputBox({ prompt: 'Skill title' });
    if (!title) {
      return;
    }
    const scopePick = await vscode.window.showQuickPick(
      ['workspace', 'module:example', 'feature:example', 'component:example'],
      { placeHolder: 'Skill scope' }
    );
    if (!scopePick) {
      return;
    }
    try {
      const rel = await this.app.skills.createSkill(id, title, scopePick);
      const uri = vscode.Uri.file(
        path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, rel.replace(/\//g, path.sep))
      );
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
      webviewView.webview.html = this.render(webviewView.webview);
    } catch (e) {
      void vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
    }
  }

  private render(webview: vscode.Webview): string {
    const s = this.app.platform.getSettings();
    const model = this.app.platform.models.getSelected();
    const idx = this.app.indexManager.getState();
    const stage = this.app.stages.getStage();
    const tier = resolveContextTier(model?.maxInputTokens, s.tierOverride);
    const addonUrl = s.embeddingAddonUrl;
    const downloadBtn = addonUrl
      ? `<button type="button" data-action="downloadEmbeddingAddon">Download embedding add-on</button>`
      : `<p style="font-size:11px;opacity:0.85">Mode B requires enterprise mirror URL in settings.</p>`;
    const skills = this.app.skills.getSkills();
    const skillRows = skills
      .map(
        (s) =>
          `<div style="font-size:12px;margin-bottom:4px">
            <button type="button" data-action="toggleSkill" data-id="${escapeHtml(s.id)}">${s.enabled ? 'Disable' : 'Enable'}</button>
            ${escapeHtml(s.title)} <span style="opacity:0.7">(${escapeHtml(s.scope)})</span>
            ${s.valid ? '' : `<span style="color:var(--vscode-errorForeground)"> invalid</span>`}
          </div>`
      )
      .join('');
    const mcpServers = this.app.mcp.getServers();
    const mcpRows = mcpServers
      .map((s) => {
        const reconnect =
          s.state === 'error' || s.state === 'disconnected'
            ? `<button type="button" data-action="reconnectMcp" data-id="${escapeHtml(s.config.id)}">Reconnect</button>`
            : '';
        return `<div style="font-size:12px;margin-bottom:6px">
          <strong>${escapeHtml(s.config.id)}</strong> · ${escapeHtml(s.state)} · ${s.tools.length} tool(s)
          ${s.lastError ? `<div style="color:var(--vscode-errorForeground)">${escapeHtml(s.lastError)}</div>` : ''}
          ${reconnect}
        </div>`;
      })
      .join('');
    const memoryEntries = this.app.knowledge.getSessionEntries();
    const memoryRows = memoryEntries
      .slice(0, 12)
      .map(
        (m) =>
          `<div style="font-size:12px;margin-bottom:4px">
            <button type="button" data-action="pinMemory" data-id="${escapeHtml(m.id)}">${m.pinned ? 'Unpin' : 'Pin'}</button>
            <button type="button" data-action="removeMemory" data-id="${escapeHtml(m.id)}">Remove</button>
            ${escapeHtml(m.text.slice(0, 120))}
            <span style="opacity:0.7"> (${escapeHtml(m.scope)})</span>
          </div>`
      )
      .join('');
    const reflectionRows = this.app.knowledge
      .getReflectionSummaries()
      .map((line) => `<div style="font-size:11px;margin-bottom:4px;opacity:0.9">${escapeHtml(line)}</div>`)
      .join('');
    const body = `
      <div class="section" role="region" aria-label="Status">
        <h3>Status</h3>
        <div>Model: ${escapeHtml(model?.name ?? 'none')}</div>
        <div>Context tier: ${tier}</div>
        <div>Offline: ${this.app.platform.network.isOffline() ? 'yes' : 'no'}</div>
        <div style="font-size:11px;opacity:0.85">Perf budget: activation ≤ ${PLAT5.activationTargetMs}ms</div>
        <button type="button" data-action="initAgents">Initialize AGENTS.md</button>
      </div>
      <div class="section" role="region" aria-label="Workflow Stage">
        <h3>Workflow Stage</h3>
        <div id="stage">${escapeHtml(stage)}</div>
        <div>Autonomy: ${escapeHtml(s.autonomyLevel)}</div>
      </div>
      <div class="section" role="region" aria-label="Indexing">
        <h3>Indexing</h3>
        <div>Mode: ${escapeHtml(idx.embeddingMode)}${idx.embeddingModelId ? ` (${escapeHtml(idx.embeddingModelId)})` : ''}</div>
        ${idx.embeddingAddonVersion ? `<div>Add-on: ${escapeHtml(idx.embeddingAddonVersion)}</div>` : ''}
        ${idx.embeddedChunks != null ? `<div>Embedded chunks: ${idx.embeddedChunks}</div>` : ''}
        ${idx.embeddingNotice ? `<div style="font-size:11px;opacity:0.85">${escapeHtml(idx.embeddingNotice)}</div>` : ''}
        <div>Code: ${escapeHtml(idx.code)} (${idx.codeChunks} chunks)</div>
        <div>Docs: ${escapeHtml(idx.docs)} (${idx.docChunks} chunks)</div>
        ${idx.lastError ? `<div style="color:var(--vscode-errorForeground)">${escapeHtml(idx.lastError)}</div>` : ''}
        <button type="button" data-action="rebuildIndex">Rebuild index</button>
        ${downloadBtn}
      </div>
      <div class="section" role="region" aria-label="Skills">
        <h3>Skills</h3>
        ${skills.length ? skillRows : '<p style="font-size:12px;opacity:0.85">No skills yet.</p>'}
        <button type="button" data-action="createSkill">Create Skill</button>
      </div>
      <div class="section" role="region" aria-label="MCP Servers">
        <h3>MCP Servers</h3>
        ${mcpServers.length ? mcpRows : '<p style="font-size:12px;opacity:0.85">Configure .copilotPlus/mcp.json</p>'}
      </div>
      <div class="section" role="region" aria-label="Memory">
        <h3>Memory</h3>
        ${memoryEntries.length ? memoryRows : '<p style="font-size:12px;opacity:0.85">No session memory entries.</p>'}
        <h4 style="margin:8px 0 4px">Reflection summary</h4>
        ${reflectionRows || '<p style="font-size:11px;opacity:0.85">No recent build reflections.</p>'}
      </div>
      <div class="section" role="region" aria-label="Models">
        <h3>Models</h3>
        <button type="button" aria-label="Select model" data-action="selectModel">Select model</button>
      </div>
      <div class="section" role="region" aria-label="Settings">
        <h3>Settings</h3>
        <button type="button" aria-label="Open settings" data-action="openSettings">Open Settings</button>
      </div>`;
    const initScript = `
      const vscode = acquireVsCodeApi();
      document.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const type = btn.getAttribute('data-action');
          const id = btn.getAttribute('data-id');
          if (id) {
            vscode.postMessage({ type, id });
          } else {
            vscode.postMessage({ type });
          }
        });
      });
    `;
    return getWebviewHtml(webview, body, initScript);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
