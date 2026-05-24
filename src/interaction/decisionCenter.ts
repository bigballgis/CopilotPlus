/** Decision notifications — R-INT-10, R-INT-11 */

import * as vscode from 'vscode';
import type { DecisionResolver } from '../cli/decisionResolver';
import {
  loadDecisionsFile,
  remainingSecFromStored,
  saveDecisionsFile,
  type StoredDecision,
} from './decisionPersistence';
import { appendDecisionTranscript } from '../workflow/taskTranscript';

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

export interface DecisionPendingView extends DecisionRequest {
  createdAt: string;
  remainingSec: number;
}

export interface DecisionCenterHooks {
  getWorkspaceRoot: () => string | undefined;
  getActiveBuildId: () => string | undefined;
}

const PAUSE_TASK = 'Pause Task';

export class DecisionCenter {
  private pending = new Map<string, StoredDecision>();
  private resolvers = new Map<string, (r: DecisionResponse) => void>();
  private ciResolver: DecisionResolver | undefined;
  private hooks: DecisionCenterHooks | undefined;
  private timeoutHandles = new Map<string, ReturnType<typeof setTimeout>>();
  private deadlines = new Map<string, number>();
  private readonly onChangeEmitter = new vscode.EventEmitter<number>();
  readonly onPendingCountChange = this.onChangeEmitter.event;

  configure(hooks: DecisionCenterHooks): void {
    this.hooks = hooks;
  }

  setCiResolver(resolver: DecisionResolver | undefined): void {
    this.ciResolver = resolver;
  }

  async load(): Promise<void> {
    const root = this.hooks?.getWorkspaceRoot();
    if (!root) {
      return;
    }
    const file = await loadDecisionsFile(root);
    if (!file) {
      return;
    }
    for (const stored of file.pending) {
      if (this.pending.has(stored.id)) {
        continue;
      }
      const remaining = remainingSecFromStored(stored);
      if (remaining <= 0) {
        continue;
      }
      const entry: StoredDecision = { ...stored, remainingSecAtSave: undefined };
      this.pending.set(entry.id, entry);
      this.scheduleTimeout(entry, remaining);
    }
    this.emitChange();
  }

  async persist(): Promise<void> {
    const root = this.hooks?.getWorkspaceRoot();
    if (!root) {
      return;
    }
    const payload = [...this.pending.values()].map((entry) => ({
      ...entry,
      remainingSecAtSave: this.getRemainingSec(entry.id),
    }));
    await saveDecisionsFile(root, payload);
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
    this.registerPending(this.toStored(request));
    void this.persist();
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
    const stored = this.toStored(request);
    this.registerPending(stored);
    void this.persist();

    return new Promise<DecisionResponse>((resolve) => {
      this.resolvers.set(request.id, resolve);
    });
  }

  resolve(id: string, selected: string, timedOut = false): void {
    const entry = this.pending.get(id);
    const resolver = this.resolvers.get(id);
    this.clearTimeout(id);
    this.pending.delete(id);
    this.resolvers.delete(id);
    this.emitChange();
    void this.persist();
    if (entry) {
      void this.recordTranscript(entry, selected, timedOut);
    }
    if (resolver) {
      resolver({ id, selected, timedOut });
    }
  }

  bulkResolve(ids: string[], selected: string): void {
    for (const id of ids) {
      if (this.pending.has(id)) {
        this.resolve(id, selected, false);
      }
    }
  }

  bulkApproveDefault(): void {
    for (const entry of this.pending.values()) {
      const choice = entry.defaultOption ?? entry.options[0] ?? 'Reject';
      this.resolve(entry.id, choice, false);
    }
  }

  getPending(): DecisionRequest[] {
    return [...this.pending.values()];
  }

  getPendingViews(): DecisionPendingView[] {
    return [...this.pending.values()].map((entry) => ({
      ...entry,
      remainingSec: this.getRemainingSec(entry.id),
    }));
  }

  getRemainingSec(id: string): number {
    const deadline = this.deadlines.get(id);
    if (!deadline) {
      return 0;
    }
    return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  }

  private toStored(request: DecisionRequest): StoredDecision {
    return {
      ...request,
      createdAt: new Date().toISOString(),
    };
  }

  private registerPending(request: StoredDecision): void {
    this.pending.set(request.id, request);
    this.scheduleTimeout(request);
    this.emitChange();

    if (this.pending.size <= 5) {
      void this.showNativeNotification(request);
    } else {
      void vscode.window.setStatusBarMessage(`Copilot Plus: ${this.pending.size}`, 3000);
    }
  }

  private scheduleTimeout(request: StoredDecision, remainingSec?: number): void {
    this.clearTimeout(request.id);
    const sec = remainingSec ?? request.timeoutSec;
    const deadline = Date.now() + sec * 1000;
    this.deadlines.set(request.id, deadline);
    const handle = setTimeout(() => {
      if (this.pending.has(request.id)) {
        this.resolve(
          request.id,
          request.defaultOption ?? request.options[0] ?? 'Reject',
          true
        );
      }
    }, sec * 1000);
    this.timeoutHandles.set(request.id, handle);
  }

  private clearTimeout(id: string): void {
    const handle = this.timeoutHandles.get(id);
    if (handle) {
      clearTimeout(handle);
      this.timeoutHandles.delete(id);
    }
    this.deadlines.delete(id);
  }

  private emitChange(): void {
    this.onChangeEmitter.fire(this.pending.size);
  }

  private async recordTranscript(
    entry: StoredDecision,
    selected: string,
    timedOut: boolean
  ): Promise<void> {
    const root = this.hooks?.getWorkspaceRoot();
    const buildId = this.hooks?.getActiveBuildId();
    if (!root || !buildId || !entry.taskId) {
      return;
    }
    await appendDecisionTranscript(root, buildId, entry.taskId, {
      question: entry.question,
      options: entry.options,
      selected,
      timedOut,
    });
  }

  private async showNativeNotification(request: StoredDecision): Promise<void> {
    const choice = await vscode.window.showInformationMessage(
      request.question.slice(0, 500),
      ...request.options,
      PAUSE_TASK
    );
    if (!choice || !this.pending.has(request.id)) {
      return;
    }
    this.resolve(request.id, choice);
  }
}
