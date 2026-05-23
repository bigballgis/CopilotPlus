/** MCP JSON-RPC stdio framing — R-EXT-2 */

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class McpMessageReader {
  private chunks: Buffer[] = [];

  push(chunk: Buffer): JsonRpcResponse[] {
    this.chunks.push(chunk);
    const combined = Buffer.concat(this.chunks);
    const messages: JsonRpcResponse[] = [];
    let buffer = combined;
    while (true) {
      const parsed = tryReadFrame(buffer);
      if (!parsed) {
        this.chunks = buffer.length ? [buffer] : [];
        break;
      }
      buffer = Buffer.from(parsed.rest);
      if (parsed.message && typeof parsed.message === 'object' && 'id' in parsed.message) {
        messages.push(parsed.message as JsonRpcResponse);
      }
    }
    return messages;
  }
}

export function encodeMessage(payload: JsonRpcRequest | JsonRpcNotification): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = `Content-Length: ${body.length}\r\n\r\n`;
  return Buffer.concat([Buffer.from(header, 'utf8'), body]);
}

function tryReadFrame(
  buffer: Buffer
): { message: unknown; rest: Buffer } | undefined {
  const headerEnd = buffer.indexOf('\r\n\r\n');
  if (headerEnd < 0) {
    return undefined;
  }
  const headerText = buffer.slice(0, headerEnd).toString('utf8');
  const match = /Content-Length:\s*(\d+)/i.exec(headerText);
  if (!match) {
    return undefined;
  }
  const length = Number.parseInt(match[1], 10);
  const bodyStart = headerEnd + 4;
  if (buffer.length < bodyStart + length) {
    return undefined;
  }
  const body = buffer.slice(bodyStart, bodyStart + length).toString('utf8');
  const rest = buffer.slice(bodyStart + length);
  try {
    return { message: JSON.parse(body), rest };
  } catch {
    return { message: undefined, rest };
  }
}

export function parseToolNames(listResult: unknown): string[] {
  if (typeof listResult !== 'object' || listResult === null) {
    return [];
  }
  const tools = (listResult as { tools?: unknown }).tools;
  if (!Array.isArray(tools)) {
    return [];
  }
  return tools
    .map((t) => (typeof t === 'object' && t !== null ? String((t as { name?: string }).name ?? '') : ''))
    .filter(Boolean);
}

export function parseToolCallResult(result: unknown): { ok: true; data: unknown } | { ok: false; reason: string } {
  if (typeof result !== 'object' || result === null) {
    return { ok: false, reason: 'invalid_tool_result' };
  }
  const obj = result as { isError?: boolean; content?: unknown };
  if (obj.isError) {
    const text = extractTextContent(obj.content);
    return { ok: false, reason: text || 'tool_error' };
  }
  return { ok: true, data: extractTextContent(obj.content) || obj };
}

function extractTextContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((c) =>
      typeof c === 'object' && c !== null && (c as { type?: string }).type === 'text'
        ? String((c as { text?: string }).text ?? '')
        : JSON.stringify(c)
    )
    .join('\n');
}

/** Parse JSON-RPC response body from HTTP (application/json). */
export function parseHttpJsonRpcBody(raw: unknown): JsonRpcResponse {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('invalid_http_json');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.error && typeof obj.error === 'object') {
    const err = obj.error as { message?: string };
    throw new Error(String(err.message ?? 'jsonrpc_error'));
  }
  if ('result' in obj) {
    return {
      jsonrpc: '2.0',
      id: typeof obj.id === 'number' ? obj.id : 0,
      result: obj.result,
    };
  }
  throw new Error('missing_jsonrpc_result');
}

/** Parse SSE `data:` lines into JSON-RPC responses. */
export function parseSseJsonRpcMessages(text: string): JsonRpcResponse[] {
  const out: JsonRpcResponse[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('data:')) {
      continue;
    }
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') {
      continue;
    }
    try {
      const msg = JSON.parse(payload) as Record<string, unknown>;
      if (typeof msg.id === 'number') {
        if (msg.error) {
          out.push({
            jsonrpc: '2.0',
            id: msg.id,
            error: msg.error as JsonRpcResponse['error'],
          });
        } else {
          out.push({ jsonrpc: '2.0', id: msg.id, result: msg.result });
        }
      }
    } catch {
      // ignore malformed SSE data lines
    }
  }
  return out;
}

export function extractSessionId(headers: Headers): string | undefined {
  return headers.get('mcp-session-id') ?? headers.get('Mcp-Session-Id') ?? undefined;
}

export function unwrapJsonRpcResult(response: JsonRpcResponse): unknown {
  if (response.error) {
    throw new Error(response.error.message);
  }
  return response.result;
}
