/** Conversation summarization — R-CTX-7 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { streamChat, estimateTokens } from '../platform/chatClient';
import type { SessionMessage } from '../interaction/sessionStore';

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
  private requestTimestamps: number[] = [];
  private summarizationTimestamps: number[] = [];

  constructor(private readonly app: AppServices) {}

  resetSession(): void {
    this.requestTimestamps = [];
    this.summarizationTimestamps = [];
  }

  recordRequest(): void {
    const now = Date.now();
    this.requestTimestamps.push(now);
    this.requestTimestamps = this.requestTimestamps.filter((t) => now - t < 600_000);
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
    }
  ): Promise<SummarizeResult> {
    this.recordRequest();

    const settings = this.app.platform.getSettings();
    if (settings.summarizationMode === 'disabled') {
      return { history };
    }

    const model = await this.app.platform.models.resolveSelectionForSurface('primaryAgent');
    const tokenBudget = model?.maxInputTokens ?? settings.sessionTokenCap;
    const threshold = Math.floor(tokenBudget * 0.8);
    const estimated = this.estimateInputTokens(history, userText, contextPrefix, systemPrompt);

    if (estimated <= threshold) {
      return { history };
    }

    const now = Date.now();
    const recentSummaries = this.summarizationTimestamps.filter((t) => now - t < 600_000);
    if (recentSummaries.length >= 3 && this.requestTimestamps.length >= 10) {
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

    this.summarizationTimestamps.push(now);
    return {
      history: [summaryMessage, ...recent],
      summaryPath,
    };
  }
}
