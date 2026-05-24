/** Load Vite-built React webview bundles — R-INT-2 */

import * as vscode from 'vscode';
import { getWebviewHtml, uriFor, type WebviewHtmlOptions } from './webviewHtml';

function sharedStyleUris(webview: vscode.Webview, extensionUri: vscode.Uri): string[] {
  return [uriFor(webview, extensionUri, 'dist', 'webview', 'codicons', 'codicon.css').toString()];
}

export function getConversationWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  options?: WebviewHtmlOptions
): string {
  const scriptUri = uriFor(webview, extensionUri, 'dist', 'webview', 'conversation.js');
  const styleUri = uriFor(webview, extensionUri, 'dist', 'webview', 'conversation.css');
  const body = '<div id="root"></div>';
  return getWebviewHtml(webview, body, undefined, {
    ...options,
    styles: [...sharedStyleUris(webview, extensionUri), styleUri.toString()],
    scripts: [scriptUri.toString()],
  });
}

export function getTabWorkspaceWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  options?: WebviewHtmlOptions
): string {
  const scriptUri = uriFor(webview, extensionUri, 'dist', 'webview', 'tabWorkspace.js');
  const styleUri = uriFor(webview, extensionUri, 'dist', 'webview', 'tabWorkspace.css');
  const body = '<div id="root"></div>';
  return getWebviewHtml(webview, body, undefined, {
    ...options,
    styles: [...sharedStyleUris(webview, extensionUri), styleUri.toString()],
    scripts: [scriptUri.toString()],
  });
}
