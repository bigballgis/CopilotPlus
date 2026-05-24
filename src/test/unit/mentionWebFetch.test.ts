import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWebTarget } from '../../context/mentionWebFetch.js';

describe('R-CTX-1 web mention', () => {
  it('normalizes bare domains to https URLs', () => {
    assert.equal(normalizeWebTarget('example.com/docs'), 'https://example.com/docs');
    assert.equal(normalizeWebTarget('https://example.com'), 'https://example.com');
  });

  it('rejects empty targets', () => {
    assert.equal(normalizeWebTarget('   '), undefined);
  });
});
