/** Local embedding add-on manifest — R-CTX-5 Mode B */

export type LocalEmbeddingRuntime = 'hash' | 'onnx';
export type LocalEmbeddingInputFormat = 'hash_features' | 'token_ids';
export type LocalEmbeddingTokenizer = 'whitespace' | 'vocab';

export interface LocalEmbeddingManifest {
  version: string;
  /** Enterprise model identifier shown in Control Console */
  modelId?: string;
  dimensions: number;
  runtime: LocalEmbeddingRuntime;
  modelFile?: string;
  vocabFile?: string;
  inputFormat?: LocalEmbeddingInputFormat;
  tokenizer?: LocalEmbeddingTokenizer;
  maxSequenceLength?: number;
  inputName?: string;
  attentionInputName?: string;
  tokenTypeInputName?: string;
  outputName?: string;
  normalizeOutput?: boolean;
}

export const DEFAULT_LOCAL_MANIFEST: LocalEmbeddingManifest = {
  version: '1',
  modelId: 'hash-fallback',
  dimensions: 384,
  runtime: 'onnx',
  modelFile: 'model.onnx',
  inputFormat: 'hash_features',
  tokenizer: 'whitespace',
  maxSequenceLength: 128,
  inputName: 'input',
  outputName: 'output',
  normalizeOutput: true,
};

export function parseLocalManifest(raw: unknown): LocalEmbeddingManifest {
  if (typeof raw !== 'object' || raw === null) {
    return { ...DEFAULT_LOCAL_MANIFEST };
  }
  const obj = raw as Record<string, unknown>;
  const dimensions =
    typeof obj.dimensions === 'number' && obj.dimensions >= 32 && obj.dimensions <= 4096
      ? Math.trunc(obj.dimensions)
      : DEFAULT_LOCAL_MANIFEST.dimensions;
  const runtime = obj.runtime === 'hash' ? 'hash' : 'onnx';
  const inputFormat =
    obj.inputFormat === 'token_ids' || obj.inputFormat === 'hash_features'
      ? obj.inputFormat
      : DEFAULT_LOCAL_MANIFEST.inputFormat;
  const tokenizer =
    obj.tokenizer === 'vocab' || obj.tokenizer === 'whitespace'
      ? obj.tokenizer
      : DEFAULT_LOCAL_MANIFEST.tokenizer;
  const maxSequenceLength =
    typeof obj.maxSequenceLength === 'number' && obj.maxSequenceLength >= 8 && obj.maxSequenceLength <= 512
      ? Math.trunc(obj.maxSequenceLength)
      : DEFAULT_LOCAL_MANIFEST.maxSequenceLength;

  return {
    version: typeof obj.version === 'string' ? obj.version : '1',
    modelId: typeof obj.modelId === 'string' ? obj.modelId : undefined,
    dimensions,
    runtime,
    modelFile: typeof obj.modelFile === 'string' ? obj.modelFile : DEFAULT_LOCAL_MANIFEST.modelFile,
    vocabFile: typeof obj.vocabFile === 'string' ? obj.vocabFile : undefined,
    inputFormat,
    tokenizer,
    maxSequenceLength,
    inputName: typeof obj.inputName === 'string' ? obj.inputName : DEFAULT_LOCAL_MANIFEST.inputName,
    attentionInputName:
      typeof obj.attentionInputName === 'string' ? obj.attentionInputName : undefined,
    tokenTypeInputName:
      typeof obj.tokenTypeInputName === 'string' ? obj.tokenTypeInputName : undefined,
    outputName: typeof obj.outputName === 'string' ? obj.outputName : DEFAULT_LOCAL_MANIFEST.outputName,
    normalizeOutput:
      typeof obj.normalizeOutput === 'boolean' ? obj.normalizeOutput : DEFAULT_LOCAL_MANIFEST.normalizeOutput,
  };
}

export function resolveEffectiveInputFormat(manifest: LocalEmbeddingManifest): LocalEmbeddingInputFormat {
  if (manifest.runtime === 'hash') {
    return 'hash_features';
  }
  if (manifest.inputFormat === 'token_ids' && manifest.tokenizer === 'vocab' && manifest.vocabFile) {
    return 'token_ids';
  }
  if (manifest.inputFormat === 'token_ids') {
    return 'token_ids';
  }
  return 'hash_features';
}

export function resolveModelRelativePath(manifest: LocalEmbeddingManifest): string {
  return manifest.modelFile ?? 'model.onnx';
}

export function resolveVocabRelativePath(manifest: LocalEmbeddingManifest): string | undefined {
  if (manifest.tokenizer === 'vocab' && manifest.vocabFile) {
    return manifest.vocabFile;
  }
  return undefined;
}
