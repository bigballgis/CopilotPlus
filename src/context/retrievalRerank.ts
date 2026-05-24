/** Lexical reranker proxy for hybrid retrieval — R-CTX-3.5 */

import { tokenize } from './tokenize';

export interface RerankCandidate {
  id: string;
  text: string;
  baseScore: number;
}

export interface RerankResult {
  id: string;
  score: number;
}

export function rerankCandidates(
  query: string,
  candidates: RerankCandidate[],
  topPool = 30,
  selectTop = 10
): RerankResult[] {
  if (!candidates.length) {
    return [];
  }
  const qTerms = new Set(tokenize(query));
  const pool = candidates.slice(0, topPool);
  const reranked = pool.map((candidate) => {
    const docTerms = new Set(tokenize(candidate.text));
    let overlap = 0;
    for (const term of qTerms) {
      if (docTerms.has(term)) {
        overlap++;
      }
    }
    const overlapScore = qTerms.size ? overlap / qTerms.size : 0;
    return {
      id: candidate.id,
      score: candidate.baseScore + overlapScore * 2,
    };
  });
  reranked.sort((a, b) => b.score - a.score);
  return reranked.slice(0, selectTop);
}
