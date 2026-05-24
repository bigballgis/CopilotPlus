/** Execute individual background tasks — R-AG-9 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { loadAgentPrompt } from './promptLoader';
import { SubAgentLoop } from './subAgentLoop';
import {
  type BackgroundTaskBudget,
  type BackgroundTaskId,
  type BackgroundTaskResult,
} from './backgroundTasks';

const TASK_PROMPTS: Record<BackgroundTaskId, string> = {
  doc_drift_scan:
    'Compare the Document_Tree under .copilotPlus/docs/ with the codebase. Identify docs that drift from implementation and propose concise updates.',
  flaky_test_scan:
    'Inspect the project test setup. If a test command exists, reason about likely flaky tests from patterns (timing, network, randomness). Do not run long test suites unless clearly safe.',
  dead_code_scan:
    'Find likely dead or unreferenced symbols using lsp_references and grep. Propose removals only when evidence is strong.',
  dependency_audit:
    'Review package manifest and lockfiles for outdated or vulnerable dependencies. Summarize upgrade recommendations.',
  agents_md_proposal:
    'Review recent session friction signals and AGENTS.md coverage. Propose additions that would help future tasks.',
  lateral_link_proposal:
    'Review document co-edit patterns and related modules. Propose new lateral links between docs where cross-references would help.',
  index_rebuild: 'Check whether the codebase or document index appears stale and needs rebuild.',
};

export class BackgroundTaskRunner {
  private readonly loop: SubAgentLoop;

  constructor(
    private readonly app: AppServices,
    private readonly extensionUri: vscode.Uri
  ) {
    this.loop = new SubAgentLoop(app.platform, app.tools);
  }

  async run(
    taskId: BackgroundTaskId,
    budget: BackgroundTaskBudget,
    token: vscode.CancellationToken,
    onStatus?: (message: string) => void
  ): Promise<BackgroundTaskResult> {
    if (taskId === 'index_rebuild') {
      return this.runIndexRebuild(token, onStatus);
    }
    return this.runAgentTask(taskId, budget, token, onStatus);
  }

  private async runIndexRebuild(
    token: vscode.CancellationToken,
    onStatus?: (message: string) => void
  ): Promise<BackgroundTaskResult> {
    if (token.isCancellationRequested) {
      return { taskId: 'index_rebuild', ok: false, summary: 'Paused', partial: true };
    }
    const idx = this.app.indexManager.getState();
    const stale =
      idx.code !== 'Ready' ||
      idx.docs !== 'Ready' ||
      Boolean(idx.lastError) ||
      idx.codeChunks + idx.docChunks === 0;
    if (!stale) {
      return {
        taskId: 'index_rebuild',
        ok: true,
        summary: 'Indexes look fresh — no rebuild needed.',
      };
    }
    onStatus?.('Rebuilding codebase and document indexes…');
    await this.app.indexManager.rebuildAll();
    if (token.isCancellationRequested) {
      return { taskId: 'index_rebuild', ok: false, summary: 'Rebuild paused', partial: true };
    }
    const after = this.app.indexManager.getState();
    return {
      taskId: 'index_rebuild',
      ok: true,
      summary: `Index rebuild complete (${after.codeChunks} code / ${after.docChunks} doc chunks).`,
    };
  }

  private async runAgentTask(
    taskId: BackgroundTaskId,
    budget: BackgroundTaskBudget,
    token: vscode.CancellationToken,
    onStatus?: (message: string) => void
  ): Promise<BackgroundTaskResult> {
    if (token.isCancellationRequested) {
      return { taskId, ok: false, summary: 'Paused', partial: true };
    }

    onStatus?.(`Running ${taskId}…`);
    const systemPrompt = await loadAgentPrompt(this.extensionUri, 'background');
    const toolIds = this.app.tools.getEffectiveTools('Background');
    const result = await this.loop.run({
      role: 'Background',
      buildId: 'background-idle',
      taskId: `bg-${taskId}-${Date.now()}`,
      systemPrompt,
      userPrompt: `Background task: ${taskId}\n\n${TASK_PROMPTS[taskId]}`,
      toolIds,
      maxToolCalls: budget.maxToolCalls,
      iterationTimeoutMs: budget.maxDurationSec * 1000,
      token,
      onStatus,
    });

    if (token.isCancellationRequested) {
      return {
        taskId,
        ok: false,
        summary: result.finalAnswer.slice(0, 200) || 'Paused',
        partial: true,
      };
    }

    const parsed = parseBackgroundAnswer(result.finalAnswer);
    return {
      taskId,
      ok: !result.failed,
      summary: parsed.summary || result.finalAnswer.slice(0, 240) || taskId,
      proposal: parsed.proposal,
      partial: false,
    };
  }
}

function parseBackgroundAnswer(text: string): { summary: string; proposal?: string } {
  const jsonMatch = text.match(/\{[\s\S]*"summary"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[0]) as { summary?: string; proposal?: string };
      return {
        summary: typeof data.summary === 'string' ? data.summary : text.slice(0, 240),
        proposal: typeof data.proposal === 'string' && data.proposal.trim() ? data.proposal : undefined,
      };
    } catch {
      /* fall through */
    }
  }
  const trimmed = text.trim();
  return { summary: trimmed.slice(0, 240), proposal: trimmed.length > 240 ? trimmed : undefined };
}
