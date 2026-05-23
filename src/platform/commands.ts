/** Command registration — R-PLAT-1.4 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { openWorkspace, getTabWorkspace } from '../interaction/workspace';

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
    await app.indexManager.rebuildAll();
    void vscode.window.showInformationMessage('Document index rebuilt (compact pipeline — Phase 3).');
  });
  register('copilotPlus.docs.markReviewed', async () => {
    const pick = await vscode.window.showQuickPick(
      app.docs.getEntries().filter((e) => e.valid).map((e) => ({ label: e.frontmatter.title, path: e.relativePath })),
      { placeHolder: 'Select document to mark reviewed' }
    );
    if (!pick) {
      return;
    }
    void vscode.window.showInformationMessage(`Marked reviewed: ${pick.label} (metadata write — Phase 3).`);
  });
  register('copilotPlus.docs.assignOrphan', () =>
    vscode.window.showInformationMessage('Assign orphan — Phase 3 (DOCS).')
  );

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
      const files = await app.deploy.generateManifest();
      void vscode.window.showInformationMessage(`Deploy manifest generated (${files.length} files).`);
      await getTabWorkspace()?.refresh();
    } catch (e) {
      void vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
    }
  });

  return disposables;
}

function focusTab(tab: string): void {
  void vscode.commands.executeCommand('copilotPlus.openWorkspace');
  void vscode.commands.executeCommand('copilotPlus.tabWorkspace.focus', tab);
}
