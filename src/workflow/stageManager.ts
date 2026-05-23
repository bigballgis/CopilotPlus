/** Workflow stage persistence — R-WF-1 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { WorkflowStage } from '../shared/types';
import { COPILOT_PLUS_HOME } from '../shared/constants';
import { canTransition as isAllowedTransition } from './stageTransitions';
import type { HookService } from '../extensibility/hookService';
import { t } from '../platform/l10n';
import {
  type DesignWorkflowStep,
  isDesignWorkflowStep,
  nextDesignStep,
} from './designSteps';

const ALLOWED: WorkflowStage[] = ['Design', 'Build', 'Deploy'];

export class StageManager {
  private stage: WorkflowStage = 'Design';
  private designStep: DesignWorkflowStep = 'Requirement_Clarification';
  private transitionListeners = new Set<(from: WorkflowStage, to: WorkflowStage) => void>();
  private designStepListeners = new Set<(step: DesignWorkflowStep) => void>();

  constructor(private readonly hooks?: HookService) {}

  async load(): Promise<WorkflowStage> {
    const file = this.statePath();
    if (!file) {
      return 'Design';
    }
    try {
      const raw = await fs.readFile(file, 'utf8');
      const data = JSON.parse(raw) as { workflowStage?: string; designWorkflowStep?: string };
      if (data.workflowStage && ALLOWED.includes(data.workflowStage as WorkflowStage)) {
        this.stage = data.workflowStage as WorkflowStage;
      }
      if (data.designWorkflowStep && isDesignWorkflowStep(data.designWorkflowStep)) {
        this.designStep = data.designWorkflowStep;
      }
    } catch {
      this.stage = 'Design';
      this.designStep = 'Requirement_Clarification';
    }
    return this.stage;
  }

  getDesignStep(): DesignWorkflowStep {
    return this.designStep;
  }

  async setDesignStep(step: DesignWorkflowStep): Promise<void> {
    if (this.designStep === step) {
      return;
    }
    this.designStep = step;
    await this.save();
    for (const listener of this.designStepListeners) {
      listener(step);
    }
  }

  async advanceDesignStep(): Promise<DesignWorkflowStep | undefined> {
    const next = nextDesignStep(this.designStep);
    if (!next) {
      return undefined;
    }
    await this.setDesignStep(next);
    return next;
  }

  onDesignStepChange(listener: (step: DesignWorkflowStep) => void): vscode.Disposable {
    this.designStepListeners.add(listener);
    return { dispose: () => this.designStepListeners.delete(listener) };
  }

  getStage(): WorkflowStage {
    return this.stage;
  }

  async transition(to: WorkflowStage): Promise<boolean> {
    if (!this.canTransition(this.stage, to)) {
      void vscode.window.showWarningMessage(t('stage.transitionBlocked', this.stage, to));
      return false;
    }
    const from = this.stage;
    await this.hooks?.fire('stage.exited', { from, to });
    this.stage = to;
    await this.save();
    await this.hooks?.fire('stage.entered', { stage: to, from });
    for (const listener of this.transitionListeners) {
      listener(from, to);
    }
    return true;
  }

  onTransition(listener: (from: WorkflowStage, to: WorkflowStage) => void): vscode.Disposable {
    this.transitionListeners.add(listener);
    return { dispose: () => this.transitionListeners.delete(listener) };
  }

  canTransition(from: WorkflowStage, to: WorkflowStage): boolean {
    return isAllowedTransition(from, to);
  }

  private statePath(): string | undefined {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      return undefined;
    }
    return path.join(root, COPILOT_PLUS_HOME, 'state.json');
  }

  private async save(): Promise<void> {
    const file = this.statePath();
    if (!file) {
      return;
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    let existing: Record<string, unknown> = {};
    try {
      existing = JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
    } catch {
      /* new file */
    }
    existing.workflowStage = this.stage;
    existing.designWorkflowStep = this.designStep;
    await fs.writeFile(file, JSON.stringify(existing, null, 2), 'utf8');
  }
}
