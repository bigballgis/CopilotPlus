import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSessionFromUrl,
  isLegacyEndpointEvent,
  parseLegacyEndpointFromSseEvent,
  parseLegacySseJsonRpcMessages,
  resolveLegacyPostUrl,
  splitSseEvents,
} from '../../extensibility/mcpLegacySse.js';

describe('R-EXT-2 MCP legacy GET/SSE', () => {
  it('splits buffered SSE events', () => {
    const first = splitSseEvents('event: endpoint\ndata: /message?sessionId=abc\n\n');
    assert.equal(first.events.length, 1);
    assert.equal(first.rest, '');

    const second = splitSseEvents(`${first.events[0]}\n\nevent: message\ndata: {"jsonrpc":"2.0","id":1,"result":{}}\n\n`);
    assert.equal(second.events.length, 2);
  });

  it('parses endpoint event with session id', () => {
    const block = 'event: endpoint\ndata: /message?sessionId=sess-42\n\n';
    assert.equal(isLegacyEndpointEvent(block), true);
    const endpoint = parseLegacyEndpointFromSseEvent(block);
    assert.ok(endpoint);
    assert.equal(endpoint.postUrl, '/message?sessionId=sess-42');
    assert.equal(endpoint.sessionId, 'sess-42');
    assert.equal(
      resolveLegacyPostUrl(endpoint.postUrl, 'http://localhost:3000/sse'),
      'http://localhost:3000/message?sessionId=sess-42'
    );
  });

  it('extracts session id from absolute post url', () => {
    assert.equal(
      extractSessionFromUrl('http://localhost:3000/message?session_id=xyz'),
      'xyz'
    );
  });

  it('parses JSON-RPC messages from legacy SSE blocks', () => {
    const messages = parseLegacySseJsonRpcMessages(
      'event: message\ndata: {"jsonrpc":"2.0","id":3,"result":{"tools":[{"name":"fetch"}]}}\n\n'
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].id, 3);
  });
});
