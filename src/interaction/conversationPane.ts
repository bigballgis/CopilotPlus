/** Conversation Pane — R-INT-2 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { getWebviewHtml } from './webviewHtml';
import { SessionStore } from './sessionStore';
import type { WorkflowStage } from '../shared/types';
import {
  mergeAttachments,
  parseMentionTokens,
  parseSlashSkill,
  pickMention,
  resolveMentionContext,
  type MentionAttachment,
} from '../context/mentions';
import { buildScopePreheatKey, runScopePreheat } from '../context/scopePreheat';
import { estimateTokens } from '../platform/chatClient';
import { designStepLabel } from '../workflow/designSteps';
import { t } from '../platform/l10n';

export class ConversationPaneProvider {
  private panel: vscode.WebviewPanel | undefined;
  private readonly sessions: SessionStore;
  private cancelSource: vscode.CancellationTokenSource | undefined;
  private sessionTokens = 0;
  private pendingAttachments: MentionAttachment[] = [];
  private preheatTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    private readonly app: AppServices
  ) {
    this.sessions = new SessionStore(context);
    void this.sessions.load();
    app.speculative.setTokenSink((tokens) => {
      this.sessionTokens += tokens;
      this.sessions.addTokens(tokens);
      this.postMessage({ type: 'tokenUpdate', tokens: this.sessionTokens });
    });
  }

  async show(column: vscode.ViewColumn): Promise<void> {
    if (this.panel) {
      this.panel.reveal(column);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'copilotPlus.conversation',
      t('conversation.panelTitle'),
      column,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel.webview.html = this.render();
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.onDidReceiveMessage(async (msg: {
      type: string;
      text?: string;
      attachments?: MentionAttachment[];
    }) => {
      if (msg.type === 'submit' && msg.text) {
        await this.handleSubmit(msg.text, msg.attachments ?? []);
      }
      if (msg.type === 'pickMention') {
        const mention = await pickMention(this.app);
        if (mention) {
          this.postMessage({ type: 'mentionAttached', mention });
        }
      }
      if (msg.type === 'cancel') {
        this.cancelSource?.cancel();
      }
      if (msg.type === 'newSession') {
        await this.sessions.startNewSession();
        this.app.summarizer.resetSession();
        this.sessionTokens = 0;
        this.pendingAttachments = [];
        this.reload();
      }
      if (msg.type === 'inputDraft' && typeof msg.text === 'string') {
        this.scheduleScopePreheat(msg.text, msg.attachments ?? []);
      }
    });
  }

  private scheduleScopePreheat(text: string, attachments: MentionAttachment[]): void {
    if (this.app.stages.getStage() !== 'Design') {
      return;
    }
    if (this.preheatTimer) {
      clearTimeout(this.preheatTimer);
    }
    this.preheatTimer = setTimeout(() => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }
      const merged = mergeAttachments(parseMentionTokens(trimmed), attachments);
      const rawKey = buildScopePreheatKey(trimmed, merged);
      const key = this.app.speculative.makeKey('scopePreheat', { key: rawKey });
      this.app.speculative.discardExcept(key);
      const estimatedTokens = estimateTokens(trimmed) + 128;
      this.app.speculative.schedule('scopePreheat', key, estimatedTokens, async () =>
        runScopePreheat(this.app, trimmed, merged)
      );
    }, 300);
  }

  syncStage(_stage: WorkflowStage): void {
    this.reload();
  }

  private reload(): void {
    if (this.panel) {
      this.panel.webview.html = this.render();
    }
  }

  private async handleSubmit(text: string, webAttachments: MentionAttachment[]): Promise<void> {
    const stage = this.app.stages.getStage();
    if (stage !== 'Design') {
      return;
    }
    if (this.app.platform.network.isOffline()) {
      void vscode.window.showWarningMessage(t('conversation.offline'));
      return;
    }

    const slash = parseSlashSkill(text);
    let userText = slash.message || text;
    if (slash.skillId) {
      userText = slash.message || '(skill attached)';
    }

    const attachments = mergeAttachments(parseMentionTokens(userText), [
      ...this.pendingAttachments,
      ...webAttachments,
      ...(slash.skillId
        ? [{ kind: 'skill' as const, target: slash.skillId, label: slash.skillId }]
        : []),
    ]);
    this.pendingAttachments = [];

    const systemDoc = this.app.docs.getEntries().find((e) => e.valid && e.frontmatter.level === 'system');
    const autoSkills = this.app.skills.getAutoAttached(systemDoc?.relativePath, systemDoc?.frontmatter.id);
    const skillPrefix = this.app.skills.formatInstructions(autoSkills);

    let contextPrefix =
      attachments.length > 0
        ? await resolveMentionContext(attachments, this.app, this.app.platform.getSettings().sessionTokenCap)
        : undefined;

    const preheatRawKey = buildScopePreheatKey(userText, attachments);
    const preheatKey = this.app.speculative.makeKey('scopePreheat', { key: preheatRawKey });
    const preheated = this.app.speculative.tryConsume<string>(preheatKey);
    if (preheated?.hit && preheated.value.trim()) {
      contextPrefix = contextPrefix
        ? `${preheated.value}\n\n${contextPrefix}`
        : preheated.value;
    }

    if (skillPrefix) {
      contextPrefix = contextPrefix ? `${skillPrefix}\n\n${contextPrefix}` : skillPrefix;
    }

    await this.sessions.appendUserMessage(slash.skillId ? `/${slash.skillId} ${userText}`.trim() : text);
    this.postMessage({ type: 'userMessage', text, attachments });

    this.cancelSource?.cancel();
    this.cancelSource = new vscode.CancellationTokenSource();
    this.postMessage({ type: 'streamStart' });

    try {
      const systemPrompt = await this.app.primaryAgent.ensurePrompt();
      const prepared = await this.app.summarizer.prepareHistory(
        this.sessions.getMessages().slice(0, -1),
        userText,
        contextPrefix,
        systemPrompt,
        this.cancelSource.token,
        this.sessions
      );

      if (prepared.blocked) {
        this.postMessage({ type: 'error', message: prepared.blockReason ?? t('conversation.requestBlocked') });
        void vscode.window.showWarningMessage(prepared.blockReason ?? t('conversation.requestBlocked'));
        return;
      }

      if (prepared.summaryPath) {
        this.postMessage({ type: 'summarized', path: prepared.summaryPath });
      }

      const result = await this.app.primaryAgent.runDesignTurn(
        userText,
        prepared.history,
        this.cancelSource.token,
        (chunk) => this.postMessage({ type: 'streamChunk', text: chunk }),
        contextPrefix,
        (status) => this.postMessage({ type: 'designStatus', message: status })
      );

      if (result.cancelled) {
        this.postMessage({ type: 'streamCancelled' });
        return;
      }

      await this.sessions.appendAssistantMessage(result.text);
      this.sessionTokens += result.inputTokens + result.outputTokens;
      this.postMessage({
        type: 'streamEnd',
        text: result.text,
        tokens: this.sessionTokens,
        designStep: result.designStep,
        delegatedRole: result.delegatedRole,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.postMessage({ type: 'error', message });
      void vscode.window.showErrorMessage(message);
    }
  }

  private postMessage(msg: unknown): void {
    void this.panel?.webview.postMessage(msg);
  }

  private render(): string {
    const stage = this.app.stages.getStage();
    const readOnly = stage !== 'Design';
    const model = this.app.platform.models.getSelected()?.name ?? 'none';
    const designStep = designStepLabel(this.app.stages.getDesignStep());
    const designStepHeader = escapeHtml(t('design.stepLabel'));
    const banner = readOnly
      ? `<div class="banner" role="status">${escapeHtml(t('conversation.readOnlyBanner', stage))}</div>`
      : '';
    const inputLabel = escapeHtml(t('conversation.inputLabel'));
    const inputPlaceholder = escapeHtml(t('conversation.inputPlaceholder'));
    const sendLabel = escapeHtml(t('conversation.send'));
    const sendAria = escapeHtml(t('conversation.sendAria'));
    const attachLabel = escapeHtml(t('conversation.attach'));
    const attachAria = escapeHtml(t('conversation.attachAria'));
    const cancelLabel = escapeHtml(t('conversation.cancel'));
    const cancelAria = escapeHtml(t('conversation.cancelAria'));
    const newSessionLabel = escapeHtml(t('conversation.newSession'));
    const newSessionAria = escapeHtml(t('conversation.newSessionAria'));
    const removeAttachmentAria = escapeHtml(t('conversation.removeAttachment'));
    const L = {
      userPrefix: t('conversation.userPrefix'),
      assistantPrefix: t('conversation.assistantPrefix'),
      summarized: t('conversation.summarized', '{path}'),
      streamComplete: t('conversation.streamComplete'),
      streamCancelled: t('conversation.streamCancelled'),
      streamError: t('conversation.streamError', '{msg}'),
      removeAttachment: t('conversation.removeAttachment'),
    };
    const l10nJson = JSON.stringify(L);
    const body = `
      ${banner}
      <header style="margin-bottom:8px;font-size:12px;opacity:0.85">
        Model: ${escapeHtml(model)} · Stage: ${stage} · ${designStepHeader}: ${escapeHtml(designStep)} · Tokens: <span id="token-count">${this.sessionTokens}</span>
        <span id="design-status" style="display:block;margin-top:4px;opacity:0.9"></span>
      </header>
      <div id="a11y-status" class="sr-only" role="status" aria-live="assertive" aria-atomic="true"></div>
      <div id="messages" role="log" aria-live="polite" aria-relevant="additions" style="min-height:200px;border:1px solid var(--vscode-panel-border);padding:8px;margin-bottom:8px"></div>
      <div id="attachments" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;min-height:4px"></div>
      <textarea id="input" rows="3" style="width:100%;box-sizing:border-box" ${readOnly ? 'disabled aria-disabled="true"' : `aria-label="${inputLabel}"`} placeholder="${inputPlaceholder}"></textarea>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button id="send" type="button" ${readOnly ? 'disabled' : ''} aria-label="${sendAria}">${sendLabel}</button>
        <button id="attach" type="button" ${readOnly ? 'disabled' : ''} aria-label="${attachAria}">${attachLabel}</button>
        <button id="cancel" type="button" ${readOnly ? 'disabled' : ''} aria-label="${cancelAria}">${cancelLabel}</button>
        <button id="newSession" type="button" aria-label="${newSessionAria}">${newSessionLabel}</button>
      </div>`;
    const initScript = `
        const vscode = acquireVsCodeApi();
        const L = ${l10nJson};
        const messages = document.getElementById('messages');
        const a11yStatus = document.getElementById('a11y-status');
        const input = document.getElementById('input');
        const attachmentsEl = document.getElementById('attachments');
        const tokenCount = document.getElementById('token-count');
        const designStatus = document.getElementById('design-status');
        let streaming = false;
        let streamNode = null;
        let streamBuf = '';
        let attachments = [];

        function announce(msg) {
          if (!a11yStatus) return;
          a11yStatus.textContent = '';
          requestAnimationFrame(() => { a11yStatus.textContent = msg; });
        }

        function renderAttachments() {
          attachmentsEl.innerHTML = attachments.map((a, i) =>
            '<span style="font-size:11px;padding:2px 6px;border:1px solid var(--vscode-panel-border);border-radius:4px">@' +
            a.kind + ':' + a.label +
            ' <button type="button" data-i="' + i + '" aria-label="' + L.removeAttachment + '">×</button></span>'
          ).join('');
          attachmentsEl.querySelectorAll('button[data-i]').forEach(btn => {
            btn.onclick = () => {
              attachments.splice(Number(btn.getAttribute('data-i')), 1);
              renderAttachments();
            };
          });
        }

        input.addEventListener('input', () => {
          if (input.disabled) return;
          vscode.postMessage({ type: 'inputDraft', text: input.value, attachments: attachments.slice() });
        });
        document.getElementById('send').onclick = () => {
          if (streaming) return;
          const text = input.value.trim();
          if (!text && !attachments.length) return;
          const div = document.createElement('div');
          div.textContent = L.userPrefix + text + (attachments.length ? ' [' + attachments.map(a => '@' + a.kind + ':' + a.label).join(', ') + ']' : '');
          messages.appendChild(div);
          const sentAttachments = attachments.slice();
          input.value = '';
          attachments = [];
          renderAttachments();
          streaming = true;
          streamBuf = '';
          vscode.postMessage({ type: 'submit', text, attachments: sentAttachments });
        };
        document.getElementById('attach').onclick = () => vscode.postMessage({ type: 'pickMention' });
        input.addEventListener('keydown', (e) => {
          if (e.key === '@' && !input.disabled) {
            e.preventDefault();
            vscode.postMessage({ type: 'pickMention' });
          }
        });
        document.getElementById('cancel').onclick = () => vscode.postMessage({ type: 'cancel' });
        document.getElementById('newSession').onclick = () => {
          messages.innerHTML = '';
          attachments = [];
          renderAttachments();
          tokenCount.textContent = '0';
          vscode.postMessage({ type: 'newSession' });
        };
        window.addEventListener('message', e => {
          const m = e.data;
          if (m.type === 'mentionAttached' && m.mention) {
            attachments.push(m.mention);
            renderAttachments();
          }
          if (m.type === 'summarized' && m.path) {
            const div = document.createElement('div');
            div.style.fontSize = '11px';
            div.style.opacity = '0.8';
            div.textContent = '⟳ ' + L.summarized.replace('{path}', m.path);
            messages.appendChild(div);
          }
          if (m.type === 'streamStart') {
            streamNode = document.createElement('div');
            streamNode.textContent = L.assistantPrefix;
            messages.appendChild(streamNode);
          }
          if (m.type === 'streamChunk' && streamNode) {
            streamBuf += m.text;
            streamNode.textContent = L.assistantPrefix + streamBuf;
          }
          if (m.type === 'designStatus' && m.message && designStatus) {
            designStatus.textContent = m.message;
          }
          if (m.type === 'streamEnd') {
            streaming = false;
            if (typeof m.tokens === 'number') tokenCount.textContent = String(m.tokens);
            if (designStatus) designStatus.textContent = '';
            streamNode = null;
            announce(L.streamComplete);
          }
          if (m.type === 'tokenUpdate' && typeof m.tokens === 'number') {
            tokenCount.textContent = String(m.tokens);
          }
          if (m.type === 'streamCancelled') {
            streaming = false;
            streamNode = null;
            announce(L.streamCancelled);
          }
          if (m.type === 'error') {
            streaming = false;
            streamNode = null;
            announce(L.streamError.replace('{msg}', m.message || ''));
          }
        });
      `;
    return getWebviewHtml(this.panel!.webview, body, initScript, {
      title: t('conversation.panelTitle'),
    });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
