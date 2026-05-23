import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bm25Search, buildBm25Index, reciprocalRankFusion } from '../../context/bm25.js';
import type { IndexChunk } from '../../context/types.js';

describe('R-CTX-2 BM25', () => {
  it('ranks matching chunks higher', () => {
    const chunks: IndexChunk[] = [
      { id: 'a', corpus: 'code', path: 'src/a.ts', text: 'function authenticate user login token' },
      { id: 'b', corpus: 'code', path: 'src/b.ts', text: 'export const styles = {}' },
    ];
    const index = buildBm25Index(chunks);
    const hits = bm25Search(index, 'authenticate login');
    assert.equal(hits[0]?.chunk.id, 'a');
  });
});

describe('R-CTX-6 RRF', () => {
  it('fuses ranked lists', () => {
    const fused = reciprocalRankFusion([
      [{ id: 'a' }, { id: 'b' }],
      [{ id: 'b' }, { id: 'c' }],
    ]);
    assert.ok((fused.get('b') ?? 0) > (fused.get('a') ?? 0));
    assert.ok((fused.get('b') ?? 0) > (fused.get('c') ?? 0));
  });
});
