/** MCP server registry and tool injection — R-EXT-2 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { COPILOT_PLUS_HOME } from '../shared/constants';
import {
  mcpToolId,
  parseMcpConfig,
  serverAllowsAgent,
  serverAllowsTool,
  type McpServerConfig,
} from './mcpConfig';
import { McpStdioClient } from './mcpStdioClient';

export type McpConnectionState = 'connected' | 'connecting' | 'disconnected' | 'error';

export interface McpServerStatus {
  config: McpServerConfig;
  state: McpConnectionState;
  lastError?: string;
  tools: string[];
  retryCount: number;
}

export class McpService {
  private servers: McpServerStatus[] = [];
  private clients = new Map<string, McpStdioClient>();
  private watcher: vscode.FileSystemWatcher | undefined;
  private retryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly context: vscode.ExtensionContext) {
    context.subscriptions.push({ dispose: () => void this.dispose() });
  }

  async initialize(): Promise<void> {
    await this.reload();
    const root = vscode.workspace.workspaceFolders?.[0];
    if (!root) {
      return;
    }
    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(path.join(root.uri.fsPath, COPILOT_PLUS_HOME)),
      'mcp.json'
    );
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const refresh = () => void this.reload();
    this.watcher.onDidChange(refresh);
    this.watcher.onDidCreate(refresh);
    this.context.subscriptions.push(this.watcher);
  }

  getServers(): McpServerStatus[] {
    return this.servers.map((s) => ({ ...s, tools: [...s.tools], config: { ...s.config } }));
  }

  getInjectedTools(role: string): string[] {
    const tools: string[] = [];
    for (const server of this.servers) {
      if (!server.config.enabled || server.state !== 'connected') {
        continue;
      }
      if (!serverAllowsAgent(server.config, role)) {
        continue;
      }
      for (const tool of server.tools) {
        if (serverAllowsTool(server.config, tool)) {
          tools.push(mcpToolId(server.config.id, tool));
        }
      }
    }
    return tools;
  }

  getResolvedInjectionSummary(role: string): Array<{ serverId: string; tools: string[] }> {
    return this.getServers()
      .filter((s) => s.config.enabled && serverAllowsAgent(s.config, role))
      .map((s) => ({
        serverId: s.config.id,
        tools: s.tools.filter((t) => serverAllowsTool(s.config, t)).map((t) => mcpToolId(s.config.id, t)),
      }));
  }

  async reconnect(serverId: string): Promise<void> {
    const server = this.servers.find((s) => s.config.id === serverId);
    if (!server) {
      return;
    }
    server.retryCount = 0;
    await this.connectServer(server);
  }

  async invokeTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{ ok: true; data: unknown } | { ok: false; reason: string }> {
    const server = this.servers.find((s) => s.config.id === serverId);
    if (!server?.config.enabled) {
      return { ok: false, reason: 'server_disabled' };
    }
    if (server.state !== 'connected') {
      return { ok: false, reason: 'server_not_connected' };
    }
    if (!serverAllowsTool(server.config, toolName)) {
      return { ok: false, reason: 'tool_not_allowed' };
    }
    const client = this.clients.get(serverId);
    if (!client) {
      return { ok: false, reason: 'client_missing' };
    }
    return client.callTool(toolName, args);
  }

  private async dispose(): Promise<void> {
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
    await Promise.all([...this.clients.values()].map((c) => c.close()));
    this.clients.clear();
  }

  private async reload(): Promise<void> {
    await this.dispose();
    this.retryTimers.clear();

    const root = vscode.workspace.workspaceFolders?.[0];
    if (!root) {
      this.servers = [];
      return;
    }

    const configPath = path.join(root.uri.fsPath, COPILOT_PLUS_HOME, 'mcp.json');
    let raw: unknown;
    try {
      raw = JSON.parse(await fs.readFile(configPath, 'utf8'));
    } catch {
      this.servers = [];
      return;
    }

    const parsed = parseMcpConfig(raw);
    if (!parsed.ok) {
      this.servers = [
        {
          config: {
            id: '(config)',
            enabled: false,
            tool_allowlist: ['*'],
            agent_allowlist: ['*'],
          },
          state: 'error',
          lastError: parsed.reason,
          tools: [],
          retryCount: 0,
        },
      ];
      return;
    }

    this.servers = parsed.config.servers.map((config) => ({
      config,
      state: 'disconnected' as McpConnectionState,
      tools: [],
      retryCount: 0,
    }));

    await Promise.all(
      this.servers.filter((s) => s.config.enabled).map((s) => this.connectServer(s))
    );
  }

  private async connectServer(server: McpServerStatus): Promise<void> {
    server.state = 'connecting';
    server.lastError = undefined;
    server.tools = [];

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      server.state = 'error';
      server.lastError = 'no_workspace';
      return;
    }

    const existing = this.clients.get(server.config.id);
    if (existing) {
      await existing.close();
      this.clients.delete(server.config.id);
    }

    try {
      if (server.config.url) {
        server.state = 'error';
        server.lastError = 'http_sse_transport_not_yet_supported';
        this.scheduleRetry(server);
        return;
      }
      if (!server.config.command) {
        server.state = 'error';
        server.lastError = 'missing_transport';
        return;
      }

      const client = new McpStdioClient();
      await client.connect(server.config, root);
      this.clients.set(server.config.id, client);
      server.state = 'connected';
      server.tools = client.getTools();
      server.retryCount = 0;
    } catch (err) {
      server.state = 'error';
      server.lastError = err instanceof Error ? err.message : String(err);
      this.scheduleRetry(server);
    }
  }

  private scheduleRetry(server: McpServerStatus): void {
    if (server.retryCount >= 3) {
      return;
    }
    server.retryCount += 1;
    const delayMs = Math.min(60_000, 5000 * 2 ** (server.retryCount - 1));
    const existing = this.retryTimers.get(server.config.id);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      void this.connectServer(server);
    }, delayMs);
    this.retryTimers.set(server.config.id, timer);
  }
}
