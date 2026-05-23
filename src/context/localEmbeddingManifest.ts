/** Local embedding add-on manifest — R-CTX-5 Mode B */

export interface LocalEmbeddingManifest {
  version: string;
  dimensions: number;
  runtime: 'hash' | 'onnx';
  inputName?: string;
  outputName?: string;
}

export const DEFAULT_LOCAL_MANIFEST: LocalEmbeddingManifest = {
  version: '1',
  dimensions: 384,
  runtime: 'onnx',
  inputName: 'input',
  outputName: 'output',
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
  return {
    version: typeof obj.version === 'string' ? obj.version : '1',
    dimensions,
    runtime,
    inputName: typeof obj.inputName === 'string' ? obj.inputName : DEFAULT_LOCAL_MANIFEST.inputName,
    outputName: typeof obj.outputName === 'string' ? obj.outputName : DEFAULT_LOCAL_MANIFEST.outputName,
  };
}
