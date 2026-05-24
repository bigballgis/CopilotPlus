/** Git worktree build isolation — R-WF-9 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { COPILOT_PLUS_HOME } from '../shared/constants';
import type { CopilotPlusSettings } from '../platform/configuration';
import type { DecisionCenter } from '../interaction/decisionCenter';
import type { BuildManifest } from './buildTypes';
import { appendBuildTranscript } from './buildTranscript';
import { runBash } from '../tools/bashRunner';
import { t } from '../platform/l10n';
import {
  buildIsolationBranchName,
  formatIsolationDisplayPath,
  interpretBuildCompletionDecision,
  type BuildIsolationMode,
  type BuildIsolationState,
} from './buildIsolationTypes';

type SettingsProvider = () => CopilotPlusSettings;

export class BuildIsolationService {
  private active: BuildIsolationState | undefined;

  constructor(
    private readonly getSettings: SettingsProvider,
    private readonly decisions: DecisionCenter
  ) {}

  getState(): BuildIsolationState | undefined {
    return this.active;
  }

  getToolRoot(): string | undefined {
    return this.active?.toolRoot;
  }

  getDisplayPath(): string {
    return this.active?.displayPath ?? 'inline';
  }

  clearActive(): void {
    this.active = undefined;
  }

  async prepare(buildId: string): Promise<BuildIsolationState> {
    const workspaceRoot = this.workspaceRoot();
    if (!workspaceRoot) {
      this.active = inlineState('', '');
      return this.active;
    }

    const settings = this.getSettings();
    const requested = settings.buildIsolation;
    if (requested === 'inline') {
      this.active = inlineState(workspaceRoot, requested);
      return this.active;
    }

    const gitCheck = await this.runGit(workspaceRoot, 'git rev-parse --git-dir');
    if (gitCheck.exit_code !== 0) {
      return this.fallback(buildId, workspaceRoot, requested, t('buildIsolation.noGit'));
    }

    const dirty = await this.runGit(workspaceRoot, 'git status --porcelain');
    if (dirty.exit_code === 0 && dirty.stdout.trim().length > 0) {
      return this.fallback(buildId, workspaceRoot, requested, t('buildIsolation.dirtyTree'));
    }

    const worktreePath = path.join(workspaceRoot, COPILOT_PLUS_HOME, 'worktrees', buildId);
    await fs.mkdir(path.dirname(worktreePath), { recursive: true });

    const branch = requested === 'worktree_branch' ? buildIsolationBranchName(buildId) : undefined;
    const addCmd = branch
      ? `git worktree add -B ${JSON.stringify(branch)} ${JSON.stringify(worktreePath)} HEAD`
      : `git worktree add --detach ${JSON.stringify(worktreePath)} HEAD`;

    const added = await this.runGit(workspaceRoot, addCmd);
    if (added.exit_code !== 0) {
      const reason = added.stderr.trim() || added.stdout.trim() || t('buildIsolation.worktreeFailed');
      return this.fallback(buildId, workspaceRoot, requested, reason);
    }

    this.active = {
      requestedMode: requested,
      effectiveMode: requested,
      workspaceRoot,
      toolRoot: worktreePath,
      worktreePath,
      branch,
      displayPath: formatIsolationDisplayPath({
        effectiveMode: requested,
        branch,
      }),
    };
    await appendBuildTranscript(
      workspaceRoot,
      buildId,
      t('buildIsolation.prepared', this.active.displayPath, worktreePath)
    );
    return this.active;
  }

  async handleBuildCompleted(buildId: string, manifest: BuildManifest): Promise<void> {
    const state = this.active;
    if (!state || state.effectiveMode === 'inline') {
      this.clearActive();
      return;
    }

    const decision = await this.decisions.ask({
      id: `build-complete-${buildId}`,
      question: t('buildIsolation.completePrompt', state.displayPath),
      options: [
        'Merge_To_Main',
        'Cherry_Pick_Selected_Tasks',
        'Keep_Isolated',
        'Discard',
      ],
      defaultOption: 'Keep_Isolated',
      timeoutSec: this.getSettings().decisionTimeoutSec,
    });

    const action = interpretBuildCompletionDecision(decision.selected, decision.timedOut);
    try {
      if (action === 'merge') {
        await this.mergeToMain(state);
        await appendBuildTranscript(state.workspaceRoot, buildId, t('buildIsolation.merged'));
      } else if (action === 'cherry_pick') {
        await this.cherryPickSelected(state);
        await appendBuildTranscript(state.workspaceRoot, buildId, t('buildIsolation.cherryPicked'));
      } else if (action === 'discard') {
        await this.removeWorktree(state);
        await appendBuildTranscript(state.workspaceRoot, buildId, t('buildIsolation.discarded'));
      } else {
        await appendBuildTranscript(state.workspaceRoot, buildId, t('buildIsolation.keptIsolated'));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(t('buildIsolation.actionFailed', message));
      await appendBuildTranscript(state.workspaceRoot, buildId, t('buildIsolation.actionFailed', message));
    } finally {
      this.clearActive();
    }
  }

  async pruneCompletedWorktrees(): Promise<void> {
    const workspaceRoot = this.workspaceRoot();
    if (!workspaceRoot) {
      return;
    }
    const retentionDays = this.getSettings().worktreeRetentionDays;
    const cutoff = Date.now() - retentionDays * 86_400_000;
    const worktreesDir = path.join(workspaceRoot, COPILOT_PLUS_HOME, 'worktrees');
    let entries: string[] = [];
    try {
      entries = await fs.readdir(worktreesDir);
    } catch {
      return;
    }

    for (const buildId of entries) {
      const manifestFile = path.join(
        workspaceRoot,
        COPILOT_PLUS_HOME,
        'builds',
        buildId,
        'build.json'
      );
      try {
        const raw = await fs.readFile(manifestFile, 'utf8');
        const manifest = JSON.parse(raw) as BuildManifest;
        const completedAt = manifest.completedAt ? Date.parse(manifest.completedAt) : NaN;
        if (!Number.isFinite(completedAt) || completedAt > cutoff) {
          continue;
        }
        if (manifest.isolation && manifest.isolation !== 'inline' && manifest.worktreePath) {
          await this.removeWorktreeAt(workspaceRoot, manifest.worktreePath, manifest.branch);
        }
      } catch {
        /* skip unknown entries */
      }
    }
  }

  private async fallback(
    buildId: string,
    workspaceRoot: string,
    requested: BuildIsolationMode,
    reason: string
  ): Promise<BuildIsolationState> {
    this.active = {
      requestedMode: requested,
      effectiveMode: 'inline',
      workspaceRoot,
      toolRoot: workspaceRoot,
      fallbackReason: reason,
      displayPath: 'inline',
    };
    const notice = t('buildIsolation.fallback', reason);
    void vscode.window.showWarningMessage(notice);
    await appendBuildTranscript(workspaceRoot, buildId, notice);
    return this.active;
  }

  private async mergeToMain(state: BuildIsolationState): Promise<void> {
    if (state.branch) {
      const merge = await this.runGit(
        state.workspaceRoot,
        `git merge --no-ff ${JSON.stringify(state.branch)} -m "Copilot Plus build merge"`
      );
      if (merge.exit_code !== 0) {
        throw new Error(merge.stderr.trim() || merge.stdout.trim() || 'merge_failed');
      }
      await this.removeWorktree(state);
      return;
    }

    if (!state.worktreePath) {
      throw new Error('missing_worktree');
    }
    const head = await this.runGit(state.worktreePath, 'git rev-parse HEAD');
    if (head.exit_code !== 0) {
      throw new Error(head.stderr.trim() || 'head_failed');
    }
    const commit = head.stdout.trim();
    const merge = await this.runGit(
      state.workspaceRoot,
      `git merge --no-ff ${JSON.stringify(commit)} -m "Copilot Plus build merge"`
    );
    if (merge.exit_code !== 0) {
      throw new Error(merge.stderr.trim() || merge.stdout.trim() || 'merge_failed');
    }
    await this.removeWorktree(state);
  }

  private async cherryPickSelected(state: BuildIsolationState): Promise<void> {
    if (!state.worktreePath) {
      throw new Error('missing_worktree');
    }
    const base = state.branch
      ? await this.runGit(state.workspaceRoot, `git merge-base HEAD ${JSON.stringify(state.branch)}`)
      : await this.runGit(state.workspaceRoot, 'git rev-parse HEAD');
    if (base.exit_code !== 0) {
      throw new Error(base.stderr.trim() || 'merge_base_failed');
    }
    const baseRef = base.stdout.trim();
    const log = await this.runGit(
      state.worktreePath,
      `git log --reverse --format=%H%x09%s ${baseRef}..HEAD`
    );
    if (log.exit_code !== 0) {
      throw new Error(log.stderr.trim() || 'log_failed');
    }
    const commits = log.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const tab = line.indexOf('\t');
        return {
          hash: tab > 0 ? line.slice(0, tab) : line,
          subject: tab > 0 ? line.slice(tab + 1) : line,
        };
      });
    if (commits.length === 0) {
      throw new Error(t('buildIsolation.noCommits'));
    }

    const picked = await vscode.window.showQuickPick(
      commits.map((entry) => ({
        label: entry.subject,
        description: entry.hash.slice(0, 8),
        hash: entry.hash,
      })),
      {
        placeHolder: t('buildIsolation.pickCommits'),
        canPickMany: true,
      }
    );
    if (!picked?.length) {
      return;
    }

    for (const item of picked) {
      const cp = await this.runGit(state.workspaceRoot, `git cherry-pick ${JSON.stringify(item.hash)}`);
      if (cp.exit_code !== 0) {
        throw new Error(cp.stderr.trim() || cp.stdout.trim() || `cherry_pick_failed:${item.hash}`);
      }
    }
  }

  private async removeWorktree(state: BuildIsolationState): Promise<void> {
    if (!state.worktreePath) {
      return;
    }
    await this.removeWorktreeAt(state.workspaceRoot, state.worktreePath, state.branch);
  }

  private async removeWorktreeAt(
    workspaceRoot: string,
    worktreePath: string,
    branch?: string
  ): Promise<void> {
    await this.runGit(workspaceRoot, `git worktree remove --force ${JSON.stringify(worktreePath)}`);
    if (branch) {
      await this.runGit(workspaceRoot, `git branch -D ${JSON.stringify(branch)}`);
    }
    await fs.rm(worktreePath, { recursive: true, force: true }).catch(() => undefined);
  }

  private async runGit(cwd: string, command: string) {
    return runBash(command, cwd, 120_000);
  }

  private workspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }
}

function inlineState(workspaceRoot: string, requested: BuildIsolationMode): BuildIsolationState {
  return {
    requestedMode: requested === 'inline' ? 'inline' : requested,
    effectiveMode: 'inline',
    workspaceRoot,
    toolRoot: workspaceRoot,
    displayPath: 'inline',
  };
}
