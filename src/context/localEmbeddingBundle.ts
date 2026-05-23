/** Enterprise embedding add-on bundle helpers — R-CTX-5 Mode B */

import * as crypto from 'crypto';
import * as path from 'path';
import {
  parseLocalManifest,
  resolveModelRelativePath,
  resolveVocabRelativePath,
  type LocalEmbeddingManifest,
} from './localEmbeddingManifest';

export interface InstalledAddonLayout {
  manifest: LocalEmbeddingManifest;
  modelPath: string;
  vocabPath?: string;
}

export function sha256Buffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function isManifestJsonUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.endsWith('/manifest.json') || lower.endsWith('manifest.json');
}

export function resolveBundleAssetUrl(baseUrl: string, relativePath: string): string {
  if (/^https?:\/\//i.test(relativePath)) {
    return relativePath;
  }
  const base = baseUrl.replace(/[^/]+$/, '');
  return new URL(relativePath, base).toString();
}

export function parseManifestBuffer(buffer: Buffer): LocalEmbeddingManifest {
  return parseLocalManifest(JSON.parse(buffer.toString('utf8')));
}

export function verifyInstalledLayout(
  addonDir: string,
  manifest: LocalEmbeddingManifest
): { ok: true; layout: InstalledAddonLayout } | { ok: false; reason: string } {
  const modelRel = resolveModelRelativePath(manifest);
  const modelPath = path.join(addonDir, modelRel);
  const vocabRel = resolveVocabRelativePath(manifest);
  const vocabPath = vocabRel ? path.join(addonDir, vocabRel) : undefined;

  if (manifest.runtime === 'onnx' && !modelRel.endsWith('.onnx')) {
    return { ok: false, reason: 'modelFile_must_be_onnx' };
  }
  if (manifest.tokenizer === 'vocab' && manifest.inputFormat === 'token_ids' && !vocabRel) {
    return { ok: false, reason: 'vocabFile_required_for_token_ids' };
  }

  return {
    ok: true,
    layout: {
      manifest,
      modelPath,
      vocabPath,
    },
  };
}

export function verifySha256(buffer: Buffer, expected: string): boolean {
  if (!expected) {
    return false;
  }
  return sha256Buffer(buffer).toLowerCase() === expected.toLowerCase();
}
