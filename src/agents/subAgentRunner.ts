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

    const ci = this.app.getCiSession();
    const result = await this.loop.run({
      role,
      buildId,
      taskId: task.id,
      systemPrompt,
      userPrompt,
      toolIds,
      token,
      onStatus,
      maxToolCalls: ci?.maxToolCalls,
    });

    return toRunResult(result);
  }

  /** R-AG-3.1 / R-WF-2 — Design-stage sub-agent with scope + layer walk */
  async runDesignRole(
    role: string,
    designStep: string,
    userMessage: string,
    scopeDoc: string,
    token: vscode.CancellationToken,
    onStatus?: (message: string) => void,
    contextPrefix?: string,
    historySummary?: string
  ): Promise<SubAgentRunResult> {
    const task: TaskNode = {
      id: `design-${role}-${Date.now()}`,
      title: `${designStep} turn`,
      description: userMessage,
      agent: role,
      inputs: { designStep, userMessage },
      depends_on: [],
      status: 'Running',
      scope_doc: scopeDoc,
    };

    const promptFile = roleToPromptFile(role);
    const systemPrompt = await loadAgentPrompt(this.extensionUri, promptFile);
    const userPrompt = await this.buildDesignPrompt(
      role,
      designStep,
      task,
      contextPrefix,
      historySummary
    );
    const toolIds = this.app.tools.getEffectiveTools(role);

    const ci = this.app.getCiSession();
    const result = await this.loop.run({
      role,
      buildId: 'design-session',
      taskId: task.id,
      systemPrompt,
      userPrompt,
      toolIds,
      token,
      onStatus,
      maxToolCalls: ci?.maxToolCalls,
    });

    return toRunResult(result);
  }

  /** R-DEP-2 / R-DEP-4 — Deployer agent for manifest generation or apply */
  async runDeployer(
    intent: 'generate' | 'apply',
    token: vscode.CancellationToken,
    onStatus?: (message: string) => void
  ): Promise<SubAgentRunResult> {
    const cfg = this.app.deploy.getConfig();
    const system = this.app.docs.getEntries().find((e) => e.valid && e.frontmatter.level === 'system');
    const scopeDoc = system?.relativePath ?? '.copilotPlus/docs/system/default.md';

    const task: TaskNode = {
      id: `deploy-${intent}-${Date.now()}`,
      title: intent === 'generate' ? 'Generate deploy manifest' : 'Apply deployment',
      description:
        intent === 'generate'
          ? 'Review project docs and build artifacts, then update deployment manifest files under .copilotPlus/deploy/. Use write_file for changes (Diff Review applies).'
          : 'Verify manifest and prerequisites, then invoke deploy_apply when ready. Use deploy_rollback only when user requests rollback.',
      agent: 'Deployer',
      inputs: { intent, target: cfg.target, mode: cfg.mode },
      depends_on: [],
      status: 'Running',
      scope_doc: scopeDoc,
    };

    const promptFile = roleToPromptFile('Deployer');
    const systemPrompt = await loadAgentPrompt(this.extensionUri, promptFile);
    const userPrompt = await this.buildDeployPrompt(intent, task);
    const toolIds = this.app.tools.getEffectiveTools('Deployer');

    const ci = this.app.getCiSession();
    const result = await this.loop.run({
      role: 'Deployer',
      buildId: `deploy-${intent}`,
      taskId: task.id,
      systemPrompt,
      userPrompt,
      toolIds,
      token,
      onStatus,
      maxToolCalls: ci?.maxToolCalls,
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

  private async buildDeployPrompt(intent: 'generate' | 'apply', task: TaskNode): Promise<string> {
    const cfg = this.app.deploy.getConfig();
    const manifestDir = this.app.deploy.manifestDir() ?? '';
    const files = await this.app.deploy.listManifestFiles();
    const recommended = this.app.deploy.recommendedCommands();
    const entries = this.app.docs.getEntries();
    const scope = resolveScope(task.scope_doc, entries);
    const scopeBlock = scope
      .map((s) => `- [${s.link_type}] ${s.title} (${s.document_path})`)
      .join('\n');
    const scopeEntry = entries.find((e) => e.relativePath === task.scope_doc.replace(/\\/g, '/'));
    const skillBlock = this.app.skills.formatInstructions(
      this.app.skills.getAutoAttached(task.scope_doc, scopeEntry?.frontmatter.id)
    );

    return `
Workflow stage: Deploy
Intent: ${intent}
Target: ${cfg.target}
Mode: ${cfg.mode}
Manifest directory: ${manifestDir}
Existing manifest files:
${files.map((f) => `- ${f}`).join('\n') || '(none — baseline templates will be created)'}

Recommended apply commands:
${recommended.map((c) => `- ${c}`).join('\n')}

Scope doc: ${task.scope_doc}
## Scope resolution
${scopeBlock || '(empty)'}

## Skills
${skillBlock || '(none)'}

Task: ${task.title}
${task.description}

${intent === 'generate'
  ? 'Update manifest files to match the current system design and build outputs. Propose changes via write_file only.'
  : 'When manifest looks correct, call deploy_apply. Do not run raw bash for apply unless validating CLI availability.'}
`.trim();
  }

  private async buildDesignPrompt(
    role: string,
    designStep: string,
    task: TaskNode,
    contextPrefix?: string,
    historySummary?: string
  ): Promise<string> {
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
    const scopeEntry = this.app.docs.getByPath(task.scope_doc);
    const skillBlock = this.app.skills.formatInstructions(
      this.app.skills.getAutoAttached(task.scope_doc, scopeEntry?.frontmatter.id)
    );
    const layerBlock = layerWalk
      .map((l) => `### ${l.documentPath}\n${l.content}`)
      .join('\n\n');
    const scopeFile = scopeEntry?.relativePath ?? task.scope_doc.replace(/^\.copilotPlus\/docs\//, 'src/');
    const knowledgeBlock = await this.app.knowledge.buildContextBlock(scopeFile, task.id);

    return `
Workflow stage: Design
Design workflow step: ${designStep}
Sub-agent role: ${role}
Scope doc: ${task.scope_doc}

## User message
${task.description}

${contextPrefix ? `## Attached context\n${contextPrefix}\n` : ''}
${historySummary ? `## Recent conversation\n${historySummary}\n` : ''}

## Scope resolution
${scopeBlock || '(empty)'}

## Skills
${skillBlock || '(none)'}

## Layer walk
${layerBlock || '(empty)'}

## Project memory
${knowledgeBlock || '(none)'}

Respond with a concise final answer for the Conversation Pane. Use tools when you need to read or update docs.
`.trim();
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
    const scopeEntry = this.app.docs.getByPath(task.scope_doc);
    const skillBlock = this.app.skills.formatInstructions(
      this.app.skills.getAutoAttached(task.scope_doc, scopeEntry?.frontmatter.id)
    );
    const layerBlock = layerWalk
      .map((l) => `### ${l.documentPath}\n${l.content}`)
      .join('\n\n');
    const scopeFile = scopeEntry?.relativePath ?? task.scope_doc.replace(/^\.copilotPlus\/docs\//, 'src/');
    const knowledgeBlock = await this.app.knowledge.buildContextBlock(scopeFile, task.id);

    return `
Workflow stage: ${role === 'Deployer' ? 'Deploy' : 'Build'}
Build id: ${buildId}
Sub-agent role: ${role}
Task id: ${task.id}
Title: ${task.title}
Description: ${task.description}
Scope doc: ${task.scope_doc}

## Scope resolution
${scopeBlock || '(empty)'}

## Skills
${skillBlock || '(none)'}

## Layer walk
${layerBlock || '(empty)'}

## Project memory
${knowledgeBlock || '(none)'}

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
