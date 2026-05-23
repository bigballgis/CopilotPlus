import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSessionId,
  parseHttpJsonRpcBody,
  parseSseJsonRpcMessages,
} from '../../extensibility/mcpJsonRpc.js';

describe('R-EXT-2 MCP HTTP/SSE', () => {
  it('parses JSON HTTP responses', () => {
    const res = parseHttpJsonRpcBody({ jsonrpc: '2.0', id: 1, result: { tools: [{ name: 'query' }] } });
    assert.equal(res.id, 1);
    assert.deepEqual((res.result as { tools: { name: string }[] }).tools[0].name, 'query');
  });

  it('parses SSE data lines', () => {
    const messages = parseSseJsonRpcMessages(
      'event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"search"}]}}\n\n'
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].id, 2);
  });

  it('extracts session id header', () => {
    const headers = new Headers({ 'mcp-session-id': 'abc-123' });
    assert.equal(extractSessionId(headers), 'abc-123');
  });
});
