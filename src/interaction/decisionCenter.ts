/** Decision notifications — R-INT-10, R-INT-11 */

import * as vscode from 'vscode';

export interface DecisionRequest {
  id: string;
  taskId?: string;
  question: string;
  options: string[];
  defaultOption?: string;
  timeoutSec: number;
}

export interface DecisionResponse {
  id: string;
  selected: string;
  timedOut: boolean;
}

export class DecisionCenter {
  private pending = new Map<string, DecisionRequest>();
  private resolvers = new Map<string, (r: DecisionResponse) => void>();
  private readonly onChangeEmitter = new vscode.EventEmitter<number>();
  readonly onPendingCountChange = this.onChangeEmitter.event;

  async ask(request: DecisionRequest): Promise<DecisionResponse> {
    this.pending.set(request.id, request);
    this.onChangeEmitter.fire(this.pending.size);

    if (this.pending.size <= 5) {
      void this.showNativeNotification(request);
    } else {
      void vscode.window.setStatusBarMessage(`Copilot Plus: ${this.pending.size}`, 3000);
    }

    return new Promise<DecisionResponse>((resolve) => {
      this.resolvers.set(request.id, resolve);
      setTimeout(() => {
        if (this.pending.has(request.id)) {
          this.resolve(request.id, request.defaultOption ?? request.options[0] ?? 'Reject', true);
        }
      }, request.timeoutSec * 1000);
    });
  }

  resolve(id: string, selected: string, timedOut = false): void {
    const resolver = this.resolvers.get(id);
    if (!resolver) {
      return;
    }
    this.pending.delete(id);
    this.resolvers.delete(id);
    this.onChangeEmitter.fire(this.pending.size);
    resolver({ id, selected, timedOut });
  }

  getPending(): DecisionRequest[] {
    return [...this.pending.values()];
  }

  private async showNativeNotification(request: DecisionRequest): Promise<void> {
    const choice = await vscode.window.showInformationMessage(
      request.question.slice(0, 500),
      ...request.options,
      'Pause Task'
    );
    if (choice) {
      this.resolve(request.id, choice);
    }
  }
}
