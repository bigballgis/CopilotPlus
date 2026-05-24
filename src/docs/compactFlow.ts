/** Document compaction flow — R-DOCS-9.2–9.4 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { getTabWorkspace } from '../interaction/workspace';
import { executeCompactionPlan } from './compactionExecutor';
import { filterExecutablePlan, parseCompactionPlan } from './compactionPlan';
import { t } from '../platform/l10n';

export async function runDocCompact(app: AppServices, subtreeRoot?: string): Promise<void> {
  const threshold = app.platform.getSettings().staleThresholdDays;
  const stale = subtreeRoot
    ? app.docs.findStaleInSubtree(subtreeRoot, threshold)
    : app.docs.findStaleDocuments(threshold);
  if (!stale.length) {
    void vscode.window.showInformationMessage(
      subtreeRoot ? t('docs.noStaleSubtree', threshold) : t('docs.noStale', threshold)
    );
    return;
  }

  if (app.platform.models.hasModels()) {
    const mode = await vscode.window.showQuickPick(
      [
        { label: t('docs.compactArchitect'), description: t('docs.compactArchitectDesc'), mode: 'architect' as const },
        { label: t('docs.compactManual'), description: t('docs.compactManualDesc'), mode: 'manual' as const },
      ],
      { placeHolder: t('docs.compactModePlaceHolder') }
    );
    if (!mode) {
      return;
    }
    if (mode.mode === 'architect') {
      await runArchitectCompaction(app, stale.map((e) => e.relativePath), threshold);
      return;
    }
  }

  await runManualArchive(app, stale);
}

async function runArchitectCompaction(
  app: AppServices,
  stalePaths: string[],
  thresholdDays: number
): Promise<void> {
  const token = new vscode.CancellationTokenSource().token;
  const result = await app.subAgentRunner.runCompactionArchitect(stalePaths, thresholdDays, token);
  if (!result.ok) {
    void vscode.window.showWarningMessage(t('docs.compactArchitectFailed', result.reason ?? 'unknown'));
    return;
  }

  const plan = parseCompactionPlan(result.finalAnswer);
  const executable = filterExecutablePlan(plan, app.docs.getEntries());
  if (executable.length === 0) {
    void vscode.window.showInformationMessage(t('docs.compactPlanEmpty'));
    return;
  }

  const detail = executable
    .map((item) => `${item.action} — ${item.documentPath}${item.rationale ? `: ${item.rationale}` : ''}`)
    .join('\n');
  const choice = await vscode.window.showInformationMessage(
    t('docs.compactPlanReview', String(executable.length)),
    { modal: true, detail },
    t('docs.compactPlanApply'),
    t('common.cancel')
  );
  if (choice !== t('docs.compactPlanApply')) {
    return;
  }

  const applied = await executeCompactionPlan(app, executable);
  void vscode.window.showInformationMessage(t('docs.compactPlanApplied', String(applied)));
  await getTabWorkspace()?.refresh();
}

async function runManualArchive(
  app: AppServices,
  stale: ReturnType<AppServices['docs']['findStaleDocuments']>
): Promise<void> {
  const pick = await vscode.window.showQuickPick(
    stale.map((e) => ({
      label: `${e.frontmatter.title} (${e.frontmatter.level})`,
      description: e.relativePath,
      path: e.relativePath,
    })),
    { placeHolder: t('docs.stalePlaceHolder', stale.length) }
  );
  if (!pick) {
    return;
  }
  const action = await vscode.window.showQuickPick([t('docs.compactArchive'), t('common.cancel')], {
    placeHolder: t('docs.compactActionPlaceHolder'),
  });
  if (action === t('docs.compactArchive')) {
    const archived = await app.docs.archiveDocument(pick.path);
    await app.indexManager.rebuildAll();
    void vscode.window.showInformationMessage(t('docs.archivedTo', archived));
    await getTabWorkspace()?.refresh();
  }
}
