import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildToolInstructions,
  canonicalToolKey,
  parseFinalAnswer,
  parseToolCalls,
} from '../../agents/toolCallParser.js';

describe('R-AG-7 tool call parser', () => {
  it('parses tool_call blocks', () => {
    const text = `
Here is the plan.
\`\`\`tool_call
{"name":"read_file","arguments":{"path":"src/index.ts"}}
\`\`\`
`;
    const calls = parseToolCalls(text);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'read_file');
    assert.equal(calls[0].arguments.path, 'src/index.ts');
  });

  it('parses final answer block', () => {
    const text = '```final\nAll done.\n```';
    assert.equal(parseFinalAnswer(text), 'All done.');
  });

  it('dedupes by canonical key', () => {
    const a = { path: 'a.ts' };
    const b = { path: 'b.ts' };
    assert.notEqual(canonicalToolKey('grep', a), canonicalToolKey('grep', b));
    assert.equal(canonicalToolKey('grep', a), canonicalToolKey('grep', { path: 'a.ts' }));
  });

  it('includes tool ids in instructions', () => {
    const text = buildToolInstructions(['read_file', 'grep']);
    assert.match(text, /read_file/);
    assert.match(text, /tool_call/);
  });
});
