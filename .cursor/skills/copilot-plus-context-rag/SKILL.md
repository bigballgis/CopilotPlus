---
name: copilot-plus-context-rag
description: >-
  Context assembly for Copilot Plus: @ mentions, codebase index, RAG hybrid retrieval
  BM25+embeddings+RRF+reranker, token budget, conversation summarization, embedding
  modes. Use when implementing R-CTX or indexing in src/context/.
---

# Context, Indexing & RAG

## Priority order (R-CTX-4.3)

1. Explicit @mentions
2. **Layer_Walk** (R-DOCS-14)
3. Active selection
4. Current file
5. RAG retrievals
6. Codebase_Index retrievals
7. Prior chat history

## Indexes

| Index | Path | Content |
|-------|------|---------|
| Codebase | `.copilotPlus/index/code/` | Source chunks, BM25 + optional embeddings |
| RAG | `.copilotPlus/index/docs/` | Document_Tree markdown |

Rebuild on FS events ≤5s; manual rebuild from Control Console.

## Hybrid pipeline (R-CTX-3.5)

With embeddings: BM25 top 50 + dense top 50 → RRF (k=60) → Structural_Booster → rerank top 30 → select 10.

Sparse-only: BM25 top 100 → booster → rerank → 10.

## Embedding modes (R-CTX-5)

`auto` resolves: proposed_lm → local ONNX add-on → sparse_only.

No external embedding APIs.

## Mentions (R-CTX-1)

Kinds: `@file`, `@folder`, `@symbol`, `@selection`, `@doc`, `@web`, `@skill`.

Block Sensitive_File attachments.

## Summarization (R-CTX-7)

Trigger at 80% Token_Budget; keep last N turns; max 3 per 10 requests.

## Unified code_search (R-CTX-6)

Default quota: 6 code + 4 doc chunks in top 10.

## Reference

`.kiro/specs/copilot-plus-extension/requirements/04-context.md`
