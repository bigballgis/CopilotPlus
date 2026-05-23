/** Sub-Agent invocation with scope context — R-AG-3 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { loadAgentPrompt } from './promptLoader';
import { BUILD_PIPELINE, roleToPromptFile } from './roleMapping';
import { SubAgentLoop, type AgentLoopResult } from './subAgentLoop';
import type { TaskNode } from '../workflow/taskDag';
import { buildLayerWalkForDoc } from '../docs/scopeResolution';
import { resolveScope } from '../docs/scopeResolution';

export interface SubAgentRunResult {
  ok: boolean;
  finalAnswer: string;
  failed: boolean;
  reason?: string;
}

export class SubAgentRunner {
  private readonly loop: SubAgentLoop;

  constructor(
    private readonly app: AppServices,
    private readonly extensionUri: vscode.Uri
  ) {
    this.loop = new SubAgentLoop(app.platform, app.tools);
  }

  async runRole(
    role: string,
    task: TaskNode,
    buildId: string,
    token: vscode.CancellationToken,
    onStatus?: (message: string) => void
  ): Promise<SubAgentRunResult> {
    const promptFile = roleToPromptFile(role);
    const systemPrompt = await loadAgentPrompt(this.extensionUri, promptFile);
    const userPrompt = await this.buildTaskPrompt(role, task, buildId);
    const toolIds = this.app.tools.getEffectiveTools(role);

    const result = await this.loop.run({
      role,
      buildId,
      taskId: task.id,
      systemPrompt,
      userPrompt,
      toolIds,
      token,
      onStatus,
    });

    return toRunResult(result);
  }

  /** R-WF-4 — Coder-led pipeline on a single task */
  async runBuildPipeline(
    task: TaskNode,
    buildId: string,
    token: vscode.CancellationToken,
    onStatus?: (message: string) => void
  ): Promise<SubAgentRunResult> {
    if (task.agent !== 'Coder') {
      return this.runRole(task.agent, task, buildId, token, onStatus);
    }

    let lastAnswer = '';
    for (const role of BUILD_PIPELINE) {
      onStatus?.(`Running ${role} for ${task.id}`);
      let stepTask: TaskNode = {
        ...task,
        description: `${task.description}\n\nBuild step: ${role}`,
      };

      if (role === 'Coder') {
        const coderResult = await this.runCoderWithVerification(stepTask, buildId, token, onStatus);
        if (!coderResult.ok) {
          return coderResult;
        }
        lastAnswer = coderResult.finalAnswer;
        continue;
      }

      const result = await this.runRole(role, stepTask, buildId, token, onStatus);
      if (!result.ok) {
        return result;
      }
      lastAnswer = result.finalAnswer;
    }

    return { ok: true, finalAnswer: lastAnswer, failed: false };
  }

  /** R-AG-6 — up to 3 Coder rounds on LSP regression */
  private async runCoderWithVerification(
    task: TaskNode,
    buildId: string,
    token: vscode.CancellationToken,
    onStatus?: (message: string) => void
  ): Promise<SubAgentRunResult> {
    this.app.postEdit.clear();
    let stepTask = task;

    for (let round = 1; round <= 3; round++) {
      const result = await this.runRole('Coder', stepTask, buildId, token, onStatus);
      if (!result.ok) {
        return result;
      }

      const verification = await this.app.postEdit.verify();
      if (verification.ok || verification.skipped) {
        return result;
      }

      if (round >= 3) {
        return {
          ok: false,
          finalAnswer: result.finalAnswer,
          failed: true,
          reason: 'lsp_regression',
        };
      }

      onStatus?.(`LSP regression detected — Coder retry ${round + 1}/3`);
      stepTask = {
        ...stepTask,
        description: `${stepTask.description}\n\n## regression_diagnostics\n${JSON.stringify(verification.regression_diagnostics, null, 2)}`,
      };
    }

    return { ok: false, finalAnswer: '', failed: true, reason: 'lsp_regression' };
  }

  private async buildTaskPrompt(role: string, task: TaskNode, buildId: string): Promise<string> {
    const entries = this.app.docs.getEntries();
    const scope = resolveScope(task.scope_doc, entries);
    const model = await this.app.platform.models.resolveSelectionForSurface('subAgent');
    const tier = model
      ? this.app.platform.models.getContextTier(model)
      : ('M' as const);
    const layerWalk = buildLayerWalkForDoc(task.scope_doc, entries, tier);

    const scopeBlock = scope
      .map((s) => `- [${s.link_type}] ${s.title} (${s.document_path})`)
      .join('\n');
    const layerBlock = layerWalk
      .map((l) => `### ${l.documentPath}\n${l.content}`)
      .join('\n\n');

    return `
Workflow stage: Build
Build id: ${buildId}
Sub-agent role: ${role}
Task id: ${task.id}
Title: ${task.title}
Description: ${task.description}
Scope doc: ${task.scope_doc}

## Scope resolution
${scopeBlock || '(empty)'}

## Layer walk
${layerBlock || '(empty)'}

## Task inputs
${JSON.stringify(task.inputs, null, 2)}
`.trim();
  }
}

function toRunResult(result: AgentLoopResult): SubAgentRunResult {
  return {
    ok: !result.failed,
    finalAnswer: result.finalAnswer,
    failed: result.failed,
    reason: result.reason,
  };
}
