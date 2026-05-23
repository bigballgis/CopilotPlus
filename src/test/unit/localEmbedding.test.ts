import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import { hashEmbed } from '../../context/localEmbeddingRuntime.js';
import {
  parseLocalManifest,
  resolveEffectiveInputFormat,
} from '../../context/localEmbeddingManifest.js';
import {
  encodeVocabIds,
  encodeWhitespaceIds,
  loadVocab,
  normalizeVector,
} from '../../context/localEmbeddingTokenizer.js';
import {
  isManifestJsonUrl,
  resolveBundleAssetUrl,
  verifyInstalledLayout,
} from '../../context/localEmbeddingBundle.js';

const fixturesDir = path.join(process.cwd(), 'fixtures', 'embedding');

describe('R-CTX-5 Mode B local embedding', () => {
  it('hashEmbed produces normalized vectors', () => {
    const a = hashEmbed('hello world', 64);
    assert.equal(a.length, 64);
    const norm = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    assert.ok(Math.abs(norm - 1) < 0.001 || norm === 0);
  });

  it('hashEmbed is deterministic', () => {
    const a = hashEmbed('copilot plus retrieval', 128);
    const b = hashEmbed('copilot plus retrieval', 128);
    assert.deepEqual(a, b);
  });

  it('parses addon manifest defaults', () => {
    const m = parseLocalManifest({ runtime: 'hash', dimensions: 256 });
    assert.equal(m.runtime, 'hash');
    assert.equal(m.dimensions, 256);
  });
});

describe('R-CTX-5 enterprise ONNX manifest', () => {
  it('parses enterprise manifest fixture', async () => {
    const raw = JSON.parse(await fs.readFile(path.join(fixturesDir, 'enterprise-manifest.json'), 'utf8'));
    const manifest = parseLocalManifest(raw);
    assert.equal(manifest.modelId, 'enterprise-minilm-l6-v2-onnx');
    assert.equal(manifest.inputFormat, 'token_ids');
    assert.equal(manifest.tokenizer, 'vocab');
    assert.equal(resolveEffectiveInputFormat(manifest), 'token_ids');
  });

  it('resolves bundle asset URLs from manifest base', () => {
    assert.equal(
      resolveBundleAssetUrl('https://mirror.example.com/embeddings/v2/manifest.json', 'model.onnx'),
      'https://mirror.example.com/embeddings/v2/model.onnx'
    );
    assert.equal(isManifestJsonUrl('https://mirror.example.com/manifest.json'), true);
  });

  it('validates installed layout expectations', async () => {
    const raw = JSON.parse(await fs.readFile(path.join(fixturesDir, 'enterprise-manifest.json'), 'utf8'));
    const manifest = parseLocalManifest(raw);
    const layout = verifyInstalledLayout('/tmp/addon', manifest);
    assert.equal(layout.ok, true);
    if (layout.ok) {
      assert.match(layout.layout.modelPath, /model\.onnx$/);
      assert.match(layout.layout.vocabPath ?? '', /vocab\.txt$/);
    }
  });
});

describe('R-CTX-5 enterprise tokenizer', () => {
  it('loads vocab and encodes token ids', async () => {
    const vocabText = await fs.readFile(path.join(fixturesDir, 'sample-vocab.txt'), 'utf8');
    const vocab = loadVocab(vocabText);
    const encoded = encodeVocabIds('hello copilot', vocab, 8);
    assert.equal(encoded.inputIds.length, 8);
    assert.equal(encoded.attentionMask.length, 8);
    assert.equal(encoded.inputIds[0], vocab.get('[CLS]') ?? 0);
    assert.ok(encoded.inputIds[1] > 0);
    assert.equal(encoded.attentionMask.filter((v) => v === 1).length, 4);
  });

  it('encodes whitespace fallback ids', () => {
    const encoded = encodeWhitespaceIds('hello world', 8);
    assert.equal(encoded.inputIds.length, 8);
    assert.ok(encoded.inputIds[0] > 0);
  });

  it('normalizes output vectors', () => {
    const vec = normalizeVector([3, 4]);
    const norm = Math.sqrt(vec[0] * vec[0] + vec[1] * vec[1]);
    assert.ok(Math.abs(norm - 1) < 0.0001);
  });
});
