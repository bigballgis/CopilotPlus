/** Primary Agent — R-AG-1 */

import * as vscode from 'vscode';
import type { PlatformServices } from '../platform/services';
import { streamChat, estimateTokens } from '../platform/chatClient';
import { loadAgentPrompt } from './promptLoader';
import type { SessionMessage } from '../interaction/sessionStore';

export interface PrimaryTurnResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cancelled: boolean;
}

export class PrimaryAgent {
  private systemPrompt: string | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly platform: PlatformServices
  ) {}

  async ensurePrompt(): Promise<string> {
    if (!this.systemPrompt) {
      this.systemPrompt = await loadAgentPrompt(this.extensionUri, 'primary');
    }
    return this.systemPrompt;
  }

  /** R-AG-1.3 — Design stage conversation turn */
  async runDesignTurn(
    userText: string,
    history: SessionMessage[],
    token: vscode.CancellationToken,
    onChunk?: (chunk: string) => void,
    contextPrefix?: string
  ): Promise<PrimaryTurnResult> {
    const model = await this.platform.models.resolveSelectionForSurface('primaryAgent');
    if (!model) {
      await this.platform.auth.ensureModelsAvailable();
      throw new Error('No Copilot model available.');
    }

    const system = await this.ensurePrompt();
    const messages: vscode.LanguageModelChatMessage[] = [
      vscode.LanguageModelChatMessage.System(system),
    ];

    for (const msg of history.slice(-20)) {
      if (msg.role === 'user') {
        messages.push(vscode.LanguageModelChatMessage.User(msg.text));
      } else if (msg.role === 'assistant') {
        messages.push(vscode.LanguageModelChatMessage.Assistant(msg.text));
      } else if (msg.role === 'system') {
        messages.push(vscode.LanguageModelChatMessage.System(msg.text));
      }
    }
    messages.push(
      vscode.LanguageModelChatMessage.User(
        contextPrefix ? `${contextPrefix}\n\n---\n\nUser request:\n${userText}` : userText
      )
    );

    const inputTokens = messages.reduce((n, m) => n + estimateTokens(chatMessageText(m)), 0);
    const cap = this.platform.getSettings().sessionTokenCap;
    if (inputTokens > cap) {
      throw new Error(`Session token cap reached (${cap}). Start a new session.`);
    }

    const run = () =>
      streamChat(model, messages, token, onChunk);

    const result = await this.platform.auth.withConsent(run, () => undefined);
    if (!result) {
      return { text: '', inputTokens, outputTokens: 0, cancelled: true };
    }

    return {
      text: result.text,
      inputTokens,
      outputTokens: estimateTokens(result.text),
      cancelled: result.cancelled,
    };
  }
}

function chatMessageText(msg: vscode.LanguageModelChatMessage): string {
  const content = msg.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => ('value' in part ? String((part as { value: string }).value) : ''))
      .join('');
  }
  return String(content);
}
