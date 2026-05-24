/** Document compaction flow — R-DOCS-9.2–9.4 (archive path; Architect plan deferred) */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { getTabWorkspace } from '../interaction/workspace';
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
