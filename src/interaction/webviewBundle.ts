/** Load Vite-built React webview bundles — R-INT-2 */

import * as vscode from 'vscode';
import { getWebviewHtml, uriFor, type WebviewHtmlOptions } from './webviewHtml';

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
    styles: [styleUri.toString()],
    scripts: [scriptUri.toString()],
  });
}
