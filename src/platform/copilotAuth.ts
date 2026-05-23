/** GitHub Copilot auth via vscode.lm — R-PLAT-2 */

import * as vscode from 'vscode';
import { COPILOT_VENDOR } from '../shared/constants';
import { t } from './l10n';

const COPILOT_SIGN_IN = 'github.copilot.signIn';

export class CopilotAuthService {
  private entitlementLost = false;

  async selectCopilotModels(): Promise<vscode.LanguageModelChat[]> {
    return vscode.lm.selectChatModels({ vendor: COPILOT_VENDOR });
  }

  async ensureModelsAvailable(): Promise<vscode.LanguageModelChat[]> {
    const models = await this.selectCopilotModels();
    if (models.length === 0) {
      await this.promptSignIn();
    }
    return models;
  }

  async promptSignIn(): Promise<void> {
    const action = t('auth.signInAction');
    const message = t('auth.entitlementRequired');
    const choice = await vscode.window.showErrorMessage(message, action);
    if (choice === action) {
      await vscode.commands.executeCommand(COPILOT_SIGN_IN);
    }
  }

  watchEntitlement(onLost: () => void): vscode.Disposable {
    return vscode.lm.onDidChangeChatModels(async () => {
      const models = await this.selectCopilotModels();
      if (models.length === 0 && !this.entitlementLost) {
        this.entitlementLost = true;
        onLost();
        await this.promptSignIn();
      } else if (models.length > 0) {
        this.entitlementLost = false;
      }
    });
  }

  /** R-PLAT-2.3 — consent is enforced by vscode.lm on first sendRequest */
  async withConsent<T>(
    run: () => Promise<T>,
    onDenied: () => void
  ): Promise<T | undefined> {
    try {
      return await run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/consent|permission|denied/i.test(msg)) {
        void vscode.window.showWarningMessage(t('auth.consentRequired'));
        onDenied();
        return undefined;
      }
      throw err;
    }
  }
}
