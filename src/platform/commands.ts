/** Command registration — R-PLAT-1.4 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { openWorkspace, getTabWorkspace } from '../interaction/workspace';
import { runCli, getCliOutputChannel } from '../cli/cliRunner';

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
  register('copilotPlus.knowledge.init', () =>
    vscode.window.showInformationMessage('AGENTS.md init — Phase 9 (KNOW).')
  );
  register('copilotPlus.docs.compact', async () => {
    const threshold = app.platform.getSettings().staleThresholdDays;
    const stale = app.docs.findStaleDocuments(threshold);
    if (!stale.length) {
      void vscode.window.showInformationMessage(`No stale documents (>${threshold} days without reference).`);
      return;
    }
    const pick = await vscode.window.showQuickPick(
      stale.map((e) => ({
        label: `${e.frontmatter.title} (${e.frontmatter.level})`,
        description: e.relativePath,
        path: e.relativePath,
      })),
      { placeHolder: `Select stale document to archive (${stale.length} found)` }
    );
    if (!pick) {
      return;
    }
    const action = await vscode.window.showQuickPick(['Archive', 'Cancel'], {
      placeHolder: 'Compaction action (Architect plan — Phase 3 skeleton)',
    });
    if (action === 'Archive') {
      const archived = await app.docs.archiveDocument(pick.path);
      await app.indexManager.rebuildAll();
      void vscode.window.showInformationMessage(`Archived to ${archived}`);
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
        { placeHolder: 'Select document to mark reviewed' }
      );
      if (!pick) {
        return;
      }
      rel = pick.path;
    }
    const reviewer = (await vscode.authentication.getSession('github', [], { createIfNone: false }))?.account
      ?.label ?? 'user';
    await app.docs.markReviewed(rel, reviewer);
    void vscode.window.showInformationMessage(`Marked reviewed: ${rel}`);
    await getTabWorkspace()?.refresh();
  });
  register('copilotPlus.docs.assignOrphan', () =>
    vscode.window.showInformationMessage('Assign orphan — Phase 3 (DOCS).')
  );

  register('copilotPlus.skills.create', async () => {
    const id = await vscode.window.showInputBox({
      prompt: 'Skill id',
      validateInput: (v) => (/^[a-z][a-z0-9-]{2,63}$/.test(v) ? undefined : 'Invalid id'),
    });
    if (!id) {
      return;
    }
    const title = (await vscode.window.showInputBox({ prompt: 'Title' })) ?? id;
    const scope = (await vscode.window.showInputBox({ prompt: 'Scope', value: 'workspace' })) ?? 'workspace';
    try {
      const rel = await app.skills.createSkill(id, title, scope);
      void vscode.window.showInformationMessage(`Skill created: ${rel}`);
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
    void vscode.window.showInformationMessage('Copilot Plus index rebuilt.');
  });

  register('copilotPlus.deploy.generateManifest', async () => {
    try {
      const result = await app.deployOrchestrator.generateManifest();
      if (result.ok) {
        void vscode.window.showInformationMessage(
          `Deploy manifest ready (${result.files?.length ?? 0} files).`
        );
      } else {
        void vscode.window.showErrorMessage(result.reason ?? 'Deploy generation failed.');
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
        void vscode.window.showInformationMessage(`Deploy completed (${result.runId}).`);
      } else if (result.reason === 'manual_mode') {
        void vscode.window.showWarningMessage('Deploy mode is Manual — set copilotPlus.deploy.mode to Auto.');
      } else {
        void vscode.window.showErrorMessage(`Deploy failed: ${result.reason ?? 'unknown'}`);
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

  register('copilotPlus.composer.cancel', () => {
    app.composer.cancel();
    void getTabWorkspace()?.refresh();
  });

  register('copilotPlus.cli', async (...args: unknown[]) => {
    let cliArgs = args.filter((a): a is string => typeof a === 'string');
    if (cliArgs.length === 0) {
      const line = await vscode.window.showInputBox({
        prompt: 'Copilot Plus CLI',
        placeHolder: 'build run .copilotPlus/ci/example-build-config.json',
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
      void vscode.window.showErrorMessage(`Copilot Plus CLI failed (exit ${code}). See output channel.`);
    }
    return code;
  });

  register('copilotPlus.deploy.rollback', async (runId: unknown) => {
    if (typeof runId !== 'string') {
      return;
    }
    const result = await app.deployOrchestrator.rollbackRun(runId);
    if (result.ok) {
      void vscode.window.showInformationMessage(`Rollback completed (${runId}).`);
    } else {
      void vscode.window.showErrorMessage(`Rollback failed: ${result.reason ?? 'unknown'}`);
    }
    await getTabWorkspace()?.refresh();
  });

  return disposables;
}

function focusTab(tab: string): void {
  void vscode.commands.executeCommand('copilotPlus.openWorkspace');
  void vscode.commands.executeCommand('copilotPlus.tabWorkspace.focus', tab);
}
