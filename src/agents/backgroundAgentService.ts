/** Continuous background agent orchestration — R-AG-9 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { readBackgroundAgentConfig } from './backgroundConfig';
import { BackgroundTaskRunner } from './backgroundTaskRunner';
import {
  elapsedSec,
  idleForSec,
  isUserIdle,
  pickNextBackgroundTask,
  shouldBlockBackground,
  shouldScheduleBackground,
  type BackgroundPhase,
  type BackgroundStatusSnapshot,
  type BackgroundTaskId,
} from './backgroundTasks';
import { t } from '../platform/l10n';

const POLL_MS = 15_000;
const PAUSE_GRACE_MS = 2_000;
const FIRST_ENABLE_KEY = 'copilotPlus.background.firstEnableNoticeShown';

export class BackgroundAgentService {
  private readonly runner: BackgroundTaskRunner;
  private phase: BackgroundPhase = 'disabled';
  private lastActivityMs = Date.now();
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private cancelSource: vscode.CancellationTokenSource | undefined;
  private currentTask: BackgroundTaskId | undefined;
  private pausedTask: BackgroundTaskId | undefined;
  private pausedSummary: string | undefined;
  private startedAtMs: number | undefined;
  private lastFinding: string | undefined;
  private lastCompletedTask: BackgroundTaskId | undefined;
  private pauseRequestedAtMs: number | undefined;
  private listeners = new Set<() => void>();
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly app: AppServices,
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext
  ) {
    this.runner = new BackgroundTaskRunner(app, extensionUri);
  }

  start(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.scheme === 'file' && !event.document.isUntitled) {
          this.recordActivity();
        }
      })
    );
    this.disposables.push(
      this.app.platform.config.onDidChange(() => {
        this.syncEnabledState();
        this.notify();
      })
    );
    this.syncEnabledState();
    this.pollTimer = setInterval(() => {
      void this.tick();
    }, POLL_MS);
  }

  dispose(): void {
    this.pauseNow('Host closed');
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }

  recordActivity(): void {
    this.lastActivityMs = Date.now();
    if (this.phase === 'running') {
      this.pauseRequestedAtMs = Date.now();
    } else if (this.phase !== 'disabled') {
      this.phase = 'waiting_idle';
      this.notify();
    }
  }

  async showFirstEnableNoticeIfNeeded(): Promise<void> {
    if (this.context.globalState.get<boolean>(FIRST_ENABLE_KEY)) {
      return;
    }
    await this.context.globalState.update(FIRST_ENABLE_KEY, true);
    void vscode.window.showInformationMessage(t('background.firstEnableNotice'));
  }

  getStatus(): BackgroundStatusSnapshot {
    const config = readBackgroundAgentConfig();
    const now = Date.now();
    return {
      enabled: config.enabled,
      phase: this.phase,
      idleThresholdSec: config.idleThresholdSec,
      idleForSec: idleForSec(this.lastActivityMs, now),
      currentTask: this.currentTask,
      elapsedSec: elapsedSec(this.startedAtMs, now),
      lastFinding: this.lastFinding,
      lastCompletedTask: this.lastCompletedTask,
      pausedTask: this.pausedTask,
      enabledTasks: config.enabledTasks,
    };
  }

  onChange(listener: () => void): vscode.Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  private syncEnabledState(): void {
    const config = readBackgroundAgentConfig();
    if (!config.enabled) {
      this.pauseNow('Disabled');
      this.phase = 'disabled';
      return;
    }
    if (this.phase === 'disabled') {
      this.phase = 'waiting_idle';
      void this.showFirstEnableNoticeIfNeeded();
    }
  }

  private async tick(): Promise<void> {
    const config = readBackgroundAgentConfig();
    if (!config.enabled) {
      return;
    }

    const now = Date.now();
    const buildStatus = this.app.buildExecutor.getBuildStatus();
    const stage = this.app.stages.getStage();

    if (shouldBlockBackground(stage, buildStatus)) {
      if (this.phase === 'running') {
        this.pauseNow('Build operation active');
      }
      return;
    }

    if (this.phase === 'running') {
      if (this.pauseRequestedAtMs && now - this.pauseRequestedAtMs >= PAUSE_GRACE_MS) {
        this.cancelSource?.cancel();
      }
      if (!isUserIdle(this.lastActivityMs, now, config.idleThresholdSec)) {
        this.pauseRequestedAtMs = this.pauseRequestedAtMs ?? now;
      }
      return;
    }

    if (!shouldScheduleBackground({
      enabled: config.enabled,
      offline: this.app.platform.network.isOffline(),
      stage,
      buildStatus,
      phase: this.phase,
    })) {
      return;
    }

    if (!isUserIdle(this.lastActivityMs, now, config.idleThresholdSec)) {
      this.phase = 'waiting_idle';
      return;
    }

    const task = pickNextBackgroundTask(
      config.enabledTasks,
      this.lastCompletedTask,
      this.pausedTask
    );
    if (!task) {
      return;
    }

    await this.runTask(task);
  }

  private async runTask(taskId: BackgroundTaskId): Promise<void> {
    const config = readBackgroundAgentConfig();
    const budget = config.taskBudgets[taskId];
    this.phase = 'running';
    this.currentTask = taskId;
    this.startedAtMs = Date.now();
    this.pauseRequestedAtMs = undefined;
    this.cancelSource = new vscode.CancellationTokenSource();
    this.notify();

    const result = await this.runner.run(
      taskId,
      budget,
      this.cancelSource.token,
      (message) => {
        this.lastFinding = message;
        this.notify();
      }
    );

    this.currentTask = undefined;
    this.startedAtMs = undefined;
    this.cancelSource = undefined;

    if (result.partial) {
      this.phase = 'paused';
      this.pausedTask = taskId;
      this.pausedSummary = result.summary;
      this.lastFinding = result.summary;
      this.notify();
      return;
    }

    this.pausedTask = undefined;
    this.pausedSummary = undefined;
    this.lastCompletedTask = taskId;
    this.lastFinding = result.summary;
    this.phase = 'waiting_idle';
    this.notify();

    if (result.proposal?.trim()) {
      this.app.decisions.enqueue({
        id: `background-${taskId}-${Date.now()}`,
        question: t('background.proposalQuestion', taskId, result.summary),
        options: ['Apply', 'Apply_With_Edit', 'Reject', 'Snooze_24h'],
        defaultOption: 'Reject',
        timeoutSec: readBackgroundAgentConfig().idleThresholdSec * 4,
      });
    }
  }

  private pauseNow(reason: string): void {
    this.cancelSource?.cancel();
    this.cancelSource = undefined;
    if (this.currentTask) {
      this.pausedTask = this.currentTask;
      this.pausedSummary = this.lastFinding ?? reason;
      this.lastFinding = reason;
    }
    this.currentTask = undefined;
    this.startedAtMs = undefined;
    this.pauseRequestedAtMs = undefined;
    if (this.phase !== 'disabled') {
      this.phase = this.pausedTask ? 'paused' : 'waiting_idle';
    }
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
