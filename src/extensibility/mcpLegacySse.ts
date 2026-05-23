/** MCP legacy HTTP+SSE helpers — R-EXT-2 */

import type { JsonRpcResponse } from './mcpJsonRpc';
import { parseSseJsonRpcMessages } from './mcpJsonRpc';

export interface LegacySseEndpoint {
  postUrl: string;
  sessionId?: string;
}

/** Split an SSE byte/text buffer into complete event blocks (separated by blank line). */
export function splitSseEvents(buffer: string): { events: string[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  const rest = parts.pop() ?? '';
  return { events: parts.filter((p) => p.trim().length > 0), rest };
}

export function parseLegacyEndpointFromSseEvent(eventBlock: string): LegacySseEndpoint | undefined {
  const lines = eventBlock.split(/\r?\n/);
  let eventType = 'message';
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }
  if (eventType !== 'endpoint') {
    return undefined;
  }
  const data = dataLines.join('\n').trim();
  if (!data) {
    return undefined;
  }
  return { postUrl: data, sessionId: extractSessionFromUrl(data) };
}

export function resolveLegacyPostUrl(endpointData: string, baseUrl: string): string {
  try {
    return new URL(endpointData, baseUrl).toString();
  } catch {
    return endpointData;
  }
}

export function extractSessionFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url, 'http://localhost');
    return parsed.searchParams.get('sessionId') ?? parsed.searchParams.get('session_id') ?? undefined;
  } catch {
    return undefined;
  }
}

export function parseLegacySseJsonRpcMessages(eventBlock: string): JsonRpcResponse[] {
  return parseSseJsonRpcMessages(eventBlock);
}

export function isLegacyEndpointEvent(eventBlock: string): boolean {
  return parseLegacyEndpointFromSseEvent(eventBlock) !== undefined;
}
