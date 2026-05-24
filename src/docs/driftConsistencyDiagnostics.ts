/** Drift consistency diagnostics in editor Problem pane — R-DOCS-12.6 */

import * as vscode from 'vscode';
import type { DriftItem } from './driftTypes';

const COLLECTION = 'copilotPlus.drift';

export class DriftConsistencyDiagnostics {
  private readonly collection = vscode.languages.createDiagnosticCollection(COLLECTION);

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(this.collection);
  }

  publishMismatch(filePath: string, item: DriftItem, componentDocPath: string): void {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      return;
    }
    const uri = vscode.Uri.file(`${root}/${filePath.replace(/\//g, '\\')}`);
    const message = item.detail
      ? `${item.type}: ${item.detail} (see ${componentDocPath})`
      : `${item.type}: see ${componentDocPath}`;
    const diagnostic = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), message, vscode.DiagnosticSeverity.Warning);
    diagnostic.source = 'Copilot Plus Drift';
    diagnostic.code = item.id;
    this.collection.set(uri, [diagnostic]);
  }

  clearPath(filePath: string): void {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      return;
    }
    this.collection.delete(vscode.Uri.file(`${root}/${filePath.replace(/\//g, '\\')}`));
  }

  clearAll(): void {
    this.collection.clear();
  }
}
