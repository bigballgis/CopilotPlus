/** Document tree command flows — R-DOCS-6 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { getTabWorkspace } from '../interaction/workspace';
import type { DocTreePanelAction } from '../shared/tabWorkspaceWebviewProtocol';
import type { LateralLink } from './frontmatter';
import { childLevelFor } from './treeOps';
import { collectSubtreeDocPaths } from './docLifecycle';
import { t } from '../platform/l10n';

const ID_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;

export async function runCreateChildDoc(app: AppServices, parentPath?: string): Promise<void> {
  const parent = await pickDocPath(app, parentPath, t('docs.createChildPickParent'));
  if (!parent) {
    return;
  }
  const entry = app.docs.getByPath(parent);
  if (!entry?.valid || !childLevelFor(entry.frontmatter.level)) {
    void vscode.window.showErrorMessage(t('docs.createChildLevelBlocked'));
    return;
  }

  const id = await vscode.window.showInputBox({
    prompt: t('docs.createChildIdPrompt'),
    validateInput: (v) => (ID_PATTERN.test(v) ? undefined : t('docs.invalidDocId')),
  });
  if (!id) {
    return;
  }
  const title = (await vscode.window.showInputBox({ prompt: t('docs.createChildTitlePrompt'), value: id })) ?? id;

  const result = await app.docs.createChildDocument(parent, id, title);
  if (!result.ok) {
    void vscode.window.showErrorMessage(t('docs.treeOpFailed', result.reason));
    return;
  }
  void vscode.window.showInformationMessage(t('docs.createChildDone', result.path ?? id));
  await refreshDocUi(app, result.path);
}

export async function runRenameDoc(app: AppServices, docPath?: string): Promise<void> {
  const path = await pickDocPath(app, docPath, t('docs.renamePickDoc'));
  if (!path) {
    return;
  }
  const entry = app.docs.getByPath(path);
  if (!entry) {
    return;
  }

  const newId = await vscode.window.showInputBox({
    prompt: t('docs.renameIdPrompt'),
    value: entry.frontmatter.id,
    validateInput: (v) => (ID_PATTERN.test(v) ? undefined : t('docs.invalidDocId')),
  });
  if (!newId) {
    return;
  }
  const newTitle = await vscode.window.showInputBox({
    prompt: t('docs.renameTitlePrompt'),
    value: entry.frontmatter.title,
  });
  if (newTitle === undefined) {
    return;
  }

  const result = await app.docs.renameDocument(path, newId, newTitle);
  if (!result.ok) {
    void vscode.window.showErrorMessage(t('docs.treeOpFailed', result.reason));
    return;
  }
  void vscode.window.showInformationMessage(t('docs.renameDone', result.path ?? newId));
  await refreshDocUi(app, result.path);
}

export async function runMoveDoc(app: AppServices, docPath?: string): Promise<void> {
  const path = await pickDocPath(app, docPath, t('docs.movePickDoc'));
  if (!path) {
    return;
  }
  const entry = app.docs.getByPath(path);
  if (!entry) {
    return;
  }

  const expectedParentLevel = parentLevelFor(entry.frontmatter.level);
  if (!expectedParentLevel) {
    void vscode.window.showErrorMessage(t('docs.moveLevelBlocked'));
    return;
  }

  const candidates = app.docs
    .getEntries()
    .filter((e) => e.valid && e.frontmatter.level === expectedParentLevel && e.relativePath !== path)
    .map((e) => ({ label: e.frontmatter.title, description: e.frontmatter.id, id: e.frontmatter.id }));

  const pick = await vscode.window.showQuickPick(candidates, { placeHolder: t('docs.movePickParent') });
  if (!pick) {
    return;
  }

  const settings = app.platform.getSettings();
  const result = await app.docs.moveDocument(
    path,
    pick.id,
    settings.maxLateralDepth,
    (id) => app.namingAliases.resolve(id)
  );
  if (!result.ok) {
    const msg =
      result.reason === 'level_violation'
        ? t('docs.moveLevelViolation', result.detail ?? result.reason)
        : t('docs.treeOpFailed', result.reason);
    void vscode.window.showErrorMessage(msg);
    return;
  }
  void vscode.window.showInformationMessage(t('docs.moveDone', result.path ?? pick.id));
  await refreshDocUi(app, result.path);
}

export async function runDeleteDoc(app: AppServices, docPath?: string): Promise<void> {
  const path = await pickDocPath(app, docPath, t('docs.deletePickDoc'));
  if (!path) {
    return;
  }
  const entry = app.docs.getByPath(path);
  if (!entry) {
    return;
  }

  const subtreeCount = collectSubtreeDocPaths(path, app.docs.getEntries()).length;
  const confirm = await vscode.window.showWarningMessage(
    subtreeCount > 1
      ? t('docs.deleteSubtreeConfirm', entry.frontmatter.title, subtreeCount)
      : t('docs.deleteConfirm', entry.frontmatter.title),
    { modal: true },
    t('docs.deleteConfirmAction')
  );
  if (confirm !== t('docs.deleteConfirmAction')) {
    return;
  }

  const result = await app.docs.deleteDocumentTree(path);
  if (!result.ok) {
    void vscode.window.showErrorMessage(t('docs.treeOpFailed', result.reason));
    return;
  }
  void vscode.window.showInformationMessage(
    result.deletedCount && result.deletedCount > 1
      ? t('docs.deleteSubtreeDone', entry.frontmatter.title, result.deletedCount)
      : t('docs.deleteDone', entry.frontmatter.title)
  );
  await refreshDocUi(app);
}

export async function runLinkDoc(app: AppServices, sourcePath?: string): Promise<void> {
  const path = await pickDocPath(app, sourcePath, t('docs.linkPickSource'));
  if (!path) {
    return;
  }
  const source = app.docs.getByPath(path);
  if (!source) {
    return;
  }

  const targets = app.docs
    .getEntries()
    .filter((e) => e.valid && e.relativePath !== path && !e.relativePath.includes('/archive/'))
    .map((e) => ({ label: e.frontmatter.title, description: e.frontmatter.id, id: e.frontmatter.id }));

  const targetPick = await vscode.window.showQuickPick(targets, { placeHolder: t('docs.linkPickTarget') });
  if (!targetPick) {
    return;
  }

  const linkTypes: LateralLink['type'][] = ['references', 'depends_on', 'extends', 'conflicts_with'];
  const typePick = await vscode.window.showQuickPick(
    linkTypes.map((type) => ({ label: type, type })),
    { placeHolder: t('docs.linkPickType') }
  );
  if (!typePick) {
    return;
  }

  const result = await app.tools.invoke('Architect', 'doc_link', {
    source_doc_id: source.frontmatter.id,
    target_doc_id: targetPick.id,
    link_type: typePick.type,
  });
  if (!result.ok) {
    void vscode.window.showErrorMessage(t('docs.treeOpFailed', result.reason ?? 'link_failed'));
    return;
  }
  void vscode.window.showInformationMessage(t('docs.linkDone', targetPick.label));
  await refreshDocUi(app, path);
}

export async function runUnlinkDoc(app: AppServices, sourcePath?: string): Promise<void> {
  const path = await pickDocPath(app, sourcePath, t('docs.unlinkPickSource'));
  if (!path) {
    return;
  }
  const source = app.docs.getByPath(path);
  if (!source?.frontmatter.lateral?.length) {
    void vscode.window.showErrorMessage(t('docs.unlinkNoLinks'));
    return;
  }

  const pick = await vscode.window.showQuickPick(
    source.frontmatter.lateral.map((link) => ({
      label: link.target,
      description: link.type,
      target: link.target,
    })),
    { placeHolder: t('docs.unlinkPickTarget') }
  );
  if (!pick) {
    return;
  }

  const result = await app.docs.unlinkLateral(path, pick.target, (id) => app.namingAliases.resolve(id));
  if (!result.ok) {
    void vscode.window.showErrorMessage(t('docs.treeOpFailed', result.reason));
    return;
  }
  void vscode.window.showInformationMessage(t('docs.unlinkDone', pick.target));
  await refreshDocUi(app, path);
}

export async function runEnsureSummary(app: AppServices, docPath?: string): Promise<void> {
  const path = await pickDocPath(app, docPath, t('docs.ensureSummaryPickDoc'));
  if (!path) {
    return;
  }
  const entry = app.docs.getByPath(path);
  if (!entry) {
    return;
  }
  if (entry.frontmatter.level === 'system') {
    void vscode.window.showInformationMessage(t('docs.ensureSummarySystemExempt'));
    return;
  }

  const result = await app.docs.ensureSummary(path);
  if (!result.ok) {
    if (result.reason === 'user_rejected') {
      return;
    }
    void vscode.window.showErrorMessage(t('docs.treeOpFailed', result.reason ?? 'ensure_summary_failed'));
    return;
  }
  if (result.reason === 'already_valid') {
    void vscode.window.showInformationMessage(t('docs.ensureSummaryAlreadyValid', entry.frontmatter.title));
  } else {
    void vscode.window.showInformationMessage(t('docs.ensureSummaryDone', entry.frontmatter.title));
  }
  await app.drift.runConsistencyCheck(false, { skipAgent: true });
  await refreshDocUi(app, path);
}

export async function runDocTreeAction(
  app: AppServices,
  action: DocTreePanelAction,
  docPath: string
): Promise<void> {
  switch (action) {
    case 'createChild':
      await runCreateChildDoc(app, docPath);
      break;
    case 'delete':
      await runDeleteDoc(app, docPath);
      break;
    case 'rename':
      await runRenameDoc(app, docPath);
      break;
    case 'move':
      await runMoveDoc(app, docPath);
      break;
    case 'markReviewed': {
      const reviewer =
        (await vscode.authentication.getSession('github', [], { createIfNone: false }))?.account?.label ?? 'user';
      await app.docs.markReviewed(docPath, reviewer);
      void vscode.window.showInformationMessage(t('docs.markedReviewed', docPath));
      await refreshDocUi(app, docPath);
      break;
    }
    case 'link':
      await runLinkDoc(app, docPath);
      break;
    case 'unlink':
      await runUnlinkDoc(app, docPath);
      break;
    case 'ensureSummary':
      await runEnsureSummary(app, docPath);
      break;
  }
}

function parentLevelFor(level: import('./frontmatter').DocLevel): import('./frontmatter').DocLevel | null {
  switch (level) {
    case 'module':
      return 'system';
    case 'feature':
      return 'module';
    case 'component':
      return 'feature';
    case 'system':
      return null;
  }
}

async function pickDocPath(
  app: AppServices,
  preset: string | undefined,
  placeHolder: string
): Promise<string | undefined> {
  if (preset) {
    return preset.replace(/\\/g, '/');
  }
  const pick = await vscode.window.showQuickPick(
    app.docs
      .getEntries()
      .filter((e) => e.valid && !e.relativePath.includes('/archive/'))
      .map((e) => ({ label: e.frontmatter.title, description: e.relativePath, path: e.relativePath })),
    { placeHolder }
  );
  return pick?.path;
}

async function refreshDocUi(app: AppServices, previewPath?: string): Promise<void> {
  const ws = getTabWorkspace();
  await ws?.refresh();
  if (previewPath) {
    await app.docs.scan();
    if (app.docs.getByPath(previewPath)) {
      ws?.previewDoc(previewPath);
    }
  }
}
