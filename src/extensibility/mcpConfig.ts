/** MCP configuration parsing — R-EXT-2 */

export type McpHttpTransport = 'streamable' | 'legacy_sse';

export interface McpServerConfig {
  id: string;
  command?: string;
  url?: string;
  /** HTTP transport when `url` is set. Default: streamable POST+SSE body. */
  httpTransport?: McpHttpTransport;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
  tool_allowlist: string[];
  agent_allowlist: string[];
}

export interface McpConfigFile {
  servers: McpServerConfig[];
}

const MAX_SERVERS = 50;

export function parseMcpConfig(raw: unknown): { ok: true; config: McpConfigFile } | { ok: false; reason: string } {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, reason: 'invalid_root' };
  }

  const servers: McpServerConfig[] = [];

  if ('servers' in raw && Array.isArray((raw as { servers: unknown }).servers)) {
    for (const entry of (raw as { servers: unknown[] }).servers) {
      const parsed = parseServerEntry(entry);
      if (!parsed.ok) {
        return parsed;
      }
      servers.push(parsed.server);
    }
  } else if ('mcpServers' in raw && typeof (raw as { mcpServers: unknown }).mcpServers === 'object') {
    const map = (raw as { mcpServers: Record<string, unknown> }).mcpServers;
    for (const [key, entry] of Object.entries(map)) {
      const withId =
        typeof entry === 'object' && entry !== null
          ? { ...(entry as Record<string, unknown>), id: (entry as { id?: string }).id ?? key }
          : entry;
      const parsed = parseServerEntry(withId);
      if (!parsed.ok) {
        return parsed;
      }
      servers.push(parsed.server);
    }
  } else {
    return { ok: false, reason: 'missing_servers' };
  }

  if (servers.length > MAX_SERVERS) {
    return { ok: false, reason: 'too_many_servers' };
  }

  const ids = new Set<string>();
  for (const server of servers) {
    if (ids.has(server.id)) {
      return { ok: false, reason: `duplicate_id:${server.id}` };
    }
    ids.add(server.id);
  }

  return { ok: true, config: { servers } };
}

function parseServerEntry(
  entry: unknown
): { ok: true; server: McpServerConfig } | { ok: false; reason: string } {
  if (typeof entry !== 'object' || entry === null) {
    return { ok: false, reason: 'invalid_server_entry' };
  }
  const obj = entry as Record<string, unknown>;
  const id = typeof obj.id === 'string' ? obj.id.trim() : '';
  if (!id) {
    return { ok: false, reason: 'missing_id' };
  }
  const command = typeof obj.command === 'string' ? obj.command : undefined;
  const url = typeof obj.url === 'string' ? obj.url : undefined;
  if (!command && !url) {
    return { ok: false, reason: `missing_transport:${id}` };
  }
  if (command && url) {
    return { ok: false, reason: `ambiguous_transport:${id}` };
  }

  const httpTransport = parseHttpTransport(obj.httpTransport);
  if (httpTransport === 'invalid') {
    return { ok: false, reason: `invalid_http_transport:${id}` };
  }
  if (httpTransport && !url) {
    return { ok: false, reason: `http_transport_without_url:${id}` };
  }

  return {
    ok: true,
    server: {
      id,
      command,
      url,
      httpTransport: httpTransport ?? undefined,
      args: Array.isArray(obj.args) ? obj.args.map(String) : undefined,
      env:
        typeof obj.env === 'object' && obj.env !== null
          ? Object.fromEntries(
              Object.entries(obj.env as Record<string, unknown>).map(([k, v]) => [k, String(v)])
            )
          : undefined,
      enabled: obj.enabled !== false,
      tool_allowlist: normalizeAllowlist(obj.tool_allowlist),
      agent_allowlist: normalizeAllowlist(obj.agent_allowlist),
    },
  };
}

function parseHttpTransport(value: unknown): McpHttpTransport | undefined | 'invalid' {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    return 'invalid';
  }
  const normalized = value.trim().toLowerCase().replace(/-/g, '_');
  if (normalized === 'streamable' || normalized === 'streamable_http' || normalized === 'http') {
    return 'streamable';
  }
  if (normalized === 'legacy_sse' || normalized === 'legacy' || normalized === 'sse') {
    return 'legacy_sse';
  }
  return 'invalid';
}

function normalizeAllowlist(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return ['*'];
  }
  return value.map(String);
}

export function mcpToolId(serverId: string, toolName: string): string {
  return `mcp:${serverId}:${toolName}`;
}

export function parseMcpToolId(toolId: string): { serverId: string; toolName: string } | undefined {
  if (!toolId.startsWith('mcp:')) {
    return undefined;
  }
  const parts = toolId.split(':');
  if (parts.length < 3) {
    return undefined;
  }
  const serverId = parts[1];
  const toolName = parts.slice(2).join(':');
  if (!serverId || !toolName) {
    return undefined;
  }
  return { serverId, toolName };
}

export function serverAllowsTool(server: McpServerConfig, toolName: string): boolean {
  if (server.tool_allowlist.includes('*')) {
    return true;
  }
  return server.tool_allowlist.includes(toolName);
}

export function serverAllowsAgent(server: McpServerConfig, role: string): boolean {
  if (server.agent_allowlist.includes('*')) {
    return true;
  }
  return server.agent_allowlist.includes(role);
}
