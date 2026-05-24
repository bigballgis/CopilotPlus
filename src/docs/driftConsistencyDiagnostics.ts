/** Drift consistency diagnostics in editor Problem pane — R-DOCS-11.3 / R-DOCS-12.6 */

import * as vscode from 'vscode';
import type { DriftItem, DriftType } from './driftTypes';

const COLLECTION = 'copilotPlus.drift';

const CODE_FILE_TYPES: ReadonlySet<DriftType> = new Set([
  'Orphan_Code',
  'Ownership_Conflict',
  'Code_Mismatch_Suspected',
]);

export class DriftConsistencyDiagnostics {
  private readonly collection = vscode.languages.createDiagnosticCollection(COLLECTION);
  private readonly trackedStaticFiles = new Set<string>();
  private readonly trackedMismatchFiles = new Set<string>();

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(this.collection);
  }

  publishMismatch(filePath: string, item: DriftItem, componentDocPath: string): void {
    this.trackedMismatchFiles.add(filePath.replace(/\\/g, '/'));
    this.publish(filePath, item, componentDocPath);
  }

  syncStaticCodeDrift(items: DriftItem[]): void {
    const next = new Set<string>();
    for (const item of items) {
      if (item.layer !== 'code' || !CODE_FILE_TYPES.has(item.type) || item.type === 'Code_Mismatch_Suspected') {
        continue;
      }
      next.add(item.target);
      this.publish(item.target, item);
    }
    for (const file of this.trackedStaticFiles) {
      if (!next.has(file)) {
        this.clearPath(file);
      }
    }
    this.trackedStaticFiles.clear();
    for (const file of next) {
      this.trackedStaticFiles.add(file);
    }
  }

  clearMismatchPath(filePath: string): void {
    const norm = filePath.replace(/\\/g, '/');
    this.trackedMismatchFiles.delete(norm);
    if (!this.trackedStaticFiles.has(norm)) {
      this.clearPath(norm);
    }
  }

  private publish(filePath: string, item: DriftItem, componentDocPath?: string): void {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      return;
    }
    const norm = filePath.replace(/\\/g, '/');
    const uri = vscode.Uri.file(`${root}/${norm.replace(/\//g, '\\')}`);
    const suffix = componentDocPath ? ` (see ${componentDocPath})` : '';
    const message = item.detail ? `${item.type}: ${item.detail}${suffix}` : `${item.type}${suffix}`;
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
    this.trackedStaticFiles.clear();
    this.trackedMismatchFiles.clear();
  }
}
