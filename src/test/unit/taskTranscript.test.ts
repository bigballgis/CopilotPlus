import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatTranscript, groupTranscriptIterations, parseTranscriptLines } from '../../workflow/taskTranscript';

describe('R-INT-4 task transcript', () => {
  it('formats jsonl transcript lines', () => {
    const raw = [
      JSON.stringify({ role: 'user', content: 'hello', ts: 1_700_000_000_000 }),
      JSON.stringify({ role: 'tool', toolName: 'read_file', content: '{"ok":true}', ts: 1_700_000_001_000 }),
    ].join('\n');
    const formatted = formatTranscript(raw);
    assert.match(formatted, /user/);
    assert.match(formatted, /tool:read_file/);
    assert.match(formatted, /hello/);
  });

  it('formats iteration markers for fork UI', () => {
    const raw = JSON.stringify({ role: 'iteration', content: 'Iteration 1 complete', iteration: 1 });
    const formatted = formatTranscript(raw);
    assert.match(formatted, /Agent iteration 1/);
  });

  it('groups legacy transcripts without iteration markers', () => {
    const lines = parseTranscriptLines(
      [
        JSON.stringify({ role: 'system', content: 'sys' }),
        JSON.stringify({ role: 'user', content: 'go' }),
        JSON.stringify({ role: 'assistant', content: 'a1' }),
        JSON.stringify({ role: 'tool', toolName: 'read_file', content: '{}' }),
        JSON.stringify({ role: 'assistant', content: 'a2' }),
      ].join('\n')
    );
    const groups = groupTranscriptIterations(lines);
    assert.equal(groups.length, 2);
  });
});
