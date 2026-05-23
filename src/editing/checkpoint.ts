/** Checkpoints — R-EDIT-5 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { COPILOT_PLUS_HOME } from '../shared/constants';

export type CheckpointKind = 'Pre_Edit' | 'Pre_Commit' | 'Post_Commit';

export interface CheckpointRecord {
  id: string;
  kind: CheckpointKind;
  timestamp: string;
  operation: string;
  taskId?: string;
  files: string[];
}

export class CheckpointService {
  private retention = 50;

  setRetention(count: number): void {
    this.retention = count;
  }

  async recordPreEdit(
    filePaths: Array<{ relative: string; content: string }>,
    operation: string,
    taskId?: string
  ): Promise<string> {
    const root = this.checkpointRoot();
    if (!root) {
      throw new Error('No workspace folder for checkpoint.');
    }
    const id = `ckpt-${Date.now()}`;
    const dir = path.join(root, id);
    await fs.mkdir(dir, { recursive: true });
    const manifest: CheckpointRecord = {
      id,
      kind: 'Pre_Edit',
      timestamp: new Date().toISOString(),
      operation,
      taskId,
      files: [],
    };

    for (const file of filePaths) {
      const target = path.join(dir, 'files', file.relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, file.content, 'utf8');
      manifest.files.push(file.relative);
    }

    await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    await this.evictOld(root);
    return id;
  }

  async restore(checkpointId: string): Promise<string[]> {
    const root = this.checkpointRoot();
    if (!root) {
      throw new Error('No workspace folder.');
    }
    const dir = path.join(root, checkpointId);
    const manifest = JSON.parse(
      await fs.readFile(path.join(dir, 'manifest.json'), 'utf8')
    ) as CheckpointRecord;

    const workspace = vscode.workspace.workspaceFolders![0];
    const restored: string[] = [];

    for (const rel of manifest.files) {
      const content = await fs.readFile(path.join(dir, 'files', rel), 'utf8');
      const uri = vscode.Uri.joinPath(workspace.uri, rel);
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        const edit = new vscode.WorkspaceEdit();
        const lastLine = doc.lineAt(Math.max(0, doc.lineCount - 1));
        edit.replace(uri, new vscode.Range(0, 0, lastLine.lineNumber, lastLine.text.length), content);
        await vscode.workspace.applyEdit(edit);
      } catch {
        const edit = new vscode.WorkspaceEdit();
        edit.createFile(uri, { overwrite: true });
        edit.insert(uri, new vscode.Position(0, 0), content);
        await vscode.workspace.applyEdit(edit);
      }
      restored.push(rel);
    }
    return restored;
  }

  private checkpointRoot(): string | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return undefined;
    }
    return path.join(folder.uri.fsPath, COPILOT_PLUS_HOME, 'checkpoints');
  }

  private async evictOld(root: string): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(root);
    } catch {
      return;
    }
    const sorted = entries.filter((e) => e.startsWith('ckpt-')).sort();
    while (sorted.length > this.retention) {
      const oldest = sorted.shift();
      if (oldest) {
        await fs.rm(path.join(root, oldest), { recursive: true, force: true });
      }
    }
  }
}
