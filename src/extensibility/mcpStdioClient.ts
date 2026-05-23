/** MCP stdio transport client — R-EXT-2 */

import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import {
  encodeMessage,
  McpMessageReader,
  parseToolCallResult,
  parseToolNames,
  type JsonRpcRequest,
} from './mcpJsonRpc';
import type { McpServerConfig } from './mcpConfig';
import type { McpTransportClient } from './mcpClient';

const PROTOCOL_VERSION = '2024-11-05';
const CONNECT_TIMEOUT_MS = 5000;
const CLIENT_INFO = { name: 'copilot-plus', version: '0.1.0' };

export class McpStdioClient implements McpTransportClient {
  private proc: ChildProcessWithoutNullStreams | undefined;
  private reader = new McpMessageReader();
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private toolNames: string[] = [];

  getTools(): string[] {
    return [...this.toolNames];
  }

  async connect(config: McpServerConfig, cwd: string): Promise<void> {
    if (!config.command) {
      throw new Error('stdio_command_required');
    }
    await this.close();
    this.reader = new McpMessageReader();

    const env = { ...process.env, ...(config.env ?? {}) };
    this.proc = spawn(config.command, config.args ?? [], {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    this.proc.stdout.on('data', (chunk: Buffer) => this.onStdout(chunk));
    this.proc.stderr.on('data', (chunk: Buffer) => {
      console.warn(`[mcp:${config.id}]`, chunk.toString('utf8').trim());
    });
    this.proc.on('exit', (code) => {
      for (const [, p] of this.pending) {
        p.reject(new Error(`process_exited_${code ?? 'unknown'}`));
      }
      this.pending.clear();
    });

    await this.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO,
    });
    this.notify('notifications/initialized', {});
    const list = await this.request('tools/list', {});
    this.toolNames = parseToolNames(list);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false; reason: string }> {
    try {
      const result = await this.request('tools/call', { name, arguments: args });
      return parseToolCallResult(result);
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  async close(): Promise<void> {
    for (const [, p] of this.pending) {
      p.reject(new Error('client_closed'));
    }
    this.pending.clear();
    if (this.proc) {
      this.proc.kill();
      this.proc = undefined;
    }
    this.toolNames = [];
  }

  private onStdout(chunk: Buffer): void {
    const responses = this.reader.push(chunk);
    for (const msg of responses) {
      const pending = this.pending.get(msg.id);
      if (!pending) {
        continue;
      }
      this.pending.delete(msg.id);
      if (msg.error) {
        pending.reject(new Error(msg.error.message));
      } else {
        pending.resolve(msg.result);
      }
    }
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.write({ jsonrpc: '2.0', method, params });
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    const payload: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout:${method}`));
      }, CONNECT_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.write(payload);
    });
  }

  private write(payload: JsonRpcRequest | { jsonrpc: '2.0'; method: string; params?: Record<string, unknown> }): void {
    if (!this.proc?.stdin.writable) {
      throw new Error('stdin_not_writable');
    }
    this.proc.stdin.write(encodeMessage(payload));
  }
}
