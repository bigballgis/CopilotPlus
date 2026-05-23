import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeAttachments, parseMentionTokens, parseSlashSkill } from '../../context/mentionTokens.js';

describe('R-CTX-1 Mentions', () => {
  it('parses inline mention tokens', () => {
    const parsed = parseMentionTokens('Review @file:src/app.ts and @doc:requirements/prd.md');
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0]?.kind, 'file');
    assert.equal(parsed[0]?.target, 'src/app.ts');
    assert.equal(parsed[1]?.kind, 'doc');
  });

  it('deduplicates merged attachments', () => {
    const merged = mergeAttachments(
      [{ kind: 'file', target: 'a.ts', label: 'a.ts' }],
      [
        { kind: 'file', target: 'a.ts', label: 'a.ts' },
        { kind: 'selection', target: 'b.ts', label: 'selection' },
      ]
    );
    assert.equal(merged.length, 2);
  });

  it('parses slash skill prefix', () => {
    const parsed = parseSlashSkill('/api-style Review the API layer');
    assert.equal(parsed.skillId, 'api-style');
    assert.equal(parsed.message, 'Review the API layer');
  });
});
