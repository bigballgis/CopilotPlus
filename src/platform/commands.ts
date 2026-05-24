/** Command registration — R-PLAT-1.4 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { openWorkspace, getTabWorkspace } from '../interaction/workspace';
import { runCli, getCliOutputChannel } from '../cli/cliRunner';
import { t } from './l10n';

export function registerCommands(
  context: vscode.ExtensionContext,
  app: AppServices
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];
  const { platform: services } = app;

  const register = (id: string, handler: (...args: unknown[]) => unknown) => {
    disposables.push(vscode.commands.registerCommand(id, handler));
  };

  register('copilotPlus.openWorkspace', () => openWorkspace(context, app));
  register('copilotPlus.inlineEdit', () => app.inlineEdit.invoke());
  register('copilotPlus.knowledge.init', () => app.knowledge.initAgentsMd(app));
  register('copilotPlus.docs.compact', async () => {
    const threshold = app.platform.getSettings().staleThresholdDays;
    const stale = app.docs.findStaleDocuments(threshold);
    if (!stale.length) {
      void vscode.window.showInformationMessage(t('docs.noStale', threshold));
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
  });
  register('copilotPlus.docs.markReviewed', async () => {
    const active = vscode.window.activeTextEditor;
    let rel: string | undefined;
    if (active) {
      rel = vscode.workspace.asRelativePath(active.document.uri).replace(/\\/g, '/');
      if (!rel.startsWith('.copilotPlus/docs/')) {
        rel = undefined;
      }
    }
    if (!rel) {
      const pick = await vscode.window.showQuickPick(
        app.docs.getEntries().filter((e) => e.valid).map((e) => ({ label: e.frontmatter.title, path: e.relativePath })),
        { placeHolder: t('docs.markReviewedPlaceHolder') }
      );
      if (!pick) {
        return;
      }
      rel = pick.path;
    }
    const reviewer = (await vscode.authentication.getSession('github', [], { createIfNone: false }))?.account
      ?.label ?? 'user';
    await app.docs.markReviewed(rel, reviewer);
    void vscode.window.showInformationMessage(t('docs.markedReviewed', rel));
    await getTabWorkspace()?.refresh();
  });
  register('copilotPlus.docs.assignOrphan', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage(t('docs.assignOrphanNoEditor'));
      return;
    }
    const rel = vscode.workspace.asRelativePath(editor.document.uri).replace(/\\/g, '/');
    await app.drift.runConsistencyCheck(false);
    const orphan = app.drift.getItems().find((item) => item.type === 'Orphan_Code' && item.target === rel);
    if (orphan) {
      await app.drift.resolveItem(orphan.id);
      return;
    }
    void vscode.window.showInformationMessage(t('docs.assignOrphanNotOrphan', rel));
  });
  register('copilotPlus.docs.runConsistencyCheck', () => app.drift.runConsistencyCheck());
  register('copilotPlus.docs.openDriftView', () => app.drift.openDriftView());

  register('copilotPlus.skills.create', async () => {
    const id = await vscode.window.showInputBox({
      prompt: t('skills.idPrompt'),
      validateInput: (v) => (/^[a-z][a-z0-9-]{2,63}$/.test(v) ? undefined : t('skills.invalidId')),
    });
    if (!id) {
      return;
    }
    const title = (await vscode.window.showInputBox({ prompt: t('skills.titlePrompt') })) ?? id;
    const scope = (await vscode.window.showInputBox({ prompt: t('skills.scopePrompt'), value: 'workspace' })) ?? 'workspace';
    try {
      const rel = await app.skills.createSkill(id, title, scope);
      void vscode.window.showInformationMessage(t('skills.created', rel));
    } catch (e) {
      void vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
    }
  });

  register('copilotPlus.focusTaskPanel', () => focusTab('task'));
  register('copilotPlus.focusArchitecturePanel', () => focusTab('architecture'));
  register('copilotPlus.focusRequirementPanel', () => focusTab('requirement'));
  register('copilotPlus.focusCommitPanel', () => focusTab('commit'));
  register('copilotPlus.focusDeployPanel', () => focusTab('deploy'));

  register('copilotPlus.tabWorkspace.focus', (tab: unknown) => {
    const ws = getTabWorkspace();
    if (ws && typeof tab === 'string') {
      ws.focusTab(tab as 'task' | 'architecture' | 'requirement' | 'commit' | 'deploy');
    }
  });

  register('copilotPlus.selectModel', () => services.models.pickModel());
  register('copilotPlus.openSettings', () =>
    vscode.commands.executeCommand('workbench.action.openSettings', '@ext:copilot-plus.copilot-plus')
  );

  register('copilotPlus.workflow.setStage', async (stage: unknown) => {
    if (stage === 'Design' || stage === 'Build' || stage === 'Deploy') {
      await app.stages.transition(stage);
    }
  });

  register('copilotPlus.design.continue', async () => {
    if (app.stages.getStage() !== 'Design') {
      return;
    }
    await app.designWorkflow.continueToNextStep();
    const { getConversationPane } = await import('../interaction/workspace');
    await getConversationPane()?.syncStage('Design');
  });

  register('copilotPlus.design.pickStep', async (step: unknown) => {
    if (app.stages.getStage() !== 'Design') {
      return;
    }
    if (typeof step === 'string') {
      const picked = await app.designWorkflow.pickStep(step);
      if (picked) {
        const { getConversationPane } = await import('../interaction/workspace');
        await getConversationPane()?.syncStage('Design');
      }
      return;
    }
    const state = await app.designWorkflow.getState();
    const pick = await vscode.window.showQuickPick(
      state.steps.map((s) => ({
        label: s.label,
        description: s.current ? t('design.currentStep') : s.complete ? t('design.stepComplete') : s.missing.join(', '),
        step: s.id,
      })),
      { placeHolder: t('design.pickStepPlaceHolder') }
    );
    if (pick) {
      await app.designWorkflow.pickStep(pick.step);
      const { getConversationPane } = await import('../interaction/workspace');
      await getConversationPane()?.syncStage('Design');
    }
  });

  register('copilotPlus.build.start', async () => {
    await app.stages.transition('Build');
    await app.buildExecutor.start();
    await getTabWorkspace()?.refresh();
  });

  register('copilotPlus.build.stop', () => {
    app.buildExecutor.stop();
    void getTabWorkspace()?.refresh();
  });

  register('copilotPlus.index.rebuild', async () => {
    await app.indexManager.rebuildAll();
    void vscode.window.showInformationMessage(t('index.rebuilt'));
  });

  register('copilotPlus.deploy.generateManifest', async () => {
    try {
      const result = await app.deployOrchestrator.generateManifest();
      if (result.ok) {
        void vscode.window.showInformationMessage(
          t('deploy.manifestReady', result.files?.length ?? 0)
        );
      } else {
        void vscode.window.showErrorMessage(result.reason ?? t('deploy.generationFailed'));
      }
      await getTabWorkspace()?.refresh();
    } catch (e) {
      void vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
    }
  });

  register('copilotPlus.deploy.applyManifest', async () => {
    try {
      const result = await app.deployOrchestrator.applyManifest();
      if (result.ok) {
        void vscode.window.showInformationMessage(t('deploy.completed', result.runId));
      } else if (result.reason === 'manual_mode') {
        void vscode.window.showWarningMessage(t('deploy.manualMode'));
      } else {
        void vscode.window.showErrorMessage(t('deploy.failed', result.reason ?? t('common.unknown')));
      }
      await getTabWorkspace()?.refresh();
    } catch (e) {
      void vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
    }
  });

  register('copilotPlus.composer.submit', async () => {
    await app.stages.transition('Build');
    await app.composer.submit();
    await getTabWorkspace()?.refresh();
  });

  register('copilotPlus.composer.attachFiles', async () => {
    await app.composer.attachFromPicker();
    await getTabWorkspace()?.refresh();
  });

  register('copilotPlus.composer.cancel', () => {
    app.composer.cancel();
    void getTabWorkspace()?.refresh();
  });

  register('copilotPlus.cli', async (...args: unknown[]) => {
    let cliArgs = args.filter((a): a is string => typeof a === 'string');
    if (cliArgs.length === 0) {
      const line = await vscode.window.showInputBox({
        prompt: t('cli.prompt'),
        placeHolder: t('cli.placeHolder'),
      });
      if (!line?.trim()) {
        return 1;
      }
      cliArgs = line.trim().split(/\s+/);
    }
    const channel = getCliOutputChannel();
    channel.show(true);
    channel.appendLine(`copilotPlus.cli ${cliArgs.join(' ')}`);
    const code = await runCli(app, cliArgs, context.extensionUri);
    channel.appendLine(`Exit code: ${code}`);
    if (code !== 0) {
      void vscode.window.showErrorMessage(t('cli.failed', code));
    }
    return code;
  });

  register('copilotPlus.deploy.rollback', async (runId: unknown) => {
    if (typeof runId !== 'string') {
      return;
    }
    const result = await app.deployOrchestrator.rollbackRun(runId);
    if (result.ok) {
      void vscode.window.showInformationMessage(t('deploy.rollbackCompleted', runId));
    } else {
      void vscode.window.showErrorMessage(t('deploy.rollbackFailed', result.reason ?? t('common.unknown')));
    }
    await getTabWorkspace()?.refresh();
  });

  return disposables;
}

function focusTab(tab: string): void {
  void vscode.commands.executeCommand('copilotPlus.openWorkspace');
  void vscode.commands.executeCommand('copilotPlus.tabWorkspace.focus', tab);
}
