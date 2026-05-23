/** Base webview helper */

import * as vscode from 'vscode';

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri, script: string): string {
  const nonce = String(Date.now());
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Copilot Plus</title>
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
  </style>
</head>
<body>
  ${script}
</body>
</html>`;
}

export function uriFor(webview: vscode.Webview, extensionUri: vscode.Uri, ...path: string[]): vscode.Uri {
  return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...path));
}
