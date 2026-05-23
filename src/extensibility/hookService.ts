/** Lifecycle hooks — R-EXT-3 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { COPILOT_PLUS_HOME } from '../shared/constants';
import { runBash } from '../tools/bashRunner';
import { matchesCommandDenyList } from '../platform/configuration';

export type HookEventName =
  | 'stage.entered'
  | 'stage.exited'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'rollback.completed'
  | 'edit.applied'
  | 'edit.rejected';

export interface HookEntry {
  id: string;
  event: HookEventName;
  filter?: Record<string, unknown>;
  action: 'runCommand' | 'askAgent';
  command?: string;
  prompt?: string;
  target_agent?: string;
  enabled?: boolean;
  timeout?: number;
}

export interface HookLogEntry {
  hookId: string;
  event: HookEventName;
  ok: boolean;
  output?: string;
  error?: string;
  at: string;
}

export class HookService {
  private hooks: HookEntry[] = [];
  private log: HookLogEntry[] = [];
  private watcher: vscode.FileSystemWatcher | undefined;
  private firing = new Set<string>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  async initialize(): Promise<void> {
    await this.reload();
    const root = vscode.workspace.workspaceFolders?.[0];
    if (!root) {
      return;
    }
    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(path.join(root.uri.fsPath, COPILOT_PLUS_HOME)),
      'hooks.json'
    );
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.watcher.onDidChange(() => void this.reload());
    this.watcher.onDidCreate(() => void this.reload());
    this.watcher.onDidDelete(() => {
      this.hooks = [];
    });
    this.context.subscriptions.push(this.watcher);
  }

  getHooks(): HookEntry[] {
    return this.hooks;
  }

  getRecentLog(limit = 20): HookLogEntry[] {
    return this.log.slice(-limit);
  }

  async reload(): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      this.hooks = [];
      return;
    }
    const file = path.join(root, COPILOT_PLUS_HOME, 'hooks.json');
    try {
      const raw = await fs.readFile(file, 'utf8');
      const data = JSON.parse(raw) as { hooks?: HookEntry[] } | HookEntry[];
      this.hooks = Array.isArray(data) ? data : (data.hooks ?? []);
    } catch {
      this.hooks = [];
    }
  }

  async fire(event: HookEventName, payload: Record<string, unknown>): Promise<void> {
    const matches = this.hooks.filter((h) => h.enabled !== false && h.event === event && filterMatches(h.filter, payload));
    for (const hook of matches.slice(0, 100)) {
      await this.runHook(hook, event, payload);
    }
  }

  private async runHook(
    hook: HookEntry,
    event: HookEventName,
    payload: Record<string, unknown>
  ): Promise<void> {
    const key = `${hook.id}:${event}`;
    if (this.firing.has(key)) {
      return;
    }
    this.firing.add(key);
    const at = new Date().toISOString();
    try {
      if (hook.action === 'runCommand' && hook.command) {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) {
          return;
        }
        const deny = matchesCommandDenyList(
          hook.command,
          vscode.workspace.getConfiguration('copilotPlus').get<string[]>('workflow.commandDenyList') ?? []
        );
        if (deny) {
          this.pushLog({ hookId: hook.id, event, ok: false, error: 'command_denied', at });
          return;
        }
        const timeout = (hook.timeout ?? 60) * 1000;
        const result = await runBash(hook.command, root, timeout);
        this.pushLog({
          hookId: hook.id,
          event,
          ok: result.exit_code === 0,
          output: result.stdout || result.stderr,
          at,
        });
      } else {
        this.pushLog({
          hookId: hook.id,
          event,
          ok: true,
          output: `askAgent(${hook.target_agent ?? 'primary'}): ${hook.prompt ?? ''}`,
          at,
        });
      }
    } catch (err) {
      this.pushLog({
        hookId: hook.id,
        event,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        at,
      });
    } finally {
      this.firing.delete(key);
    }
  }

  private pushLog(entry: HookLogEntry): void {
    this.log.push(entry);
    if (this.log.length > 200) {
      this.log = this.log.slice(-200);
    }
  }
}

function filterMatches(filter: Record<string, unknown> | undefined, payload: Record<string, unknown>): boolean {
  if (!filter) {
    return true;
  }
  for (const [key, value] of Object.entries(filter)) {
    if (payload[key] !== value) {
      return false;
    }
  }
  return true;
}
