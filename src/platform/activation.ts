/** Extension activation orchestration — R-PLAT-1 */

import * as vscode from 'vscode';
import { ACTIVATION_HARD_LIMIT_MS, ACTIVATION_SLOW_MS, MIN_VSCODE_VERSION } from '../shared/constants';
import { isSupportedHostVersion } from './version';
import { TelemetryService, isGlobalTelemetryEnabled } from './telemetry';
import { t, loadLocaleBundle } from './l10n';
import { registerCommands } from './commands';
import { ControlConsoleProvider } from '../interaction/controlConsole';
import { AppServices } from '../app/appServices';
import {
  DecisionStatusBar,
  registerDecisionCenterCommands,
} from '../interaction/decisionStatusBar';
import { getTabWorkspace, openWorkspace } from '../interaction/workspace';
import { registerTabCompletion } from '../editing/tabCompletion';
import { registerNesDelegate } from '../editing/nesDelegate';

export interface ActivationResult {
  app: AppServices | undefined;
  aborted: boolean;
}

export async function activatePlatform(context: vscode.ExtensionContext): Promise<ActivationResult> {
  const started = Date.now();

  if (!isSupportedHostVersion(vscode.version, MIN_VSCODE_VERSION)) {
    void vscode.window.showErrorMessage(
      t('activation.unsupported', MIN_VSCODE_VERSION, vscode.version)
    );
    return { app: undefined, aborted: true };
  }

  const slowTimer = setTimeout(() => {
    void vscode.window.showInformationMessage(t('activation.slow'));
  }, ACTIVATION_SLOW_MS);

  try {
    const app = await AppServices.create(context);
    const registrations: vscode.Disposable[] = [];

    registrations.push(...registerCommands(context, app));
    registrations.push(
      vscode.window.registerWebviewViewProvider(
        ControlConsoleProvider.viewId,
        new ControlConsoleProvider(app)
      )
    );
    registrations.push(...registerDecisionCenterCommands(app.decisions));
    const statusBar = new DecisionStatusBar(app.decisions);
    context.subscriptions.push({ dispose: () => statusBar.dispose() });
    context.subscriptions.push(
      app.buildExecutor.onChange(() => {
        getTabWorkspace()?.refresh();
      })
    );
    registerTabCompletion(context, app);
    registerNesDelegate(context, app);

    for (const d of registrations) {
      context.subscriptions.push(d);
    }

    clearTimeout(slowTimer);
    const duration = Date.now() - started;

    if (duration > ACTIVATION_HARD_LIMIT_MS) {
      console.warn(`Copilot Plus activation took ${duration}ms`);
    }

    app.platform.telemetry.emit('activation.completed', { durationMs: duration });
    logLocaleFallback();

    await surfaceWorkspaceUi(context, app);

    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        if (vscode.workspace.workspaceFolders?.length) {
          void openWorkspace(context, app);
        }
      })
    );

    return { app, aborted: false };
  } catch (err) {
    clearTimeout(slowTimer);
    void vscode.window.showErrorMessage(
      t('activation.failed', err instanceof Error ? err.message : String(err))
    );
    return { app: undefined, aborted: true };
  }
}

async function surfaceWorkspaceUi(context: vscode.ExtensionContext, app: AppServices): Promise<void> {
  if (vscode.workspace.workspaceFolders?.length) {
    await openWorkspace(context, app);
    return;
  }
    void vscode.window
    .showInformationMessage(
      t('activation.openFolderPrompt'),
      t('activation.openFolderAction')
    )
    .then((choice) => {
      if (choice === t('activation.openFolderAction')) {
        void vscode.commands.executeCommand('workbench.action.openFolder');
      }
    });
}

function logLocaleFallback(): void {
  const locale = loadLocaleBundle();
  if (locale && !locale.startsWith('en')) {
    const telemetry = new TelemetryService(() => isGlobalTelemetryEnabled());
    telemetry.emit('locale.fallback', { locale, fallbackLocale: 'en' });
  }
}
