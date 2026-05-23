/** Workflow stage persistence — R-WF-1 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { WorkflowStage } from '../shared/types';
import { COPILOT_PLUS_HOME } from '../shared/constants';
import { canTransition as isAllowedTransition } from './stageTransitions';

const ALLOWED: WorkflowStage[] = ['Design', 'Build', 'Deploy'];

export class StageManager {
  private stage: WorkflowStage = 'Design';

  async load(): Promise<WorkflowStage> {
    const file = this.statePath();
    if (!file) {
      return 'Design';
    }
    try {
      const raw = await fs.readFile(file, 'utf8');
      const data = JSON.parse(raw) as { workflowStage?: string };
      if (data.workflowStage && ALLOWED.includes(data.workflowStage as WorkflowStage)) {
        this.stage = data.workflowStage as WorkflowStage;
      }
    } catch {
      this.stage = 'Design';
    }
    return this.stage;
  }

  getStage(): WorkflowStage {
    return this.stage;
  }

  async transition(to: WorkflowStage): Promise<boolean> {
    if (!this.canTransition(this.stage, to)) {
      void vscode.window.showWarningMessage(`Transition ${this.stage} → ${to} is not allowed.`);
      return false;
    }
    this.stage = to;
    await this.save();
    return true;
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
    await fs.writeFile(file, JSON.stringify(existing, null, 2), 'utf8');
  }
}
