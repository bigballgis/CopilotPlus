import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rerankCandidates } from '../../context/retrievalRerank.js';

describe('R-CTX-3 reranker', () => {
  it('promotes candidates with higher lexical overlap', () => {
    const reranked = rerankCandidates(
      'authenticate login token',
      [
        { id: 'a', text: 'unrelated styles export', baseScore: 1.5 },
        { id: 'b', text: 'authenticate user login flow token validation', baseScore: 1.0 },
      ],
      30,
      2
    );
    assert.equal(reranked[0]?.id, 'b');
  });
});
