/** Drift persistence, queue, and resolution — R-DOCS-12, R-DOCS-13 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { COPILOT_PLUS_HOME } from '../shared/constants';
import type { AppServices } from '../app/appServices';
import { resolveOwners } from './ownershipIndex';
import { ConsistencyQueue } from './consistencyQueue';
import {
  dedupeDriftItems,
  scanDriftDiagnostics,
  summarizeLayerConsistency,
} from './driftDiagnostics';
import type { DriftDismissal, DriftHistoryFile, DriftItem, DriftStateFile, LayerConsistencyCounts } from './driftTypes';
import { t } from '../platform/l10n';

export class DriftService {
  private items: DriftItem[] = [];
  private dismissals: DriftDismissal[] = [];
  private readonly queue = new ConsistencyQueue();
  private readonly onChangeEmitter = new vscode.EventEmitter<void>();
  readonly onChange = this.onChangeEmitter.event;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private resolveSource: vscode.CancellationTokenSource | undefined;

  constructor(private readonly app: AppServices) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      this.onChange,
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.scheme !== 'file') {
          return;
        }
        const rel = vscode.workspace.asRelativePath(event.document.uri).replace(/\\/g, '/');
        this.onFileChanged(rel);
      }),
      this.app.docs.onChange(() => {
        this.scheduleRescan();
      })
    );
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.loadState();
    await this.runConsistencyCheck(false);
  }

  getItems(): DriftItem[] {
    return [...this.items];
  }

  getOpenCount(): number {
    return this.items.length;
  }

  getSummary(): LayerConsistencyCounts {
    return summarizeLayerConsistency(this.items, this.queue.pendingCount());
  }

  getRecentDismissals(limit = 10): DriftDismissal[] {
    return this.dismissals.slice(-limit);
  }

  async runConsistencyCheck(notify = true): Promise<number> {
    const entries = this.app.docs.getEntries();
    const stale = new Set(
      this.app.docs.findStaleDocuments(this.app.platform.getSettings().staleThresholdDays).map((e) => e.relativePath)
    );
    const codePaths = this.app.indexManager.listIndexedCodePaths();
    const scanned = scanDriftDiagnostics(entries, codePaths, stale);
    const dismissedKeys = new Set(
      this.dismissals.map((d) => `${d.target}`).concat(this.dismissals.map((d) => d.driftId))
    );
    this.items = dedupeDriftItems(
      scanned.filter((item) => !this.isDismissed(item, dismissedKeys))
    );
    await this.saveState();
    this.onChangeEmitter.fire();
    if (notify) {
      void vscode.window.showInformationMessage(t('drift.checkComplete', String(this.items.length)));
    }
    return this.items.length;
  }

  async resolveItem(itemId: string): Promise<void> {
    const item = this.items.find((i) => i.id === itemId);
    if (!item) {
      return;
    }
    if (!this.app.platform.models.hasModels()) {
      await this.app.platform.auth.promptSignIn();
      void vscode.window.showWarningMessage(t('models.noModelsAvailable'));
      return;
    }

    this.resolveSource?.cancel();
    this.resolveSource = new vscode.CancellationTokenSource();
    const registration = this.app.platform.modelRequests.register(this.resolveSource);

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: t('drift.resolving', item.type),
          cancellable: true,
        },
        async (_progress, token) => {
          token.onCancellationRequested(() => this.resolveSource?.cancel());
          const result = await this.app.subAgentRunner.runDriftResolution(
            item,
            this.dismissals,
            this.resolveSource!.token,
            (status) => {
              void vscode.window.setStatusBarMessage(`Copilot Plus drift: ${status}`, 3000);
            }
          );

          if (this.resolveSource.token.isCancellationRequested) {
            void vscode.window.showInformationMessage(t('drift.resolveCancelled'));
            return;
          }
          if (!result.ok || result.failed) {
            void vscode.window.showErrorMessage(
              t('drift.resolveFailed', result.reason ?? result.finalAnswer.slice(0, 120))
            );
            return;
          }

          const before = this.items.length;
          await this.runConsistencyCheck(false);
          const cleared = before > this.items.length || !this.items.some((i) => i.id === itemId);
          if (cleared) {
            await this.app.hooks.fire('drift.resolved', { id: item.id, dismissed: false });
            void vscode.window.showInformationMessage(t('drift.resolveSuccess', item.type));
          } else {
            void vscode.window.showInformationMessage(t('drift.resolvePartial', item.type));
          }
        }
      );
    } finally {
      registration.dispose();
      this.resolveSource = undefined;
    }
  }

  async resolveAll(): Promise<void> {
    const queue = [...this.items];
    for (const item of queue) {
      if (!this.items.some((i) => i.id === item.id)) {
        continue;
      }
      await this.resolveItem(item.id);
    }
  }

  async dismissItem(itemId: string): Promise<void> {
    const item = this.items.find((i) => i.id === itemId);
    if (!item) {
      return;
    }
    const rationale = await vscode.window.showInputBox({
      prompt: t('drift.dismissPrompt'),
      placeHolder: t('drift.dismissPlaceholder'),
    });
    if (!rationale?.trim()) {
      return;
    }
    this.dismissals.push({
      driftId: item.id,
      target: item.target,
      rationale: rationale.trim(),
      dismissedAt: new Date().toISOString(),
    });
    this.items = this.items.filter((i) => i.id !== itemId);
    await this.saveState();
    await this.saveHistory();
    await this.app.hooks.fire('drift.resolved', { id: item.id, dismissed: true });
    this.onChangeEmitter.fire();
  }

  async openDriftView(): Promise<void> {
    const items = this.getItems();
    if (items.length === 0) {
      void vscode.window.showInformationMessage(t('drift.noneOpen'));
      return;
    }
    const pick = await vscode.window.showQuickPick(
      items.map((item) => ({
        label: `${item.type} — ${item.target}`,
        description: item.layer,
        detail: item.detail,
        id: item.id,
      })),
      { placeHolder: t('drift.viewPlaceHolder') }
    );
    if (!pick) {
      return;
    }
    const action = await vscode.window.showQuickPick(
      [t('drift.actionResolve'), t('drift.actionDismiss'), t('common.cancel')],
      { placeHolder: t('drift.actionPlaceHolder') }
    );
    if (action === t('drift.actionResolve')) {
      await this.resolveItem(pick.id);
    } else if (action === t('drift.actionDismiss')) {
      await this.dismissItem(pick.id);
    }
  }

  private onFileChanged(relativePath: string): void {
    if (relativePath.startsWith('.copilotPlus/docs/')) {
      this.scheduleRescan();
      return;
    }
    const owners = resolveOwners(relativePath, this.app.docs.getEntries());
    for (const ownerId of owners.owners) {
      this.queue.enqueue(ownerId, relativePath);
      if (this.queue.shouldFlush(ownerId)) {
        void this.runConsistencyCheck(false);
      }
    }
    if (owners.orphan) {
      this.scheduleRescan();
    }
  }

  private scheduleRescan(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      void this.runConsistencyCheck(false);
    }, 2000);
  }

  private isDismissed(item: DriftItem, dismissedKeys: Set<string>): boolean {
    return dismissedKeys.has(item.id) || dismissedKeys.has(item.target);
  }

  private async loadState(): Promise<void> {
    const root = this.workspaceRoot();
    if (!root) {
      return;
    }
    const statePath = path.join(root, COPILOT_PLUS_HOME, 'drift_state.json');
    const historyPath = path.join(root, COPILOT_PLUS_HOME, 'drift_history.json');
    try {
      const raw = JSON.parse(await fs.readFile(statePath, 'utf8')) as DriftStateFile;
      this.items = raw.items ?? [];
    } catch {
      this.items = [];
    }
    try {
      const raw = JSON.parse(await fs.readFile(historyPath, 'utf8')) as DriftHistoryFile;
      this.dismissals = raw.dismissals ?? [];
    } catch {
      this.dismissals = [];
    }
  }

  private async saveState(): Promise<void> {
    const root = this.workspaceRoot();
    if (!root) {
      return;
    }
    const dir = path.join(root, COPILOT_PLUS_HOME);
    await fs.mkdir(dir, { recursive: true });
    const payload: DriftStateFile = {
      items: this.items,
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(path.join(dir, 'drift_state.json'), JSON.stringify(payload, null, 2), 'utf8');
  }

  private async saveHistory(): Promise<void> {
    const root = this.workspaceRoot();
    if (!root) {
      return;
    }
    const dir = path.join(root, COPILOT_PLUS_HOME);
    await fs.mkdir(dir, { recursive: true });
    const payload: DriftHistoryFile = { dismissals: this.dismissals.slice(-500) };
    await fs.writeFile(path.join(dir, 'drift_history.json'), JSON.stringify(payload, null, 2), 'utf8');
  }

  private workspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }
}
