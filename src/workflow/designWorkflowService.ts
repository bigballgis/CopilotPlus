/** Design workflow Continue / step picker — R-WF-2.8, R-WF-2.9 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import {
  canAdvanceFromStep,
  checkDesignStepArtifacts,
  type DesignStepArtifactStatus,
  type DocArtifactSummary,
} from './designArtifactCheck';
import {
  DESIGN_STEPS,
  designStepLabel,
  nextDesignStep,
  type DesignWorkflowStep,
  isDesignWorkflowStep,
} from './designSteps';
import type { TaskDagFile } from './taskDag';
import { t } from '../platform/l10n';

export interface DesignStepOption {
  id: DesignWorkflowStep;
  label: string;
  complete: boolean;
  missing: string[];
  current: boolean;
}

export interface DesignWorkflowState {
  currentStep: DesignWorkflowStep;
  currentStepLabel: string;
  canContinue: boolean;
  continueBlockedReason?: string;
  isFinalStep: boolean;
  steps: DesignStepOption[];
}

export interface AdvanceDesignResult {
  ok: boolean;
  previousStep: DesignWorkflowStep;
  nextStep?: DesignWorkflowStep;
  reason?: string;
}

export class DesignWorkflowService {
  constructor(private readonly app: AppServices) {}

  async getState(): Promise<DesignWorkflowState> {
    const currentStep = this.app.stages.getDesignStep();
    const docs = this.summarizeDocs();
    const tasks = await this.app.buildExecutor.getTasksDag();
    return this.buildState(currentStep, docs, tasks);
  }

  async getArtifactStatus(step?: DesignWorkflowStep): Promise<DesignStepArtifactStatus> {
    const target = step ?? this.app.stages.getDesignStep();
    const tasks = await this.app.buildExecutor.getTasksDag();
    return checkDesignStepArtifacts(target, this.summarizeDocs(), tasks);
  }

  async continueToNextStep(): Promise<AdvanceDesignResult> {
    const previousStep = this.app.stages.getDesignStep();
    const next = nextDesignStep(previousStep);
    if (!next) {
      return { ok: false, previousStep, reason: t('design.finalStep') };
    }

    const docs = this.summarizeDocs();
    const tasks = await this.app.buildExecutor.getTasksDag();
    if (!canAdvanceFromStep(previousStep, docs, tasks)) {
      const missing = checkDesignStepArtifacts(previousStep, docs, tasks).missing.join(', ');
      const reason = t('design.continueBlocked', missing);
      void vscode.window.showWarningMessage(reason);
      return { ok: false, previousStep, reason };
    }

    await this.app.stages.setDesignStep(next);
    void vscode.window.showInformationMessage(t('design.advancedStep', designStepLabel(next)));
    return { ok: true, previousStep, nextStep: next };
  }

  async pickStep(step: DesignWorkflowStep | string): Promise<boolean> {
    if (!isDesignWorkflowStep(step)) {
      return false;
    }
    await this.app.stages.setDesignStep(step);
    void vscode.window.showInformationMessage(t('design.pickedStep', designStepLabel(step)));
    return true;
  }

  async refreshPanelsForStep(step: DesignWorkflowStep): Promise<void> {
    await this.app.docs.scan();
    const { getTabWorkspace } = await import('../interaction/workspace');
    const tab = getTabWorkspace();
    if (!tab) {
      return;
    }
    await tab.refresh();
    if (step === 'Architecture_Generation') {
      tab.focusTab('architecture');
    } else if (step === 'Design_Document_Generation' || step === 'Requirement_Clarification') {
      tab.focusTab('requirement');
    } else if (step === 'Task_List_Generation') {
      tab.focusTab('task');
    }
  }

  private buildState(
    currentStep: DesignWorkflowStep,
    docs: DocArtifactSummary[],
    tasks: TaskDagFile | undefined
  ): DesignWorkflowState {
    const artifact = checkDesignStepArtifacts(currentStep, docs, tasks);
    const next = nextDesignStep(currentStep);
    const canContinue = !!next && artifact.complete;

    return {
      currentStep,
      currentStepLabel: designStepLabel(currentStep),
      canContinue,
      continueBlockedReason: canContinue
        ? undefined
        : next
          ? t('design.continueBlocked', artifact.missing.join(', '))
          : t('design.finalStep'),
      isFinalStep: !next,
      steps: DESIGN_STEPS.map((step) => {
        const status = checkDesignStepArtifacts(step, docs, tasks);
        return {
          id: step,
          label: designStepLabel(step),
          complete: status.complete,
          missing: status.missing,
          current: step === currentStep,
        };
      }),
    };
  }

  private summarizeDocs(): DocArtifactSummary[] {
    return this.app.docs.getEntries().map((entry) => ({
      level: entry.frontmatter.level,
      valid: entry.valid,
    }));
  }
}
