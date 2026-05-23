/** Decision Center status bar — R-INT-11.3 */

import * as vscode from 'vscode';
import type { DecisionCenter } from './decisionCenter';
import { t } from '../platform/l10n';

export class DecisionStatusBar {
  private readonly item: vscode.StatusBarItem;

  constructor(decisions: DecisionCenter) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'copilotPlus.openDecisionCenter';
    decisions.onPendingCountChange((count) => this.update(count));
    this.update(0);
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }

  private update(count: number): void {
    this.item.text = `Copilot Plus: ${count}`;
    this.item.tooltip = count > 0 ? `${count} pending decision(s)` : 'No pending decisions';
  }
}

export function registerDecisionCenterCommands(decisions: DecisionCenter): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('copilotPlus.openDecisionCenter', async () => {
      const pending = decisions.getPending();
      if (pending.length === 0) {
        void vscode.window.showInformationMessage(t('decision.noPending'));
        return;
      }
      const pick = await vscode.window.showQuickPick(
        pending.map((p) => ({
          label: p.question.slice(0, 80),
          description: p.taskId,
          id: p.id,
        })),
        { placeHolder: 'Select a pending decision' }
      );
      if (!pick) {
        return;
      }
      const req = pending.find((p) => p.id === pick.id);
      if (!req) {
        return;
      }
      const answer = await vscode.window.showQuickPick(req.options, {
        placeHolder: req.question,
      });
      if (answer) {
        decisions.resolve(req.id, answer);
      }
    }),
  ];
}
