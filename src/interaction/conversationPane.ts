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

export class ConversationPaneProvider {
  private panel: vscode.WebviewPanel | undefined;
  private readonly sessions: SessionStore;
  private cancelSource: vscode.CancellationTokenSource | undefined;
  private sessionTokens = 0;
  private pendingAttachments: MentionAttachment[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    private readonly app: AppServices
  ) {
    this.sessions = new SessionStore(context);
    void this.sessions.load();
  }

  async show(column: vscode.ViewColumn): Promise<void> {
    if (this.panel) {
      this.panel.reveal(column);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'copilotPlus.conversation',
      'Copilot Plus — Design',
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
    });
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
      void vscode.window.showWarningMessage('Offline — cannot send model request.');
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
        this.postMessage({ type: 'error', message: prepared.blockReason ?? 'Request blocked' });
        void vscode.window.showWarningMessage(prepared.blockReason ?? 'Request blocked');
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
        contextPrefix
      );

      if (result.cancelled) {
        this.postMessage({ type: 'streamCancelled' });
        return;
      }

      await this.sessions.appendAssistantMessage(result.text);
      this.sessionTokens += result.inputTokens + result.outputTokens;
      this.postMessage({ type: 'streamEnd', text: result.text, tokens: this.sessionTokens });
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
    const banner = readOnly
      ? `<div class="banner" role="status">Direct input unavailable in ${stage} stage.</div>`
      : '';
    const body = `
      ${banner}
      <header style="margin-bottom:8px;font-size:12px;opacity:0.85">
        Model: ${escapeHtml(model)} · Stage: ${stage} · Tokens: <span id="token-count">${this.sessionTokens}</span>
      </header>
      <div id="messages" role="log" aria-live="polite" aria-relevant="additions" style="min-height:200px;border:1px solid var(--vscode-panel-border);padding:8px;margin-bottom:8px"></div>
      <div id="attachments" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;min-height:4px"></div>
      <textarea id="input" rows="3" style="width:100%;box-sizing:border-box" ${readOnly ? 'disabled aria-disabled="true"' : 'aria-label="Design conversation input"'} placeholder="Describe your design… (@ to attach context)"></textarea>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button id="send" type="button" ${readOnly ? 'disabled' : ''} aria-label="Send message">Send</button>
        <button id="attach" type="button" ${readOnly ? 'disabled' : ''} aria-label="Attach context">@ Attach</button>
        <button id="cancel" type="button" ${readOnly ? 'disabled' : ''} aria-label="Cancel request">Cancel</button>
        <button id="newSession" type="button" aria-label="New session">New Session</button>
      </div>
      <script nonce="">
        const vscode = acquireVsCodeApi();
        const messages = document.getElementById('messages');
        const input = document.getElementById('input');
        const attachmentsEl = document.getElementById('attachments');
        const tokenCount = document.getElementById('token-count');
        let streaming = false;
        let streamNode = null;
        let streamBuf = '';
        let attachments = [];

        function renderAttachments() {
          attachmentsEl.innerHTML = attachments.map((a, i) =>
            '<span style="font-size:11px;padding:2px 6px;border:1px solid var(--vscode-panel-border);border-radius:4px">@' +
            a.kind + ':' + a.label +
            ' <button type="button" data-i="' + i + '" aria-label="Remove attachment">×</button></span>'
          ).join('');
          attachmentsEl.querySelectorAll('button[data-i]').forEach(btn => {
            btn.onclick = () => {
              attachments.splice(Number(btn.getAttribute('data-i')), 1);
              renderAttachments();
            };
          });
        }

        document.getElementById('send').onclick = () => {
          if (streaming) return;
          const text = input.value.trim();
          if (!text && !attachments.length) return;
          const div = document.createElement('div');
          div.textContent = 'You: ' + text + (attachments.length ? ' [' + attachments.map(a => '@' + a.kind + ':' + a.label).join(', ') + ']' : '');
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
            div.textContent = '⟳ Summarized — ' + m.path;
            messages.appendChild(div);
          }
          if (m.type === 'streamStart') {
            streamNode = document.createElement('div');
            streamNode.textContent = 'Assistant: ';
            messages.appendChild(streamNode);
          }
          if (m.type === 'streamChunk' && streamNode) {
            streamBuf += m.text;
            streamNode.textContent = 'Assistant: ' + streamBuf;
          }
          if (m.type === 'streamEnd') {
            streaming = false;
            if (typeof m.tokens === 'number') tokenCount.textContent = String(m.tokens);
            streamNode = null;
          }
          if (m.type === 'streamCancelled' || m.type === 'error') {
            streaming = false;
            streamNode = null;
          }
        });
      </script>`;
    return getWebviewHtml(this.panel!.webview, this.extensionUri, body);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
