/** CI build execution — R-DEP-7 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { SubAgentRunner } from '../agents/subAgentRunner';
import type { BuildConfig } from './buildConfig';
import { CI_PIPELINE, validateTaskAgents } from './buildConfig';
import { CiSession } from './ciSession';
import { CiTranscript, CI_STARTUP_NOTICE, newCiRunId } from './ciTranscript';
import { DecisionResolver, DecisionUnresolvedError } from './decisionResolver';
import type { TaskNode } from '../workflow/taskDag';
import { TaskDagStore, tasksPath, manifestPath } from '../workflow/taskDagStore';
import * as fs from 'fs/promises';

const activeRuns = new Map<string, vscode.CancellationTokenSource>();

export async function runCiBuild(app: AppServices, config: BuildConfig, extensionUri: vscode.Uri): Promise<number> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    console.error(JSON.stringify({ type: 'error', reason: 'no_workspace' }));
    return 1;
  }

  const models = await app.platform.auth.selectCopilotModels();
  if (models.length === 0) {
    console.error(
      JSON.stringify({
        type: 'error',
        reason: 'copilot_entitlement_required',
        message: 'CI runner requires a signed-in GitHub Copilot session (vscode.lm).',
      })
    );
    return 1;
  }
  await app.platform.models.refresh();

  const store = new TaskDagStore();
  const dag = await store.load(config.buildId);
  if (!dag) {
    console.error(JSON.stringify({ type: 'error', reason: 'build_not_found', buildId: config.buildId }));
    return 1;
  }

  const agentErr = validateTaskAgents(dag.tasks.map((t) => t.agent));
  if (agentErr) {
    console.error(JSON.stringify({ type: 'error', reason: 'invalid_agent', message: agentErr }));
    return 1;
  }

  const runId = newCiRunId();
  const runDir = CiTranscript.runDirFor(root, runId);
  const transcript = new CiTranscript(runDir);
  await transcript.initialize();
  transcript.emit({ type: 'notice', message: CI_STARTUP_NOTICE });

  const session = new CiSession(
    runId,
    config.buildId,
    transcript,
    new DecisionResolver(config.decisions),
    config.maxToolCalls,
    config.maxBuildDurationSec
  );

  const cancelSource = new vscode.CancellationTokenSource();
  activeRuns.set(config.buildId, cancelSource);
  const timeout = setTimeout(() => cancelSource.cancel(), config.maxBuildDurationSec * 1000);

  app.enableCiSession(session);
  let exitCode = 0;

  try {
    transcript.emit({ type: 'status', message: `Starting CI build ${config.buildId}`, buildId: config.buildId });
    const runner = new SubAgentRunner(app, extensionUri);

    const tasks = store.markReadyStatuses(dag.tasks);
    const readyTasks = store.getReadyTasks(tasks);

    for (const task of readyTasks) {
      if (cancelSource.token.isCancellationRequested) {
        exitCode = 1;
        transcript.emit({ type: 'run.failed', runId, reason: 'cancelled' });
        break;
      }

      transcript.emit({
        type: 'task.started',
        buildId: config.buildId,
        taskId: task.id,
        agent: task.agent,
      });

      const result = await runCiTask(app, runner, task, config.buildId, cancelSource.token, transcript);
      transcript.emit({
        type: 'task.completed',
        buildId: config.buildId,
        taskId: task.id,
        ok: result.ok,
        reason: result.reason,
      });

      if (!result.ok) {
        exitCode = 1;
        transcript.emit({ type: 'run.failed', runId, reason: result.reason ?? 'task_failed' });
        break;
      }
    }

    if (exitCode === 0) {
      transcript.emit({ type: 'run.completed', ok: true, runId });
    }
  } catch (err) {
    exitCode = 1;
    const reason = err instanceof DecisionUnresolvedError ? err.prompt : err instanceof Error ? err.message : String(err);
    transcript.emit({ type: 'run.failed', runId, reason });
  } finally {
    clearTimeout(timeout);
    activeRuns.delete(config.buildId);
    app.disableCiSession();
    await transcript.writeMeta({
      buildId: config.buildId,
      configPath: config.configPath,
      runId,
      exitCode,
    });
    await transcript.flush();
  }

  return exitCode;
}

async function runCiTask(
  app: AppServices,
  runner: SubAgentRunner,
  task: TaskNode,
  buildId: string,
  token: vscode.CancellationToken,
  transcript: CiTranscript
): Promise<{ ok: boolean; reason?: string }> {
  if (task.agent === 'Deployer') {
    return runner.runRole('Deployer', task, buildId, token, (msg) =>
      transcript.emit({ type: 'status', message: msg, buildId, taskId: task.id })
    ).then((r) => ({ ok: r.ok, reason: r.reason }));
  }

  if (task.agent !== 'Coder') {
    return runner.runRole(task.agent, task, buildId, token, (msg) =>
      transcript.emit({ type: 'status', message: msg, buildId, taskId: task.id })
    ).then((r) => ({ ok: r.ok, reason: r.reason }));
  }

  let lastOk = true;
  for (const role of CI_PIPELINE) {
    transcript.emit({ type: 'status', message: `Running ${role}`, buildId, taskId: task.id });
    const stepTask: TaskNode = {
      ...task,
      description: `${task.description}\n\nCI step: ${role}`,
    };
    const result = await runner.runRole(role, stepTask, buildId, token, (msg) =>
      transcript.emit({ type: 'status', message: msg, buildId, taskId: task.id })
    );
    if (!result.ok) {
      return { ok: false, reason: result.reason ?? `${role}_failed` };
    }
    lastOk = result.ok;
  }
  return { ok: lastOk };
}

export async function ciBuildStatus(buildId: string): Promise<number> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    console.error(JSON.stringify({ type: 'error', reason: 'no_workspace' }));
    return 1;
  }

  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath(root, buildId), 'utf8'));
    const tasks = JSON.parse(await fs.readFile(tasksPath(root, buildId), 'utf8'));
    console.log(JSON.stringify({ buildId, manifest, tasks }));
    return 0;
  } catch {
    console.error(JSON.stringify({ type: 'error', reason: 'build_not_found', buildId }));
    return 1;
  }
}

export function ciBuildCancel(buildId: string): number {
  const source = activeRuns.get(buildId);
  if (!source) {
    console.error(JSON.stringify({ type: 'error', reason: 'not_running', buildId }));
    return 1;
  }
  source.cancel();
  activeRuns.delete(buildId);
  console.log(JSON.stringify({ type: 'cancelled', buildId }));
  return 0;
}

export async function runCiDeploy(app: AppServices, target: string): Promise<number> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    console.error(JSON.stringify({ type: 'error', reason: 'no_workspace' }));
    return 1;
  }

  const models = await app.platform.auth.selectCopilotModels();
  if (models.length === 0) {
    console.error(JSON.stringify({ type: 'error', reason: 'copilot_entitlement_required' }));
    return 1;
  }

  const cfg = app.deploy.getConfig();
  if (cfg.target !== target) {
    console.error(
      JSON.stringify({
        type: 'error',
        reason: 'target_mismatch',
        message: `Config target is ${cfg.target}, requested ${target}`,
      })
    );
    return 1;
  }

  const runId = newCiRunId();
  const transcript = new CiTranscript(CiTranscript.runDirFor(root, runId));
  await transcript.initialize();
  transcript.emit({ type: 'notice', message: CI_STARTUP_NOTICE });

  const session = new CiSession(
    runId,
    `deploy-${target}`,
    transcript,
    new DecisionResolver({ default: 'fail-on-decision', rules: [] }),
    80,
    3600
  );

  app.enableCiSession(session);
  try {
    transcript.emit({ type: 'status', message: `Deploy run for ${target}` });
    const result = await app.deployOrchestrator.applyManifest();
    if (!result.ok) {
      transcript.emit({ type: 'run.failed', runId, reason: result.reason ?? 'deploy_failed' });
      await transcript.flush();
      return 1;
    }
    transcript.emit({ type: 'run.completed', ok: true, runId });
    await transcript.flush();
    return 0;
  } catch (err) {
    transcript.emit({
      type: 'run.failed',
      runId,
      reason: err instanceof Error ? err.message : String(err),
    });
    await transcript.flush();
    return 1;
  } finally {
    app.disableCiSession();
  }
}
