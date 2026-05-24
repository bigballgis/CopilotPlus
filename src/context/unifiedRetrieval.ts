/** Unified hybrid retrieval — R-CTX-3, R-CTX-6, R-TOOL-6 */

import type { ContextTier } from '../shared/types';
import { bm25Search, buildBm25Index, reciprocalRankFusion, type Bm25Index } from './bm25';
import type { IndexChunk, SearchHit } from './types';
import { resolveScope } from '../docs/scopeResolution';
import type { DocEntry } from '../docs/documentTreeService';
import { cosineSimilarity } from './vectorMath';
import type { ResolvedEmbeddingMode } from './embeddingResolver';
import { rerankCandidates } from './retrievalRerank';

export type SearchThoroughness = 'quick' | 'medium' | 'thorough';

export interface CodeSearchOptions {
  query: string;
  scope?: string;
  thoroughness?: SearchThoroughness;
  topK?: number;
  tier?: ContextTier;
  docEntries?: DocEntry[];
  queryEmbedding?: number[];
  /** When false, skip RAG doc chunks (R-CTX-3.7). Codebase chunks still searched. */
  includeDocChunks?: boolean;
}

export interface CodeSearchResponse {
  results: SearchHit[];
  truncated: boolean;
  mode: string;
}

const RRF_K = 60;
const RERANK_POOL = 30;
const DEFAULT_TOP_K = 10;
const CODE_QUOTA = 6;
const DOC_QUOTA = 4;

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
    const tier = options.tier ?? 'S';
    const requestedTop = options.topK ?? DEFAULT_TOP_K;
    const effectiveTop = Math.min(Math.max(requestedTop, 1), tier === 'L' ? 50 : tier === 'M' ? 25 : DEFAULT_TOP_K);

    const scopePaths = resolveScopePaths(options.scope, options.docEntries ?? []);
    const codePool = filterChunks(this.codeIndex.chunks, scopePaths, 'code');
    const includeDocs = options.includeDocChunks !== false;
    const docPool = includeDocs ? filterChunks(this.docIndex.chunks, scopePaths, 'doc') : [];
    const byId = indexChunksById([...codePool, ...docPool]);

    if (thoroughness === 'quick') {
      const codeIdx = buildBm25Index(codePool);
      const docIdx = buildBm25Index(docPool);
      const merged = [
        ...bm25Search(codeIdx, options.query, 30).map(toHit),
        ...bm25Search(docIdx, options.query, 30).map(toHit),
      ]
        .sort((a, b) => b.score - a.score)
        .slice(0, effectiveTop);
      return { results: merged, truncated: merged.length >= effectiveTop, mode: 'sparse_quick' };
    }

    const useDense =
      Boolean(options.queryEmbedding?.length) &&
      (this.embeddingMode === 'proposed_lm' || this.embeddingMode === 'local');
    const bm25Limit = useDense ? 50 : 100;

    const codeIdx = buildBm25Index(codePool);
    const docIdx = buildBm25Index(docPool);
    const codeRanked = bm25Search(codeIdx, options.query, bm25Limit);
    const docRanked = bm25Search(docIdx, options.query, bm25Limit);

    const rankLists: { id: string }[][] = [
      codeRanked.map((r) => ({ id: r.chunk.id })),
      docRanked.map((r) => ({ id: r.chunk.id })),
    ];

    if (useDense && options.queryEmbedding) {
      const denseCode = denseSearch(codePool, options.queryEmbedding, 50);
      const denseDoc = denseSearch(docPool, options.queryEmbedding, 50);
      for (const hit of [...denseCode, ...denseDoc]) {
        byId.set(hit.chunk.id, hit.chunk);
      }
      if (denseCode.length) {
        rankLists.push(denseCode.map((r) => ({ id: r.chunk.id })));
      }
      if (denseDoc.length) {
        rankLists.push(denseDoc.map((r) => ({ id: r.chunk.id })));
      }
    }

    const fused = reciprocalRankFusion(rankLists, RRF_K);
    const scopeSet = new Set(scopePaths);
    const boosted: Array<{ id: string; hit: SearchHit }> = [];
    for (const [id, rrfScore] of fused.entries()) {
      const chunk = byId.get(id);
      if (!chunk) {
        continue;
      }
      boosted.push({
        id,
        hit: chunkToHit(chunk, rrfScore + structuralBoost(chunk, scopeSet, options.docEntries ?? [])),
      });
    }

    boosted.sort((a, b) => b.hit.score - a.hit.score);
    const reranked = rerankCandidates(
      options.query,
      boosted.map((item) => ({
        id: item.id,
        text: byId.get(item.id)?.text ?? item.hit.snippet,
        baseScore: item.hit.score,
      })),
      RERANK_POOL,
      RERANK_POOL
    );

    const rerankedHits: SearchHit[] = [];
    for (const item of reranked) {
      const chunk = byId.get(item.id);
      if (!chunk) {
        continue;
      }
      rerankedHits.push(chunkToHit(chunk, item.score));
    }

    const picked = applyQuotas(
      rerankedHits,
      effectiveTop,
      includeDocs ? CODE_QUOTA : effectiveTop,
      includeDocs ? DOC_QUOTA : 0
    );

    if (includeDocs && thoroughness === 'thorough' && options.docEntries?.length) {
      expandLinkedDocs(picked, options.docEntries, docIdx);
    }

    return {
      results: picked.slice(0, effectiveTop),
      truncated: picked.length > effectiveTop,
      mode: useDense ? 'hybrid_dense' : 'sparse_hybrid',
    };
  }
}

function indexChunksById(chunks: IndexChunk[]): Map<string, IndexChunk> {
  const byId = new Map<string, IndexChunk>();
  for (const chunk of chunks) {
    byId.set(chunk.id, chunk);
  }
  return byId;
}

function denseSearch(pool: IndexChunk[], queryVec: number[], topK: number): { chunk: IndexChunk; score: number }[] {
  return pool
    .filter((c) => c.embedding?.length)
    .map((chunk) => ({ chunk, score: cosineSimilarity(queryVec, chunk.embedding!) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

function chunkToHit(chunk: IndexChunk, score: number): SearchHit {
  return {
    path: chunk.path,
    line: chunk.line,
    heading: chunk.heading,
    headingPath: chunk.headingPath,
    linkTargets: chunk.linkTargets,
    snippet: chunk.text.slice(0, 400),
    score,
    kind: chunk.corpus,
  };
}

function toHit(r: { chunk: IndexChunk; score: number }): SearchHit {
  return chunkToHit(r.chunk, r.score);
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
    return chunk.corpus === 'doc' && (chunk.linkTargets?.length || chunk.docPaths?.length) ? 0.05 : 0;
  }
  const norm = chunk.path.replace(/\\/g, '/');
  if (scopePaths.has(norm)) {
    return 0.5;
  }
  for (const linkPath of chunk.linkTargets ?? chunk.docPaths ?? []) {
    if (scopePaths.has(linkPath.replace(/\\/g, '/'))) {
      return 0.25;
    }
  }
  void entries;
  return chunk.corpus === 'doc' ? 0.05 : 0;
}

function applyQuotas(
  hits: SearchHit[],
  topK: number,
  codeQuota: number,
  docQuota: number
): SearchHit[] {
  const code: SearchHit[] = [];
  const doc: SearchHit[] = [];
  for (const hit of hits) {
    if (hit.kind === 'code' && code.length < codeQuota) {
      code.push(hit);
    } else if (hit.kind === 'doc' && doc.length < docQuota) {
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

function expandLinkedDocs(picked: SearchHit[], entries: DocEntry[], docIdx: Bm25Index): void {
  const docHits = picked.filter((h) => h.kind === 'doc');
  for (const hit of docHits.slice(0, 3)) {
    const entry = entries.find((e) => e.relativePath === hit.path);
    for (const link of entry?.frontmatter.lateral ?? []) {
      const target = entries.find((e) => e.frontmatter.id === link.target);
      if (target && !picked.some((p) => p.path === target.relativePath)) {
        const chunk = docIdx.chunks.find((c) => c.path === target.relativePath);
        if (chunk) {
          picked.push(chunkToHit(chunk, 0.1));
        }
      }
    }
  }
}
