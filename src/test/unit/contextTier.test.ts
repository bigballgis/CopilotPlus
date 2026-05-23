import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveContextTier } from '../../context/contextTier.js';
import { cosineSimilarity } from '../../context/vectorMath.js';

describe('R-CTX-8 context tier', () => {
  it('classifies by maxInputTokens', () => {
    assert.equal(resolveContextTier(50_000, 'auto'), 'S');
    assert.equal(resolveContextTier(200_000, 'auto'), 'M');
    assert.equal(resolveContextTier(600_000, 'auto'), 'L');
  });

  it('honors override', () => {
    assert.equal(resolveContextTier(600_000, 's'), 'S');
  });
});

describe('R-CTX-5 cosine similarity', () => {
  it('scores identical vectors highest', () => {
    const a = [1, 0, 0];
    assert.ok(cosineSimilarity(a, a) > 0.99);
    assert.ok(cosineSimilarity(a, [0, 1, 0]) < 0.01);
  });
});
