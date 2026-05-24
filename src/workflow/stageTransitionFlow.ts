/** User-facing stage transitions with R-WF-6 gates */

import * as vscode from 'vscode';
import type { WorkflowStage } from '../shared/types';
import type { AppServices } from '../app/appServices';
import { t } from '../platform/l10n';
import {
  evaluateStageTransition,
} from './stageTransitionGate';

async function buildContext(app: AppServices) {
  const docs = app.docs.getEntries().map((entry) => ({
    level: entry.frontmatter.level,
    valid: entry.valid,
  }));
  const tasksDag = await app.buildExecutor.getTasksDag();
  const snap = app.buildExecutor.getSnapshot();
  return {
    designStep: app.stages.getDesignStep(),
    docs,
    tasksDag,
    runningTaskCount: snap.runningTaskIds.length,
  };
}

export async function transitionStage(
  app: AppServices,
  to: WorkflowStage
): Promise<boolean> {
  const from = app.stages.getStage();
  if (!app.stages.canTransition(from, to)) {
    void vscode.window.showWarningMessage(t('stage.transitionBlocked', from, to));
    return false;
  }

  const ctx = await buildContext(app);
  const gate = evaluateStageTransition(from, to, ctx);
  if (!gate.allowed) {
    void vscode.window.showWarningMessage(
      t(gate.reasonKey!, ...(gate.reasonArgs ?? []))
    );
    return false;
  }

  if (gate.needsConfirm) {
    const confirm = await vscode.window.showWarningMessage(
      t(gate.confirmKey!),
      { modal: true },
      t('common.yes'),
      t('common.cancel')
    );
    if (confirm !== t('common.yes')) {
      return false;
    }
  }

  if (gate.pauseRunningTasks) {
    await app.buildExecutor.pauseRunningForStageTransition();
  }

  return app.stages.transition(to);
}
