/** Task DAG persistence — R-WF-3 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { COPILOT_PLUS_HOME } from '../shared/constants';
import {
  computeReadyTasks,
  markReadyStatuses as applyReadyStatuses,
  validateTaskDag,
  type TaskDagFile,
  type TaskNode,
  type TaskStatus,
} from './taskDag';
import type { BuildManifest } from './buildTypes';

export function buildsRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, COPILOT_PLUS_HOME, 'builds');
}

export function tasksPath(workspaceRoot: string, buildId: string): string {
  return path.join(buildsRoot(workspaceRoot), buildId, 'tasks.json');
}

export function manifestPath(workspaceRoot: string, buildId: string): string {
  return path.join(buildsRoot(workspaceRoot), buildId, 'build.json');
}

export class TaskDagStore {
  private workspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  async listBuildIds(): Promise<string[]> {
    const root = this.workspaceRoot();
    if (!root) {
      return [];
    }
    const dir = buildsRoot(root);
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort().reverse();
    } catch {
      return [];
    }
  }

  async load(buildId: string): Promise<TaskDagFile | undefined> {
    const root = this.workspaceRoot();
    if (!root) {
      return undefined;
    }
    try {
      const raw = await fs.readFile(tasksPath(root, buildId), 'utf8');
      return JSON.parse(raw) as TaskDagFile;
    } catch {
      return undefined;
    }
  }

  async save(buildId: string, dag: TaskDagFile): Promise<void> {
    const root = this.workspaceRoot();
    if (!root) {
      throw new Error('No workspace folder open.');
    }
    const file = tasksPath(root, buildId);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(dag, null, 2), 'utf8');
  }

  async loadManifest(buildId: string): Promise<BuildManifest | undefined> {
    const root = this.workspaceRoot();
    if (!root) {
      return undefined;
    }
    try {
      const raw = await fs.readFile(manifestPath(root, buildId), 'utf8');
      return JSON.parse(raw) as BuildManifest;
    } catch {
      return undefined;
    }
  }

  async saveManifest(buildId: string, manifest: BuildManifest): Promise<void> {
    const root = this.workspaceRoot();
    if (!root) {
      throw new Error('No workspace folder open.');
    }
    const file = manifestPath(root, buildId);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(manifest, null, 2), 'utf8');
  }

  validate(dag: TaskDagFile, context?: import('./taskDag').TaskDagValidationContext) {
    return validateTaskDag(dag, context);
  }

  markReadyStatuses(tasks: TaskNode[]): TaskNode[] {
    return applyReadyStatuses(tasks);
  }

  getReadyTasks(tasks: TaskNode[]): TaskNode[] {
    const refreshed = this.markReadyStatuses(tasks);
    return computeReadyTasks(refreshed);
  }

  async updateTaskStatus(
    buildId: string,
    taskId: string,
    status: TaskStatus
  ): Promise<TaskDagFile | undefined> {
    const dag = await this.load(buildId);
    if (!dag) {
      return undefined;
    }
    dag.tasks = dag.tasks.map((t) => (t.id === taskId ? { ...t, status } : t));
    dag.tasks = this.markReadyStatuses(dag.tasks);
    await this.save(buildId, dag);
    return dag;
  }

  async addTask(buildId: string, task: TaskNode): Promise<TaskDagFile> {
    const dag = (await this.load(buildId)) ?? { tasks: [] };
    dag.tasks.push(task);
    const errors = this.validate(dag);
    if (errors.length) {
      throw new Error(errors.map((e) => e.message).join('; '));
    }
    dag.tasks = this.markReadyStatuses(dag.tasks);
    await this.save(buildId, dag);
    return dag;
  }

  async updateTask(buildId: string, taskId: string, patch: Partial<TaskNode>): Promise<TaskDagFile> {
    const dag = await this.load(buildId);
    if (!dag) {
      throw new Error('Build not found.');
    }
    dag.tasks = dag.tasks.map((t) => (t.id === taskId ? { ...t, ...patch, id: taskId } : t));
    const errors = this.validate(dag);
    if (errors.length) {
      throw new Error(errors.map((e) => e.message).join('; '));
    }
    dag.tasks = this.markReadyStatuses(dag.tasks);
    await this.save(buildId, dag);
    return dag;
  }
}
