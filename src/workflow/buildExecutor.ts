/** Build stage orchestrator — R-WF-3, R-WF-4, R-AG-3 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { SubAgentRunner } from '../agents/subAgentRunner';
import type { BuildManifest, BuildStatus } from './buildTypes';
import { newBuildId } from './buildTypes';
import { TaskDagStore } from './taskDagStore';
import type { TaskDagFile, TaskNode } from './taskDag';

export interface BuildSnapshot {
  buildId: string | undefined;
  status: BuildStatus;
  dag: TaskDagFile | undefined;
  runningTaskIds: string[];
  lastMessage?: string;
}

type ChangeListener = () => void;

export class BuildExecutor {
  private readonly store = new TaskDagStore();
  private readonly runner: SubAgentRunner;
  private activeBuildId: string | undefined;
  private status: BuildStatus = 'Idle';
  private running = new Set<string>();
  private cancelSource: vscode.CancellationTokenSource | undefined;
  private listeners = new Set<ChangeListener>();
  private lastMessage = '';

  constructor(
    private readonly app: AppServices,
    extensionUri: vscode.Uri
  ) {
    this.runner = new SubAgentRunner(app, extensionUri);
  }

  getActiveBuildId(): string | undefined {
    return this.activeBuildId;
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
      lastMessage: this.lastMessage,
    };
  }

  async getSnapshotAsync(): Promise<BuildSnapshot> {
    const dag = this.activeBuildId ? await this.store.load(this.activeBuildId) : undefined;
    return {
      buildId: this.activeBuildId,
      status: this.status,
      dag,
      runningTaskIds: [...this.running],
      lastMessage: this.lastMessage,
    };
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
    const errors = this.store.validate(sample);
    if (errors.length) {
      void vscode.window.showErrorMessage(errors.map((e) => e.message).join('\n'));
      return undefined;
    }
    sample.tasks = this.store.markReadyStatuses(sample.tasks);
    await this.store.save(buildId, sample);
    await this.store.saveManifest(buildId, { id: buildId, status: 'Idle' });
    this.activeBuildId = buildId;
    this.notify();
    return buildId;
  }

  async start(buildId?: string): Promise<boolean> {
    if (this.status === 'Running') {
      void vscode.window.showInformationMessage('Build already running.');
      return false;
    }

    const id = buildId ?? this.activeBuildId ?? (await this.pickOrCreateBuild());
    if (!id) {
      return false;
    }

    const dag = await this.store.load(id);
    if (!dag) {
      void vscode.window.showErrorMessage(`No tasks.json for build ${id}.`);
      return false;
    }

    const errors = this.store.validate(dag);
    if (errors.length) {
      void vscode.window.showErrorMessage(
        `Task DAG invalid:\n${errors.map((e) => e.message).join('\n')}`
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
    this.status = 'Paused';
    this.setMessage('Build stopped by user');
    this.notify();
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
          const allDone = dag.tasks.every(
            (t) => t.status === 'Done' || t.status === 'Skipped' || t.status === 'RolledBack'
          );
          this.status = allDone ? 'Completed' : this.status;
          if (allDone) {
            await this.store.saveManifest(buildId, {
              id: buildId,
              status: 'Completed',
              completedAt: new Date().toISOString(),
            });
            this.setMessage('Build completed');
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
      this.running.clear();
      this.notify();
    }
  }

  private async runTask(
    buildId: string,
    task: TaskNode,
    token: vscode.CancellationToken
  ): Promise<void> {
    this.running.add(task.id);
    await this.store.updateTaskStatus(buildId, task.id, 'Running');
    this.setMessage(`Running ${task.id} (${task.agent})`);
    this.notify();

    try {
      const result = await this.runner.runBuildPipeline(task, buildId, token, (msg) =>
        this.setMessage(msg)
      );
      const nextStatus = result.ok ? 'Done' : 'Failed';
      await this.store.updateTaskStatus(buildId, task.id, nextStatus);
      if (!result.ok && result.reason) {
        this.setMessage(`Task ${task.id} failed: ${result.reason}`);
      }
    } catch (err) {
      await this.store.updateTaskStatus(buildId, task.id, 'Failed');
      this.setMessage(
        `Task ${task.id} error: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      this.running.delete(task.id);
      this.notify();
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
