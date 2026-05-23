/** MCP legacy GET/SSE + POST message transport — R-EXT-2 */

import {
  parseToolCallResult,
  parseToolNames,
  unwrapJsonRpcResult,
  type JsonRpcNotification,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from './mcpJsonRpc';
import type { McpServerConfig } from './mcpConfig';
import type { McpTransportClient } from './mcpClient';
import {
  parseLegacyEndpointFromSseEvent,
  parseLegacySseJsonRpcMessages,
  resolveLegacyPostUrl,
  splitSseEvents,
} from './mcpLegacySse';

const PROTOCOL_VERSION = '2024-11-05';
const CONNECT_TIMEOUT_MS = 5000;
const REQUEST_TIMEOUT_MS = 30_000;
const CLIENT_INFO = { name: 'copilot-plus', version: '0.1.0' };

interface PendingRequest {
  resolve: (response: JsonRpcResponse) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class McpLegacySseClient implements McpTransportClient {
  private baseUrl = '';
  private postUrl = '';
  private sessionId: string | undefined;
  private nextId = 1;
  private toolNames: string[] = [];
  private streamAbort: AbortController | undefined;
  private pending = new Map<number, PendingRequest>();
  private endpointResolver: ((endpoint: { postUrl: string; sessionId?: string }) => void) | undefined;
  private endpointRejecter: ((err: Error) => void) | undefined;

  getTools(): string[] {
    return [...this.toolNames];
  }

  async connect(config: McpServerConfig, _cwd: string): Promise<void> {
    if (!config.url) {
      throw new Error('http_url_required');
    }
    await this.close();
    this.baseUrl = config.url;
    this.nextId = 1;

    const endpointPromise = new Promise<{ postUrl: string; sessionId?: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('legacy_sse_endpoint_timeout')), CONNECT_TIMEOUT_MS);
      this.endpointResolver = (endpoint) => {
        clearTimeout(timer);
        resolve(endpoint);
      };
      this.endpointRejecter = (err) => {
        clearTimeout(timer);
        reject(err);
      };
    });

    void this.openSseStream(config.url);
    const endpoint = await endpointPromise;
    this.postUrl = endpoint.postUrl;
    this.sessionId = endpoint.sessionId;

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
    this.streamAbort?.abort();
    this.streamAbort = undefined;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('client_closed'));
    }
    this.pending.clear();
    this.endpointResolver = undefined;
    this.endpointRejecter?.(new Error('client_closed'));
    this.endpointRejecter = undefined;
    this.postUrl = '';
    this.sessionId = undefined;
    this.toolNames = [];
  }

  private async openSseStream(url: string): Promise<void> {
    this.streamAbort = new AbortController();
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'text/event-stream' },
        signal: this.streamAbort.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`legacy_sse_open_${res.status}`);
      }
      void this.pumpSseStream(res.body);
    } catch (err) {
      this.endpointRejecter?.(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  private async pumpSseStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = splitSseEvents(buffer);
        buffer = rest;
        for (const event of events) {
          this.handleSseEvent(event);
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        this.failAllPending(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      reader.releaseLock();
    }
  }

  private handleSseEvent(eventBlock: string): void {
    const endpoint = parseLegacyEndpointFromSseEvent(eventBlock);
    if (endpoint && this.endpointResolver) {
      const postUrl = resolveLegacyPostUrl(endpoint.postUrl, this.baseUrl);
      const sessionId = endpoint.sessionId ?? extractSessionFromEndpoint(postUrl);
      this.endpointResolver({ postUrl, sessionId });
      this.endpointResolver = undefined;
      this.endpointRejecter = undefined;
      return;
    }

    for (const message of parseLegacySseJsonRpcMessages(eventBlock)) {
      this.resolvePending(message);
    }
  }

  private resolvePending(message: JsonRpcResponse): void {
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message));
      return;
    }
    pending.resolve(message);
  }

  private failAllPending(err: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pending.clear();
  }

  private async notify(method: string, params: Record<string, unknown>): Promise<void> {
    const payload: JsonRpcNotification = { jsonrpc: '2.0', method, params };
    await this.postMessage(payload);
  }

  private async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    const payload: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    const response = await this.postAndWait(payload);
    return unwrapJsonRpcResult(response);
  }

  private postAndWait(payload: JsonRpcRequest): Promise<JsonRpcResponse> {
    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(payload.id);
        reject(new Error('legacy_sse_request_timeout'));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(payload.id, { resolve, reject, timer });
      void this.postMessage(payload).catch((err) => {
        clearTimeout(timer);
        this.pending.delete(payload.id);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  private async postMessage(payload: JsonRpcRequest | JsonRpcNotification): Promise<void> {
    if (!this.postUrl) {
      throw new Error('legacy_sse_post_url_missing');
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
    try {
      const res = await fetch(this.postUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`http_${res.status}`);
      }

      const contentType = res.headers.get('content-type') ?? '';
      const bodyText = await res.text();
      if (contentType.includes('text/event-stream') && bodyText.trim()) {
        for (const message of parseLegacySseJsonRpcMessages(bodyText)) {
          this.resolvePending(message);
        }
        return;
      }
      if (bodyText.trim() && 'id' in payload) {
        const parsed = JSON.parse(bodyText) as JsonRpcResponse;
        if (typeof parsed.id === 'number') {
          this.resolvePending(parsed);
        }
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

function extractSessionFromEndpoint(postUrl: string): string | undefined {
  try {
    const parsed = new URL(postUrl);
    return parsed.searchParams.get('sessionId') ?? parsed.searchParams.get('session_id') ?? undefined;
  } catch {
    return undefined;
  }
}
