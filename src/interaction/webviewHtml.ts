/** Base webview helper — CSP-safe script nonce */

import * as vscode from 'vscode';
import { t } from '../platform/l10n';

export function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

export interface WebviewHtmlOptions {
  /** BCP-47 language tag; defaults to Host_Editor locale. */
  lang?: string;
  /** Page title for assistive tech. */
  title?: string;
}

/** @param bodyHtml Main panel markup (no script tags). @param initScript Optional webview bootstrap JS. */
export function getWebviewHtml(
  webview: vscode.Webview,
  bodyHtml: string,
  initScript?: string,
  options?: WebviewHtmlOptions
): string {
  const nonce = getNonce();
  const lang = options?.lang ?? vscode.env.language ?? 'en';
  const title = options?.title ?? t('webview.title');
  const skipLabel = t('webview.skipToContent');
  const scriptBlock = initScript
    ? `<script nonce="${nonce}">\n${initScript}\n</script>`
    : '';
  return `<!DOCTYPE html>
<html lang="${escapeAttr(lang)}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 8px; }
    button, select, input, textarea { font: inherit; }
    .banner { background: var(--vscode-inputValidation-warningBackground); padding: 8px; margin-bottom: 8px; }
    .section { margin-bottom: 12px; border: 1px solid var(--vscode-panel-border); padding: 8px; }
    .section h3 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; opacity: 0.8; }
    [role="tablist"] { display: flex; gap: 4px; flex-wrap: wrap; }
    [role="tab"] { padding: 4px 8px; cursor: pointer; border: 1px solid var(--vscode-panel-border); background: transparent; color: inherit; }
    [role="tab"][aria-selected="true"] { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    :focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
    .skip-link { position: absolute; left: -9999px; top: auto; width: 1px; height: 1px; overflow: hidden; }
    .skip-link:focus { position: static; width: auto; height: auto; margin-bottom: 8px; display: inline-block; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  </style>
</head>
<body>
  <a class="skip-link" href="#main-content">${escapeHtml(skipLabel)}</a>
  <main id="main-content">
  ${bodyHtml}
  </main>
  ${scriptBlock}
</body>
</html>`;
}

export function uriFor(webview: vscode.Webview, extensionUri: vscode.Uri, ...path: string[]): vscode.Uri {
  return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...path));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
