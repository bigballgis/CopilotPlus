/** Task DAG diagnostics in editor Problem pane — R-WF-3.3 */

import * as vscode from 'vscode';
import type { DagValidationError } from './taskDag';
import { tasksPath } from './taskDagStore';

const COLLECTION = 'copilotPlus.taskDag';

export class TaskDagDiagnostics {
  private readonly collection = vscode.languages.createDiagnosticCollection(COLLECTION);

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(this.collection);
  }

  async publish(buildId: string, errors: DagValidationError[]): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      return;
    }
    const file = tasksPath(root, buildId);
    const uri = vscode.Uri.file(file);
    let fileText = '';
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      fileText = doc.getText();
    } catch {
      fileText = '';
    }
    await this.publishForUri(uri, fileText, errors);
  }

  clear(buildId: string): void {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      return;
    }
    this.collection.delete(vscode.Uri.file(tasksPath(root, buildId)));
  }

  async publishForUri(
    uri: vscode.Uri,
    fileText: string,
    errors: DagValidationError[]
  ): Promise<void> {
    if (errors.length === 0) {
      this.collection.delete(uri);
      return;
    }

    const diagnostics: vscode.Diagnostic[] = errors.map((error) => {
      const line = error.taskId ? findTaskLine(fileText, error.taskId) : 0;
      const range = new vscode.Range(line, 0, line, 200);
      const diagnostic = new vscode.Diagnostic(range, error.message, vscode.DiagnosticSeverity.Error);
      diagnostic.source = 'Copilot Plus Task DAG';
      if (error.taskId) {
        diagnostic.code = error.taskId;
      }
      return diagnostic;
    });
    this.collection.set(uri, diagnostics);
  }
}

function findTaskLine(fileText: string, taskId: string): number {
  const needle = `"id": "${taskId}"`;
  const idx = fileText.indexOf(needle);
  if (idx < 0) {
    const alt = `"id":"${taskId}"`;
    const altIdx = fileText.indexOf(alt);
    if (altIdx < 0) {
      return 0;
    }
    return fileText.slice(0, altIdx).split('\n').length - 1;
  }
  return fileText.slice(0, idx).split('\n').length - 1;
}
