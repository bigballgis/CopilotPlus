/** Tab Completion (own mode) — R-EDIT-2 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { streamChat } from '../platform/chatClient';
import { PLAT5 } from '../platform/performanceBudget';

const MAX_DISPLAY = 500;

export function registerTabCompletion(context: vscode.ExtensionContext, app: AppServices): void {
  let copilotNoticeShown = false;

  const provider: vscode.InlineCompletionItemProvider = {
    provideInlineCompletionItems: async (document, position, _ctx, token) => {
      const settings = app.platform.getSettings();
      if (settings.tabCompletionMode !== 'own') {
        return [];
      }

      if (!copilotNoticeShown && vscode.extensions.getExtension('GitHub.copilot')) {
        copilotNoticeShown = true;
        void vscode.window.showInformationMessage(
          'Copilot Plus Tab Completion (own) is active. Consider disabling duplicate inline suggestions in editor settings if ghost text overlaps.'
        );
      }

      const langs = settings.tabCompletionLanguages;
      if (langs.length && !langs.includes(document.languageId)) {
        return [];
      }

      const rel = vscode.workspace.asRelativePath(document.uri);
      if (app.platform.isPathSensitive(rel).sensitive) {
        return [];
      }
      if (app.platform.network.isOffline()) {
        return [];
      }

      const model = await app.platform.models.resolveSelectionForSurface('tabCompletion');
      if (!model) {
        return [];
      }

      const linePrefix = document.getText(new vscode.Range(position.line, 0, position.line, position.character));
      const contextStart = Math.max(0, position.line - 30);
      const context = document.getText(new vscode.Range(contextStart, 0, position.line, linePrefix.length));
      const fileContent = document.getText();
      const relPath = vscode.workspace.asRelativePath(document.uri);
      const cursorRange = new vscode.Range(position, position);
      const promptText = [context, '|'].join('\n');

      const cached = await app.responseCache.lookup({
        surface: 'tabCompletion',
        promptText,
        modelId: model.id,
        fileRelative: relPath,
        fileContent,
        selectionRange: cursorRange,
        originalSelectedText: linePrefix,
        contextBefore: context.slice(0, Math.max(0, context.length - linePrefix.length)),
      });
      if (cached) {
        const insertText = cached.text.trim().slice(0, MAX_DISPLAY);
        if (insertText) {
          const item = new vscode.InlineCompletionItem(
            insertText,
            new vscode.Range(position, position)
          );
          item.detail = cached.badge;
          return [item];
        }
      }

      const timeout = new vscode.CancellationTokenSource();
      token.onCancellationRequested(() => timeout.cancel());
      const timeoutMs = settings.tabCompletionTimeoutMs || PLAT5.tabCompletionTimeoutDefaultMs;
      const timer = setTimeout(() => timeout.cancel(), timeoutMs);

      try {
        const result = await streamChat(
          model,
          [
            vscode.LanguageModelChatMessage.User(
              [
                'Complete the code at the cursor. Return ONLY the completion suffix (text to insert after cursor), no fences.',
                `Language: ${document.languageId}`,
                '--- Context ---',
                context,
                '--- Cursor ---',
                '|',
              ].join('\n')
            ),
          ],
          timeout.token
        );
        if (!result.text.trim() || result.cancelled) {
          return [];
        }
        const insertText = result.text.trim().slice(0, MAX_DISPLAY);
        const item = new vscode.InlineCompletionItem(
          insertText,
          new vscode.Range(position, position)
        );
        void app.responseCache.store({
          surface: 'tabCompletion',
          promptText,
          modelId: model.id,
          fileRelative: relPath,
          fileContent,
          selectionRange: cursorRange,
          originalSelectedText: linePrefix,
          contextBefore: context.slice(0, Math.max(0, context.length - linePrefix.length)),
          responseText: insertText,
        });
        return [item];
      } catch {
        return [];
      } finally {
        clearTimeout(timer);
      }
    },
  };

  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, provider)
  );
}
