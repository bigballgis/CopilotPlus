/** Conversation Pane — R-INT-2 */

import * as vscode from 'vscode';
import type { PlatformServices } from '../platform/services';
import { getWebviewHtml } from './webviewHtml';
import { SessionStore } from './sessionStore';
import type { WorkflowStage } from '../shared/types';

export class ConversationPaneProvider {
  private panel: vscode.WebviewPanel | undefined;
  private stage: WorkflowStage = 'Design';
  private readonly sessions: SessionStore;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly services: PlatformServices
  ) {
    this.sessions = new SessionStore();
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

    this.panel.webview.onDidReceiveMessage(async (msg: { type: string; text?: string }) => {
      if (msg.type === 'submit' && msg.text) {
        await this.handleSubmit(msg.text);
      }
    });
  }

  setStage(stage: WorkflowStage): void {
    this.stage = stage;
    if (this.panel) {
      this.panel.webview.html = this.render();
    }
  }

  private async handleSubmit(text: string): Promise<void> {
    if (this.stage !== 'Design') {
      return;
    }
    if (this.services.network.isOffline()) {
      void vscode.window.showWarningMessage('Offline — cannot send model request.');
      return;
    }
    await this.sessions.appendUserMessage(text);
    this.postMessage({ type: 'userMessage', text });
    // Primary agent invocation — Phase 4
    this.postMessage({ type: 'assistantMessage', text: `[Primary Agent stub] Received: ${text}` });
  }

  private postMessage(msg: unknown): void {
    void this.panel?.webview.postMessage(msg);
  }

  private render(): string {
    const readOnly = this.stage !== 'Design';
    const model = this.services.models.getSelected()?.name ?? 'none';
    const banner = readOnly
      ? `<div class="banner" role="status">Direct input unavailable in ${this.stage} stage.</div>`
      : '';
    const body = `
      ${banner}
      <header style="margin-bottom:8px;font-size:12px;opacity:0.85">
        Model: ${escapeHtml(model)} · Stage: ${this.stage} · Tokens: 0
      </header>
      <div id="messages" role="log" aria-live="polite" aria-relevant="additions" style="min-height:200px;border:1px solid var(--vscode-panel-border);padding:8px;margin-bottom:8px"></div>
      <textarea id="input" rows="3" style="width:100%;box-sizing:border-box" ${readOnly ? 'disabled aria-disabled="true"' : 'aria-label="Design conversation input"'} placeholder="Describe your design…"></textarea>
      <button id="send" type="button" ${readOnly ? 'disabled' : ''} aria-label="Send message">Send</button>
      <script nonce="">
        const vscode = acquireVsCodeApi();
        const messages = document.getElementById('messages');
        const input = document.getElementById('input');
        document.getElementById('send').onclick = () => {
          const text = input.value.trim();
          if (!text) return;
          const div = document.createElement('div');
          div.textContent = 'You: ' + text;
          messages.appendChild(div);
          input.value = '';
          vscode.postMessage({ type: 'submit', text });
        };
        window.addEventListener('message', e => {
          const m = e.data;
          if (m.type === 'assistantMessage') {
            const div = document.createElement('div');
            div.textContent = 'Assistant: ' + m.text;
            messages.appendChild(div);
          }
        });
      </script>`;
    return getWebviewHtml(this.panel!.webview, this.extensionUri, body);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
