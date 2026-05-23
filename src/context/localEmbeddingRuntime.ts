/** Local embedding inference (Mode B) — R-CTX-5 */

import type { LocalEmbeddingManifest } from './localEmbeddingManifest';
import {
  DEFAULT_LOCAL_MANIFEST,
  resolveEffectiveInputFormat,
} from './localEmbeddingManifest';
import {
  encodeVocabIds,
  encodeWhitespaceIds,
  loadVocab,
  normalizeVector,
} from './localEmbeddingTokenizer';

export const DEFAULT_EMBED_DIMENSIONS = 384;
const BATCH_SIZE = 16;

type OrtModule = typeof import('onnxruntime-node');
type OrtSession = import('onnxruntime-node').InferenceSession;
type OrtTensor = import('onnxruntime-node').Tensor;

export interface LocalEmbedContext {
  vocab?: Map<string, number>;
}

let ortModule: OrtModule | undefined;
let ortSession: OrtSession | undefined;
let ortSessionPath: string | undefined;

export function hashEmbed(text: string, dimensions = DEFAULT_EMBED_DIMENSIONS): number[] {
  const vec = new Array<number>(dimensions).fill(0);
  const normalized = text.toLowerCase().trim();
  if (!normalized) {
    return vec;
  }
  for (const token of normalized.split(/\s+/)) {
    let h = 2166136261;
    for (let i = 0; i < token.length; i++) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % dimensions;
    vec[idx] += 1;
  }
  let norm = 0;
  for (const v of vec) {
    norm += v * v;
  }
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

export function probeOnnxRuntime(): { available: boolean; reason?: string } {
  try {
    // Synchronous probe for mode resolution during indexing startup.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('onnxruntime-node');
    return { available: true };
  } catch (err) {
    return {
      available: false,
      reason: err instanceof Error ? err.message : 'onnxruntime_unavailable',
    };
  }
}

export async function embedTextsLocal(
  texts: string[],
  modelPath: string | undefined,
  manifest: LocalEmbeddingManifest = DEFAULT_LOCAL_MANIFEST,
  context: LocalEmbedContext = {}
): Promise<number[][]> {
  const dims = manifest.dimensions;
  if (manifest.runtime === 'hash') {
    return texts.map((t) => hashEmbed(t, dims));
  }
  if (manifest.runtime === 'onnx' && modelPath && probeOnnxRuntime().available) {
    try {
      return await embedViaOnnx(texts, modelPath, manifest, context);
    } catch {
      // Fall back to hash embeddings when ONNX model/session is incompatible.
    }
  }
  return texts.map((t) => hashEmbed(t, dims));
}

export async function embedChunksLocal(
  chunks: { text: string; embedding?: number[] }[],
  modelPath: string | undefined,
  manifest: LocalEmbeddingManifest,
  context: LocalEmbedContext = {}
): Promise<number> {
  let embedded = 0;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const inputs = batch.map((c) => c.text.slice(0, 8000));
    const vectors = await embedTextsLocal(inputs, modelPath, manifest, context);
    batch.forEach((chunk, idx) => {
      const vec = vectors[idx];
      if (vec?.length) {
        chunk.embedding = vec;
        embedded += 1;
      }
    });
  }
  return embedded;
}

async function embedViaOnnx(
  texts: string[],
  modelPath: string,
  manifest: LocalEmbeddingManifest,
  context: LocalEmbedContext
): Promise<number[][]> {
  const ort = await loadOrt();
  if (!ortSession || ortSessionPath !== modelPath) {
    ortSession = await ort.InferenceSession.create(modelPath);
    ortSessionPath = modelPath;
  }

  const inputFormat = resolveEffectiveInputFormat(manifest);
  const dims = manifest.dimensions;
  const out: number[][] = [];

  for (const text of texts) {
    const feeds = buildOnnxFeeds(text, manifest, inputFormat, context, ort);
    const result = await ortSession.run(feeds);
    const outputName = manifest.outputName ?? 'output';
    const output = result[outputName];
    if (!output) {
      throw new Error('onnx_missing_output');
    }
    let vec = extractVector(output, dims);
    if (manifest.normalizeOutput !== false) {
      vec = normalizeVector(vec);
    }
    out.push(vec);
  }
  return out;
}

export function buildOnnxFeeds(
  text: string,
  manifest: LocalEmbeddingManifest,
  inputFormat: ReturnType<typeof resolveEffectiveInputFormat>,
  context: LocalEmbedContext,
  ort: OrtModule
): Record<string, OrtTensor> {
  const maxLen = manifest.maxSequenceLength ?? 128;
  const inputName = manifest.inputName ?? 'input';

  if (inputFormat === 'token_ids') {
    const encoded =
      manifest.tokenizer === 'vocab' && context.vocab
        ? encodeVocabIds(text, context.vocab, maxLen)
        : encodeWhitespaceIds(text, maxLen);
    const feeds: Record<string, OrtTensor> = {
      [inputName]: new ort.Tensor(
        'int64',
        BigInt64Array.from(encoded.inputIds.map((id) => BigInt(id))) as unknown as Float32Array,
        [1, maxLen]
      ),
    };
    if (manifest.attentionInputName) {
      feeds[manifest.attentionInputName] = new ort.Tensor(
        'int64',
        BigInt64Array.from(encoded.attentionMask.map((v) => BigInt(v))) as unknown as Float32Array,
        [1, maxLen]
      );
    }
    if (manifest.tokenTypeInputName) {
      feeds[manifest.tokenTypeInputName] = new ort.Tensor(
        'int64',
        BigInt64Array.from(new Array(maxLen).fill(0n)) as unknown as Float32Array,
        [1, maxLen]
      );
    }
    return feeds;
  }

  const features = hashEmbed(text, manifest.dimensions);
  return {
    [inputName]: new ort.Tensor('float32', Float32Array.from(features), [1, manifest.dimensions]),
  };
}

function extractVector(
  output: { data: Float32Array | number[] | BigInt64Array; dims: number[] },
  dims: number
): number[] {
  const data = output.data;
  const floats =
    data instanceof BigInt64Array
      ? Array.from(data, (v) => Number(v))
      : Array.from(data as ArrayLike<number>);
  if (output.dims.length === 2 && output.dims[1] === dims) {
    return floats.slice(0, dims);
  }
  if (output.dims.length === 1 && output.dims[0] === dims) {
    return floats.slice(0, dims);
  }
  if (floats.length >= dims) {
    return floats.slice(0, dims);
  }
  throw new Error('onnx_output_shape_mismatch');
}

export async function loadVocabFromFile(vocabPath: string): Promise<Map<string, number>> {
  const fs = await import('fs/promises');
  return loadVocab(await fs.readFile(vocabPath, 'utf8'));
}

async function loadOrt(): Promise<OrtModule> {
  if (!ortModule) {
    ortModule = await import('onnxruntime-node');
  }
  return ortModule;
}

export function resetOnnxSessionCache(): void {
  ortSession = undefined;
  ortSessionPath = undefined;
}
