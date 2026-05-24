/** Drift persistence, queue, and resolution — R-DOCS-12, R-DOCS-13 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { COPILOT_PLUS_HOME } from '../shared/constants';
import type { AppServices } from '../app/appServices';
import { resolveOwners } from './ownershipIndex';
import { ConsistencyQueue } from './consistencyQueue';
import {
  createDriftItem,
  dedupeDriftItems,
  driftItemKey,
  scanDriftDiagnostics,
  summarizeLayerConsistency,
} from './driftDiagnostics';
import { DriftConsistencyDiagnostics } from './driftConsistencyDiagnostics';
import { parseConsistencyVerdict, type ConsistencyCheckVerdict } from './consistencyVerdict';
import type { DriftDismissal, DriftHistoryFile, DriftItem, DriftStateFile, LayerConsistencyCounts } from './driftTypes';
import { t } from '../platform/l10n';

const AGENT_DETAIL_PREFIX = 'agent:';

export interface ConsistencyCheckOptions {
  buildId?: string;
  token?: vscode.CancellationToken;
  onStatus?: (message: string) => void;
  componentFilter?: string;
  skipAgent?: boolean;
}

export class DriftService {
  private items: DriftItem[] = [];
  private dismissals: DriftDismissal[] = [];
  private readonly queue = new ConsistencyQueue();
  private readonly consistencyDiagnostics = new DriftConsistencyDiagnostics();
  private readonly onChangeEmitter = new vscode.EventEmitter<void>();
  readonly onChange = this.onChangeEmitter.event;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private resolveSource: vscode.CancellationTokenSource | undefined;
  private readonly buildAgentBudget = new Map<string, number>();
  private deferredComponentIds: string[] = [];
  private readonly snoozedDocUpdates = new Set<string>();
  private lastOrphanFiles = new Set<string>();

  constructor(private readonly app: AppServices) {}

  register(context: vscode.ExtensionContext): void {
    this.consistencyDiagnostics.register(context);
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
      }),
      this.app.buildExecutor.onChange(() => {
        if (this.app.buildExecutor.getBuildStatus() === 'Idle') {
          this.snoozedDocUpdates.clear();
        }
      })
    );
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.loadState();
    await this.runConsistencyCheck(false, { skipAgent: true });
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

  async runConsistencyCheck(notify = true, options: ConsistencyCheckOptions = {}): Promise<number> {
    if (!options.skipAgent) {
      await this.flushAgentConsistencyChecks(options);
    }
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
    await this.emitNewOrphanHooks(this.items);
    await this.saveState();
    this.onChangeEmitter.fire();
    if (notify) {
      void vscode.window.showInformationMessage(t('drift.checkComplete', String(this.items.length)));
    }
    return this.items.length;
  }

  async flushAgentConsistencyChecks(options: ConsistencyCheckOptions = {}): Promise<number> {
    const { buildId, token, onStatus, componentFilter } = options;
    if (!this.app.platform.models.hasModels()) {
      return 0;
    }

    const budget = this.app.platform.getSettings().consistencyCheckBudget;
    let invoked = 0;
    const componentIds = this.collectComponentIds(componentFilter);

    for (const componentId of componentIds) {
      if (token?.isCancellationRequested) {
        break;
      }
      if (buildId && this.buildBudgetUsed(buildId) >= budget) {
        this.deferComponent(componentId);
        continue;
      }

      const changedFiles = this.queue.flush(componentId);
      if (changedFiles.length === 0) {
        continue;
      }

      const doc = this.findComponentDoc(componentId);
      if (!doc) {
        continue;
      }

      onStatus?.(t('drift.agentCheckComponent', doc.frontmatter.title ?? componentId));
      const gitDiff = await this.app.subAgentRunner.captureGitDiffForPaths(changedFiles);
      const result = await this.app.subAgentRunner.runComponentConsistencyCheck(
        doc.relativePath,
        changedFiles,
        gitDiff,
        this.dismissals,
        buildId ?? 'consistency-check',
        token ?? new vscode.CancellationTokenSource().token,
        onStatus
      );

      if (buildId) {
        this.incrementBuildBudget(buildId);
      }
      invoked += 1;

      if (result.ok) {
        const verdict = parseConsistencyVerdict(result.finalAnswer);
        await this.handleComponentVerdict(verdict, doc.relativePath, changedFiles, gitDiff);
      }
      this.markComponentProcessed(componentId);
    }

    if (!componentFilter) {
      invoked += await this.flushUpwardChecks(buildId, budget, token, onStatus);
    }

    if (invoked > 0) {
      await this.saveState();
      this.onChangeEmitter.fire();
    }
    return invoked;
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
          await this.runConsistencyCheck(false, { skipAgent: true });
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

  private collectComponentIds(componentFilter?: string): string[] {
    if (componentFilter) {
      return [componentFilter];
    }
    return [...new Set([...this.deferredComponentIds, ...this.queue.componentIds()])];
  }

  private markComponentProcessed(componentId: string): void {
    this.deferredComponentIds = this.deferredComponentIds.filter((id) => id !== componentId);
  }

  private deferComponent(componentId: string): void {
    if (!this.deferredComponentIds.includes(componentId)) {
      this.deferredComponentIds.push(componentId);
    }
  }

  private buildBudgetUsed(buildId: string): number {
    return this.buildAgentBudget.get(buildId) ?? 0;
  }

  private incrementBuildBudget(buildId: string): void {
    this.buildAgentBudget.set(buildId, this.buildBudgetUsed(buildId) + 1);
  }

  private findComponentDoc(componentId: string) {
    return this.app.docs
      .getEntries()
      .find((e) => e.valid && e.frontmatter.id === componentId && e.frontmatter.level === 'component');
  }

  private async flushUpwardChecks(
    buildId: string | undefined,
    budget: number,
    token?: vscode.CancellationToken,
    onStatus?: (message: string) => void
  ): Promise<number> {
    let invoked = 0;
    const docPaths = this.queue.flushDocChanges();
    for (const docPath of docPaths) {
      if (token?.isCancellationRequested) {
        this.queue.enqueueDocChange(docPath);
        break;
      }
      if (buildId && this.buildBudgetUsed(buildId) >= budget) {
        this.queue.enqueueDocChange(docPath);
        continue;
      }

      const entry = this.app.docs.getByPath(docPath);
      if (!entry || !['feature', 'module', 'system'].includes(entry.frontmatter.level)) {
        continue;
      }
      const parentId = entry.frontmatter.parent;
      if (!parentId) {
        continue;
      }
      const parent = this.app.docs.getEntries().find((e) => e.valid && e.frontmatter.id === parentId);
      if (!parent) {
        continue;
      }

      onStatus?.(t('drift.agentCheckUpward', parent.frontmatter.title ?? parentId));
      const result = await this.app.subAgentRunner.runUpwardConsistencyCheck(
        docPath,
        parent.relativePath,
        this.dismissals,
        buildId ?? 'consistency-check',
        token ?? new vscode.CancellationTokenSource().token,
        onStatus
      );

      if (buildId) {
        this.incrementBuildBudget(buildId);
      }
      invoked += 1;

      if (result.ok) {
        const verdict = parseConsistencyVerdict(result.finalAnswer);
        await this.handleUpwardVerdict(verdict, parent.relativePath, entry.frontmatter.level);
      }
    }
    return invoked;
  }

  private async handleComponentVerdict(
    verdict: ConsistencyCheckVerdict,
    componentDocPath: string,
    changedFiles: string[],
    gitDiff: string
  ): Promise<void> {
    const ts = new Date().toISOString();
    switch (verdict.status) {
      case 'Consistent':
        this.removeAgentDriftForTarget(componentDocPath);
        for (const file of changedFiles) {
          this.consistencyDiagnostics.clearPath(file);
        }
        break;
      case 'Doc_Update_Recommended': {
        const item = createDriftItem(
          'Doc_Update_Recommended',
          'component',
          componentDocPath,
          `${AGENT_DETAIL_PREFIX}${verdict.summary}`,
          ts
        );
        this.upsertDriftItem(item);
        if (!this.snoozedDocUpdates.has(componentDocPath)) {
          await this.promptDocUpdateDecision(verdict, componentDocPath);
        }
        break;
      }
      case 'Code_Mismatch_Suspected': {
        const detail = verdict.rationale
          ? `${AGENT_DETAIL_PREFIX}${verdict.rationale}`
          : `${AGENT_DETAIL_PREFIX}${verdict.summary}`;
        const item = createDriftItem('Code_Mismatch_Suspected', 'component', componentDocPath, detail, ts);
        this.upsertDriftItem(item);
        await this.app.hooks.fire('doc.drift.suspected', {
          target: componentDocPath,
          changedFiles,
          summary: verdict.summary,
          diffPreview: gitDiff.slice(0, 2000),
        });
        for (const file of changedFiles) {
          this.consistencyDiagnostics.publishMismatch(file, item, componentDocPath);
        }
        break;
      }
      case 'Cannot_Determine':
        break;
    }
  }

  private async handleUpwardVerdict(
    verdict: ConsistencyCheckVerdict,
    parentDocPath: string,
    childLayer: string
  ): Promise<void> {
    const ts = new Date().toISOString();
    if (verdict.status === 'Consistent') {
      this.removeAgentDriftForTarget(parentDocPath);
      return;
    }
    if (verdict.status === 'Doc_Update_Recommended') {
      const item = createDriftItem(
        'Doc_Update_Recommended',
        childLayer === 'feature' ? 'feature' : childLayer === 'module' ? 'module' : 'system',
        parentDocPath,
        `${AGENT_DETAIL_PREFIX}${verdict.summary}`,
        ts
      );
      this.upsertDriftItem(item);
      if (!this.snoozedDocUpdates.has(parentDocPath)) {
        await this.promptDocUpdateDecision(verdict, parentDocPath);
      }
    }
  }

  private async promptDocUpdateDecision(
    verdict: ConsistencyCheckVerdict,
    defaultDocPath: string
  ): Promise<void> {
    const docPath = verdict.proposedDocPath ?? defaultDocPath;
    const question = [verdict.summary, verdict.rationale].filter(Boolean).join('\n\n');
    const decision = await this.app.decisions.ask({
      id: `doc-update-${docPath}-${Date.now()}`,
      question: question || t('drift.docUpdatePrompt', docPath),
      options: ['Apply', 'Edit_And_Apply', 'Reject', 'Snooze_Until_Build_End'],
      defaultOption: 'Reject',
      timeoutSec: this.app.platform.getSettings().decisionTimeoutSec,
    });

    if (decision.selected === 'Snooze_Until_Build_End') {
      this.snoozedDocUpdates.add(docPath);
      return;
    }
    if (decision.selected === 'Reject' || decision.timedOut) {
      return;
    }
    if (decision.selected === 'Apply' && verdict.proposedDocContent) {
      await this.app.docs.writeWithReview(docPath, verdict.proposedDocContent, 'consistency check');
      this.removeAgentDriftForTarget(docPath);
      return;
    }
    if (decision.selected === 'Edit_And_Apply') {
      if (verdict.proposedDocContent) {
        await this.app.docs.writeWithReview(docPath, verdict.proposedDocContent, 'consistency check');
      } else {
        await this.app.docs.openInEditor(docPath);
      }
    }
  }

  private upsertDriftItem(item: DriftItem): void {
    const key = driftItemKey(item);
    this.items = [...this.items.filter((i) => driftItemKey(i) !== key), item];
  }

  private removeAgentDriftForTarget(target: string): void {
    this.items = this.items.filter(
      (i) =>
        i.target !== target ||
        !i.detail?.startsWith(AGENT_DETAIL_PREFIX) ||
        (i.type !== 'Doc_Update_Recommended' && i.type !== 'Code_Mismatch_Suspected')
    );
  }

  private onFileChanged(relativePath: string): void {
    if (relativePath.startsWith('.copilotPlus/docs/')) {
      const entry = this.app.docs.getByPath(relativePath);
      if (entry && ['feature', 'module', 'system'].includes(entry.frontmatter.level)) {
        this.queue.enqueueDocChange(relativePath);
      }
      this.scheduleRescan();
      return;
    }
    const owners = resolveOwners(relativePath, this.app.docs.getEntries());
    for (const ownerId of owners.owners) {
      this.queue.enqueue(ownerId, relativePath);
      if (this.queue.shouldFlush(ownerId)) {
        void this.runConsistencyCheck(false, { componentFilter: ownerId });
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
      void this.runConsistencyCheck(false, { skipAgent: true });
    }, 2000);
  }

  private isDismissed(item: DriftItem, dismissedKeys: Set<string>): boolean {
    return dismissedKeys.has(item.id) || dismissedKeys.has(item.target);
  }

  private async emitNewOrphanHooks(items: DriftItem[]): Promise<void> {
    const orphans = items.filter((item) => item.type === 'Orphan_Code').map((item) => item.target);
    for (const file of orphans) {
      if (!this.lastOrphanFiles.has(file)) {
        await this.app.hooks.fire('code.orphan.detected', { file });
      }
    }
    this.lastOrphanFiles = new Set(orphans);
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
