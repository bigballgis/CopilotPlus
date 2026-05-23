/** Parse structured tool calls from model text — R-AG-7 */

export interface ParsedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

const TOOL_BLOCK = /```tool_call\s*\n([\s\S]*?)```/gi;
const FINAL_BLOCK = /```final\s*\n([\s\S]*?)```/i;

export function parseToolCalls(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  for (const match of text.matchAll(TOOL_BLOCK)) {
    const raw = match[1].trim();
    try {
      const parsed = JSON.parse(raw) as { name?: string; arguments?: Record<string, unknown> };
      if (parsed.name) {
        calls.push({ name: parsed.name, arguments: parsed.arguments ?? {} });
      }
    } catch {
      /* skip malformed block */
    }
  }
  return calls;
}

export function parseFinalAnswer(text: string): string | undefined {
  const match = text.match(FINAL_BLOCK);
  return match ? match[1].trim() : undefined;
}

export function buildToolInstructions(toolIds: string[]): string {
  const list = toolIds.map((id) => `- ${id}`).join('\n');
  return `
## Tool calling

Available tools:
${list}

To call a tool, emit one or more fenced blocks (read-only tools may appear together):

\`\`\`tool_call
{"name":"read_file","arguments":{"path":"src/example.ts"}}
\`\`\`

When you are done and need no more tools, respond with:

\`\`\`final
Your summary for the parent agent.
\`\`\`

Do not include \`\`\`final\`\`\` in the same message as \`\`\`tool_call\`\`\`.
`.trim();
}

export function canonicalToolKey(name: string, args: Record<string, unknown>): string {
  return `${name}:${JSON.stringify(args, Object.keys(args).sort())}`;
}
