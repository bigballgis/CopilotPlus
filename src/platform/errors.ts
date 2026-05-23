/** Error handling and offline detection — R-PLAT-8 */

import * as vscode from 'vscode';
import { t } from './l10n';

export class NetworkMonitor {
  private offline = false;
  private readonly emitter = new vscode.EventEmitter<boolean>();
  readonly onDidChange = this.emitter.event;

  constructor() {
    void this.poll();
    const interval = setInterval(() => void this.poll(), 5000);
    // Caller must dispose via returned disposable from register()
    void interval;
  }

  isOffline(): boolean {
    return this.offline;
  }

  private async poll(): Promise<void> {
    // VS Code does not expose network directly; use lm availability as proxy.
    const wasOffline = this.offline;
    try {
      const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
      this.offline = models.length === 0;
    } catch {
      this.offline = true;
    }
    if (wasOffline !== this.offline) {
      this.emitter.fire(this.offline);
      if (this.offline) {
        void vscode.window.showWarningMessage(t('errors.offline'));
      }
    }
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  surfaceLabel: string
): Promise<T | undefined> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const retry = t('errors.retry');
        const choice = await vscode.window.showErrorMessage(
          `${surfaceLabel}: ${formatError(err)}`,
          retry
        );
        if (choice !== retry) {
          return undefined;
        }
      }
    }
  }
  void lastError;
  return undefined;
}

export function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export function isRateLimitError(err: unknown): boolean {
  const msg = formatError(err).toLowerCase();
  return msg.includes('rate') || msg.includes('429');
}

export function parseRetryAfterMs(err: unknown): number {
  const msg = formatError(err);
  const match = msg.match(/retry[^\d]*(\d+)/i);
  if (match) {
    return parseInt(match[1], 10) * 1000;
  }
  return 30_000;
}
