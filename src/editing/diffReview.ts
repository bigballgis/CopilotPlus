/** Diff Review UI — R-EDIT-4 */

import * as vscode from 'vscode';
import { CheckpointService } from './checkpoint';
import { ProposedContentProvider } from './proposedContentProvider';
import { applyEdits, type PatchEdit } from '../tools/applyPatchLogic';
import * as path from 'path';
import { t } from '../platform/l10n';

export interface ComposerBatchItem {
  relativePath: string;
  fileUri: vscode.Uri;
  original: string;
  proposed: string;
}

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
  private ciAutoApply = false;
  private onCiDiff: ((path: string, operation: string, before: string, after: string) => void) | undefined;

  constructor(
    private readonly checkpoints: CheckpointService,
    private readonly proposedProvider: ProposedContentProvider,
    private readonly onFileApplied?: (relativePath: string) => void
  ) {}

  setCiAutoApply(
    enabled: boolean,
    onDiff?: (path: string, operation: string, before: string, after: string) => void
  ): void {
    this.ciAutoApply = enabled;
    this.onCiDiff = onDiff;
  }

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
    operation: string,
    taskId?: string
  ): Promise<boolean> {
    if (original === proposed) {
      if (!this.ciAutoApply) {
        void vscode.window.showInformationMessage(t('diffReview.noChanges'));
      }
      return false;
    }

    const relativePath = this.relativePath(fileUri);
    if (this.ciAutoApply) {
      return this.applyDirectly(fileUri, relativePath, original, proposed, operation, taskId);
    }
    const id = `change-${Date.now()}`;
    this.pending.set(id, { id, fileUri, relativePath, original, proposed, operation });

    const proposedUri = this.proposedProvider.createProposedUri(relativePath);
    this.proposedProvider.setProposed(proposedUri, proposed);

    await vscode.commands.executeCommand('vscode.diff', fileUri, proposedUri, `${path.basename(relativePath)} (Proposed)`);

    const accept = t('diffReview.accept');
    const reject = t('diffReview.reject');
    const choice = await vscode.window.showInformationMessage(
      t('diffReview.reviewPrompt', relativePath),
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
        t('diffReview.checkpointFailed', err instanceof Error ? err.message : String(err))
      );
      return false;
    }

    const edit = new vscode.WorkspaceEdit();
    const doc = await vscode.workspace.openTextDocument(fileUri);
    const last = doc.lineAt(Math.max(0, doc.lineCount - 1));
    edit.replace(
      fileUri,
      new vscode.Range(0, 0, last.lineNumber, last.text.length),
      proposed
    );
    const ok = await vscode.workspace.applyEdit(edit);
    if (ok) {
      void vscode.window.showInformationMessage(t('diffReview.applied'));
      this.onFileApplied?.(relativePath);
    }
    return ok;
  }

  private async applyDirectly(
    fileUri: vscode.Uri,
    relativePath: string,
    original: string,
    proposed: string,
    operation: string,
    taskId?: string
  ): Promise<boolean> {
    this.onCiDiff?.(relativePath, operation, original, proposed);
    try {
      await this.checkpoints.recordPreEdit([{ relative: relativePath, content: original }], operation, taskId);
    } catch {
      return false;
    }
    const edit = new vscode.WorkspaceEdit();
    try {
      const doc = await vscode.workspace.openTextDocument(fileUri);
      const last = doc.lineAt(Math.max(0, doc.lineCount - 1));
      edit.replace(
        fileUri,
        new vscode.Range(0, 0, last.lineNumber, last.text.length),
        proposed
      );
    } catch {
      edit.createFile(fileUri, { overwrite: false });
      edit.insert(fileUri, new vscode.Position(0, 0), proposed);
    }
    return vscode.workspace.applyEdit(edit).then((ok) => {
      if (ok) {
        this.onFileApplied?.(relativePath);
      }
      return ok;
    });
  }

  /** R-EDIT-3 — multi-file Composer review with Apply All */
  async reviewComposerBatch(
    items: ComposerBatchItem[],
    operation: string,
    taskId?: string
  ): Promise<boolean> {
    if (items.length === 0) {
      return false;
    }

    type ReviewState = 'pending' | 'accepted' | 'rejected';
    const states = new Map<string, ReviewState>();
    const proposals = new Map<string, string>();
    for (const item of items) {
      states.set(item.relativePath, 'pending');
      proposals.set(item.relativePath, item.proposed);
    }

    while (true) {
      const pending = items.filter((i) => states.get(i.relativePath) === 'pending');
      if (pending.length === 0) {
        break;
      }

      for (const item of pending) {
        const proposed = proposals.get(item.relativePath) ?? item.proposed;
        if (item.original === proposed) {
          states.set(item.relativePath, 'rejected');
          continue;
        }

        const proposedUri = this.proposedProvider.createProposedUri(item.relativePath);
        this.proposedProvider.setProposed(proposedUri, proposed);
        await vscode.commands.executeCommand(
          'vscode.diff',
          item.fileUri,
          proposedUri,
          `${path.basename(item.relativePath)} (Composer)`
        );

        const choice = await vscode.window.showInformationMessage(
          `Review ${item.relativePath}`,
          { modal: true },
          'Accept',
          'Reject',
          'Modify',
          'Skip remaining'
        );

        if (choice === 'Skip remaining') {
          for (const rest of pending) {
            if (states.get(rest.relativePath) === 'pending') {
              states.set(rest.relativePath, 'rejected');
            }
          }
          break;
        }
        if (choice === 'Modify') {
          const edited = await vscode.window.showInputBox({
            prompt: `Edit proposed content for ${item.relativePath}`,
            value: proposed.slice(0, 5000),
            ignoreFocusOut: true,
          });
          if (edited != null) {
            proposals.set(item.relativePath, edited);
            continue;
          }
          states.set(item.relativePath, 'rejected');
        } else if (choice === 'Accept') {
          states.set(item.relativePath, 'accepted');
        } else {
          states.set(item.relativePath, 'rejected');
        }
      }
    }

    const accepted = items.filter((i) => states.get(i.relativePath) === 'accepted');
    if (accepted.length === 0) {
      void vscode.window.showInformationMessage(t('diffReview.composerNoAccepted'));
      return false;
    }

    const applyAll = await vscode.window.showInformationMessage(
      t('diffReview.applyAll'),
      { modal: true },
      t('diffReview.applyAllAction'),
      t('diffReview.reject')
    );
    if (applyAll !== t('diffReview.applyAllAction')) {
      return false;
    }

    const snapshots = accepted.map((item) => ({
      relative: item.relativePath,
      content: item.original,
    }));

    try {
      await this.checkpoints.recordPreEdit(snapshots, operation, taskId);
    } catch (err) {
      void vscode.window.showErrorMessage(
        t('diffReview.checkpointFailed', err instanceof Error ? err.message : String(err))
      );
      return false;
    }

    const written: Array<{ relativePath: string; original: string }> = [];
    for (const item of accepted) {
      const proposed = proposals.get(item.relativePath) ?? item.proposed;
      const edit = new vscode.WorkspaceEdit();
      try {
        const doc = await vscode.workspace.openTextDocument(item.fileUri);
        const last = doc.lineAt(Math.max(0, doc.lineCount - 1));
        edit.replace(
          item.fileUri,
          new vscode.Range(0, 0, last.lineNumber, last.text.length),
          proposed
        );
      } catch {
        edit.createFile(item.fileUri, { overwrite: false });
        edit.insert(item.fileUri, new vscode.Position(0, 0), proposed);
      }
      const ok = await vscode.workspace.applyEdit(edit);
      if (!ok) {
        await this.rollbackWritten(written);
        void vscode.window.showErrorMessage(t('diffReview.rollbackFailed', item.relativePath));
        return false;
      }
      written.push({ relativePath: item.relativePath, original: item.original });
    }

    void vscode.window.showInformationMessage(t('diffReview.appliedComposer', accepted.length));
    for (const item of accepted) {
      this.onFileApplied?.(item.relativePath);
    }
    return true;
  }

  private async rollbackWritten(written: Array<{ relativePath: string; original: string }>): Promise<void> {
    for (const item of [...written].reverse()) {
      const root = vscode.workspace.workspaceFolders?.[0];
      if (!root) {
        continue;
      }
      const uri = vscode.Uri.joinPath(root.uri, ...item.relativePath.split('/'));
      const edit = new vscode.WorkspaceEdit();
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        const last = doc.lineAt(Math.max(0, doc.lineCount - 1));
        edit.replace(uri, new vscode.Range(0, 0, last.lineNumber, last.text.length), item.original);
        await vscode.workspace.applyEdit(edit);
      } catch {
        edit.deleteFile(uri);
        await vscode.workspace.applyEdit(edit);
      }
    }
  }

  async reviewPatch(
    fileUri: vscode.Uri,
    edits: PatchEdit[],
    operation: string
  ): Promise<boolean> {
    const doc = await vscode.workspace.openTextDocument(fileUri);
    const result = applyEdits(doc.getText(), edits);
    if (!result.ok) {
      void vscode.window.showErrorMessage(t('diffReview.patchFailed', result.reason ?? ''));
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
