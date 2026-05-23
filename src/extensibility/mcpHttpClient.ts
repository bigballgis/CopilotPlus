/** MCP HTTP/SSE transport client — R-EXT-2 */

import {
  extractSessionId,
  parseHttpJsonRpcBody,
  parseSseJsonRpcMessages,
  parseToolCallResult,
  parseToolNames,
  unwrapJsonRpcResult,
  type JsonRpcNotification,
  type JsonRpcRequest,
} from './mcpJsonRpc';
import type { McpServerConfig } from './mcpConfig';
import type { McpTransportClient } from './mcpClient';

const PROTOCOL_VERSION = '2024-11-05';
const CONNECT_TIMEOUT_MS = 5000;
const CLIENT_INFO = { name: 'copilot-plus', version: '0.1.0' };

export class McpHttpClient implements McpTransportClient {
  private url = '';
  private sessionId: string | undefined;
  private nextId = 1;
  private toolNames: string[] = [];
  private abort: AbortController | undefined;

  getTools(): string[] {
    return [...this.toolNames];
  }

  async connect(config: McpServerConfig, _cwd: string): Promise<void> {
    if (!config.url) {
      throw new Error('http_url_required');
    }
    await this.close();
    this.url = config.url;
    this.abort = new AbortController();
    this.nextId = 1;

    await this.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO,
    });
    await this.notify('notifications/initialized', {});
    const list = await this.request('tools/list', {});
    this.toolNames = parseToolNames(list);
  }

  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ ok: true; data: unknown } | { ok: false; reason: string }> {
    try {
      const result = await this.request('tools/call', { name, arguments: args });
      return parseToolCallResult(result);
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  async close(): Promise<void> {
    this.abort?.abort();
    this.abort = undefined;
    this.sessionId = undefined;
    this.toolNames = [];
  }

  private async notify(method: string, params: Record<string, unknown>): Promise<void> {
    const payload: JsonRpcNotification = { jsonrpc: '2.0', method, params };
    await this.post(payload);
  }

  private async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    const payload: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    const response = await this.post(payload);
    return unwrapJsonRpcResult(response);
  }

  private async post(payload: JsonRpcRequest | JsonRpcNotification): Promise<import('./mcpJsonRpc').JsonRpcResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      };
      if (this.sessionId) {
        headers['Mcp-Session-Id'] = this.sessionId;
      }

      const res = await fetch(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`http_${res.status}`);
      }

      const session = extractSessionId(res.headers);
      if (session) {
        this.sessionId = session;
      }

      const contentType = res.headers.get('content-type') ?? '';
      const bodyText = await res.text();
      if (contentType.includes('text/event-stream')) {
        const messages = parseSseJsonRpcMessages(bodyText);
        const match =
          'id' in payload
            ? messages.find((m) => m.id === (payload as JsonRpcRequest).id)
            : messages.at(-1);
        if (!match) {
          throw new Error('sse_response_missing');
        }
        return match;
      }

      if (!bodyText.trim()) {
        return { jsonrpc: '2.0', id: 'id' in payload ? payload.id : 0, result: {} };
      }

      return parseHttpJsonRpcBody(JSON.parse(bodyText));
    } finally {
      clearTimeout(timer);
    }
  }
}
