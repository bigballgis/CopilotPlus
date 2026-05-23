/** Localization wrapper — R-PLAT-9 */

import * as vscode from 'vscode';

const FALLBACK: Record<string, string> = {
  'auth.entitlementRequired': 'An active GitHub Copilot subscription is required.',
  'auth.signInAction': 'Sign in to GitHub Copilot',
  'auth.consentRequired': 'Language model access consent is required for Copilot Plus.',
  'errors.offline': 'Copilot Plus is offline — model requests are blocked.',
  'errors.retry': 'Retry',
  'activation.unsupported': 'Copilot Plus requires VS Code {0} or later (current: {1}).',
  'activation.failed': 'Copilot Plus failed to activate: {0}',
  'activation.slow': 'Copilot Plus is still starting…',
  'settings.invalid': 'Invalid setting "{0}": {1}. Using default.',
};

export function t(key: string, ...args: (string | number)[]): string {
  let text: string;
  try {
    text = vscode.l10n.t(key);
    if (text === key) {
      text = FALLBACK[key] ?? key;
    }
  } catch {
    text = FALLBACK[key] ?? key;
  }
  return args.reduce<string>(
    (acc, arg, i) => acc.replace(`{${i}}`, String(arg)),
    text
  );
}

export function loadLocaleBundle(): string {
  return vscode.env.language;
}
