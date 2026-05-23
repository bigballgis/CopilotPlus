import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hashEmbed } from '../../context/localEmbeddingRuntime.js';
import { parseLocalManifest } from '../../context/localEmbeddingManifest.js';

describe('R-CTX-5 Mode B local embedding', () => {
  it('hashEmbed produces normalized vectors', () => {
    const a = hashEmbed('hello world', 64);
    assert.equal(a.length, 64);
    const norm = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    assert.ok(Math.abs(norm - 1) < 0.001 || norm === 0);
  });

  it('hashEmbed is deterministic', () => {
    const a = hashEmbed('copilot plus retrieval', 128);
    const b = hashEmbed('copilot plus retrieval', 128);
    assert.deepEqual(a, b);
  });

  it('parses addon manifest defaults', () => {
    const m = parseLocalManifest({ runtime: 'hash', dimensions: 256 });
    assert.equal(m.runtime, 'hash');
    assert.equal(m.dimensions, 256);
  });
});
