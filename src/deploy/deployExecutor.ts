/** Deploy apply/rollback execution — R-DEP-4, R-DEP-6 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { AppServices } from '../app/appServices';
import type { DeployRun, DeployTarget } from './deployService';
import { evaluatePrerequisiteExit, requiresCli } from './deployPrerequisites';
import { runBash } from '../tools/bashRunner';
import { matchesCommandDenyList } from '../platform/configuration';
import { COPILOT_PLUS_HOME } from '../shared/constants';

export class DeployExecutor {
  constructor(
    private readonly app: AppServices,
    private readonly deploy = app.deploy
  ) {}

  async applyManifest(): Promise<{ ok: boolean; runId?: string; reason?: string }> {
    const cfg = this.deploy.getConfig();
    if (cfg.mode !== 'Auto') {
      return { ok: false, reason: 'manual_mode' };
    }

    const prereq = await this.verifyPrerequisites(cfg.target);
    if (!prereq.ok) {
      return { ok: false, reason: prereq.reason };
    }

    const run = await this.deploy.beginRun('Auto');
    await this.app.hooks.fire('deploy.started', { runId: run.id, target: run.target });
    await this.log(run, `Deploy started (${run.target})\n`);

    try {
      await this.deploy.snapshotCurrentManifest(run.id);

      for (const command of cfg.pre_deploy_commands ?? []) {
        const step = await this.runGuarded(command, run, 600_000);
        if (!step.ok) {
          throw new Error(step.reason ?? 'pre_deploy_failed');
        }
      }

      const applyCmd = cfg.apply_command ?? this.defaultApplyCommand(run.target);
      const applied = await this.runGuarded(applyCmd, run, 600_000);
      if (!applied.ok) {
        throw new Error(applied.reason ?? 'apply_failed');
      }

      for (const command of cfg.post_deploy_commands ?? []) {
        const step = await this.runGuarded(command, run, 600_000);
        if (!step.ok) {
          throw new Error(step.reason ?? 'post_deploy_failed');
        }
      }

      await this.deploy.finishRun(run.id, 'Completed');
      await this.app.hooks.fire('deploy.completed', { runId: run.id });
      await this.log(run, 'Deploy completed\n');
      return { ok: true, runId: run.id };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await this.deploy.finishRun(run.id, 'Failed', reason);
      await this.app.hooks.fire('deploy.failed', { runId: run.id, reason });
      await this.log(run, `Deploy failed: ${reason}\n`);

      const answer = await this.app.decisions.ask({
        id: `deploy-fail-${run.id}`,
        question: `Deploy failed: ${reason}`,
        options: ['Retry', 'Rollback', 'Terminate'],
        defaultOption: 'Terminate',
        timeoutSec: 300,
      });
      if (answer.selected === 'Retry') {
        return this.applyManifest();
      }
      if (answer.selected === 'Rollback') {
        await this.rollbackRun(run.id);
      }
      return { ok: false, runId: run.id, reason };
    }
  }

  async rollbackRun(runId: string): Promise<{ ok: boolean; reason?: string }> {
    const run = this.deploy.getRuns().find((r) => r.id === runId);
    if (!run) {
      return { ok: false, reason: 'run_not_found' };
    }

    const cfg = this.deploy.getConfig();
    const cmd =
      cfg.rollback_command ??
      (cfg.rollback_strategy === 'native'
        ? this.nativeRollbackCommand(run.target)
        : run.snapshotId
          ? this.snapshotRestoreCommand(run.target, run.snapshotId)
          : this.defaultApplyCommand(run.target));

    await this.log(run, `Rollback started\n`);
    const result = await this.runGuarded(cmd, run, 600_000);
    if (!result.ok) {
      const answer = await this.app.decisions.ask({
        id: `deploy-rollback-fail-${runId}`,
        question: `Rollback failed: ${result.reason ?? 'unknown'}`,
        options: ['Retry', 'Run Custom Command', 'Terminate'],
        defaultOption: 'Terminate',
        timeoutSec: 300,
      });
      if (answer.selected === 'Retry') {
        return this.rollbackRun(runId);
      }
      return { ok: false, reason: result.reason };
    }

    await this.deploy.finishRun(runId, 'RolledBack');
    await this.app.hooks.fire('rollback.completed', { runId, scope: 'deploy' });
    await this.log(run, 'Rollback completed\n');
    return { ok: true };
  }

  private async runGuarded(
    command: string,
    run: DeployRun,
    timeoutMs: number
  ): Promise<{ ok: boolean; reason?: string }> {
    const deny = matchesCommandDenyList(command, this.app.platform.getSettings().commandDenyList);
    if (deny) {
      const approved = await this.app.decisions.ask({
        id: `deploy-cmd-${Date.now()}`,
        question: `Allow deploy command?\n${command}`,
        options: ['Approve', 'Reject'],
        defaultOption: 'Reject',
        timeoutSec: 300,
      });
      if (approved.timedOut || approved.selected !== 'Approve') {
        return { ok: false, reason: 'command_denied' };
      }
    }

    const perm = this.app.platform.resolveToolPermission('bash', command);
    if (perm.effective === 'ask') {
      const approved = await this.app.decisions.ask({
        id: `deploy-bash-${Date.now()}`,
        question: `Run deploy command?\n${command}`,
        options: ['Approve', 'Reject'],
        defaultOption: 'Reject',
        timeoutSec: 300,
      });
      if (approved.timedOut || approved.selected !== 'Approve') {
        return { ok: false, reason: 'user_rejected' };
      }
    }

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      return { ok: false, reason: 'no_workspace' };
    }

    await this.log(run, `$ ${command}\n`);
    const result = await runBash(command, root, timeoutMs);
    await this.log(
      run,
      `exit=${result.exit_code}${result.timed_out ? ' (timeout)' : ''}\n${result.stdout}\n${result.stderr}\n`
    );
    return result.exit_code === 0 && !result.timed_out
      ? { ok: true }
      : { ok: false, reason: result.stderr || 'command_failed' };
  }

  private defaultApplyCommand(target: DeployTarget): string {
    switch (target) {
      case 'Local':
        return process.platform === 'win32'
          ? 'bash .copilotPlus/deploy/local/run.sh'
          : 'sh .copilotPlus/deploy/local/run.sh';
      case 'Docker':
        return 'docker compose -f .copilotPlus/deploy/docker/docker-compose.yml up -d --build';
      case 'Kubernetes':
        return 'kubectl apply -k .copilotPlus/deploy/kubernetes/';
    }
  }

  private snapshotRestoreCommand(target: DeployTarget, snapshotId: string): string {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const manifestDir = this.deploy.manifestDir(target);
    if (!root || !manifestDir) {
      return this.defaultApplyCommand(target);
    }
    const snapDir = path.join(root, COPILOT_PLUS_HOME, 'deploy', 'snapshots', snapshotId);
    return process.platform === 'win32'
      ? `xcopy /E /I /Y "${snapDir}\\*" "${manifestDir}"`
      : `cp -R "${snapDir}/." "${manifestDir}"`;
  }

  private nativeRollbackCommand(target: DeployTarget): string {
    switch (target) {
      case 'Kubernetes':
        return 'kubectl rollout undo deployment/copilot-plus-app';
      case 'Docker':
        return 'docker compose -f .copilotPlus/deploy/docker/docker-compose.yml down';
      default:
        return this.defaultApplyCommand(target);
    }
  }

  private async verifyPrerequisites(target: DeployTarget): Promise<{ ok: boolean; reason?: string }> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      return { ok: false, reason: 'no_workspace' };
    }
    const need = requiresCli(target);
    let dockerExit = 0;
    let kubectlExit = 0;
    let contextExit = 0;
    if (need === 'docker') {
      dockerExit = (await runBash('docker --version', root, 5000)).exit_code;
    }
    if (need === 'kubectl') {
      kubectlExit = (await runBash('kubectl version --client', root, 5000)).exit_code;
      contextExit = (await runBash('kubectl config current-context', root, 5000)).exit_code;
    }
    return evaluatePrerequisiteExit(target, dockerExit, kubectlExit, contextExit);
  }

  private async log(run: DeployRun, text: string): Promise<void> {
    if (!run.logPath) {
      return;
    }
    await fs.mkdir(path.dirname(run.logPath), { recursive: true });
    await fs.appendFile(run.logPath, text, 'utf8');
  }
}
