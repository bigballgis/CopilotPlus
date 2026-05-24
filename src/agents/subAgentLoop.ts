/** Sub-Agent tool calling loop — R-AG-7 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { streamChat, estimateTokens } from '../platform/chatClient';
import type { PlatformServices } from '../platform/services';
import type { ToolExecutor, ToolResult } from '../tools/executor';
import { getDefaultPermission } from '../tools/registry';
import {
  buildToolInstructions,
  canonicalToolKey,
  parseFinalAnswer,
  parseToolCalls,
  type ParsedToolCall,
} from './toolCallParser';

export interface LoopMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
}

export interface AgentLoopOptions {
  role: string;
  buildId: string;
  taskId: string;
  systemPrompt: string;
  userPrompt: string;
  toolIds: string[];
  maxIterations?: number;
  maxToolCalls?: number;
  iterationTimeoutMs?: number;
  temperature?: number;
  token: vscode.CancellationToken;
  onStatus?: (message: string) => void;
}

export interface AgentLoopResult {
  finalAnswer: string;
  toolCalls: number;
  iterations: number;
  failed: boolean;
  reason?: string;
}

const READ_ONLY_TOOLS = new Set([
  'read_file',
  'grep',
  'glob',
  'list_dir',
  'lsp_diagnostics',
  'lsp_definition',
  'lsp_references',
  'lsp_hover',
  'code_search',
  'doc_read',
  'git_status',
  'git_diff',
  'todoread',
  'webfetch',
  'websearch',
]);

export class SubAgentLoop {
  constructor(
    private readonly platform: PlatformServices,
    private readonly tools: ToolExecutor
  ) {}

  async run(options: AgentLoopOptions): Promise<AgentLoopResult> {
    const maxIterations = options.maxIterations ?? 25;
    const maxToolCalls = options.maxToolCalls ?? 80;
    const iterationTimeoutMs = options.iterationTimeoutMs ?? 300_000;
    const messages: LoopMessage[] = [
      {
        role: 'system',
        content: `${options.systemPrompt}\n\n${buildToolInstructions(options.toolIds)}`,
      },
      { role: 'user', content: options.userPrompt },
    ];

    let toolCalls = 0;
    let iterations = 0;
    const repeatErrors = new Map<string, number>();

    while (iterations < maxIterations) {
      if (options.token.isCancellationRequested) {
        return { finalAnswer: '', toolCalls, iterations, failed: true, reason: 'cancelled' };
      }
      if (toolCalls >= maxToolCalls) {
        return {
          finalAnswer: '',
          toolCalls,
          iterations,
          failed: true,
          reason: 'tool_budget_exhausted',
        };
      }

      iterations++;
      options.onStatus?.(`Iteration ${iterations}`);

      const lmMessages = messages.map(toLmMessage);
      const model = await this.platform.models.resolveSelectionForSurface('subAgent');
      if (!model) {
        return { finalAnswer: '', toolCalls, iterations, failed: true, reason: 'no_model' };
      }

      const iteration = mergeCancellation(options.token, iterationTimeoutMs);
      let assistantText = '';
      try {
        const run = () =>
          streamChat(model, lmMessages, iteration.token, (chunk) => {
            assistantText += chunk;
          }, { temperature: options.temperature });
        const streamed = await this.platform.auth.withConsent(run, () => undefined);
        if (!streamed) {
          return { finalAnswer: '', toolCalls, iterations, failed: true, reason: 'cancelled' };
        }
        assistantText = streamed.text;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        messages.push({ role: 'assistant', content: `Error: ${reason}` });
        await persistMessages(options.buildId, options.taskId, messages);
        return { finalAnswer: '', toolCalls, iterations, failed: true, reason };
      } finally {
        iteration.dispose();
      }

      messages.push({ role: 'assistant', content: assistantText });
      await persistMessages(options.buildId, options.taskId, messages);

      const finalAnswer = parseFinalAnswer(assistantText);
      const calls = dedupeToolCalls(parseToolCalls(assistantText));
      if (finalAnswer !== undefined && calls.length === 0) {
        return { finalAnswer, toolCalls, iterations, failed: false };
      }
      if (calls.length === 0) {
        return { finalAnswer: assistantText.trim(), toolCalls, iterations, failed: false };
      }

      const results = await this.executeToolCalls(options.role, calls, repeatErrors);
      toolCalls += calls.length;
      for (const result of results) {
        messages.push({
          role: 'tool',
          toolName: result.name,
          content: JSON.stringify(result.result),
        });
      }
      await persistMessages(options.buildId, options.taskId, messages);

      if (results.some((r) => r.terminalFailure)) {
        return {
          finalAnswer: '',
          toolCalls,
          iterations,
          failed: true,
          reason: 'repeated_tool_error',
        };
      }
    }

    return {
      finalAnswer: '',
      toolCalls,
      iterations,
      failed: true,
      reason: 'max_iterations',
    };
  }

  private async executeToolCalls(
    role: string,
    calls: ParsedToolCall[],
    repeatErrors: Map<string, number>
  ): Promise<Array<{ name: string; result: ToolResult; terminalFailure?: boolean }>> {
    const readOnly = calls.filter((c) => isReadOnlyTool(c.name));
    const mutating = calls.filter((c) => !isReadOnlyTool(c.name));

    const readResults: Array<{ name: string; result: ToolResult; terminalFailure?: boolean }> = [];
    for (let i = 0; i < readOnly.length; i += 4) {
      const batch = readOnly.slice(i, i + 4);
      const batchResults = await Promise.all(
        batch.map(async (call) => this.invokeTracked(role, call, repeatErrors))
      );
      readResults.push(...batchResults);
    }

    const mutatingResults: Array<{ name: string; result: ToolResult; terminalFailure?: boolean }> =
      [];
    for (const call of mutating) {
      mutatingResults.push(await this.invokeTracked(role, call, repeatErrors));
    }

    return [...readResults, ...mutatingResults];
  }

  private async invokeTracked(
    role: string,
    call: ParsedToolCall,
    repeatErrors: Map<string, number>
  ): Promise<{ name: string; result: ToolResult; terminalFailure?: boolean }> {
    const result = await this.tools.invoke(role, call.name, call.arguments);
    if (!result.ok) {
      const key = canonicalToolKey(call.name, call.arguments);
      const count = (repeatErrors.get(key) ?? 0) + 1;
      repeatErrors.set(key, count);
      if (count >= 3) {
        return { name: call.name, result, terminalFailure: true };
      }
    }
    return { name: call.name, result };
  }
}

function dedupeToolCalls(calls: ParsedToolCall[]): ParsedToolCall[] {
  const seen = new Set<string>();
  const out: ParsedToolCall[] = [];
  for (const call of calls) {
    const key = canonicalToolKey(call.name, call.arguments);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(call);
  }
  return out;
}

function isReadOnlyTool(toolId: string): boolean {
  if (READ_ONLY_TOOLS.has(toolId)) {
    return true;
  }
  return getDefaultPermission(toolId) === 'allow' && toolId !== 'bash';
}

function toLmMessage(msg: LoopMessage): vscode.LanguageModelChatMessage {
  const prefix = msg.role === 'tool' ? `[tool:${msg.toolName}] ` : '';
  const text = prefix + msg.content;
  switch (msg.role) {
    case 'system':
      return vscode.LanguageModelChatMessage.System(text);
    case 'user':
    case 'tool':
      return vscode.LanguageModelChatMessage.User(text);
    case 'assistant':
      return vscode.LanguageModelChatMessage.Assistant(text);
  }
}

async function persistMessages(
  buildId: string,
  taskId: string,
  messages: LoopMessage[]
): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    return;
  }
  const dir = path.join(root, '.copilotPlus', 'builds', buildId, taskId);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'messages.jsonl');
  const lines = messages.map((m) => JSON.stringify({ ...m, ts: Date.now() }));
  await fs.writeFile(file, lines.join('\n') + '\n', 'utf8');
}

function mergeCancellation(
  parent: vscode.CancellationToken,
  timeoutMs: number
): { token: vscode.CancellationToken; dispose: () => void } {
  const source = new vscode.CancellationTokenSource();
  const timer = setTimeout(() => source.cancel(), timeoutMs);
  parent.onCancellationRequested(() => source.cancel());
  return {
    token: source.token,
    dispose: () => {
      clearTimeout(timer);
      source.dispose();
    },
  };
}

export function estimateLoopTokens(messages: LoopMessage[]): number {
  return messages.reduce((n, m) => n + estimateTokens(m.content), 0);
}
