/** Copilot Plus CLI entry — R-DEP-7 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { loadBuildConfig } from './buildConfig';
import { ciBuildCancel, ciBuildStatus, runCiBuild, runCiDeploy } from './ciBuildRunner';

export async function runCli(app: AppServices, args: string[], extensionUri: vscode.Uri): Promise<number> {
  if (args.length === 0) {
    printUsage();
    return 1;
  }

  const [domain, action, param] = args;

  if (domain === 'build') {
    if (action === 'run' && param) {
      const loaded = await loadBuildConfig(param);
      if (!loaded.ok) {
        console.error(JSON.stringify({ type: 'error', reason: loaded.error.reason }));
        return 1;
      }
      return runCiBuild(app, loaded.config, extensionUri);
    }
    if (action === 'status' && param) {
      return ciBuildStatus(param);
    }
    if (action === 'cancel' && param) {
      return ciBuildCancel(param);
    }
  }

  if (domain === 'deploy' && action === 'run' && param) {
    return runCiDeploy(app, param);
  }

  printUsage();
  return 1;
}

function printUsage(): void {
  console.log(
    [
      'copilot-plus CLI (invoke via: Copilot Plus: CLI or copilotPlus.cli command)',
      '  build run <build-config.json>',
      '  build status <build-id>',
      '  build cancel <build-id>',
      '  deploy run <Local|Docker|Kubernetes>',
    ].join('\n')
  );
}

/** Output channel for IDE-visible CLI logs */
export function getCliOutputChannel(): vscode.OutputChannel {
  return vscode.window.createOutputChannel('Copilot Plus CLI');
}
