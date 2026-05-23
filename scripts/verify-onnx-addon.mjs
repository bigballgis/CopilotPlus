#!/usr/bin/env node
/** Enterprise ONNX add-on fixture verification — no runtime ORT required */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseLocalManifest, resolveEffectiveInputFormat } from '../dist-test/context/localEmbeddingManifest.js';
import {
  isManifestJsonUrl,
  resolveBundleAssetUrl,
  verifyInstalledLayout,
} from '../dist-test/context/localEmbeddingBundle.js';
import { encodeVocabIds, loadVocab } from '../dist-test/context/localEmbeddingTokenizer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const fixturesDir = path.join(root, 'fixtures', 'embedding');

async function main() {
  const errors = [];

  const manifestRaw = JSON.parse(
    await fs.readFile(path.join(fixturesDir, 'enterprise-manifest.json'), 'utf8')
  );
  const manifest = parseLocalManifest(manifestRaw);
  if (manifest.modelId !== 'enterprise-minilm-l6-v2-onnx') {
    errors.push('unexpected enterprise modelId');
  }
  if (resolveEffectiveInputFormat(manifest) !== 'token_ids') {
    errors.push('expected token_ids input format');
  }

  const layout = verifyInstalledLayout(fixturesDir, manifest);
  if (layout.ok) {
    // Fixture dir only has manifest + vocab, not model.onnx — expect model path anyway.
    if (!layout.layout.modelPath.endsWith('model.onnx')) {
      errors.push('model path resolution failed');
    }
  }

  const vocab = loadVocab(await fs.readFile(path.join(fixturesDir, 'sample-vocab.txt'), 'utf8'));
  const encoded = encodeVocabIds('hello retrieval', vocab, 12);
  if (encoded.inputIds.length !== 12) {
    errors.push('token id length mismatch');
  }

  const modelUrl = resolveBundleAssetUrl(
    'https://corp.example.com/models/v2/manifest.json',
    manifest.modelFile ?? 'model.onnx'
  );
  if (!isManifestJsonUrl('https://corp.example.com/models/v2/manifest.json')) {
    errors.push('manifest URL detection failed');
  }
  if (!modelUrl.endsWith('/models/v2/model.onnx')) {
    errors.push(`unexpected resolved model URL: ${modelUrl}`);
  }

  if (errors.length > 0) {
    console.error('ONNX add-on verification FAILED');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    return 1;
  }

  console.log('ONNX add-on verification OK (enterprise manifest + tokenizer fixtures)');
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
