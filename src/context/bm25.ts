/** BM25 sparse scoring — R-CTX-2, R-CTX-3 */

import { termFrequency, tokenize } from './tokenize';
import type { IndexChunk } from './types';

const K1 = 1.2;
const B = 0.75;

export interface Bm25Index {
  chunks: IndexChunk[];
  avgLen: number;
  docFreq: Map<string, number>;
}

export function buildBm25Index(chunks: IndexChunk[]): Bm25Index {
  const docFreq = new Map<string, number>();
  let totalLen = 0;
  for (const chunk of chunks) {
    const terms = new Set(tokenize(chunk.text));
    totalLen += terms.size;
    for (const term of terms) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }
  return {
    chunks,
    avgLen: chunks.length ? totalLen / chunks.length : 0,
    docFreq,
  };
}

export function bm25Search(index: Bm25Index, query: string, limit = 100): Array<{ chunk: IndexChunk; score: number }> {
  const qTerms = tokenize(query);
  if (!qTerms.length || !index.chunks.length) {
    return [];
  }
  const N = index.chunks.length;
  const scores: Array<{ chunk: IndexChunk; score: number }> = [];

  for (const chunk of index.chunks) {
    const tf = termFrequency(tokenize(chunk.text));
    const docLen = tf.size || 1;
    let score = 0;
    for (const term of qTerms) {
      const freq = tf.get(term) ?? 0;
      if (freq === 0) {
        continue;
      }
      const df = index.docFreq.get(term) ?? 0;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      const norm =
        (freq * (K1 + 1)) / (freq + K1 * (1 - B + (B * docLen) / (index.avgLen || 1)));
      score += idf * norm;
    }
    if (score > 0) {
      scores.push({ chunk, score });
    }
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, limit);
}

export function reciprocalRankFusion(
  lists: Array<Array<{ id: string; score?: number }>>,
  k = 60
): Map<string, number> {
  const fused = new Map<string, number>();
  for (const list of lists) {
    list.forEach((item, rank) => {
      fused.set(item.id, (fused.get(item.id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return fused;
}
