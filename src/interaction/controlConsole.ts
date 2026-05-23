/** Control Console activity bar webview — R-INT-9 */

import * as vscode from 'vscode';
import type { PlatformServices } from '../platform/services';
import { getWebviewHtml } from './webviewHtml';

export class ControlConsoleProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'copilotPlus.controlConsole';

  constructor(private readonly services: PlatformServices) {}

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
        void this.services.models.pickModel();
      }
    });
  }

  private render(webview: vscode.Webview): string {
    const s = this.services.getSettings();
    const model = this.services.models.getSelected()?.name ?? 'none';
    const body = `
      <div class="section" role="region" aria-label="Status">
        <h3>Status</h3>
        <div>Model: ${escapeHtml(model)}</div>
        <div>Offline: ${this.services.network.isOffline() ? 'yes' : 'no'}</div>
      </div>
      <div class="section" role="region" aria-label="Workflow Stage">
        <h3>Workflow Stage</h3>
        <div id="stage">Design</div>
        <div>Autonomy: ${escapeHtml(s.autonomyLevel)}</div>
      </div>
      <div class="section" role="region" aria-label="Models">
        <h3>Models</h3>
        <button type="button" aria-label="Select model" onclick="vscode.postMessage({type:'selectModel'})">Select model</button>
      </div>
      <div class="section" role="region" aria-label="Settings">
        <h3>Settings</h3>
        <button type="button" aria-label="Open settings" onclick="vscode.postMessage({type:'openSettings'})">Open Settings</button>
      </div>
      <script nonce="">
        const vscode = acquireVsCodeApi();
      </script>`;
    return getWebviewHtml(webview, vscode.Uri.file(''), body);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
