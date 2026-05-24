import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatTranscript } from '../../workflow/taskTranscript';

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
});
