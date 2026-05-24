/** Build stage orchestrator — R-WF-3, R-WF-4, R-AG-3 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { SubAgentRunner } from '../agents/subAgentRunner';
import type { BuildManifest, BuildStatus } from './buildTypes';
import { newBuildId } from './buildTypes';
import { TaskDagStore } from './taskDagStore';
import type { DagValidationError, TaskDagFile, TaskNode, TaskDagValidationContext } from './taskDag';
import { allTasksTerminal, hasSchedulableWork } from './taskDag';
import { readTaskTranscriptAt } from './taskTranscript';
import { t } from '../platform/l10n';

export interface BuildSnapshot {
  buildId: string | undefined;
  status: BuildStatus;
  dag: TaskDagFile | undefined;
  runningTaskIds: string[];
  validationErrors: DagValidationError[];
  lastMessage?: string;
}

type ChangeListener = () => void;

export class BuildExecutor {
  private readonly store = new TaskDagStore();
  private readonly runner: SubAgentRunner;
  private activeBuildId: string | undefined;
  private status: BuildStatus = 'Idle';
  private running = new Set<string>();
  private pauseRequested = new Set<string>();
  private taskCancelSources = new Map<string, vscode.CancellationTokenSource>();
  private cancelSource: vscode.CancellationTokenSource | undefined;
  private listeners = new Set<ChangeListener>();
  private lastMessage = '';
  private lastValidationErrors: DagValidationError[] = [];

  constructor(
    private readonly app: AppServices,
    extensionUri: vscode.Uri,
    runner?: SubAgentRunner
  ) {
    this.runner = runner ?? new SubAgentRunner(app, extensionUri);
  }

  getActiveBuildId(): string | undefined {
    return this.activeBuildId;
  }

  getBuildStatus(): BuildStatus {
    return this.status;
  }

  async getTasksDag(): Promise<TaskDagFile | undefined> {
    const active = this.activeBuildId ? await this.store.load(this.activeBuildId) : undefined;
    if (active?.tasks.length) {
      return active;
    }
    const ids = await this.store.listBuildIds();
    for (const id of ids) {
      const dag = await this.store.load(id);
      if (dag?.tasks.length) {
        return dag;
      }
    }
    return undefined;
  }

  async addTask(task: TaskNode): Promise<TaskDagFile> {
    const buildId = this.activeBuildId ?? (await this.pickOrCreateBuild());
    if (!buildId) {
      throw new Error('No active build.');
    }
    this.activeBuildId = buildId;
    return this.store.addTask(buildId, task);
  }

  async updateTask(taskId: string, patch: Partial<TaskNode>): Promise<TaskDagFile> {
    const buildId = this.activeBuildId;
    if (!buildId) {
      throw new Error('No active build.');
    }
    return this.store.updateTask(buildId, taskId, patch);
  }

  onChange(listener: ChangeListener): vscode.Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  getSnapshot(): BuildSnapshot {
    return {
      buildId: this.activeBuildId,
      status: this.status,
      dag: undefined,
      runningTaskIds: [...this.running],
      validationErrors: this.lastValidationErrors,
      lastMessage: this.lastMessage,
    };
  }

  async getSnapshotAsync(): Promise<BuildSnapshot> {
    const dag = this.activeBuildId ? await this.store.load(this.activeBuildId) : undefined;
    if (this.activeBuildId) {
      await this.validateBuild(this.activeBuildId, dag);
    }
    return {
      buildId: this.activeBuildId,
      status: this.status,
      dag,
      runningTaskIds: [...this.running],
      validationErrors: this.lastValidationErrors,
      lastMessage: this.lastMessage,
    };
  }

  async refreshValidationForTasksFile(uri: vscode.Uri): Promise<void> {
    const normalized = uri.fsPath.replace(/\\/g, '/');
    const match = normalized.match(/\/\.copilotPlus\/builds\/([^/]+)\/tasks\.json$/);
    if (!match) {
      return;
    }
    const buildId = match[1];
    const dag = await this.store.load(buildId);
    await this.validateBuild(buildId, dag);
    if (buildId === this.activeBuildId) {
      this.notify();
    }
  }

  private validationContext(): TaskDagValidationContext {
    const paths = new Set(
      this.app.docs
        .getEntries()
        .filter((entry) => entry.valid)
        .map((entry) => entry.relativePath.replace(/\\/g, '/'))
    );
    return { knownScopeDocs: paths };
  }

  private async validateBuild(
    buildId: string,
    dag?: TaskDagFile
  ): Promise<DagValidationError[]> {
    const loaded = dag ?? (await this.store.load(buildId));
    if (!loaded) {
      this.lastValidationErrors = [{ message: 'tasks.json not found' }];
      await this.app.taskDagDiagnostics.publish(buildId, this.lastValidationErrors);
      return this.lastValidationErrors;
    }
    this.lastValidationErrors = this.store.validate(loaded, this.validationContext());
    await this.app.taskDagDiagnostics.publish(buildId, this.lastValidationErrors);
    return this.lastValidationErrors;
  }

  async pickOrCreateBuild(): Promise<string | undefined> {
    const ids = await this.store.listBuildIds();
    if (ids.length === 0) {
      return this.createBuild();
    }
    if (ids.length === 1) {
      return ids[0];
    }
    const pick = await vscode.window.showQuickPick(
      ids.map((id) => ({ label: id, id })),
      { placeHolder: 'Select build operation' }
    );
    return pick?.id;
  }

  async createBuild(): Promise<string | undefined> {
    const buildId = newBuildId();
    const systemDoc = await this.app.docs.ensureDefaultSystem();
    const sample: TaskDagFile = {
      tasks: [
        {
          id: 'task-1',
          title: 'Initial implementation',
          description: 'Implement the scoped feature per component docs.',
          agent: 'Coder',
          inputs: {},
          depends_on: [],
          status: 'Pending',
          scope_doc: systemDoc.relativePath,
        },
      ],
    };
    const errors = this.store.validate(sample, this.validationContext());
    if (errors.length) {
      void vscode.window.showErrorMessage(errors.map((e) => e.message).join('\n'));
      return undefined;
    }
    sample.tasks = this.store.markReadyStatuses(sample.tasks);
    await this.store.save(buildId, sample);
    await this.store.saveManifest(buildId, { id: buildId, status: 'Idle' });
    this.activeBuildId = buildId;
    await this.validateBuild(buildId, sample);
    this.notify();
    return buildId;
  }

  async start(buildId?: string): Promise<boolean> {
    if (this.status === 'Running') {
      void vscode.window.showInformationMessage(t('build.alreadyRunning'));
      return false;
    }

    const id = buildId ?? this.activeBuildId ?? (await this.pickOrCreateBuild());
    if (!id) {
      return false;
    }

    const dag = await this.store.load(id);
    if (!dag) {
      void vscode.window.showErrorMessage(t('build.noTasksJson', id));
      return false;
    }

    const errors = await this.validateBuild(id, dag);
    if (errors.length) {
      void vscode.window.showErrorMessage(
        t('build.taskDagInvalid', errors.map((e) => e.message).join('\n'))
      );
      return false;
    }

    this.activeBuildId = id;
    this.status = 'Running';
    this.cancelSource = new vscode.CancellationTokenSource();
    await this.store.saveManifest(id, {
      id,
      status: 'Running',
      startedAt: new Date().toISOString(),
    });
    this.setMessage(`Build ${id} started`);
    this.notify();
    void this.runLoop();
    return true;
  }

  stop(): void {
    this.cancelSource?.cancel();
    for (const source of this.taskCancelSources.values()) {
      source.cancel();
    }
    this.status = 'Paused';
    this.setMessage(t('build.stoppedByUser'));
    this.notify();
  }

  async pauseTask(taskId: string): Promise<boolean> {
    const buildId = this.activeBuildId;
    if (!buildId) {
      void vscode.window.showWarningMessage(t('build.noActiveBuild'));
      return false;
    }
    const dag = await this.store.load(buildId);
    const task = dag?.tasks.find((entry) => entry.id === taskId);
    if (!task) {
      return false;
    }

    if (task.status === 'Running' || this.running.has(taskId)) {
      this.pauseRequested.add(taskId);
      this.taskCancelSources.get(taskId)?.cancel();
      this.setMessage(t('build.taskPausing', taskId));
      this.notify();
      return true;
    }

    if (task.status === 'Ready' || task.status === 'Pending') {
      await this.store.updateTask(buildId, taskId, {
        status: 'Blocked',
        user_paused: true,
      });
      this.setMessage(t('build.taskPaused', taskId));
      this.notify();
      return true;
    }

    void vscode.window.showWarningMessage(t('build.taskActionBlocked', taskId, task.status));
    return false;
  }

  async resumeTask(taskId: string): Promise<boolean> {
    const buildId = this.activeBuildId;
    if (!buildId) {
      void vscode.window.showWarningMessage(t('build.noActiveBuild'));
      return false;
    }
    const dag = await this.store.load(buildId);
    const task = dag?.tasks.find((entry) => entry.id === taskId);
    if (!task || task.status !== 'Blocked' || !task.user_paused) {
      void vscode.window.showWarningMessage(t('build.taskActionBlocked', taskId, task.status));
      return false;
    }

    await this.store.updateTask(buildId, taskId, {
      status: 'Pending',
      user_paused: false,
    });
    this.setMessage(t('build.taskResumed', taskId));
    this.notify();
    return true;
  }

  async skipTask(taskId: string): Promise<boolean> {
    const buildId = this.activeBuildId;
    if (!buildId) {
      void vscode.window.showWarningMessage(t('build.noActiveBuild'));
      return false;
    }
    const dag = await this.store.load(buildId);
    const task = dag?.tasks.find((entry) => entry.id === taskId);
    if (!task || task.status === 'Running' || this.running.has(taskId)) {
      void vscode.window.showWarningMessage(t('build.taskActionBlocked', taskId, task.status));
      return false;
    }
    if (!['Pending', 'Ready', 'Blocked', 'Failed'].includes(task.status)) {
      void vscode.window.showWarningMessage(t('build.taskActionBlocked', taskId, task.status));
      return false;
    }

    await this.store.updateTask(buildId, taskId, {
      status: 'Skipped',
      user_paused: false,
      completed_at: new Date().toISOString(),
    });
    this.setMessage(t('build.taskSkipped', taskId));
    this.notify();
    return true;
  }

  async retryTask(taskId: string): Promise<boolean> {
    const buildId = this.activeBuildId;
    if (!buildId) {
      void vscode.window.showWarningMessage(t('build.noActiveBuild'));
      return false;
    }
    const dag = await this.store.load(buildId);
    const task = dag?.tasks.find((entry) => entry.id === taskId);
    if (!task || task.status !== 'Failed') {
      void vscode.window.showWarningMessage(t('build.taskActionBlocked', taskId, task.status));
      return false;
    }

    await this.store.updateTask(buildId, taskId, {
      status: 'Pending',
      user_paused: false,
      started_at: undefined,
      completed_at: undefined,
    });
    this.setMessage(t('build.taskRetried', taskId));
    this.notify();
    return true;
  }

  async getTaskLog(taskId: string): Promise<string> {
    const buildId = this.activeBuildId;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!buildId || !root) {
      return '';
    }
    return readTaskTranscriptAt(root, buildId, taskId);
  }

  hasRunningTasks(): boolean {
    return this.running.size > 0;
  }

  async rollbackTask(taskId: string): Promise<boolean> {
    const buildId = this.activeBuildId;
    if (!buildId) {
      void vscode.window.showErrorMessage(t('build.noActiveBuild'));
      return false;
    }
    const dag = await this.store.load(buildId);
    const task = dag?.tasks.find((t) => t.id === taskId);
    if (!task || (task.status !== 'Done' && task.status !== 'Failed')) {
      void vscode.window.showWarningMessage(t('build.rollbackTaskBlocked', taskId));
      return false;
    }

    const token = new vscode.CancellationTokenSource().token;
    this.setMessage(`Rolling back ${taskId}`);
    this.notify();

    const result = await this.runner.runRole('Rollback_Operator', task, buildId, token, (msg) =>
      this.setMessage(msg)
    );
    if (!result.ok) {
      await this.store.updateTaskStatus(buildId, taskId, 'Failed');
      this.notify();
      return false;
    }

    await this.store.updateTaskStatus(buildId, taskId, 'RolledBack');
    await this.app.hooks.fire('rollback.completed', { buildId, taskId });
    this.setMessage(`Task ${taskId} rolled back`);
    this.notify();
    return true;
  }

  private async runLoop(): Promise<void> {
    const token = this.cancelSource!.token;
    const maxConcurrent = this.app.platform.getSettings().maxConcurrentTasks;

    try {
      while (!token.isCancellationRequested && this.activeBuildId) {
        const buildId = this.activeBuildId;
        let dag = await this.store.load(buildId);
        if (!dag) {
          break;
        }

        dag.tasks = this.store.markReadyStatuses(dag.tasks);
        await this.store.save(buildId, dag);

        const ready = this.store
          .getReadyTasks(dag.tasks)
          .filter((t) => !this.running.has(t.id));

        if (ready.length === 0 && this.running.size === 0) {
          dag.tasks = this.store.markReadyStatuses(dag.tasks);
          await this.store.save(buildId, dag);

          if (hasSchedulableWork(dag.tasks)) {
            await sleep(500);
            continue;
          }

          const allDone = dag.tasks.every(
            (t) => t.status === 'Done' || t.status === 'Skipped' || t.status === 'RolledBack'
          );
          this.status = allDone ? 'Completed' : 'Failed';
          if (allDone) {
            await this.store.saveManifest(buildId, {
              id: buildId,
              status: 'Completed',
              completedAt: new Date().toISOString(),
            });
            this.setMessage('Build completed');
            void this.promptDeployStage();
            void this.runSelfReflection(buildId, dag.tasks.length, 'Completed');
          } else if (allTasksTerminal(dag.tasks)) {
            this.setMessage(t('build.stoppedWithFailures'));
          }
          break;
        }

        const batch = ready.slice(0, Math.max(0, maxConcurrent - this.running.size));
        if (batch.length === 0) {
          await sleep(500);
          continue;
        }

        await Promise.all(batch.map((task) => this.runTask(buildId, task, token)));
      }
    } finally {
      if (this.status === 'Running') {
        this.status = 'Paused';
      }
      if (this.activeBuildId && this.status !== 'Completed') {
        void this.runSelfReflection(this.activeBuildId, 0, this.status);
      }
      this.running.clear();
      this.notify();
    }
  }

  private async runSelfReflection(
    buildId: string,
    taskCount: number,
    outcome: string
  ): Promise<void> {
    const dag = await this.store.load(buildId);
    const count = taskCount || dag?.tasks.length || 0;
    const summary = dag?.tasks
      .map((t) => `${t.id} ${t.agent} ${t.status}: ${t.title}`)
      .join('\n') ?? this.lastMessage;
    await this.app.knowledge.runSelfReflection(this.app, buildId, count, outcome, summary);
  }

  private async runTask(
    buildId: string,
    task: TaskNode,
    parentToken: vscode.CancellationToken
  ): Promise<void> {
    this.running.add(task.id);
    const taskSource = new vscode.CancellationTokenSource();
    parentToken.onCancellationRequested(() => taskSource.cancel());
    this.taskCancelSources.set(task.id, taskSource);

    const nowIso = new Date().toISOString();
    await this.store.updateTask(buildId, task.id, {
      status: 'Running',
      started_at: nowIso,
      completed_at: undefined,
    });
    await this.app.hooks.fire('task.started', { buildId, taskId: task.id, agent: task.agent });
    this.setMessage(t('build.taskRunning', task.id, task.agent));
    this.notify();

    let paused = false;
    try {
      const result = await this.runner.runBuildPipeline(
        task,
        buildId,
        taskSource.token,
        (msg) => this.setMessage(msg),
        {
          onTaskBlocked: async () => {
            await this.store.updateTask(buildId, task.id, { status: 'Blocked' });
            this.notify();
          },
          onTaskRunning: async () => {
            await this.store.updateTask(buildId, task.id, { status: 'Running' });
            this.notify();
          },
        }
      );

      if (!result.ok && result.reason === 'cancelled') {
        if (this.pauseRequested.has(task.id)) {
          this.pauseRequested.delete(task.id);
          await this.store.updateTask(buildId, task.id, {
            status: 'Blocked',
            user_paused: true,
            completed_at: new Date().toISOString(),
          });
          this.setMessage(t('build.taskPaused', task.id));
          return;
        }
        await this.store.updateTask(buildId, task.id, {
          status: 'Blocked',
          completed_at: new Date().toISOString(),
        });
        this.setMessage(t('build.taskPaused', task.id));
        return;
      }

      paused = this.pauseRequested.has(task.id);
      if (paused) {
        this.pauseRequested.delete(task.id);
        await this.store.updateTask(buildId, task.id, {
          status: 'Blocked',
          user_paused: true,
          completed_at: new Date().toISOString(),
        });
        this.setMessage(t('build.taskPaused', task.id));
        return;
      }

      if (result.skip) {
        await this.store.updateTask(buildId, task.id, {
          status: 'Skipped',
          completed_at: new Date().toISOString(),
        });
        this.setMessage(t('build.taskSkipped', task.id));
        return;
      }

      if (result.terminateBuild) {
        await this.store.updateTask(buildId, task.id, {
          status: 'Failed',
          completed_at: new Date().toISOString(),
        });
        this.setMessage(t('build.taskFailed', task.id, result.reason ?? 'terminated'));
        this.stop();
        return;
      }

      if (result.pauseRequested) {
        await this.store.updateTask(buildId, task.id, {
          status: 'Blocked',
          user_paused: true,
          completed_at: new Date().toISOString(),
        });
        this.setMessage(t('build.taskPaused', task.id));
        return;
      }

      const nextStatus = result.ok ? 'Done' : result.blocked ? 'Blocked' : 'Failed';
      await this.store.updateTask(buildId, task.id, {
        status: nextStatus,
        completed_at: new Date().toISOString(),
      });
      await this.app.hooks.fire(result.ok ? 'task.completed' : 'task.failed', {
        buildId,
        taskId: task.id,
        reason: result.reason,
      });
      if (result.ok) {
        return;
      }
      if (!result.ok && result.reason) {
        this.setMessage(t('build.taskFailed', task.id, result.reason));
      }
    } catch (err) {
      paused = this.pauseRequested.has(task.id);
      if (paused) {
        this.pauseRequested.delete(task.id);
        await this.store.updateTask(buildId, task.id, {
          status: 'Blocked',
          user_paused: true,
          completed_at: new Date().toISOString(),
        });
        this.setMessage(t('build.taskPaused', task.id));
        return;
      }
      await this.store.updateTask(buildId, task.id, {
        status: 'Failed',
        completed_at: new Date().toISOString(),
      });
      await this.app.hooks.fire('task.failed', {
        buildId,
        taskId: task.id,
        reason: err instanceof Error ? err.message : String(err),
      });
      this.setMessage(
        t('build.taskError', task.id, err instanceof Error ? err.message : String(err))
      );
    } finally {
      this.taskCancelSources.delete(task.id);
      this.running.delete(task.id);
      this.notify();
    }
  }

  private async promptDeployStage(): Promise<void> {
    const choice = await vscode.window.showInformationMessage(
      t('build.promptDeploy'),
      t('build.advanceDeploy'),
      t('common.cancel')
    );
    if (choice === t('build.advanceDeploy')) {
      await this.app.stages.transition('Deploy');
    }
  }

  private setMessage(message: string): void {
    this.lastMessage = message;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
