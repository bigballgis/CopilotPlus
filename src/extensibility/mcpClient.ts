/** MCP transport client interface — R-EXT-2 */

import type { McpServerConfig } from './mcpConfig';

export interface McpTransportClient {
  getTools(): string[];
  connect(config: McpServerConfig, cwd: string): Promise<void>;
  callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ ok: true; data: unknown } | { ok: false; reason: string }>;
  close(): Promise<void>;
}
