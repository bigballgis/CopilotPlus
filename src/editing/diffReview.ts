/** Diff Review UI — R-EDIT-4 */

import * as vscode from 'vscode';
import { CheckpointService } from './checkpoint';
import { ProposedContentProvider } from './proposedContentProvider';
import { applyEdits, type PatchEdit } from '../tools/applyPatchLogic';
import * as path from 'path';

export interface PendingFileChange {
  id: string;
  fileUri: vscode.Uri;
  relativePath: string;
  original: string;
  proposed: string;
  operation: string;
}

export class DiffReviewService {
  private pending = new Map<string, PendingFileChange>();

  constructor(
    private readonly checkpoints: CheckpointService,
    private readonly proposedProvider: ProposedContentProvider
  ) {}

  async reviewReplaceRange(
    fileUri: vscode.Uri,
    range: vscode.Range,
    proposedText: string,
    operation: string
  ): Promise<boolean> {
    const doc = await vscode.workspace.openTextDocument(fileUri);
    const original = doc.getText();
    const before = doc.getText(new vscode.Range(0, 0, range.start.line, range.start.character));
    const after = doc.getText(new vscode.Range(range.end.line, range.end.character, doc.lineCount, 0));
    const proposed = before + proposedText + after;
    return this.reviewFullFile(fileUri, original, proposed, operation);
  }

  async reviewFullFile(
    fileUri: vscode.Uri,
    original: string,
    proposed: string,
    operation: string
  ): Promise<boolean> {
    if (original === proposed) {
      void vscode.window.showInformationMessage('No changes proposed.');
      return false;
    }

    const relativePath = this.relativePath(fileUri);
    const id = `change-${Date.now()}`;
    this.pending.set(id, { id, fileUri, relativePath, original, proposed, operation });

    const proposedUri = this.proposedProvider.createProposedUri(relativePath);
    this.proposedProvider.setProposed(proposedUri, proposed);

    await vscode.commands.executeCommand('vscode.diff', fileUri, proposedUri, `${path.basename(relativePath)} (Proposed)`);

    const accept = 'Accept';
    const reject = 'Reject';
    const choice = await vscode.window.showInformationMessage(
      `Review AI changes to ${relativePath}`,
      { modal: true },
      accept,
      reject
    );

    this.pending.delete(id);

    if (choice !== accept) {
      return false;
    }

    try {
      await this.checkpoints.recordPreEdit([{ relative: relativePath, content: original }], operation);
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Checkpoint failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    }

    const edit = new vscode.WorkspaceEdit();
    const doc = await vscode.workspace.openTextDocument(fileUri);
    const last = doc.lineAt(Math.max(0, doc.lineCount - 1));
    edit.replace(
      fileUri,
      new vscode.Range(0, 0, last.line, last.text.length),
      proposed
    );
    const ok = await vscode.workspace.applyEdit(edit);
    if (ok) {
      void vscode.window.showInformationMessage('Changes applied.');
    }
    return ok;
  }

  async reviewPatch(
    fileUri: vscode.Uri,
    edits: PatchEdit[],
    operation: string
  ): Promise<boolean> {
    const doc = await vscode.workspace.openTextDocument(fileUri);
    const result = applyEdits(doc.getText(), edits);
    if (!result.ok) {
      void vscode.window.showErrorMessage(`Patch failed: ${result.reason}`);
      return false;
    }
    return this.reviewFullFile(fileUri, doc.getText(), result.content, operation);
  }

  private relativePath(fileUri: vscode.Uri): string {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) {
      return fileUri.fsPath;
    }
    return path.relative(root.fsPath, fileUri.fsPath).replace(/\\/g, '/');
  }
}
