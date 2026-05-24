/** Tracks in-flight model requests for entitlement-loss cancellation — R-PLAT-2.7 */

import * as vscode from 'vscode';

const ENTITLEMENT_CANCEL_BUDGET_MS = 2_000;

export class ModelRequestCoordinator {
  private readonly sources = new Set<vscode.CancellationTokenSource>();

  register(source: vscode.CancellationTokenSource): vscode.Disposable {
    this.sources.add(source);
    return {
      dispose: () => {
        this.sources.delete(source);
      },
    };
  }

  /** Cancel every registered request within R-PLAT-2.7's 2 second budget. */
  cancelAll(): void {
    const started = Date.now();
    for (const source of this.sources) {
      source.cancel();
    }
    const elapsed = Date.now() - started;
    if (elapsed > ENTITLEMENT_CANCEL_BUDGET_MS) {
      console.warn(`Copilot Plus cancelled ${this.sources.size} requests in ${elapsed}ms`);
    }
  }
}
