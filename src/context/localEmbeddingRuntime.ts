/** Local embedding inference (Mode B) — R-CTX-5 */

import type { LocalEmbeddingManifest } from './localEmbeddingManifest';
import { DEFAULT_LOCAL_MANIFEST } from './localEmbeddingManifest';

export const DEFAULT_EMBED_DIMENSIONS = 384;
const BATCH_SIZE = 16;

type OrtModule = typeof import('onnxruntime-node');
type OrtSession = import('onnxruntime-node').InferenceSession;

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
  manifest: LocalEmbeddingManifest = DEFAULT_LOCAL_MANIFEST
): Promise<number[][]> {
  const dims = manifest.dimensions;
  if (manifest.runtime === 'onnx' && modelPath && probeOnnxRuntime().available) {
    try {
      return await embedViaOnnx(texts, modelPath, manifest);
    } catch {
      // Fall back to hash embeddings when ONNX model/session is incompatible.
    }
  }
  return texts.map((t) => hashEmbed(t, dims));
}

export async function embedChunksLocal(
  chunks: { text: string; embedding?: number[] }[],
  modelPath: string | undefined,
  manifest: LocalEmbeddingManifest
): Promise<number> {
  let embedded = 0;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const inputs = batch.map((c) => c.text.slice(0, 8000));
    const vectors = await embedTextsLocal(inputs, modelPath, manifest);
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
  manifest: LocalEmbeddingManifest
): Promise<number[][]> {
  const ort = await loadOrt();
  if (!ortSession || ortSessionPath !== modelPath) {
    ortSession = await ort.InferenceSession.create(modelPath);
    ortSessionPath = modelPath;
  }
  const inputName = manifest.inputName ?? 'input';
  const outputName = manifest.outputName ?? 'output';
  const dims = manifest.dimensions;
  const out: number[][] = [];

  for (const text of texts) {
    const features = hashEmbed(text, dims);
    const tensor = new ort.Tensor('float32', Float32Array.from(features), [1, dims]);
    const result = await ortSession.run({ [inputName]: tensor });
    const output = result[outputName];
    if (!output) {
      throw new Error('onnx_missing_output');
    }
    out.push(extractVector(output, dims));
  }
  return out;
}

function extractVector(
  output: { data: Float32Array | number[]; dims: number[] },
  dims: number
): number[] {
  const data = output.data;
  if (output.dims.length === 2 && output.dims[1] === dims) {
    return Array.from(data.slice(0, dims));
  }
  if (output.dims.length === 1 && output.dims[0] === dims) {
    return Array.from(data.slice(0, dims));
  }
  if (data.length >= dims) {
    return Array.from(data.slice(0, dims));
  }
  throw new Error('onnx_output_shape_mismatch');
}

async function loadOrt(): Promise<OrtModule> {
  if (!ortModule) {
    ortModule = await import('onnxruntime-node');
  }
  return ortModule;
}
