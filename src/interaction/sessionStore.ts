/** Session persistence — R-INT-2.4 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { COPILOT_PLUS_HOME } from '../shared/constants';

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
}

export class SessionStore {
  private sessionId = `session-${Date.now()}`;

  private getRoot(): string | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return undefined;
    }
    return path.join(folder.uri.fsPath, COPILOT_PLUS_HOME, 'sessions', this.sessionId);
  }

  async appendUserMessage(text: string): Promise<void> {
    await this.append({ role: 'user', text, timestamp: new Date().toISOString() });
  }

  async append(message: SessionMessage): Promise<void> {
    const root = this.getRoot();
    if (!root) {
      return;
    }
    await fs.mkdir(root, { recursive: true });
    await fs.appendFile(path.join(root, 'messages.jsonl'), JSON.stringify(message) + '\n', 'utf8');
  }
}
