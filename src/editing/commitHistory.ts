/** Copilot Plus commit history — R-INT-7 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { COPILOT_PLUS_HOME } from '../shared/constants';
import { runBash } from '../tools/bashRunner';
import type { CheckpointService } from './checkpoint';
import { extractTaskId, parseFilesChangedFromStat, parseGitCommitHash } from './commitHistoryParse';

export { extractTaskId, parseFilesChangedFromStat, parseGitCommitHash } from './commitHistoryParse';

export interface CommitRecord {
  hash: string;
  timestamp: string;
  message: string;
  stage: string;
  taskId?: string;
  filesChanged: number;
  checkpointId?: string;
  rolledBackAt?: string;
}

interface CommitHistoryFile {
  commits: CommitRecord[];
}

export class CommitHistoryService {
  private commits: CommitRecord[] = [];
  private loaded = false;
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onChange = this._onDidChange.event;

  async load(): Promise<void> {
    const file = this.historyPath();
    if (!file) {
      return;
    }
    try {
      const raw = await fs.readFile(file, 'utf8');
      const parsed = JSON.parse(raw) as CommitHistoryFile;
      this.commits = Array.isArray(parsed.commits) ? parsed.commits : [];
    } catch {
      this.commits = [];
    }
    this.loaded = true;
  }

  async record(record: Omit<CommitRecord, 'timestamp'> & { timestamp?: string }): Promise<void> {
    await this.ensureLoaded();
    const entry: CommitRecord = {
      ...record,
      timestamp: record.timestamp ?? new Date().toISOString(),
    };
    this.commits = [entry, ...this.commits.filter((c) => c.hash !== entry.hash)];
    await this.save();
    this._onDidChange.fire();
  }

  list(filter?: string): CommitRecord[] {
    const query = filter?.trim().toLowerCase();
    const sorted = [...this.commits].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    if (!query) {
      return sorted;
    }
    return sorted.filter(
      (entry) =>
        entry.message.toLowerCase().includes(query) ||
        entry.stage.toLowerCase().includes(query) ||
        entry.taskId?.toLowerCase().includes(query) ||
        entry.hash.startsWith(query)
    );
  }

  get(hash: string): CommitRecord | undefined {
    return this.commits.find((entry) => entry.hash === hash || entry.hash.startsWith(hash));
  }

  async markRolledBack(hash: string): Promise<void> {
    await this.ensureLoaded();
    const entry = this.get(hash);
    if (!entry) {
      return;
    }
    entry.rolledBackAt = new Date().toISOString();
    await this.save();
    this._onDidChange.fire();
  }

  async fetchDiff(hash: string): Promise<string> {
    const root = this.workspaceRoot();
    if (!root) {
      return '';
    }
    const result = await runBash(`git show --stat --patch ${hash}`, root);
    return result.stdout || result.stderr || '';
  }

  async rollbackCommit(
    hash: string,
    checkpoints: CheckpointService
  ): Promise<{ ok: boolean; reason?: string }> {
    const entry = this.get(hash);
    if (!entry) {
      return { ok: false, reason: 'not_found' };
    }
    if (entry.rolledBackAt) {
      return { ok: false, reason: 'already_rolled_back' };
    }
    if (entry.checkpointId) {
      try {
        await checkpoints.restore(entry.checkpointId);
      } catch (e) {
        return {
          ok: false,
          reason: e instanceof Error ? e.message : 'checkpoint_restore_failed',
        };
      }
    } else {
      const root = this.workspaceRoot();
      if (!root) {
        return { ok: false, reason: 'no_workspace' };
      }
      const result = await runBash(`git revert --no-edit ${hash}`, root);
      if (result.exit_code !== 0) {
        return { ok: false, reason: result.stderr || 'revert_failed' };
      }
    }
    await this.markRolledBack(hash);
    return { ok: true };
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) {
      await this.load();
    }
  }

  private async save(): Promise<void> {
    const file = this.historyPath();
    if (!file) {
      return;
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    const payload: CommitHistoryFile = { commits: this.commits.slice(0, 200) };
    await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf8');
  }

  private historyPath(): string | undefined {
    const root = this.workspaceRoot();
    if (!root) {
      return undefined;
    }
    return path.join(root, COPILOT_PLUS_HOME, 'commit_history.json');
  }

  private workspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }
}
