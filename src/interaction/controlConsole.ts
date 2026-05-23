/** Control Console activity bar webview — R-INT-9, R-CTX-5 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { AppServices } from '../app/appServices';
import { getWebviewHtml } from './webviewHtml';
import { resolveContextTier } from '../context/contextTier';
import { PLAT5 } from '../platform/performanceBudget';
import { describeNesDelegateStatus, getCopilotExtensionProbe } from '../editing/nesDelegate';
import { t } from '../platform/l10n';

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
            void vscode.window.showInformationMessage(t('controlConsole.addonInstalled'));
            void this.app.indexManager.rebuildAll();
          } else {
            void vscode.window.showErrorMessage(
              t('controlConsole.addonDownloadFailed', result.reason ?? t('common.unknown'))
            );
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
      ? `<button type="button" aria-label="${escapeHtml(t('controlConsole.downloadAddon'))}" data-action="downloadEmbeddingAddon">${escapeHtml(t('controlConsole.downloadAddon'))}</button>`
      : `<p style="font-size:11px;opacity:0.85">${escapeHtml(t('controlConsole.mirrorUrlHint'))}</p>`;
    const skills = this.app.skills.getSkills();
    const skillRows = skills
      .map(
        (s) =>
          `<div style="font-size:12px;margin-bottom:4px">
            <button type="button" aria-label="${escapeHtml(s.enabled ? t('controlConsole.disableSkill') : t('controlConsole.enableSkill'))} ${escapeHtml(s.title)}" data-action="toggleSkill" data-id="${escapeHtml(s.id)}">${s.enabled ? escapeHtml(t('controlConsole.disableSkill')) : escapeHtml(t('controlConsole.enableSkill'))}</button>
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
            ? `<button type="button" aria-label="${escapeHtml(t('controlConsole.reconnectMcp'))} ${escapeHtml(s.config.id)}" data-action="reconnectMcp" data-id="${escapeHtml(s.config.id)}">${escapeHtml(t('controlConsole.reconnectMcp'))}</button>`
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
            <button type="button" aria-label="${escapeHtml(m.pinned ? t('controlConsole.unpinMemory') : t('controlConsole.pinMemory'))}" data-action="pinMemory" data-id="${escapeHtml(m.id)}">${m.pinned ? escapeHtml(t('controlConsole.unpinMemory')) : escapeHtml(t('controlConsole.pinMemory'))}</button>
            <button type="button" aria-label="${escapeHtml(t('controlConsole.removeMemory'))}" data-action="removeMemory" data-id="${escapeHtml(m.id)}">${escapeHtml(t('controlConsole.removeMemory'))}</button>
            ${escapeHtml(m.text.slice(0, 120))}
            <span style="opacity:0.7"> (${escapeHtml(m.scope)})</span>
          </div>`
      )
      .join('');
    const reflectionRows = this.app.knowledge
      .getReflectionSummaries()
      .map((line) => `<div style="font-size:11px;margin-bottom:4px;opacity:0.9">${escapeHtml(line)}</div>`)
      .join('');
    const nes = describeNesDelegateStatus(s, getCopilotExtensionProbe());
    const nesLine =
      nes.mode === 'disabled'
        ? t('nes.statusDisabled')
        : !nes.copilotDetected
          ? t('nes.statusDelegateMissing')
          : nes.copilotActive
            ? t('nes.statusDelegateActive')
            : t('nes.statusDelegateInactive');
    const body = `
      <div class="section" role="region" aria-label="${escapeHtml(t('controlConsole.aria.status'))}">
        <h3>${escapeHtml(t('controlConsole.aria.status'))}</h3>
        <div>Model: ${escapeHtml(model?.name ?? 'none')}</div>
        <div>Context tier: ${tier}</div>
        <div>Offline: ${this.app.platform.network.isOffline() ? t('common.yes') : t('common.no')}</div>
        <div>${escapeHtml(nesLine)}</div>
        <div style="font-size:11px;opacity:0.85">Perf budget: activation ≤ ${PLAT5.activationTargetMs}ms</div>
        <button type="button" aria-label="${escapeHtml(t('controlConsole.initAgents'))}" data-action="initAgents">${escapeHtml(t('controlConsole.initAgents'))}</button>
      </div>
      <div class="section" role="region" aria-label="${escapeHtml(t('controlConsole.aria.workflow'))}">
        <h3>${escapeHtml(t('controlConsole.aria.workflow'))}</h3>
        <div id="stage">${escapeHtml(stage)}</div>
        <div>Autonomy: ${escapeHtml(s.autonomyLevel)}</div>
      </div>
      <div class="section" role="region" aria-label="${escapeHtml(t('controlConsole.aria.indexing'))}">
        <h3>${escapeHtml(t('controlConsole.aria.indexing'))}</h3>
        <div>Mode: ${escapeHtml(idx.embeddingMode)}${idx.embeddingModelId ? ` (${escapeHtml(idx.embeddingModelId)})` : ''}</div>
        ${idx.embeddingAddonVersion ? `<div>Add-on: ${escapeHtml(idx.embeddingAddonVersion)}</div>` : ''}
        ${idx.embeddedChunks != null ? `<div>Embedded chunks: ${idx.embeddedChunks}</div>` : ''}
        ${idx.embeddingNotice ? `<div style="font-size:11px;opacity:0.85">${escapeHtml(idx.embeddingNotice)}</div>` : ''}
        <div>Code: ${escapeHtml(idx.code)} (${idx.codeChunks} chunks)</div>
        <div>Docs: ${escapeHtml(idx.docs)} (${idx.docChunks} chunks)</div>
        ${idx.lastError ? `<div style="color:var(--vscode-errorForeground)">${escapeHtml(idx.lastError)}</div>` : ''}
        <button type="button" aria-label="${escapeHtml(t('controlConsole.rebuildIndex'))}" data-action="rebuildIndex">${escapeHtml(t('controlConsole.rebuildIndex'))}</button>
        ${downloadBtn}
      </div>
      <div class="section" role="region" aria-label="${escapeHtml(t('controlConsole.aria.skills'))}">
        <h3>${escapeHtml(t('controlConsole.aria.skills'))}</h3>
        ${skills.length ? skillRows : `<p style="font-size:12px;opacity:0.85">${escapeHtml(t('controlConsole.noSkills'))}</p>`}
        <button type="button" aria-label="${escapeHtml(t('controlConsole.createSkill'))}" data-action="createSkill">${escapeHtml(t('controlConsole.createSkill'))}</button>
      </div>
      <div class="section" role="region" aria-label="${escapeHtml(t('controlConsole.aria.mcp'))}">
        <h3>${escapeHtml(t('controlConsole.aria.mcp'))}</h3>
        ${mcpServers.length ? mcpRows : `<p style="font-size:12px;opacity:0.85">${escapeHtml(t('controlConsole.configureMcp'))}</p>`}
      </div>
      <div class="section" role="region" aria-label="${escapeHtml(t('controlConsole.aria.memory'))}">
        <h3>${escapeHtml(t('controlConsole.aria.memory'))}</h3>
        ${memoryEntries.length ? memoryRows : `<p style="font-size:12px;opacity:0.85">${escapeHtml(t('controlConsole.noMemory'))}</p>`}
        <h4 style="margin:8px 0 4px">${escapeHtml(t('controlConsole.reflectionSummary'))}</h4>
        ${reflectionRows || `<p style="font-size:11px;opacity:0.85">${escapeHtml(t('controlConsole.noReflection'))}</p>`}
      </div>
      <div class="section" role="region" aria-label="${escapeHtml(t('controlConsole.aria.models'))}">
        <h3>${escapeHtml(t('controlConsole.aria.models'))}</h3>
        <button type="button" aria-label="${escapeHtml(t('controlConsole.selectModelAria'))}" data-action="selectModel">${escapeHtml(t('controlConsole.selectModel'))}</button>
      </div>
      <div class="section" role="region" aria-label="${escapeHtml(t('controlConsole.aria.settings'))}">
        <h3>${escapeHtml(t('controlConsole.aria.settings'))}</h3>
        <button type="button" aria-label="${escapeHtml(t('controlConsole.openSettingsAria'))}" data-action="openSettings">${escapeHtml(t('controlConsole.openSettings'))}</button>
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
    return getWebviewHtml(webview, body, initScript, { title: t('webview.title') });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
