/** Copilot Plus CLI entry — R-DEP-7 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { loadBuildConfig } from './buildConfig';
import { ciBuildCancel, ciBuildStatus, runCiBuild, runCiDeploy } from './ciBuildRunner';
import { CLI_USAGE_LINES, parseCliArgs } from './cliArgs';

export async function runCli(app: AppServices, args: string[], extensionUri: vscode.Uri): Promise<number> {
  const parsed = parseCliArgs(args);
  if (parsed.command.kind === 'usage') {
    printUsage();
    return parsed.exitCode;
  }

  const { command } = parsed;

  if (command.kind === 'build') {
    if (command.action === 'run') {
      const loaded = await loadBuildConfig(command.param);
      if (!loaded.ok) {
        console.error(JSON.stringify({ type: 'error', reason: loaded.error.reason }));
        return 1;
      }
      return runCiBuild(app, loaded.config, extensionUri);
    }
    if (command.action === 'status') {
      return ciBuildStatus(command.param);
    }
    if (command.action === 'cancel') {
      return ciBuildCancel(command.param);
    }
  }

  if (command.kind === 'deploy' && command.action === 'run') {
    return runCiDeploy(app, command.param);
  }

  printUsage();
  return 1;
}

function printUsage(): void {
  console.log(CLI_USAGE_LINES.join('\n'));
}

/** Output channel for IDE-visible CLI logs */
export function getCliOutputChannel(): vscode.OutputChannel {
  return vscode.window.createOutputChannel('Copilot Plus CLI');
}
