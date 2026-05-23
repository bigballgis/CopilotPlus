/** Embedding mode resolution — R-CTX-5 */

import * as vscode from 'vscode';
import type { EmbeddingMode } from '../shared/types';
import type { LocalEmbeddingAddon } from './localEmbeddingAddon';
import { embedChunksLocal, embedTextsLocal, probeOnnxRuntime } from './localEmbeddingRuntime';

export type ResolvedEmbeddingMode = 'proposed_lm' | 'local' | 'sparse_only';

export interface EmbeddingResolution {
  mode: ResolvedEmbeddingMode;
  modelId?: string;
  addonVersion?: string;
  notice?: string;
}

type LmWithEmbeddings = typeof vscode.lm & {
  computeEmbeddings?: (model: unknown, input: string | string[]) => Promise<number[][]>;
  embeddingModels?: readonly { id?: string; name?: string }[];
};

export function probeProposedEmbeddings(): { available: boolean; modelId?: string; reason?: string } {
  const lm = vscode.lm as LmWithEmbeddings;
  if (typeof lm.computeEmbeddings !== 'function') {
    return { available: false, reason: 'computeEmbeddings API unavailable' };
  }
  const models = lm.embeddingModels;
  if (!models?.length) {
    return { available: false, reason: 'no embedding models registered' };
  }
  const modelId = models[0]?.id ?? models[0]?.name ?? 'default';
  return { available: true, modelId };
}

function resolveLocalMode(
  local: Awaited<ReturnType<LocalEmbeddingAddon['getStatus']>>
): EmbeddingResolution | undefined {
  if (!local.installed) {
    return undefined;
  }
  const ort = probeOnnxRuntime();
  if (ort.available) {
    return { mode: 'local', addonVersion: local.version };
  }
  return {
    mode: 'local',
    addonVersion: local.version,
    notice: `ONNX Runtime unavailable (${ort.reason}); using hash embeddings`,
  };
}

export async function resolveEmbeddingMode(
  configured: EmbeddingMode,
  addon: LocalEmbeddingAddon
): Promise<EmbeddingResolution> {
  const proposed = probeProposedEmbeddings();
  const local = await addon.getStatus();

  const pickAuto = (): EmbeddingResolution => {
    if (proposed.available) {
      return { mode: 'proposed_lm', modelId: proposed.modelId };
    }
    const localMode = resolveLocalMode(local);
    if (localMode) {
      return localMode;
    }
    return {
      mode: 'sparse_only',
      notice: local.notice ?? proposed.reason ?? 'Using BM25 sparse retrieval (Mode C)',
    };
  };

  switch (configured) {
    case 'proposed_lm':
      if (proposed.available) {
        return { mode: 'proposed_lm', modelId: proposed.modelId };
      }
      return {
        ...pickAuto(),
        notice: `proposed_lm unavailable (${proposed.reason}); resolved to fallback`,
      };
    case 'local': {
      const localMode = resolveLocalMode(local);
      if (localMode) {
        return localMode;
      }
      return {
        ...pickAuto(),
        notice: local.notice ?? 'local embedding add-on not installed',
      };
    }
    case 'sparse_only':
      return { mode: 'sparse_only' };
    case 'auto':
    default:
      return pickAuto();
  }
}

export async function computeChunkEmbeddings(
  chunks: { text: string; embedding?: number[] }[],
  resolution: EmbeddingResolution,
  addon?: LocalEmbeddingAddon
): Promise<number> {
  if (resolution.mode === 'local' && addon) {
    const modelPath = await addon.getModelPath();
    const manifest = await addon.getManifest();
    return embedChunksLocal(chunks, modelPath, manifest);
  }
  if (resolution.mode !== 'proposed_lm') {
    return 0;
  }
  const lm = vscode.lm as LmWithEmbeddings;
  const model = lm.embeddingModels?.[0];
  if (!model || typeof lm.computeEmbeddings !== 'function') {
    return 0;
  }
  const batchSize = 16;
  let embedded = 0;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const inputs = batch.map((c) => c.text.slice(0, 8000));
    try {
      const vectors = await lm.computeEmbeddings(model, inputs);
      batch.forEach((chunk, idx) => {
        const vec = vectors[idx];
        if (vec?.length) {
          chunk.embedding = vec;
          embedded += 1;
        }
      });
    } catch {
      break;
    }
  }
  return embedded;
}

export async function computeQueryEmbedding(
  query: string,
  resolution: EmbeddingResolution,
  addon?: LocalEmbeddingAddon
): Promise<number[] | undefined> {
  if (resolution.mode === 'local' && addon) {
    const modelPath = await addon.getModelPath();
    const manifest = await addon.getManifest();
    const vectors = await embedTextsLocal([query.slice(0, 8000)], modelPath, manifest);
    return vectors[0];
  }
  if (resolution.mode !== 'proposed_lm') {
    return undefined;
  }
  const lm = vscode.lm as LmWithEmbeddings;
  const model = lm.embeddingModels?.[0];
  if (!model || typeof lm.computeEmbeddings !== 'function') {
    return undefined;
  }
  try {
    const vectors = await lm.computeEmbeddings(model, query.slice(0, 8000));
    return vectors[0];
  } catch {
    return undefined;
  }
}
