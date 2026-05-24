/** Drift count status bar — R-DOCS-13.1 */

import * as vscode from 'vscode';
import type { DriftService } from '../docs/driftService';
import { t } from '../platform/l10n';

export class DriftStatusBar {
  private readonly item: vscode.StatusBarItem;

  constructor(drift: DriftService) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    this.item.command = 'copilotPlus.docs.openDriftView';
    drift.onChange(() => this.update(drift.getOpenCount()));
    this.update(drift.getOpenCount());
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }

  private update(count: number): void {
    this.item.text = t('drift.statusBar', String(count));
    this.item.tooltip = count > 0 ? t('drift.statusBarTooltip', String(count)) : t('drift.statusBarEmpty');
  }
}
