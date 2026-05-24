/** Conversation summarization — R-CTX-7 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { streamChat, estimateTokens } from '../platform/chatClient';
import type { SessionMessage } from '../interaction/sessionStore';
import {
  fitContextToBudget,
  type ContextBudgetItem,
} from './contextBudget';

export interface SummarizeResult {
  history: SessionMessage[];
  blocked?: boolean;
  blockReason?: string;
  summaryPath?: string;
}

const SUMMARY_PROMPT = `Summarize the conversation for continuation. Output markdown with sections:
## goals
## decisions_made
## files_touched
## open_questions
## last_user_intent
Keep total under 2000 tokens.`;

export class ConversationSummarizer {
  private readonly requestLog: Array<{ summarized: boolean }> = [];

  constructor(private readonly app: AppServices) {}

  resetSession(): void {
    this.requestLog.length = 0;
  }

  recordRequest(): void {
    this.requestLog.push({ summarized: false });
    while (this.requestLog.length > 10) {
      this.requestLog.shift();
    }
  }

  private summarizationsInWindow(): number {
    return this.requestLog.filter((entry) => entry.summarized).length;
  }

  estimateInputTokens(
    history: SessionMessage[],
    userText: string,
    contextPrefix?: string,
    systemPrompt = ''
  ): number {
    const parts = [systemPrompt, contextPrefix ?? '', ...history.map((m) => m.text), userText];
    return parts.reduce((n, p) => n + estimateTokens(p), 0);
  }

  async prepareHistory(
    history: SessionMessage[],
    userText: string,
    contextPrefix: string | undefined,
    systemPrompt: string,
    token: vscode.CancellationToken,
    sessions: {
      persistSummary: (text: string) => Promise<string>;
      appendSystemMessage: (text: string) => Promise<void>;
    },
    contextItems: ContextBudgetItem[] = []
  ): Promise<SummarizeResult> {
    this.recordRequest();

    const settings = this.app.platform.getSettings();
    if (settings.summarizationMode === 'disabled') {
      return { history };
    }

    const model = await this.app.platform.models.resolveSelectionForSurface('primaryAgent');
    const tokenBudget = model?.maxInputTokens ?? settings.sessionTokenCap;
    const fittedContext = fitContextToBudget(contextItems, tokenBudget);
    if (fittedContext.blocked) {
      return {
        history,
        blocked: true,
        blockReason: fittedContext.blockReason,
      };
    }

    const fittedPrefix = fittedContext.included.map((item) => item.text).join('\n\n') || contextPrefix;
    const threshold = Math.floor(tokenBudget * 0.8);
    const estimated = this.estimateInputTokens(history, userText, fittedPrefix, systemPrompt);

    if (estimated <= threshold) {
      return { history };
    }

    if (this.summarizationsInWindow() >= 3) {
      return {
        history,
        blocked: true,
        blockReason: 'Summarization limit reached (3 per 10 requests). Start a new session.',
      };
    }

    if (settings.summarizationMode === 'manual') {
      const answer = await this.app.decisions.ask({
        id: `summarize-${Date.now()}`,
        question: 'Context nearing limit. Summarize older turns?',
        options: ['Summarize', 'Cancel'],
        defaultOption: 'Summarize',
        timeoutSec: 120,
      });
      if (answer.selected !== 'Summarize') {
        return {
          history,
          blocked: true,
          blockReason: 'Request would exceed token budget without summarization.',
        };
      }
    }

    const keepLast = settings.summarizationKeepLastTurns;
    if (history.length <= keepLast) {
      return { history };
    }

    const toCompress = history.slice(0, -keepLast);
    const recent = history.slice(-keepLast);
    const transcript = toCompress.map((m) => `${m.role}: ${m.text}`).join('\n\n');

    const summaryModel = model ?? (await this.app.platform.models.resolveSelectionForSurface('primaryAgent'));
    if (!summaryModel) {
      return { history, blocked: true, blockReason: 'No model available for summarization.' };
    }

    const messages = [
      vscode.LanguageModelChatMessage.System(SUMMARY_PROMPT),
      vscode.LanguageModelChatMessage.User(transcript.slice(0, 120_000)),
    ];
    const run = () => streamChat(summaryModel, messages, token);
    const result = await this.app.platform.auth.withConsent(run, () => undefined);
    if (!result?.text) {
      return { history, blocked: true, blockReason: 'Summarization failed or was cancelled.' };
    }

    const summaryPath = await sessions.persistSummary(result.text);
    const summaryMessage: SessionMessage = {
      role: 'system',
      text: `[Conversation summary — ${summaryPath}]\n${result.text}`,
      timestamp: new Date().toISOString(),
    };
    await sessions.appendSystemMessage(summaryMessage.text);

    if (this.requestLog.length) {
      this.requestLog[this.requestLog.length - 1]!.summarized = true;
    }
    return {
      history: [summaryMessage, ...recent],
      summaryPath,
    };
  }
}
