/** Next Edit Suggestions delegate mode — R-EDIT-7 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { t } from '../platform/l10n';
import { describeNesDelegateStatus, type NesDelegateStatus } from './nesDelegateStatus';

const COPILOT_EXTENSION_ID = 'GitHub.copilot';

export type { NesDelegateStatus };
export { describeNesDelegateStatus };

export function isCopilotExtensionInstalled(): boolean {
  return !!vscode.extensions.getExtension(COPILOT_EXTENSION_ID);
}

export function isCopilotExtensionActive(): boolean {
  return vscode.extensions.getExtension(COPILOT_EXTENSION_ID)?.isActive ?? false;
}

export function getCopilotExtensionProbe(): { installed: boolean; active: boolean } {
  return {
    installed: isCopilotExtensionInstalled(),
    active: isCopilotExtensionActive(),
  };
}

export function registerNesDelegate(context: vscode.ExtensionContext, app: AppServices): void {
  let noticeShown = false;

  const maybeShowNotice = (): void => {
    const status = describeNesDelegateStatus(app.platform.getSettings(), getCopilotExtensionProbe());
    if (status.noticeKey && !noticeShown) {
      noticeShown = true;
      void vscode.window.showInformationMessage(t(status.noticeKey));
    }
  };

  maybeShowNotice();
  context.subscriptions.push(
    app.platform.config.onDidChange(() => {
      maybeShowNotice();
    })
  );
}
