import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mcpToolId,
  parseMcpConfig,
  parseMcpToolId,
  serverAllowsAgent,
  serverAllowsTool,
} from '../../extensibility/mcpConfig.js';

describe('R-EXT-2 MCP config', () => {
  it('parses mcpServers map format', () => {
    const parsed = parseMcpConfig({
      mcpServers: {
        demo: { command: 'node', args: ['server.js'], enabled: true },
      },
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.config.servers.length, 1);
      assert.equal(parsed.config.servers[0].id, 'demo');
      assert.equal(parsed.config.servers[0].command, 'node');
    }
  });

  it('builds and parses mcp tool ids', () => {
    const id = mcpToolId('demo', 'query');
    assert.equal(id, 'mcp:demo:query');
    assert.deepEqual(parseMcpToolId(id), { serverId: 'demo', toolName: 'query' });
  });

  it('parses legacy_sse http transport for url servers', () => {
    const parsed = parseMcpConfig({
      servers: [{ id: 'remote', url: 'http://localhost:3000/sse', httpTransport: 'legacy_sse' }],
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.config.servers[0].httpTransport, 'legacy_sse');
    }
  });

  it('rejects http transport without url', () => {
    const parsed = parseMcpConfig({
      servers: [{ id: 'bad', command: 'node', httpTransport: 'legacy_sse' }],
    });
    assert.equal(parsed.ok, false);
  });

  it('respects allowlists', () => {
    const server = {
      id: 's',
      command: 'x',
      enabled: true,
      tool_allowlist: ['read'],
      agent_allowlist: ['Coder'],
    };
    assert.equal(serverAllowsTool(server, 'read'), true);
    assert.equal(serverAllowsTool(server, 'write'), false);
    assert.equal(serverAllowsAgent(server, 'Coder'), true);
    assert.equal(serverAllowsAgent(server, 'Tester'), false);
  });
});
