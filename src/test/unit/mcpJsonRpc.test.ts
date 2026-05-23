import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeMessage,
  McpMessageReader,
  parseToolCallResult,
  parseToolNames,
} from '../../extensibility/mcpJsonRpc.js';

describe('R-EXT-2 MCP JSON-RPC', () => {
  it('encodes Content-Length frames', () => {
    const frame = encodeMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    });
    const text = frame.toString('utf8');
    assert.match(text, /^Content-Length: \d+\r\n\r\n/);
    assert.match(text, /"method":"initialize"/);
  });

  it('reads framed responses', () => {
    const reader = new McpMessageReader();
    const body = JSON.stringify({ jsonrpc: '2.0', id: 2, result: { tools: [{ name: 'search' }] } });
    const chunk = Buffer.from(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    const msgs = reader.push(chunk);
    assert.equal(msgs.length, 1);
    assert.equal(parseToolNames(msgs[0].result).join(','), 'search');
  });

  it('parses tool call success and error', () => {
    const ok = parseToolCallResult({
      content: [{ type: 'text', text: 'done' }],
      isError: false,
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.data, 'done');
    }
    const fail = parseToolCallResult({
      content: [{ type: 'text', text: 'boom' }],
      isError: true,
    });
    assert.equal(fail.ok, false);
  });
});
