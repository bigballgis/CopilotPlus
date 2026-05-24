/** Code ownership layer path status bar — R-DOCS-11.6 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { formatCodeLayerPathTooltip, resolveCodeLayerPath } from '../docs/codeLayerPath';
import { t } from '../platform/l10n';

export class CodeOwnershipStatusBar {
  private readonly item: vscode.StatusBarItem;

  constructor(
    private readonly app: AppServices,
    context: vscode.ExtensionContext
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
    context.subscriptions.push(
      this.item,
      vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
      this.app.docs.onChange(() => this.refresh())
    );
    this.refresh();
  }

  private refresh(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== 'file') {
      this.item.hide();
      return;
    }

    const rel = vscode.workspace.asRelativePath(editor.document.uri).replace(/\\/g, '/');
    if (rel.startsWith('.copilotPlus/')) {
      this.item.hide();
      return;
    }

    const layerPath = resolveCodeLayerPath(rel, this.app.docs.getEntries());
    if (layerPath.orphan) {
      this.item.text = t('ownership.statusBarOrphan');
      this.item.tooltip = t('ownership.statusBarOrphanTip', rel);
      this.item.command = 'copilotPlus.docs.assignOrphan';
      this.item.show();
      return;
    }

    if (!layerPath.component) {
      this.item.hide();
      return;
    }

    const segments = [
      layerPath.system?.title,
      layerPath.module?.title,
      layerPath.feature?.title,
      layerPath.component.title,
      ...(layerPath.coComponents?.map((c) => c.title) ?? []),
    ].filter(Boolean);

    this.item.text = t('ownership.statusBar', segments.join(' › '));
    this.item.tooltip = formatCodeLayerPathTooltip(layerPath);
    this.item.command = layerPath.component.path
      ? 'copilotPlus.docs.openOwningComponent'
      : undefined;
    this.item.show();
  }
}
