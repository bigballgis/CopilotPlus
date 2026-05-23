/** Unified hybrid retrieval — R-CTX-3, R-CTX-6, R-TOOL-6 */

import type { ContextTier } from '../shared/types';
import { bm25Search, buildBm25Index, reciprocalRankFusion, type Bm25Index } from './bm25';
import type { IndexChunk, SearchHit } from './types';
import { resolveScope } from '../docs/scopeResolution';
import type { DocEntry } from '../docs/documentTreeService';
import { cosineSimilarity } from './vectorMath';
import type { ResolvedEmbeddingMode } from './embeddingResolver';

export type SearchThoroughness = 'quick' | 'medium' | 'thorough';

export interface CodeSearchOptions {
  query: string;
  scope?: string;
  thoroughness?: SearchThoroughness;
  topK?: number;
  tier?: ContextTier;
  docEntries?: DocEntry[];
  queryEmbedding?: number[];
}

export interface CodeSearchResponse {
  results: SearchHit[];
  truncated: boolean;
  mode: string;
}

export class UnifiedRetrieval {
  private codeIndex: Bm25Index = buildBm25Index([]);
  private docIndex: Bm25Index = buildBm25Index([]);
  private codeChunks: IndexChunk[] = [];
  private docChunks: IndexChunk[] = [];
  private embeddingMode: ResolvedEmbeddingMode = 'sparse_only';

  setCodeChunks(chunks: IndexChunk[]): void {
    this.codeChunks = chunks;
    this.codeIndex = buildBm25Index(chunks);
  }

  setDocChunks(chunks: IndexChunk[]): void {
    this.docChunks = chunks;
    this.docIndex = buildBm25Index(chunks);
  }

  setEmbeddingMode(mode: ResolvedEmbeddingMode): void {
    this.embeddingMode = mode;
  }

  getStats(): { codeChunks: number; docChunks: number } {
    return {
      codeChunks: this.codeIndex.chunks.length,
      docChunks: this.docIndex.chunks.length,
    };
  }

  search(options: CodeSearchOptions): CodeSearchResponse {
    const thoroughness = options.thoroughness ?? 'medium';
    const topK = Math.min(Math.max(options.topK ?? 10, 1), 50);
    const tier = options.tier ?? 'S';
    const defaultTop = tier === 'L' ? 50 : tier === 'M' ? 25 : 10;
    const effectiveTop = topK || defaultTop;

    const scopePaths = resolveScopePaths(options.scope, options.docEntries ?? []);
    const codePool = filterChunks(this.codeIndex.chunks, scopePaths, 'code');
    const docPool = filterChunks(this.docIndex.chunks, scopePaths, 'doc');

    const codeIdx = buildBm25Index(codePool);
    const docIdx = buildBm25Index(docPool);

    if (thoroughness === 'quick') {
      const merged = [
        ...bm25Search(codeIdx, options.query, 30).map(toHit),
        ...bm25Search(docIdx, options.query, 30).map(toHit),
      ]
        .sort((a, b) => b.score - a.score)
        .slice(0, effectiveTop);
      return { results: merged, truncated: merged.length >= effectiveTop, mode: 'sparse_quick' };
    }

    const codeRanked = bm25Search(codeIdx, options.query, 100);
    const docRanked = bm25Search(docIdx, options.query, 100);

    const rankLists: { id: string }[][] = [
      codeRanked.map((r) => ({ id: r.chunk.id })),
      docRanked.map((r) => ({ id: r.chunk.id })),
    ];
    if (
      options.queryEmbedding?.length &&
      (this.embeddingMode === 'proposed_lm' || this.embeddingMode === 'local')
    ) {
      const denseCode = denseSearch(codePool, options.queryEmbedding, 50);
      const denseDoc = denseSearch(docPool, options.queryEmbedding, 50);
      if (denseCode.length) {
        rankLists.push(denseCode.map((r) => ({ id: r.chunk.id })));
      }
      if (denseDoc.length) {
        rankLists.push(denseDoc.map((r) => ({ id: r.chunk.id })));
      }
    }

    const fused = reciprocalRankFusion(rankLists);

    const byId = new Map<string, IndexChunk>();
    for (const r of [...codeRanked, ...docRanked]) {
      byId.set(r.chunk.id, r.chunk);
    }

    const scopeSet = new Set(scopePaths);
    const scored: SearchHit[] = [];
    for (const [id, rrfScore] of fused.entries()) {
      const chunk = byId.get(id);
      if (!chunk) {
        continue;
      }
      const structural = structuralBoost(chunk, scopeSet, options.docEntries ?? []);
      scored.push({
        path: chunk.path,
        line: chunk.line,
        heading: chunk.heading,
        snippet: chunk.text.slice(0, 400),
        score: rrfScore + structural,
        kind: chunk.corpus,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    const picked = applyQuotas(scored, effectiveTop);

    if (thoroughness === 'thorough' && options.docEntries?.length) {
      expandLinkedDocs(picked, options.docEntries, docIdx, options.query);
    }

    return {
      results: picked.slice(0, effectiveTop),
      truncated: picked.length > effectiveTop,
      mode: options.queryEmbedding?.length ? 'hybrid_dense' : 'sparse_hybrid',
    };
  }
}

function denseSearch(pool: IndexChunk[], queryVec: number[], topK: number): { chunk: IndexChunk; score: number }[] {
  const scored = pool
    .filter((c) => c.embedding?.length)
    .map((chunk) => ({ chunk, score: cosineSimilarity(queryVec, chunk.embedding!) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return scored;
}

function toHit(r: { chunk: IndexChunk; score: number }): SearchHit {
  return {
    path: r.chunk.path,
    line: r.chunk.line,
    heading: r.chunk.heading,
    snippet: r.chunk.text.slice(0, 400),
    score: r.score,
    kind: r.chunk.corpus,
  };
}

function filterChunks(chunks: IndexChunk[], scopePaths: Set<string> | null, corpus: 'code' | 'doc'): IndexChunk[] {
  if (!scopePaths) {
    return chunks.filter((c) => c.corpus === corpus);
  }
  return chunks.filter((c) => c.corpus === corpus && scopePaths.has(c.path.replace(/\\/g, '/')));
}

function resolveScopePaths(scope: string | undefined, entries: DocEntry[]): Set<string> | null {
  if (!scope) {
    return null;
  }
  if (scope.startsWith('path:')) {
    const glob = scope.slice(5);
    return new Set(entries.map((e) => e.relativePath).filter((p) => p.includes(glob.replace(/\*/g, ''))));
  }
  if (scope.startsWith('doc:')) {
    const docId = scope.slice(4);
    const entry = entries.find((e) => e.frontmatter.id === docId);
    if (!entry) {
      return null;
    }
    return new Set(resolveScope(entry.relativePath, entries).map((s) => s.document_path));
  }
  return null;
}

function structuralBoost(chunk: IndexChunk, scopePaths: Set<string>, entries: DocEntry[]): number {
  if (!scopePaths.size) {
    return 0;
  }
  const norm = chunk.path.replace(/\\/g, '/');
  if (scopePaths.has(norm)) {
    return 0.5;
  }
  for (const linkPath of chunk.docPaths ?? []) {
    if (scopePaths.has(linkPath)) {
      return 0.25;
    }
  }
  void entries;
  return 0;
}

function applyQuotas(hits: SearchHit[], topK: number): SearchHit[] {
  const code: SearchHit[] = [];
  const doc: SearchHit[] = [];
  for (const hit of hits) {
    if (hit.kind === 'code' && code.length < 6) {
      code.push(hit);
    } else if (hit.kind === 'doc' && doc.length < 4) {
      doc.push(hit);
    }
  }
  const merged = [...code, ...doc];
  for (const hit of hits) {
    if (merged.length >= topK) {
      break;
    }
    if (!merged.includes(hit)) {
      merged.push(hit);
    }
  }
  return merged.slice(0, topK);
}

function expandLinkedDocs(
  picked: SearchHit[],
  entries: DocEntry[],
  docIdx: Bm25Index,
  query: string
): void {
  const docHits = picked.filter((h) => h.kind === 'doc');
  for (const hit of docHits.slice(0, 3)) {
    const entry = entries.find((e) => e.relativePath === hit.path);
    for (const link of entry?.frontmatter.lateral ?? []) {
      const target = entries.find((e) => e.frontmatter.id === link.target);
      if (target && !picked.some((p) => p.path === target.relativePath)) {
        const chunk = docIdx.chunks.find((c) => c.path === target.relativePath);
        if (chunk) {
          picked.push({
            path: chunk.path,
            heading: chunk.heading,
            snippet: chunk.text.slice(0, 400),
            score: 0.1,
            kind: 'doc',
          });
        }
      }
    }
  }
  void query;
}
