/** Copilot chat streaming — R-PLAT-2, DESIGN §5.1 */

import * as vscode from 'vscode';
import { formatError, isRateLimitError, parseRetryAfterMs } from './errors';

export interface ChatStreamResult {
  text: string;
  cancelled: boolean;
}

export async function streamChat(
  model: vscode.LanguageModelChat,
  messages: vscode.LanguageModelChatMessage[],
  token: vscode.CancellationToken,
  onChunk?: (chunk: string) => void,
  options?: { temperature?: number }
): Promise<ChatStreamResult> {
  let text = '';
  const requestOptions: vscode.LanguageModelChatRequestOptions = {};
  if (options?.temperature !== undefined) {
    requestOptions.modelOptions = { temperature: options.temperature };
  }
  try {
    const response = await model.sendRequest(messages, requestOptions, token);
    for await (const chunk of response.text) {
      if (token.isCancellationRequested) {
        return { text, cancelled: true };
      }
      text += chunk;
      onChunk?.(chunk);
    }
    return { text, cancelled: false };
  } catch (err) {
    if (isRateLimitError(err)) {
      const waitMs = parseRetryAfterMs(err);
      await new Promise((r) => setTimeout(r, waitMs));
      return streamChat(model, messages, token, onChunk);
    }
    throw new Error(formatError(err));
  }
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
