/** Tab completion speculative prefetch — R-PLAT-11 / R-EDIT-2 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { streamChat, estimateTokens } from '../platform/chatClient';
import { PLAT5 } from '../platform/performanceBudget';

const MAX_DISPLAY = 500;
const CONTEXT_LINES = 30;

import { buildTabCompletionSpecKey } from './tabCompletionSpecKey';

export function buildTabCompletionPrompt(languageId: string, context: string): string {
  return [
    'Complete the code at the cursor. Return ONLY the completion suffix (text to insert after cursor), no fences.',
    `Language: ${languageId}`,
    '--- Context ---',
    context,
    '--- Cursor ---',
    '|',
  ].join('\n');
}

export function registerTabCompletionPrefetch(context: vscode.ExtensionContext, app: AppServices): void {
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let lastScheduledKey = '';

  const schedule = (editor: vscode.TextEditor | undefined): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    if (!editor) {
      return;
    }

    const settings = app.platform.getSettings();
    if (!settings.speculativeEnabled || settings.tabCompletionMode !== 'own') {
      return;
    }

    const delay = settings.tabCompletionDelayMs ?? 75;
    debounceTimer = setTimeout(() => {
      void prefetchTabCompletion(app, editor, lastScheduledKey, (key) => {
        lastScheduledKey = key;
      });
    }, delay);
  };

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (event.textEditor === vscode.window.activeTextEditor) {
        schedule(event.textEditor);
      }
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      const editor = vscode.window.activeTextEditor;
      if (editor?.document === event.document) {
        schedule(editor);
      }
    })
  );
}

async function prefetchTabCompletion(
  app: AppServices,
  editor: vscode.TextEditor,
  previousKey: string,
  onScheduled: (key: string) => void
): Promise<void> {
  const settings = app.platform.getSettings();
  if (settings.tabCompletionMode !== 'own' || !settings.speculativeEnabled) {
    return;
  }

  const document = editor.document;
  const position = editor.selection.active;
  const relPath = vscode.workspace.asRelativePath(document.uri);
  if (app.platform.isPathSensitive(relPath).sensitive || app.platform.network.isOffline()) {
    return;
  }

  const langs = settings.tabCompletionLanguages;
  if (langs.length && !langs.includes(document.languageId)) {
    return;
  }

  const model = await app.platform.models.resolveSelectionForSurface('tabCompletion');
  if (!model) {
    return;
  }

  const linePrefix = document.getText(new vscode.Range(position.line, 0, position.line, position.character));
  const contextStart = Math.max(0, position.line - CONTEXT_LINES);
  const context = document.getText(new vscode.Range(contextStart, 0, position.line, linePrefix.length));
  const specKey = buildTabCompletionSpecKey(
    relPath,
    document.languageId,
    position.line,
    position.character,
    linePrefix,
    context
  );

  if (specKey !== previousKey) {
    app.speculative.discardExcept(
      app.speculative.makeKey('tabCompletion', { key: specKey })
    );
  }

  const hashedKey = app.speculative.makeKey('tabCompletion', { key: specKey });
  onScheduled(specKey);

  const prompt = buildTabCompletionPrompt(document.languageId, context);
  const estimatedTokens = estimateTokens(prompt) + 32;

  app.speculative.schedule('tabCompletion', hashedKey, estimatedTokens, async (signal) => {
    const timeout = new vscode.CancellationTokenSource();
    signal.addEventListener('abort', () => timeout.cancel());
    const timer = setTimeout(() => timeout.cancel(), settings.tabCompletionTimeoutMs || PLAT5.tabCompletionTimeoutDefaultMs);
    try {
      const result = await streamChat(
        model,
        [vscode.LanguageModelChatMessage.User(prompt)],
        timeout.token
      );
      if (!result.text.trim() || result.cancelled || signal.aborted) {
        throw new Error('speculative_empty');
      }
      return result.text.trim().slice(0, MAX_DISPLAY);
    } finally {
      clearTimeout(timer);
    }
  });
}
