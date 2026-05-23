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

const SESSION_ID_KEY = 'copilotPlus.activeSessionId';

export class SessionStore {
  private messages: SessionMessage[] = [];
  private sessionId: string;
  private sessionTokens = 0;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.sessionId =
      context.workspaceState.get<string>(SESSION_ID_KEY) ?? `session-${Date.now()}`;
    void context.workspaceState.update(SESSION_ID_KEY, this.sessionId);
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getMessages(): SessionMessage[] {
    return [...this.messages];
  }

  getSessionTokens(): number {
    return this.sessionTokens;
  }

  addTokens(count: number): void {
    this.sessionTokens += count;
  }

  async load(): Promise<void> {
    const root = this.getRoot();
    if (!root) {
      return;
    }
    try {
      const raw = await fs.readFile(path.join(root, 'messages.jsonl'), 'utf8');
      this.messages = raw
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as SessionMessage);
    } catch {
      this.messages = [];
    }
  }

  async appendUserMessage(text: string): Promise<void> {
    await this.append({ role: 'user', text, timestamp: new Date().toISOString() });
  }

  async appendAssistantMessage(text: string): Promise<void> {
    await this.append({ role: 'assistant', text, timestamp: new Date().toISOString() });
  }

  async appendSystemMessage(text: string): Promise<void> {
    await this.append({ role: 'system', text, timestamp: new Date().toISOString() });
  }

  async persistSummary(text: string): Promise<string> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    const root = this.getRoot();
    if (!root || !folder) {
      return '(no-workspace)';
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = path.join(root, 'summaries');
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${ts}.md`);
    await fs.writeFile(file, text, 'utf8');
    return path.relative(folder.uri.fsPath, file).replace(/\\/g, '/');
  }

  async append(message: SessionMessage): Promise<void> {
    this.messages.push(message);
    const root = this.getRoot();
    if (!root) {
      return;
    }
    await fs.mkdir(root, { recursive: true });
    await fs.appendFile(path.join(root, 'messages.jsonl'), JSON.stringify(message) + '\n', 'utf8');
  }

  async startNewSession(): Promise<void> {
    this.sessionId = `session-${Date.now()}`;
    this.messages = [];
    this.sessionTokens = 0;
    await this.context.workspaceState.update(SESSION_ID_KEY, this.sessionId);
  }

  private getRoot(): string | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return undefined;
    }
    return path.join(folder.uri.fsPath, COPILOT_PLUS_HOME, 'sessions', this.sessionId);
  }
}
