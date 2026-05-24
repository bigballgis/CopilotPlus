import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bm25Search, buildBm25Index, reciprocalRankFusion } from '../../context/bm25.js';
import { UnifiedRetrieval } from '../../context/unifiedRetrieval.js';
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

  it('uses k=60 by default', () => {
    const fused = reciprocalRankFusion([[{ id: 'a' }]], 60);
    assert.equal(fused.get('a'), 1 / 61);
  });
});

describe('R-CTX-6 unified retrieval', () => {
  it('applies 6 code / 4 doc quotas', () => {
    const retrieval = new UnifiedRetrieval();
    const codeChunks: IndexChunk[] = Array.from({ length: 8 }, (_, i) => ({
      id: `code-${i}`,
      corpus: 'code',
      path: `src/f${i}.ts`,
      text: `authenticate login token handler ${i}`,
    }));
    const docChunks: IndexChunk[] = Array.from({ length: 8 }, (_, i) => ({
      id: `doc-${i}`,
      corpus: 'doc',
      path: `.copilotPlus/docs/d${i}.md`,
      heading: 'Auth',
      headingPath: ['Auth'],
      text: `design authenticate login documentation ${i}`,
      linkTargets: [],
    }));
    retrieval.setCodeChunks(codeChunks);
    retrieval.setDocChunks(docChunks);
    const response = retrieval.search({ query: 'authenticate login', topK: 10 });
    assert.equal(response.results.filter((r) => r.kind === 'code').length, 6);
    assert.equal(response.results.filter((r) => r.kind === 'doc').length, 4);
  });

  it('includes heading path and link targets on doc hits', () => {
    const retrieval = new UnifiedRetrieval();
    retrieval.setDocChunks([
      {
        id: 'doc-1',
        corpus: 'doc',
        path: '.copilotPlus/docs/auth.md',
        heading: 'Login',
        headingPath: ['System', 'Login'],
        text: 'authenticate login design',
        linkTargets: ['.copilotPlus/docs/system.md'],
      },
    ]);
    const response = retrieval.search({ query: 'authenticate login', topK: 5 });
    const hit = response.results.find((r) => r.kind === 'doc');
    assert.deepEqual(hit?.headingPath, ['System', 'Login']);
    assert.deepEqual(hit?.linkTargets, ['.copilotPlus/docs/system.md']);
  });

  it('skips doc chunks when includeDocChunks is false', () => {
    const retrieval = new UnifiedRetrieval();
    retrieval.setCodeChunks([
      {
        id: 'code-1',
        corpus: 'code',
        path: 'src/auth.ts',
        text: 'authenticate login handler',
      },
    ]);
    retrieval.setDocChunks([
      {
        id: 'doc-1',
        corpus: 'doc',
        path: '.copilotPlus/docs/auth.md',
        heading: 'Auth',
        text: 'authenticate login design doc',
      },
    ]);
    const response = retrieval.search({
      query: 'authenticate login',
      topK: 5,
      includeDocChunks: false,
    });
    assert.ok(response.results.every((r) => r.kind === 'code'));
    assert.equal(response.results.length, 1);
  });
});
