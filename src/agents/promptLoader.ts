/** Load bundled or workspace agent prompts — R-AG-1.6, R-AG-4 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { COPILOT_PLUS_HOME } from '../shared/constants';

export async function loadAgentPrompt(
  extensionUri: vscode.Uri,
  role: string
): Promise<string> {
  const workspaceOverride = vscode.workspace.workspaceFolders?.[0];
  if (workspaceOverride) {
    const overridePath = path.join(
      workspaceOverride.uri.fsPath,
      COPILOT_PLUS_HOME,
      'agents',
      `${role}.md`
    );
    try {
      return await fs.readFile(overridePath, 'utf8');
    } catch {
      /* use bundled */
    }
  }

  const bundled = vscode.Uri.joinPath(extensionUri, 'resources', 'agents', `${role}.md`);
  try {
    const bytes = await vscode.workspace.fs.readFile(bundled);
    return Buffer.from(bytes).toString('utf8');
  } catch {
    return `You are the ${role} agent for Copilot Plus.`;
  }
}
