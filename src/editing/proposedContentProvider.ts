/** Virtual content for diff preview — R-EDIT-4 */

import * as vscode from 'vscode';

const SCHEME = 'copilotplus-proposed';

export class ProposedContentProvider implements vscode.TextDocumentContentProvider {
  private readonly contents = new Map<string, string>();
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.emitter.event;

  static register(context: vscode.ExtensionContext): ProposedContentProvider {
    const provider = new ProposedContentProvider();
    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(SCHEME, provider)
    );
    return provider;
  }

  setProposed(uri: vscode.Uri, content: string): void {
    this.contents.set(uri.toString(), content);
    this.emitter.fire(uri);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? '';
  }

  createProposedUri(label: string): vscode.Uri {
    return vscode.Uri.parse(`${SCHEME}:${label}?${Date.now()}`);
  }
}
