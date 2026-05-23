/** Composer multi-file edits — R-EDIT-3 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { AppServices } from '../app/appServices';
import { streamChat } from '../platform/chatClient';
import {
  COMPOSER_TIMEOUT_MS,
  parseComposerResponse,
  validateComposerInput,
  type ComposerValidationError,
} from './composerParse';
import { sha256Text } from './responseCacheKey';
import type { ComposerBatchItem } from './diffReview';

export interface ComposerSnapshot {
  status: 'idle' | 'generating' | 'review' | 'error';
  goal: string;
  attachedFiles: string[];
  messages: string[];
  lastError?: string;
}

type ChangeListener = () => void;

export class ComposerService {
  private cancelSource: vscode.CancellationTokenSource | undefined;
  private snapshot: ComposerSnapshot = {
    status: 'idle',
    goal: '',
    attachedFiles: [],
    messages: [],
  };
  private listeners = new Set<ChangeListener>();

  constructor(private readonly app: AppServices) {}

  getSnapshot(): ComposerSnapshot {
    return { ...this.snapshot, attachedFiles: [...this.snapshot.attachedFiles], messages: [...this.snapshot.messages] };
  }

  onChange(listener: ChangeListener): vscode.Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  setGoal(goal: string): void {
    this.snapshot.goal = goal;
    this.notify();
  }

  setAttachedFiles(paths: string[]): void {
    this.snapshot.attachedFiles = [...new Set(paths.map((p) => p.replace(/\\/g, '/')))];
    this.notify();
  }

  async attachFromPicker(): Promise<void> {
    const picks = await vscode.window.showOpenDialog({
      canSelectMany: true,
      openLabel: 'Attach to Composer',
      defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
    });
    if (!picks?.length) {
      return;
    }
    const root = vscode.workspace.workspaceFolders?.[0];
    if (!root) {
      return;
    }
    const rel = picks.map((uri) => path.relative(root.uri.fsPath, uri.fsPath).replace(/\\/g, '/'));
    this.setAttachedFiles([...this.snapshot.attachedFiles, ...rel]);
  }

  attachOpenEditors(): void {
    const rel = vscode.window.visibleTextEditors
      .map((e) => vscode.workspace.asRelativePath(e.document.uri).replace(/\\/g, '/'))
      .filter((p) => !p.startsWith('..'));
    this.setAttachedFiles([...this.snapshot.attachedFiles, ...rel]);
  }

  cancel(): void {
    this.cancelSource?.cancel();
    this.appendMessage('Composer cancelled.');
    this.snapshot.status = 'idle';
    this.notify();
  }

  async submit(taskId?: string): Promise<boolean> {
    const goal = this.snapshot.goal;
    const attached = this.snapshot.attachedFiles;
    const stage = this.app.stages.getStage();
    const fileMeta = await this.loadFileMeta(attached);
    const missing = fileMeta.find((f) => !f.exists);
    if (missing) {
      this.failValidation({ code: 'file_missing', message: `File not found: ${missing.relativePath}` });
      return false;
    }
    const validation = validateComposerInput(goal, fileMeta, {
      stage,
      sensitivePaths: fileMeta.filter((f) => this.app.platform.isPathSensitive(f.relativePath).sensitive).map((f) => f.relativePath),
    });
    if (validation) {
      this.failValidation(validation);
      return false;
    }

    if (this.app.platform.network.isOffline()) {
      this.setError('Offline — Composer unavailable.');
      return false;
    }

    const model = await this.app.platform.models.resolveSelectionForSurface('composer');
    if (!model) {
      await this.app.platform.auth.ensureModelsAvailable();
      this.setError('No Copilot model selected.');
      return false;
    }

    this.cancelSource?.cancel();
    this.cancelSource = new vscode.CancellationTokenSource();
    const token = this.cancelSource.token;
    this.snapshot.status = 'generating';
    this.snapshot.lastError = undefined;
    this.appendMessage(`Generating edits for ${attached.length} file(s)…`);
    this.notify();

    const fileContents = await this.readAttachedFiles(attached);
    const userMessage = buildComposerPrompt(goal, fileContents);
    const fileFingerprint = sha256Text(
      JSON.stringify(fileContents.map((f) => ({ path: f.path, content: f.content })))
    );
    const cacheRange = new vscode.Range(0, 0, 0, 0);

    let responseText = '';
    const cached = await this.app.responseCache.lookup({
      surface: 'composer',
      promptText: goal.trim(),
      modelId: model.id,
      fileRelative: attached.slice().sort().join(','),
      fileContent: fileFingerprint,
      selectionRange: cacheRange,
      originalSelectedText: '',
    });
    if (cached?.text) {
      responseText = cached.text;
      this.appendMessage(`Composer cache ${cached.badge.toLowerCase()}.`);
      this.notify();
    } else {
      try {
        const timeout = mergeTimeout(token, COMPOSER_TIMEOUT_MS);
        const result = await streamChat(
          model,
          [
            vscode.LanguageModelChatMessage.Assistant(
              'You produce coordinated multi-file edits. Respond with a single JSON object: {"edits":[{"path":"relative/path","content":"full new file content"}]}. Include every attached file you change; use exact relative paths from the prompt.'
            ),
            vscode.LanguageModelChatMessage.User(userMessage),
          ],
          timeout.token,
          (chunk) => {
            responseText += chunk;
            if (responseText.length % 400 < chunk.length) {
              this.appendMessage('Streaming Composer response…');
              this.notify();
            }
          }
        );
        if (result.cancelled || timeout.token.isCancellationRequested) {
          this.snapshot.status = 'idle';
          this.appendMessage('Composer request cancelled.');
          this.notify();
          return false;
        }
        responseText = result.text;
        void this.app.responseCache.store({
          surface: 'composer',
          promptText: goal.trim(),
          modelId: model.id,
          fileRelative: attached.slice().sort().join(','),
          fileContent: fileFingerprint,
          selectionRange: cacheRange,
          originalSelectedText: '',
          responseText,
        });
      } catch (err) {
        this.setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    }

    const parsed = parseComposerResponse(responseText);
    if (!parsed.ok) {
      this.setError(`Invalid Composer response: ${parsed.reason}`);
      return false;
    }

    this.appendMessage(`Proposed edits for ${parsed.edits.length} file(s). Opening review…`);
    this.snapshot.status = 'review';
    this.notify();

    const batch: ComposerBatchItem[] = [];
    const root = vscode.workspace.workspaceFolders![0];
    for (const edit of parsed.edits) {
      const uri = vscode.Uri.joinPath(root.uri, ...edit.path.split('/'));
      let original = '';
      try {
        original = await fs.readFile(uri.fsPath, 'utf8');
      } catch {
        original = '';
      }
      batch.push({
        relativePath: edit.path,
        fileUri: uri,
        original,
        proposed: edit.content,
      });
      this.appendMessage(`Ready: ${edit.path}`);
      this.notify();
    }

    const applied = await this.app.diffReview.reviewComposerBatch(batch, 'Composer', taskId);
    this.snapshot.status = applied ? 'idle' : 'idle';
    if (applied) {
      this.appendMessage('Composer changes applied.');
      await this.app.hooks.fire('edit.applied', { operation: 'Composer', taskId, files: batch.map((b) => b.relativePath) });
    } else {
      this.appendMessage('Composer changes discarded or partially rejected.');
      await this.app.hooks.fire('edit.rejected', { operation: 'Composer', taskId });
    }
    this.notify();
    return applied;
  }

  private async loadFileMeta(
    paths: string[]
  ): Promise<Array<{ relativePath: string; sizeBytes: number; exists: boolean }>> {
    const root = vscode.workspace.workspaceFolders?.[0];
    if (!root) {
      return [];
    }
    const out: Array<{ relativePath: string; sizeBytes: number; exists: boolean }> = [];
    for (const rel of paths) {
      const full = path.join(root.uri.fsPath, rel);
      try {
        const stat = await fs.stat(full);
        out.push({ relativePath: rel, sizeBytes: stat.size, exists: true });
      } catch {
        out.push({ relativePath: rel, sizeBytes: 0, exists: false });
      }
    }
    return out;
  }

  private async readAttachedFiles(
    paths: string[]
  ): Promise<Array<{ path: string; content: string }>> {
    const root = vscode.workspace.workspaceFolders![0];
    const out: Array<{ path: string; content: string }> = [];
    for (const rel of paths) {
      const full = path.join(root.uri.fsPath, rel);
      try {
        const content = await fs.readFile(full, 'utf8');
        out.push({ path: rel, content });
      } catch {
        out.push({ path: rel, content: '' });
      }
    }
    return out;
  }

  private failValidation(err: ComposerValidationError): void {
    this.snapshot.lastError = err.message;
    this.appendMessage(`Error: ${err.message}`);
    this.snapshot.status = 'error';
    this.notify();
  }

  private setError(message: string): void {
    this.snapshot.lastError = message;
    this.appendMessage(`Error: ${message}`);
    this.snapshot.status = 'error';
    this.notify();
  }

  private appendMessage(message: string): void {
    this.snapshot.messages.push(message);
    if (this.snapshot.messages.length > 40) {
      this.snapshot.messages.shift();
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function buildComposerPrompt(
  goal: string,
  files: Array<{ path: string; content: string }>
): string {
  const fileBlocks = files
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n');
  return `Goal:\n${goal.trim()}\n\nAttached files:\n${fileBlocks}`;
}

function mergeTimeout(
  parent: vscode.CancellationToken,
  ms: number
): { token: vscode.CancellationToken; dispose: () => void } {
  const source = new vscode.CancellationTokenSource();
  parent.onCancellationRequested(() => source.cancel());
  const timer = setTimeout(() => source.cancel(), ms);
  return {
    token: source.token,
    dispose: () => {
      clearTimeout(timer);
      source.dispose();
    },
  };
}
