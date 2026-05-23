/** Deploy configuration and runs — R-DEP-1, R-DEP-3 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { COPILOT_PLUS_HOME } from '../shared/constants';

export type DeployTarget = 'Local' | 'Docker' | 'Kubernetes';
export type DeployMode = 'Manual' | 'Auto';
export type DeployRunStatus = 'Idle' | 'Running' | 'Completed' | 'Failed' | 'RolledBack';

export interface DeployConfig {
  target: DeployTarget;
  mode: DeployMode;
  manifest_path?: string;
  pre_deploy_commands?: string[];
  post_deploy_commands?: string[];
  rollback_strategy?: 'manifest_revert' | 'native';
  apply_command?: string;
  rollback_command?: string;
}

export interface DeployRun {
  id: string;
  status: DeployRunStatus;
  target: DeployTarget;
  mode: DeployMode;
  startedAt?: string;
  completedAt?: string;
  logPath?: string;
  snapshotId?: string;
  error?: string;
}

const DEFAULT_CONFIG: DeployConfig = {
  target: 'Local',
  mode: 'Manual',
  rollback_strategy: 'manifest_revert',
  pre_deploy_commands: [],
  post_deploy_commands: [],
};

export class DeployService {
  private config: DeployConfig = DEFAULT_CONFIG;
  private runs: DeployRun[] = [];
  private activeRun: DeployRun | undefined;

  async load(): Promise<void> {
    const file = this.configPath();
    if (!file) {
      return;
    }
    try {
      this.config = { ...DEFAULT_CONFIG, ...(JSON.parse(await fs.readFile(file, 'utf8')) as DeployConfig) };
    } catch {
      await this.saveConfig(DEFAULT_CONFIG);
    }
    await this.loadRuns();
  }

  getConfig(): DeployConfig {
    return { ...this.config };
  }

  getRuns(): DeployRun[] {
    return [...this.runs];
  }

  getActiveRun(): DeployRun | undefined {
    return this.activeRun;
  }

  async saveConfig(config: DeployConfig): Promise<void> {
    const file = this.configPath();
    if (!file) {
      throw new Error('No workspace folder.');
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(config, null, 2), 'utf8');
    this.config = config;
  }

  manifestDir(target?: DeployTarget): string | undefined {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      return undefined;
    }
    const t = (target ?? this.config.target).toLowerCase();
    return path.join(root, COPILOT_PLUS_HOME, 'deploy', t);
  }

  async generateManifest(target?: DeployTarget): Promise<string[]> {
    const t = target ?? this.config.target;
    const dir = this.manifestDir(t);
    if (!dir) {
      throw new Error('No workspace folder.');
    }
    await fs.mkdir(dir, { recursive: true });
    const written: string[] = [];

    switch (t) {
      case 'Local': {
        const runScript = path.join(dir, 'run.sh');
        const envFile = path.join(dir, '.env.example');
        await fs.writeFile(
          runScript,
          '#!/bin/sh\n# Copilot Plus local deploy — customize before running\nnpm run start\n',
          'utf8'
        );
        await fs.writeFile(envFile, 'PORT=3000\n', 'utf8');
        written.push(runScript, envFile);
        break;
      }
      case 'Docker': {
        const dockerfile = path.join(dir, 'Dockerfile');
        const compose = path.join(dir, 'docker-compose.yml');
        await fs.writeFile(
          dockerfile,
          'FROM node:22-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nCMD ["npm","run","start"]\n',
          'utf8'
        );
        await fs.writeFile(
          compose,
          'services:\n  app:\n    build: .\n    ports:\n      - "3000:3000"\n',
          'utf8'
        );
        written.push(dockerfile, compose);
        break;
      }
      case 'Kubernetes': {
        const kustomization = path.join(dir, 'kustomization.yaml');
        const deployment = path.join(dir, 'deployment.yaml');
        await fs.writeFile(kustomization, 'resources:\n  - deployment.yaml\n', 'utf8');
        await fs.writeFile(
          deployment,
          'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: copilot-plus-app\nspec:\n  replicas: 1\n',
          'utf8'
        );
        written.push(kustomization, deployment);
        break;
      }
    }

    const snapshot = path.join(
      vscode.workspace.workspaceFolders![0].uri.fsPath,
      COPILOT_PLUS_HOME,
      'deploy',
      'snapshots',
      String(Date.now())
    );
    await fs.mkdir(snapshot, { recursive: true });
    for (const file of written) {
      const rel = path.basename(file);
      await fs.copyFile(file, path.join(snapshot, rel));
    }

    return written;
  }

  async listManifestFiles(target?: DeployTarget): Promise<string[]> {
    const dir = this.manifestDir(target);
    if (!dir) {
      return [];
    }
    try {
      const names = await fs.readdir(dir);
      return names.map((name) => path.join(dir, name).replace(/\\/g, '/'));
    } catch {
      return [];
    }
  }

  async readLogTail(logPath: string | undefined, maxLines = 8): Promise<string> {
    if (!logPath) {
      return '';
    }
    try {
      const content = await fs.readFile(logPath, 'utf8');
      const tail = content.split('\n').slice(-maxLines).join('\n');
      this.logTailCache = tail;
      return tail;
    } catch {
      return '';
    }
  }

  getCachedLogTail(): string {
    return this.logTailCache;
  }

  private logTailCache = '';

  recommendedCommands(): string[] {
    switch (this.config.target) {
      case 'Local':
        return ['sh .copilotPlus/deploy/local/run.sh'];
      case 'Docker':
        return ['docker compose -f .copilotPlus/deploy/docker/docker-compose.yml up -d --build'];
      case 'Kubernetes':
        return ['kubectl apply -k .copilotPlus/deploy/kubernetes/'];
    }
  }

  async beginRun(mode: DeployMode): Promise<DeployRun> {
    const id = `deploy-${Date.now()}`;
    const run: DeployRun = {
      id,
      status: 'Running',
      target: this.config.target,
      mode,
      startedAt: new Date().toISOString(),
      logPath: this.logPath(id),
    };
    this.activeRun = run;
    this.runs.unshift(run);
    await this.persistRuns();
    return run;
  }

  async finishRun(id: string, status: DeployRunStatus, error?: string): Promise<void> {
    const run = this.runs.find((r) => r.id === id) ?? this.activeRun;
    if (!run) {
      return;
    }
    run.status = status;
    run.completedAt = new Date().toISOString();
    run.error = error;
    await this.persistRuns();
    if (this.activeRun?.id === id) {
      this.activeRun = undefined;
    }
  }

  async snapshotCurrentManifest(runId: string): Promise<string | undefined> {
    const dir = this.manifestDir();
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!dir || !root) {
      return undefined;
    }
    const snapshotId = String(Date.now());
    const snapshot = path.join(root, COPILOT_PLUS_HOME, 'deploy', 'snapshots', snapshotId);
    await fs.mkdir(snapshot, { recursive: true });
    try {
      const files = await fs.readdir(dir);
      for (const name of files) {
        await fs.copyFile(path.join(dir, name), path.join(snapshot, name));
      }
    } catch {
      /* empty manifest dir */
    }
    const run = this.runs.find((r) => r.id === runId);
    if (run) {
      run.snapshotId = snapshotId;
      await this.persistRuns();
    }
    return snapshotId;
  }

  /** @deprecated use beginRun */
  async startRun(mode: DeployMode): Promise<DeployRun> {
    return this.beginRun(mode);
  }

  /** @deprecated use finishRun */
  async completeRun(status: DeployRunStatus): Promise<void> {
    if (this.activeRun) {
      await this.finishRun(this.activeRun.id, status);
    }
  }

  private configPath(): string | undefined {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return root ? path.join(root, COPILOT_PLUS_HOME, 'deploy', 'config.json') : undefined;
  }

  private logPath(runId: string): string | undefined {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return root ? path.join(root, COPILOT_PLUS_HOME, 'deploy', 'runs', `${runId}.log`) : undefined;
  }

  private runsPath(): string | undefined {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return root ? path.join(root, COPILOT_PLUS_HOME, 'deploy', 'runs.json') : undefined;
  }

  private async loadRuns(): Promise<void> {
    const file = this.runsPath();
    if (!file) {
      return;
    }
    try {
      this.runs = JSON.parse(await fs.readFile(file, 'utf8')) as DeployRun[];
    } catch {
      this.runs = [];
    }
  }

  private async persistRuns(): Promise<void> {
    const file = this.runsPath();
    if (!file) {
      return;
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(this.runs.slice(0, 50), null, 2), 'utf8');
  }
}
