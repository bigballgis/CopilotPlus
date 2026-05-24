/** Decision notifications — R-INT-10, R-INT-11 */

import * as vscode from 'vscode';
import type { DecisionResolver } from '../cli/decisionResolver';

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
  private ciResolver: DecisionResolver | undefined;
  private readonly onChangeEmitter = new vscode.EventEmitter<number>();
  readonly onPendingCountChange = this.onChangeEmitter.event;

  setCiResolver(resolver: DecisionResolver | undefined): void {
    this.ciResolver = resolver;
  }

  /** Queue a decision without blocking the caller — R-AG-9 background proposals */
  enqueue(request: DecisionRequest): void {
    if (this.ciResolver) {
      try {
        this.ciResolver.resolve(request);
      } catch {
        /* fall through to pending queue in CI fail mode */
      }
      return;
    }
    this.registerPending(request);
    this.scheduleTimeout(request);
  }

  async ask(request: DecisionRequest): Promise<DecisionResponse> {
    if (this.ciResolver) {
      try {
        const selected = this.ciResolver.resolve(request);
        return { id: request.id, selected, timedOut: false };
      } catch (err) {
        throw err;
      }
    }
    this.registerPending(request);

    return new Promise<DecisionResponse>((resolve) => {
      this.resolvers.set(request.id, resolve);
      this.scheduleTimeout(request);
    });
  }

  resolve(id: string, selected: string, timedOut = false): void {
    const resolver = this.resolvers.get(id);
    this.pending.delete(id);
    this.resolvers.delete(id);
    this.onChangeEmitter.fire(this.pending.size);
    if (resolver) {
      resolver({ id, selected, timedOut });
    }
  }

  getPending(): DecisionRequest[] {
    return [...this.pending.values()];
  }

  private registerPending(request: DecisionRequest): void {
    this.pending.set(request.id, request);
    this.onChangeEmitter.fire(this.pending.size);

    if (this.pending.size <= 5) {
      void this.showNativeNotification(request);
    } else {
      void vscode.window.setStatusBarMessage(`Copilot Plus: ${this.pending.size}`, 3000);
    }
  }

  private scheduleTimeout(request: DecisionRequest): void {
    setTimeout(() => {
      if (this.pending.has(request.id)) {
        this.resolve(request.id, request.defaultOption ?? request.options[0] ?? 'Reject', true);
      }
    }, request.timeoutSec * 1000);
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
