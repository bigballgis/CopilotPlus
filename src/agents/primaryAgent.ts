/** Primary Agent — R-AG-1, R-AG-3 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { estimateTokens } from '../platform/chatClient';
import { loadAgentPrompt } from './promptLoader';
import type { SessionMessage } from '../interaction/sessionStore';
import {
  classifyDesignMessage,
  isContinueOnlyMessage,
} from '../workflow/designStepClassifier';
import type { DesignWorkflowStep } from '../workflow/designSteps';
import { designStepLabel } from '../workflow/designSteps';
import { t } from '../platform/l10n';

export interface PrimaryTurnResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cancelled: boolean;
  designStep?: DesignWorkflowStep;
  delegatedRole?: string;
}

export class PrimaryAgent {
  private systemPrompt: string | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly app: AppServices
  ) {}

  async ensurePrompt(): Promise<string> {
    if (!this.systemPrompt) {
      this.systemPrompt = await loadAgentPrompt(this.extensionUri, 'primary');
    }
    return this.systemPrompt;
  }

  /** R-AG-1.3 / R-AG-3.1 — classify Design step and delegate to Sub-Agent */
  async runDesignTurn(
    userText: string,
    history: SessionMessage[],
    token: vscode.CancellationToken,
    onChunk?: (chunk: string) => void,
    contextPrefix?: string,
    onStatus?: (message: string) => void
  ): Promise<PrimaryTurnResult> {
    const currentStep = this.app.stages.getDesignStep();
    let activeStep = currentStep;

    if (isContinueOnlyMessage(userText)) {
      const advance = await this.app.designWorkflow.continueToNextStep();
      if (advance.ok && advance.nextStep) {
        activeStep = advance.nextStep;
        const message = t('design.continueOnly', designStepLabel(activeStep));
        emitChunks(message, onChunk);
        return {
          text: message,
          inputTokens: estimateTokens(userText),
          outputTokens: estimateTokens(message),
          cancelled: false,
          designStep: activeStep,
        };
      }
      const reason = advance.reason ?? t('design.finalStep');
      emitChunks(reason, onChunk);
      return {
        text: reason,
        inputTokens: estimateTokens(userText),
        outputTokens: estimateTokens(reason),
        cancelled: false,
        designStep: activeStep,
      };
    }

    const classification = classifyDesignMessage(userText, activeStep);
    if (classification.step !== activeStep) {
      await this.app.stages.setDesignStep(classification.step);
      activeStep = classification.step;
    }

    const role = classification.role;
    onStatus?.(t('design.delegating', role, designStepLabel(activeStep)));

    const systemDoc = this.app.docs.getEntries().find((e) => e.valid && e.frontmatter.level === 'system');
    const scopeDoc = systemDoc?.relativePath ?? '.copilotPlus/docs/system/default.md';
    const historySummary = formatHistorySummary(history);
    const inputTokens =
      estimateTokens(userText) +
      estimateTokens(contextPrefix ?? '') +
      estimateTokens(historySummary);

    const cap = this.app.platform.getSettings().sessionTokenCap;
    if (inputTokens > cap) {
      throw new Error(`Session token cap reached (${cap}). Start a new session.`);
    }

    const result = await this.runDesignWithRetries(
      role,
      activeStep,
      userText,
      scopeDoc,
      token,
      onStatus,
      contextPrefix,
      historySummary
    );

    if (result.cancelled) {
      return {
        text: '',
        inputTokens,
        outputTokens: 0,
        cancelled: true,
        designStep: activeStep,
        delegatedRole: role,
      };
    }

    if (!result.ok) {
      const message = result.reason
        ? t('design.delegateFailed', role, result.reason)
        : t('design.delegateFailedGeneric', role);
      emitChunks(message, onChunk);
      return {
        text: message,
        inputTokens,
        outputTokens: estimateTokens(message),
        cancelled: false,
        designStep: activeStep,
        delegatedRole: role,
      };
    }

    emitChunks(result.finalAnswer, onChunk);
    await this.app.docs.scan();
    void this.app.designWorkflow.refreshPanelsForStep(activeStep);
    return {
      text: result.finalAnswer,
      inputTokens,
      outputTokens: estimateTokens(result.finalAnswer),
      cancelled: false,
      designStep: activeStep,
      delegatedRole: role,
    };
  }

  private async runDesignWithRetries(
    role: string,
    designStep: DesignWorkflowStep,
    userText: string,
    scopeDoc: string,
    token: vscode.CancellationToken,
    onStatus?: (message: string) => void,
    contextPrefix?: string,
    historySummary?: string
  ): Promise<{ ok: boolean; finalAnswer: string; reason?: string; cancelled?: boolean }> {
    let lastReason: string | undefined;

    for (let attempt = 1; attempt <= 3; attempt++) {
      if (token.isCancellationRequested) {
        return { ok: false, finalAnswer: '', cancelled: true };
      }

      onStatus?.(
        attempt === 1
          ? t('design.runningRole', role)
          : t('design.retryRole', role, attempt)
      );

      const result = await this.app.subAgentRunner.runDesignRole(
        role,
        designStep,
        userText,
        scopeDoc,
        token,
        onStatus,
        contextPrefix,
        historySummary
      );

      if (result.ok) {
        return { ok: true, finalAnswer: result.finalAnswer };
      }

      lastReason = result.reason;
      if (attempt >= 3) {
        break;
      }
    }

    const decision = await this.app.decisions.ask({
      id: `design-${role}-${Date.now()}`,
      question: t('design.failureDecision', role, lastReason ?? 'unknown'),
      options: ['Retry', 'Skip', 'Terminate'],
      defaultOption: 'Retry',
      timeoutSec: 300,
    });

    if (decision.selected === 'Retry') {
      return this.runDesignWithRetries(
        role,
        designStep,
        userText,
        scopeDoc,
        token,
        onStatus,
        contextPrefix,
        historySummary
      );
    }

    if (decision.selected === 'Skip') {
      return {
        ok: true,
        finalAnswer: t('design.skippedRole', role),
      };
    }

    return { ok: false, finalAnswer: '', reason: lastReason, cancelled: true };
  }
}

function formatHistorySummary(history: SessionMessage[]): string {
  const recent = history.slice(-6);
  if (recent.length === 0) {
    return '';
  }
  return recent
    .map((msg) => `${msg.role}: ${msg.text.slice(0, 500)}`)
    .join('\n');
}

function emitChunks(text: string, onChunk?: (chunk: string) => void): void {
  if (!onChunk) {
    return;
  }
  const size = 240;
  for (let i = 0; i < text.length; i += size) {
    onChunk(text.slice(i, i + size));
  }
}
