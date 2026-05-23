/** Inline Edit (Cmd+K) — R-EDIT-1 */

import * as vscode from 'vscode';
import type { PlatformServices } from '../platform/services';
import { streamChat, estimateTokens } from '../platform/chatClient';
import { DiffReviewService } from './diffReview';
import { ResponseCacheService } from './responseCacheService';

const MAX_SELECTION = 10_000;
const CONTEXT_LINES = 50;

export class InlineEditService {
  private activeController: AbortController | undefined;

  constructor(
    private readonly platform: PlatformServices,
    private readonly diffReview: DiffReviewService,
    private readonly responseCache: ResponseCacheService
  ) {}

  async invoke(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showWarningMessage('Open a file to use Inline Edit.');
      return;
    }

    const doc = editor.document;
    const relative = vscode.workspace.asRelativePath(doc.uri);
    if (this.platform.isPathSensitive(relative).sensitive) {
      void vscode.window.showWarningMessage('Inline Edit is disabled for sensitive files.');
      return;
    }

    if (this.platform.network.isOffline()) {
      void vscode.window.showWarningMessage('Offline — Inline Edit unavailable.');
      return;
    }

    const prompt = await vscode.window.showInputBox({
      placeHolder: 'Describe the edit…',
      prompt: 'Copilot Plus Inline Edit',
    });
    if (!prompt) {
      return;
    }

    const selection = editor.selection;
    const hasSelection = !selection.isEmpty;
    let targetRange: vscode.Range;
    let selectedText: string;

    if (hasSelection) {
      selectedText = doc.getText(selection);
      if (selectedText.length > MAX_SELECTION) {
        void vscode.window.showErrorMessage('Selection exceeds 10,000 characters.');
        return;
      }
      targetRange = selection;
    } else {
      const line = selection.active.line;
      targetRange = doc.lineAt(line).range;
      selectedText = doc.lineAt(line).text;
    }

    const contextBefore = this.getContext(doc, targetRange.start.line, -CONTEXT_LINES);
    const contextAfter = this.getContext(doc, targetRange.end.line, CONTEXT_LINES);

    const model = await this.platform.models.resolveSelectionForSurface('inlineEdit');
    if (!model) {
      await this.platform.auth.ensureModelsAvailable();
      return;
    }

    this.activeController?.abort();
    this.activeController = new AbortController();
    const tokenSource = new vscode.CancellationTokenSource();
    this.activeController.signal.addEventListener('abort', () => tokenSource.cancel());

    const userMessage = [
      'Apply an edit to the following code.',
      `Instruction: ${prompt}`,
      '--- Context before ---',
      contextBefore,
      '--- Selected ---',
      selectedText,
      '--- Context after ---',
      contextAfter,
      'Return ONLY the replacement text for the selected region, without markdown fences.',
    ].join('\n');

    const fileContent = doc.getText();
    const cached = await this.responseCache.lookup({
      surface: 'inlineEdit',
      promptText: prompt,
      modelId: model.id,
      fileRelative: relative,
      fileContent,
      selectionRange: targetRange,
      originalSelectedText: selectedText,
      contextBefore,
      contextAfter,
    });

    if (cached) {
      await this.diffReview.reviewReplaceRange(
        doc.uri,
        targetRange,
        cached.text,
        `Inline_Edit · ${cached.badge}`
      );
      return;
    }

    try {
      const result = await streamChat(
        model,
        [vscode.LanguageModelChatMessage.User(userMessage)],
        tokenSource.token
      );

      let proposed = result.text.trim();
      if (proposed.startsWith('```')) {
        proposed = proposed.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
      }

      if (!proposed) {
        void vscode.window.showWarningMessage('Model returned empty edit.');
        return;
      }

      void estimateTokens(proposed);
      await this.diffReview.reviewReplaceRange(doc.uri, targetRange, proposed, 'Inline_Edit');
      void this.responseCache.store({
        surface: 'inlineEdit',
        promptText: prompt,
        modelId: model.id,
        fileRelative: relative,
        fileContent,
        selectionRange: targetRange,
        originalSelectedText: selectedText,
        contextBefore,
        contextAfter,
        responseText: proposed,
      });
    } catch (err) {
      const retry = 'Retry';
      const msg = err instanceof Error ? err.message : String(err);
      const choice = await vscode.window.showErrorMessage(`Inline Edit failed: ${msg}`, retry);
      if (choice === retry) {
        await this.invoke();
      }
    }
  }

  private getContext(doc: vscode.TextDocument, line: number, delta: number): string {
    const start = Math.max(0, delta < 0 ? line + delta : line + 1);
    const end = Math.min(doc.lineCount - 1, delta < 0 ? line - 1 : line + delta);
    if (start > end) {
      return '';
    }
    const lines: string[] = [];
    for (let i = start; i <= end; i++) {
      lines.push(doc.lineAt(i).text);
    }
    return lines.join('\n');
  }
}
