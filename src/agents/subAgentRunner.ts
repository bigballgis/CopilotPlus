/** Sub-Agent invocation with scope context — R-AG-3 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { loadAgentPrompt } from './promptLoader';
import { roleToPromptFile } from './roleMapping';
import { SubAgentLoop, type AgentLoopResult } from './subAgentLoop';
import type { TaskNode } from '../workflow/taskDag';
import { buildLayerWalkForDoc, buildComponentCodeContext } from '../docs/scopeResolution';
import { scopeMaxDocs } from '../context/tierPolicy';
import { resolveScope, type ScopeDoc } from '../docs/scopeResolution';
import {
  buildDriftResolutionPrompt,
  extraToolsForDriftRole,
  resolveDriftAgentRole,
  resolveDriftScopeDoc,
} from '../docs/driftResolution';
import { formatUnreviewedDocNotice } from '../docs/reviewBadge';
import {
  buildComponentConsistencyPrompt,
  buildUpwardConsistencyPrompt,
} from '../docs/consistencyPrompt';
import type { DriftDismissal, DriftItem } from '../docs/driftTypes';
import { MultiAgentVerificationService } from './verificationService';
import {
  parseCommitterVerdict,
  parseReviewerVerdict,
  parseTesterVerdict,
} from './buildStageParse';
import {
  interpretCommitFailureDecision,
  interpretReviewDecision,
  interpretTestExhaustedDecision,
} from './buildPipelineDecisions';
import { runBash } from '../tools/bashRunner';
import { t } from '../platform/l10n';

export interface SubAgentRunResult {
  ok: boolean;
  finalAnswer: string;
  failed: boolean;
  reason?: string;
  blocked?: boolean;
  skip?: boolean;
  pauseRequested?: boolean;
  terminateBuild?: boolean;
}

export interface BuildPipelineHooks {
  onTaskBlocked?: () => Promise<void>;
  onTaskRunning?: () => Promise<void>;
}

export class SubAgentRunner {
  private readonly loop: SubAgentLoop;
  private readonly verification: MultiAgentVerificationService;

  constructor(
    private readonly app: AppServices,
    private readonly extensionUri: vscode.Uri
  ) {
    this.loop = new SubAgentLoop(app.platform, app.tools);
    this.verification = new MultiAgentVerificationService(app, extensionUri);
  }

  private resolveMaxToolCalls(): number {
    const ci = this.app.getCiSession();
    if (ci) {
      return ci.maxToolCalls;
    }
    const remaining = this.app.buildExecutor.getRemainingToolCalls();
    if (remaining !== undefined) {
      return Math.max(1, remaining);
    }
    return this.app.platform.getSettings().maxToolCalls;
  }

  async runRole(
    role: string,
    task: TaskNode,
    buildId: string,
    token: vscode.CancellationToken,
    onStatus?: (message: string) => void
  ): Promise<SubAgentRunResult> {
    return this.verification.runIfEnabled(role, buildId, task.id, token, onStatus, (temperature, candidateIndex) =>
      this.runRoleOnce(role, task, buildId, token, onStatus, temperature, candidateIndex)
    );
  }

  private async runRoleOnce(
    role: string,
    task: TaskNode,
    buildId: string,
    token: vscode.CancellationToken,
    onStatus?: (message: string) => void,
    temperature = 0,
    candidateIndex = 0
  ): Promise<SubAgentRunResult> {
    const promptFile = roleToPromptFile(role);
    const systemPrompt = await loadAgentPrompt(this.extensionUri, promptFile);
    const userPrompt = await this.buildTaskPrompt(role, task, buildId);
    const toolIds = this.app.tools.getEffectiveTools(role);
    const taskId = candidateIndex === 0 ? task.id : `${task.id}-c${candidateIndex}`;

    const result = await this.loop.run({
      role,
      buildId,
      taskId,
      systemPrompt,
      userPrompt,
      toolIds,
      token,
      onStatus,
      temperature,
      maxToolCalls: this.resolveMaxToolCalls(),
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
    const toolIds = this.app.tools.getEffectiveTools(role);

    return this.verification.runIfEnabled(
      role,
      'design-session',
      task.id,
      token,
      onStatus,
      (temperature, candidateIndex) =>
        this.runDesignRoleOnce(
          role,
          designStep,
          task,
          contextPrefix,
          historySummary,
          token,
          onStatus,
          toolIds,
          systemPrompt,
          temperature,
          candidateIndex
        )
    );
  }

  private async runDesignRoleOnce(
    role: string,
    designStep: string,
    task: TaskNode,
    contextPrefix: string | undefined,
    historySummary: string | undefined,
    token: vscode.CancellationToken,
    onStatus: ((message: string) => void) | undefined,
    toolIds: string[],
    systemPrompt: string,
    temperature: number,
    candidateIndex: number
  ): Promise<SubAgentRunResult> {
    const userPrompt = await this.buildDesignPrompt(
      role,
      designStep,
      task,
      contextPrefix,
      historySummary
    );
    const taskId = candidateIndex === 0 ? task.id : `${task.id}-c${candidateIndex}`;
    const result = await this.loop.run({
      role,
      buildId: 'design-session',
      taskId,
      systemPrompt,
      userPrompt,
      toolIds,
      token,
      onStatus,
      temperature,
      maxToolCalls: this.resolveMaxToolCalls(),
    });

    return toRunResult(result);
  }

  /** R-DOCS-12.3 — Reviewer consistency check for a Component doc */
  async runComponentConsistencyCheck(
    componentDocPath: string,
    changedFiles: string[],
    gitDiff: string,
    dismissals: DriftDismissal[],
    buildId: string,
    token: vscode.CancellationToken,
    onStatus?: (message: string) => void
  ): Promise<SubAgentRunResult> {
    const role = 'Reviewer';
    const task: TaskNode = {
      id: `consistency-component-${Date.now()}`,
      title: 'Component layer consistency check',
      description: buildComponentConsistencyPrompt(componentDocPath, changedFiles, gitDiff, dismissals),
      agent: role,
      inputs: { componentDocPath, changedFiles },
      depends_on: [],
      status: 'Running',
      scope_doc: componentDocPath,
    };

    return this.runConsistencyRole(role, task, buildId, token, onStatus);
  }

  /** R-DOCS-12.7 — Architect upward summary check */
  async runUpwardConsistencyCheck(
    childDocPath: string,
    parentDocPath: string,
    dismissals: DriftDismissal[],
    buildId: string,
    token: vscode.CancellationToken,
    onStatus?: (message: string) => void
  ): Promise<SubAgentRunResult> {
    const role = 'Architect';
    const task: TaskNode = {
      id: `consistency-upward-${Date.now()}`,
      title: 'Upward layer consistency check',
      description: buildUpwardConsistencyPrompt(childDocPath, parentDocPath, dismissals),
      agent: role,
      inputs: { childDocPath, parentDocPath },
      depends_on: [],
      status: 'Running',
      scope_doc: parentDocPath,
    };

    return this.runConsistencyRole(role, task, buildId, token, onStatus);
  }

  async captureGitDiffForPaths(paths: string[]): Promise<string> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root || paths.length === 0) {
      return '(no diff)';
    }
    const quoted = paths.map((p) => `"${p.replace(/"/g, '')}"`).join(' ');
    const result = await runBash(`git diff -- ${quoted} && git diff --staged -- ${quoted}`, root, 120_000);
    const combined = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    return combined || '(no diff)';
  }

  private async runConsistencyRole(
    role: string,
    task: TaskNode,
    buildId: string,
    token: vscode.CancellationToken,
    onStatus?: (message: string) => void
  ): Promise<SubAgentRunResult> {
    const systemPrompt = await loadAgentPrompt(this.extensionUri, roleToPromptFile(role));
    const writeTools = new Set(['write_file', 'doc_write', 'apply_patch', 'delete_file']);
    const toolIds = this.app.tools.getEffectiveTools(role).filter((id) => !writeTools.has(id));
    const userPrompt = await this.buildConsistencyPrompt(role, task);

    const result = await this.loop.run({
      role,
      buildId,
      taskId: task.id,
      systemPrompt,
      userPrompt,
      toolIds,
      token,
      onStatus,
      maxToolCalls: Math.min(15, this.resolveMaxToolCalls()),
    });

    return toRunResult(result);
  }

  /** R-DOCS-13.3 — resolve drift via Architect/Reviewer; writes go through Diff Review */
  async runDriftResolution(
    item: DriftItem,
    dismissals: DriftDismissal[],
    token: vscode.CancellationToken,
    onStatus?: (message: string) => void
  ): Promise<SubAgentRunResult> {
    const role = resolveDriftAgentRole(item);
    const scopeDoc = resolveDriftScopeDoc(item, this.app.docs.getEntries());
    const task: TaskNode = {
      id: `drift-${item.id}-${Date.now()}`,
      title: `Resolve drift: ${item.type}`,
      description: buildDriftResolutionPrompt(item, dismissals),
      agent: role,
      inputs: { driftType: item.type, target: item.target },
      depends_on: [],
      status: 'Running',
      scope_doc: scopeDoc,
    };

    const systemPrompt = await loadAgentPrompt(this.extensionUri, roleToPromptFile(role));
    const toolIds = [...new Set([...this.app.tools.getEffectiveTools(role), ...extraToolsForDriftRole(role, item)])];
    const userPrompt = await this.buildDriftPrompt(role, task);

    const result = await this.loop.run({
      role,
      buildId: 'drift-resolution',
      taskId: task.id,
      systemPrompt,
      userPrompt,
      toolIds,
      token,
      onStatus,
      maxToolCalls: Math.min(30, this.resolveMaxToolCalls()),
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
    const buildId = `deploy-${intent}`;

    return this.verification.runIfEnabled(
      'Deployer',
      buildId,
      task.id,
      token,
      onStatus,
      (temperature, candidateIndex) =>
        this.runDeployerOnce(
          task,
          buildId,
          systemPrompt,
          userPrompt,
          toolIds,
          token,
          onStatus,
          temperature,
          candidateIndex
        )
    );
  }

  private async runDeployerOnce(
    task: TaskNode,
    buildId: string,
    systemPrompt: string,
    userPrompt: string,
    toolIds: string[],
    token: vscode.CancellationToken,
    onStatus?: (message: string) => void,
    temperature = 0,
    candidateIndex = 0
  ): Promise<SubAgentRunResult> {
    const taskId = candidateIndex === 0 ? task.id : `${task.id}-c${candidateIndex}`;
    const result = await this.loop.run({
      role: 'Deployer',
      buildId,
      taskId,
      systemPrompt,
      userPrompt,
      toolIds,
      token,
      onStatus,
      temperature,
      maxToolCalls: this.resolveMaxToolCalls(),
    });

    return toRunResult(result);
  }

  /** R-WF-4 — Coder-led pipeline on a single task */
  async runBuildPipeline(
    task: TaskNode,
    buildId: string,
    token: vscode.CancellationToken,
    onStatus?: (message: string) => void,
    hooks?: BuildPipelineHooks
  ): Promise<SubAgentRunResult> {
    if (task.agent !== 'Coder') {
      return this.runRole(task.agent, task, buildId, token, onStatus);
    }

    const testCommand = this.resolveTestCommand();
    let stepTask = task;

    const testerOutcome = await this.runTesterWithDecisions(
      stepTask,
      buildId,
      testCommand,
      token,
      onStatus
    );
    if (!('task' in testerOutcome)) {
      return testerOutcome;
    }
    stepTask = testerOutcome.task;

    const reviewResult = await this.runReviewerWithDecision(
      stepTask,
      buildId,
      testCommand,
      token,
      onStatus,
      hooks
    );
    if (!('task' in reviewResult)) {
      return reviewResult;
    }
    stepTask = reviewResult.task;

    const commitOutcome = await this.runCommitterWithDecisions(
      stepTask,
      buildId,
      token,
      onStatus
    );
    if (!commitOutcome.ok) {
      return commitOutcome;
    }

    return { ok: true, finalAnswer: commitOutcome.finalAnswer, failed: false };
  }

  /** R-WF-4.3–4.5 — Coder then Tester with user decision after exhaustion */
  private async runTesterWithDecisions(
    task: TaskNode,
    buildId: string,
    testCommand: string,
    token: vscode.CancellationToken,
    onStatus?: (message: string) => void
  ): Promise<{ ok: true; task: TaskNode } | SubAgentRunResult> {
    let stepTask = task;

    const coderResult = await this.runCoderWithVerification(stepTask, buildId, token, onStatus);
    if (!coderResult.ok) {
      return coderResult;
    }

    while (true) {
      const testerLoop = await this.runTesterCoderLoop(
        stepTask,
        buildId,
        testCommand,
        token,
        onStatus
      );
      if (testerLoop.ok) {
        return testerLoop;
      }
      if (testerLoop.reason !== 'test_exhausted') {
        return testerLoop;
      }

      const decision = await this.app.decisions.ask({
        id: `test-fail-${task.id}-${Date.now()}`,
        taskId: task.id,
        question: t('build.testExhausted', task.id),
        options: ['Retry_Task', 'Skip_Task', 'Terminate_Build'],
        defaultOption: 'Retry_Task',
        timeoutSec: this.app.platform.getSettings().decisionTimeoutSec,
      });
      const action = interpretTestExhaustedDecision(decision.selected, decision.timedOut);
      if (action === 'retry') {
        const coderRetry = await this.runCoderWithVerification(
          stepTask,
          buildId,
          token,
          onStatus
        );
        if (!coderRetry.ok) {
          return coderRetry;
        }
        continue;
      }
      if (action === 'skip') {
        return {
          ok: false,
          finalAnswer: testerLoop.finalAnswer,
          failed: false,
          skip: true,
          reason: 'test_skipped',
        };
      }
      if (action === 'pause') {
        return {
          ok: false,
          finalAnswer: testerLoop.finalAnswer,
          failed: true,
          blocked: true,
          pauseRequested: true,
          reason: 'test_paused',
        };
      }
      if (action === 'terminate') {
        return {
          ok: false,
          finalAnswer: testerLoop.finalAnswer,
          failed: true,
          terminateBuild: true,
          reason: 'test_terminated',
        };
      }
      return testerLoop;
    }
  }

  /** R-WF-4.8–4.9 — Committer with retry + decision on failure */
  private async runCommitterWithDecisions(
    task: TaskNode,
    buildId: string,
    token: vscode.CancellationToken,
    onStatus?: (message: string) => void
  ): Promise<{ ok: true; finalAnswer: string } | SubAgentRunResult> {
    let lastAnswer = '';
    let autoAttempts = 0;

    while (autoAttempts < 4) {
      autoAttempts += 1;
      if (autoAttempts === 1) {
        onStatus?.('Running layer consistency check before commit…');
        await this.app.drift.runConsistencyCheck(false, { buildId, token, onStatus });
      }
      onStatus?.(`Running Committer for ${task.id} (attempt ${autoAttempts})`);
      const committerResult = await this.runRole(
        'Committer',
        this.buildCommitterTask(task),
        buildId,
        token,
        onStatus
      );
      if (!committerResult.ok) {
        return committerResult;
      }
      lastAnswer = committerResult.finalAnswer;

      const commitVerdict = parseCommitterVerdict(committerResult.finalAnswer);
      if (commitVerdict.committed) {
        return { ok: true, finalAnswer: committerResult.finalAnswer };
      }

      if (autoAttempts < 2) {
        onStatus?.(t('build.commitRetry', task.id, autoAttempts + 1));
        continue;
      }

      const decision = await this.app.decisions.ask({
        id: `commit-fail-${task.id}-${Date.now()}`,
        taskId: task.id,
        question: t('build.commitFailed', task.id, commitVerdict.error ?? commitVerdict.summary),
        options: ['Retry_Commit', 'Skip_Commit', 'Terminate_Task'],
        defaultOption: 'Retry_Commit',
        timeoutSec: this.app.platform.getSettings().decisionTimeoutSec,
      });
      const action = interpretCommitFailureDecision(decision.selected);
      if (action === 'retry') {
        autoAttempts = 0;
        continue;
      }
      if (action === 'skip') {
        return { ok: true, finalAnswer: lastAnswer };
      }
      if (action === 'pause') {
        return {
          ok: false,
          finalAnswer: lastAnswer,
          failed: true,
          blocked: true,
          pauseRequested: true,
          reason: 'commit_paused',
        };
      }
      return {
        ok: false,
        finalAnswer: lastAnswer,
        failed: true,
        reason: 'commit_failed',
      };
    }

    return {
      ok: false,
      finalAnswer: lastAnswer,
      failed: true,
      reason: 'commit_failed',
    };
  }

  /** R-WF-4.5 — Tester with up to 3 Coder retry rounds on failure */
  private async runTesterCoderLoop(
    task: TaskNode,
    buildId: string,
    testCommand: string,
    token: vscode.CancellationToken,
    onStatus?: (message: string) => void
  ): Promise<{ ok: true; task: TaskNode } | SubAgentRunResult> {
    let stepTask = task;

    for (let round = 1; round <= 3; round++) {
      onStatus?.(`Running Tester for ${task.id} (round ${round}/3)`);
      const testerResult = await this.runRole(
        'Tester',
        this.buildTesterTask(stepTask, testCommand),
        buildId,
        token,
        onStatus
      );
      if (!testerResult.ok) {
        return testerResult;
      }

      const verdict = parseTesterVerdict(testerResult.finalAnswer);
      if (verdict.passed) {
        return { ok: true, task: stepTask };
      }

      if (round >= 3) {
        return {
          ok: false,
          finalAnswer: testerResult.finalAnswer,
          failed: true,
          reason: 'test_exhausted',
        };
      }

      onStatus?.(`Tests failed — Coder retry ${round + 1}/3`);
      stepTask = {
        ...stepTask,
        description: `${stepTask.description}\n\n## tester_failure (round ${round})\n${verdict.failureOutput || verdict.summary}`,
      };
      const coderRetry = await this.runCoderWithVerification(stepTask, buildId, token, onStatus);
      if (!coderRetry.ok) {
        return coderRetry;
      }
    }

    return {
      ok: false,
      finalAnswer: '',
      failed: true,
      reason: 'test_exhausted',
    };
  }

  /** R-WF-4.6–4.7 — Reviewer with diff context and blocking decision */
  private async runReviewerWithDecision(
    task: TaskNode,
    buildId: string,
    testCommand: string,
    token: vscode.CancellationToken,
    onStatus?: (message: string) => void,
    hooks?: BuildPipelineHooks
  ): Promise<{ ok: true; task: TaskNode } | SubAgentRunResult> {
    let stepTask = task;

    for (let attempt = 1; attempt <= 2; attempt++) {
      onStatus?.(`Running Reviewer for ${task.id}`);
      const gitDiff = await this.captureGitDiff();
      const reviewerResult = await this.runRole(
        'Reviewer',
        this.buildReviewerTask(stepTask, gitDiff),
        buildId,
        token,
        onStatus
      );
      if (!reviewerResult.ok) {
        return reviewerResult;
      }

      const verdict = parseReviewerVerdict(reviewerResult.finalAnswer);
      if (verdict.passed || !verdict.blocking) {
        return { ok: true, task: stepTask };
      }

      await hooks?.onTaskBlocked?.();
      const decision = await this.app.decisions.ask({
        id: `review-${task.id}-${Date.now()}`,
        taskId: task.id,
        question: t('build.reviewBlocked', task.id, verdict.summary),
        options: ['Feed_to_Coder', 'Accept_anyway', 'Terminate'],
        defaultOption: 'Feed_to_Coder',
        timeoutSec: this.app.platform.getSettings().decisionTimeoutSec,
      });
      await hooks?.onTaskRunning?.();

      const action = interpretReviewDecision(decision.selected, decision.timedOut);
      if (action === 'pause') {
        return {
          ok: false,
          finalAnswer: reviewerResult.finalAnswer,
          failed: true,
          blocked: true,
          pauseRequested: true,
          reason: 'review_paused',
        };
      }
      if (action === 'terminate' || action === 'fail') {
        return {
          ok: false,
          finalAnswer: reviewerResult.finalAnswer,
          failed: true,
          blocked: true,
          reason: 'review_terminated',
        };
      }
      if (action === 'skip') {
        return { ok: true, task: stepTask };
      }

      stepTask = {
        ...stepTask,
        description: `${stepTask.description}\n\n## reviewer_blocking_issues\n${verdict.issues.join('\n') || verdict.summary}`,
      };
      const coderFix = await this.runCoderWithVerification(stepTask, buildId, token, onStatus);
      if (!coderFix.ok) {
        return coderFix;
      }

      const retest = await this.runTesterCoderLoop(stepTask, buildId, testCommand, token, onStatus);
      if (!retest.ok) {
        if (retest.reason === 'test_exhausted') {
          const decision = await this.app.decisions.ask({
            id: `test-fail-${task.id}-${Date.now()}`,
            taskId: task.id,
            question: t('build.testExhausted', task.id),
            options: ['Retry_Task', 'Skip_Task', 'Terminate_Build'],
            defaultOption: 'Retry_Task',
            timeoutSec: this.app.platform.getSettings().decisionTimeoutSec,
          });
          const action = interpretTestExhaustedDecision(decision.selected, decision.timedOut);
          if (action === 'retry') {
            const coderRetry = await this.runCoderWithVerification(
              stepTask,
              buildId,
              token,
              onStatus
            );
            if (!coderRetry.ok) {
              return coderRetry;
            }
            const again = await this.runTesterCoderLoop(
              stepTask,
              buildId,
              testCommand,
              token,
              onStatus
            );
            if (again.ok) {
              stepTask = again.task;
              continue;
            }
            return again;
          }
          if (action === 'skip') {
            return {
              ok: false,
              finalAnswer: retest.finalAnswer,
              failed: false,
              skip: true,
              reason: 'test_skipped',
            };
          }
          if (action === 'pause') {
            return {
              ok: false,
              finalAnswer: retest.finalAnswer,
              failed: true,
              blocked: true,
              pauseRequested: true,
              reason: 'test_paused',
            };
          }
          if (action === 'terminate') {
            return {
              ok: false,
              finalAnswer: retest.finalAnswer,
              failed: true,
              terminateBuild: true,
              reason: 'test_terminated',
            };
          }
          return retest;
        }
        return retest;
      }
      stepTask = retest.task;
    }

    return {
      ok: false,
      finalAnswer: '',
      failed: true,
      blocked: true,
      reason: 'review_exhausted',
    };
  }

  private buildTesterTask(task: TaskNode, testCommand: string): TaskNode {
    return {
      ...task,
      description: `${task.description}\n\nBuild step: Testing\n\n## test_command\n${testCommand}\n\nRun tests with run_tests (default command above) and report pass/fail as JSON with keys passed, summary, failure_output.`,
    };
  }

  private buildReviewerTask(task: TaskNode, gitDiff: string): TaskNode {
    return {
      ...task,
      description: `${task.description}\n\nBuild step: Review\n\n## git_diff\n${gitDiff}\n\nReview the diff against Scope resolution above. Return JSON with keys passed, blocking, blocking_issues, layer_consistency, summary.`,
    };
  }

  private buildCommitterTask(task: TaskNode): TaskNode {
    return {
      ...task,
      description: `${task.description}\n\nBuild step: Commit\n\nStage and commit changes. Return JSON with keys committed, commit_hash, summary, error.`,
    };
  }

  private resolveTestCommand(): string {
    return (
      vscode.workspace.getConfiguration('copilotPlus').get<string>('workflow.testCommand') ||
      'npm run test:unit'
    );
  }

  private async captureGitDiff(): Promise<string> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      return '(no workspace)';
    }
    const result = await runBash('git diff && git diff --staged', root, 120_000);
    const combined = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    return combined || '(no diff)';
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

  private async recordScopeReferences(scope: ScopeDoc[]): Promise<void> {
    await this.app.docs.touchLastReferenced(scope.map((s) => s.document_path));
  }

  private async buildDeployPrompt(intent: 'generate' | 'apply', task: TaskNode): Promise<string> {
    const cfg = this.app.deploy.getConfig();
    const manifestDir = this.app.deploy.manifestDir() ?? '';
    const files = await this.app.deploy.listManifestFiles();
    const recommended = this.app.deploy.recommendedCommands();
    const entries = this.app.docs.getEntries();
    const model = await this.app.platform.models.resolveSelectionForSurface('subAgent');
    const tierOverride = this.app.platform.getSettings().tierOverride;
    const tier = model ? this.app.platform.models.getContextTier(model, tierOverride) : ('M' as const);
    const scope = resolveScope(task.scope_doc, entries, scopeMaxDocs(tier));
    await this.recordScopeReferences(scope);
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
    const model = await this.app.platform.models.resolveSelectionForSurface('subAgent');
    const tierOverride = this.app.platform.getSettings().tierOverride;
    const tier = model ? this.app.platform.models.getContextTier(model, tierOverride) : ('M' as const);
    const scope = resolveScope(task.scope_doc, entries, scopeMaxDocs(tier));
    await this.recordScopeReferences(scope);
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
    const knowledgeBlock = await this.app.knowledge.buildContextBlock(scopeFile, task.id, tier);

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

  private async buildDriftPrompt(role: string, task: TaskNode): Promise<string> {
    const entries = this.app.docs.getEntries();
    const model = await this.app.platform.models.resolveSelectionForSurface('subAgent');
    const tierOverride = this.app.platform.getSettings().tierOverride;
    const tier = model ? this.app.platform.models.getContextTier(model, tierOverride) : ('M' as const);
    const scope = resolveScope(task.scope_doc, entries, scopeMaxDocs(tier));
    await this.recordScopeReferences(scope);
    const layerWalk = buildLayerWalkForDoc(task.scope_doc, entries, tier);
    const scopeBlock = scope
      .map((s) => `- [${s.link_type}] ${s.title} (${s.document_path})`)
      .join('\n');
    const scopeEntry = this.app.docs.getByPath(task.scope_doc);
    const skillBlock = this.app.skills.formatInstructions(
      this.app.skills.getAutoAttached(task.scope_doc, scopeEntry?.frontmatter.id)
    );
    const layerBlock = layerWalk.map((l) => `### ${l.documentPath}\n${l.content}`).join('\n\n');
    const scopeFile = scopeEntry?.relativePath ?? task.scope_doc.replace(/^\.copilotPlus\/docs\//, 'src/');
    const knowledgeBlock = await this.app.knowledge.buildContextBlock(scopeFile, task.id, tier);

    return `
Workflow stage: Drift resolution
Sub-agent role: ${role}
Scope doc: ${task.scope_doc}

## Drift resolution task
${task.description}

## Scope resolution
${scopeBlock || '(empty)'}

## Skills
${skillBlock || '(none)'}

## Layer walk
${layerBlock || '(empty)'}

## Project memory
${knowledgeBlock || '(none)'}

${formatUnreviewedDocNotice(entries)}

Apply doc_write or write_file for proposed fixes. Summarize what you changed when done.
`.trim();
  }

  private async buildConsistencyPrompt(role: string, task: TaskNode): Promise<string> {
    const entries = this.app.docs.getEntries();
    const model = await this.app.platform.models.resolveSelectionForSurface('subAgent');
    const tierOverride = this.app.platform.getSettings().tierOverride;
    const tier = model ? this.app.platform.models.getContextTier(model, tierOverride) : ('M' as const);
    const scope = resolveScope(task.scope_doc, entries, scopeMaxDocs(tier));
    await this.recordScopeReferences(scope);
    const layerWalk = buildLayerWalkForDoc(task.scope_doc, entries, tier);
    const scopeBlock = scope
      .map((s) => `- [${s.link_type}] ${s.title} (${s.document_path})`)
      .join('\n');
    const layerBlock = layerWalk.map((l) => `### ${l.documentPath}\n${l.content}`).join('\n\n');

    return `
Workflow stage: Layer consistency check
Sub-agent role: ${role}
Scope doc: ${task.scope_doc}

## Consistency task
${task.description}

## Scope resolution
${scopeBlock || '(empty)'}

## Layer walk
${layerBlock || '(empty)'}

${formatUnreviewedDocNotice(entries)}

Return the JSON verdict object described above. Do not modify files.
`.trim();
  }

  private async buildTaskPrompt(role: string, task: TaskNode, buildId: string): Promise<string> {
    const entries = this.app.docs.getEntries();
    const model = await this.app.platform.models.resolveSelectionForSurface('subAgent');
    const tierOverride = this.app.platform.getSettings().tierOverride;
    const tier = model ? this.app.platform.models.getContextTier(model, tierOverride) : ('M' as const);
    const scope = resolveScope(task.scope_doc, entries, scopeMaxDocs(tier));
    await this.recordScopeReferences(scope);
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
    const indexedCodePaths = this.app.indexManager.listIndexedCodePaths();
    const componentCodeBlock =
      scopeEntry?.frontmatter.level === 'component'
        ? buildComponentCodeContext(task.scope_doc, entries, indexedCodePaths)
        : '';
    const scopeFile = scopeEntry?.relativePath ?? task.scope_doc.replace(/^\.copilotPlus\/docs\//, 'src/');
    const knowledgeBlock = await this.app.knowledge.buildContextBlock(scopeFile, task.id, tier);

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

${componentCodeBlock ? `${componentCodeBlock}\n` : ''}
## Project memory
${knowledgeBlock || '(none)'}

${formatUnreviewedDocNotice(entries)}

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
