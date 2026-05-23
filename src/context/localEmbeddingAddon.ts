/** Local embedding add-on (Mode B) — R-CTX-5 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  DEFAULT_LOCAL_MANIFEST,
  parseLocalManifest,
  resolveModelRelativePath,
  type LocalEmbeddingManifest,
} from './localEmbeddingManifest';
import {
  isManifestJsonUrl,
  parseManifestBuffer,
  resolveBundleAssetUrl,
  sha256Buffer,
  verifyInstalledLayout,
  verifySha256,
} from './localEmbeddingBundle';
import { loadVocabFromFile, resetOnnxSessionCache } from './localEmbeddingRuntime';

export interface LocalAddonStatus {
  installed: boolean;
  version?: string;
  modelId?: string;
  notice?: string;
}

interface StoredAddonMeta {
  version: string;
  path: string;
  modelId?: string;
}

export class LocalEmbeddingAddon {
  private readonly storageKey = 'copilotPlus.localEmbedding';
  private vocabCache: Map<string, number> | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getUrl: () => string,
    private readonly getSha256: () => string
  ) {}

  private addonDir(): string {
    return path.join(this.context.globalStorageUri.fsPath, 'embedding-addon');
  }

  async getStatus(): Promise<LocalAddonStatus> {
    const meta = this.context.globalState.get<StoredAddonMeta>(this.storageKey);
    if (!meta?.path) {
      const url = this.getUrl();
      if (!url) {
        return {
          installed: false,
          notice: 'Mode B requires copilotPlus.indexing.embeddingAddon.url (enterprise mirror)',
        };
      }
      return { installed: false, notice: 'Local embedding add-on not installed' };
    }
    try {
      await fs.access(meta.path);
      const manifest = await this.getManifest();
      return {
        installed: true,
        version: meta.version,
        modelId: meta.modelId ?? manifest.modelId ?? manifest.version,
      };
    } catch {
      return { installed: false, notice: 'Local add-on path missing — reinstall required' };
    }
  }

  async getModelPath(): Promise<string | undefined> {
    const meta = this.context.globalState.get<StoredAddonMeta>(this.storageKey);
    if (!meta?.path) {
      return undefined;
    }
    try {
      await fs.access(meta.path);
      return meta.path;
    } catch {
      return undefined;
    }
  }

  async getManifest(): Promise<LocalEmbeddingManifest> {
    const manifestPath = path.join(this.addonDir(), 'manifest.json');
    try {
      const raw = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      return parseLocalManifest(raw);
    } catch {
      return { ...DEFAULT_LOCAL_MANIFEST };
    }
  }

  async getVocab(): Promise<Map<string, number> | undefined> {
    if (this.vocabCache) {
      return this.vocabCache;
    }
    const manifest = await this.getManifest();
    const layout = verifyInstalledLayout(this.addonDir(), manifest);
    if (!layout.ok || !layout.layout.vocabPath) {
      return undefined;
    }
    try {
      this.vocabCache = await loadVocabFromFile(layout.layout.vocabPath);
      return this.vocabCache;
    } catch {
      return undefined;
    }
  }

  async download(): Promise<{ ok: boolean; reason?: string }> {
    const url = this.getUrl();
    const expectedSha = this.getSha256();
    if (!url) {
      return { ok: false, reason: 'empty_url' };
    }
    if (!expectedSha) {
      return { ok: false, reason: 'missing_sha256' };
    }

    const dir = this.addonDir();
    await fs.mkdir(dir, { recursive: true });

    if (isManifestJsonUrl(url)) {
      return this.downloadFromManifestUrl(url, expectedSha, dir);
    }

    const response = await fetch(url);
    if (!response.ok) {
      return { ok: false, reason: `download_failed_${response.status}` };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!verifySha256(buffer, expectedSha)) {
      return { ok: false, reason: 'sha256_mismatch' };
    }

    const manifest = await this.tryFetchSidecarManifest(url, dir);
    const modelRel = resolveModelRelativePath(manifest);
    const target = path.join(dir, modelRel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, buffer);
    await this.persistInstall(dir, manifest, target);
    return { ok: true };
  }

  private async downloadFromManifestUrl(
    manifestUrl: string,
    expectedSha: string,
    dir: string
  ): Promise<{ ok: boolean; reason?: string }> {
    const manifestResponse = await fetch(manifestUrl);
    if (!manifestResponse.ok) {
      return { ok: false, reason: `manifest_download_failed_${manifestResponse.status}` };
    }
    const manifestBuffer = Buffer.from(await manifestResponse.arrayBuffer());
    const manifest = parseManifestBuffer(manifestBuffer);
    await fs.writeFile(path.join(dir, 'manifest.json'), manifestBuffer);

    const modelUrl = resolveBundleAssetUrl(manifestUrl, resolveModelRelativePath(manifest));
    const modelResponse = await fetch(modelUrl);
    if (!modelResponse.ok) {
      return { ok: false, reason: `model_download_failed_${modelResponse.status}` };
    }
    const modelBuffer = Buffer.from(await modelResponse.arrayBuffer());
    if (!verifySha256(modelBuffer, expectedSha)) {
      return { ok: false, reason: 'sha256_mismatch' };
    }

    const modelPath = path.join(dir, resolveModelRelativePath(manifest));
    await fs.mkdir(path.dirname(modelPath), { recursive: true });
    await fs.writeFile(modelPath, modelBuffer);

    const vocabRel = manifest.vocabFile;
    if (vocabRel) {
      const vocabUrl = resolveBundleAssetUrl(manifestUrl, vocabRel);
      const vocabResponse = await fetch(vocabUrl);
      if (!vocabResponse.ok) {
        return { ok: false, reason: `vocab_download_failed_${vocabResponse.status}` };
      }
      const vocabBuffer = Buffer.from(await vocabResponse.arrayBuffer());
      await fs.writeFile(path.join(dir, vocabRel), vocabBuffer);
    }

    const layout = verifyInstalledLayout(dir, manifest);
    if (!layout.ok) {
      return { ok: false, reason: layout.reason };
    }

    await this.persistInstall(dir, manifest, layout.layout.modelPath);
    return { ok: true };
  }

  private async tryFetchSidecarManifest(
    modelUrl: string,
    dir: string
  ): Promise<LocalEmbeddingManifest> {
    const sidecarUrl = modelUrl.replace(/\.onnx(\?.*)?$/i, '.manifest.json$1');
    if (sidecarUrl === modelUrl) {
      await fs.writeFile(
        path.join(dir, 'manifest.json'),
        JSON.stringify(DEFAULT_LOCAL_MANIFEST, null, 2),
        'utf8'
      );
      return { ...DEFAULT_LOCAL_MANIFEST };
    }
    try {
      const response = await fetch(sidecarUrl);
      if (!response.ok) {
        throw new Error('sidecar_missing');
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const manifest = parseManifestBuffer(buffer);
      await fs.writeFile(path.join(dir, 'manifest.json'), buffer);
      return manifest;
    } catch {
      await fs.writeFile(
        path.join(dir, 'manifest.json'),
        JSON.stringify(DEFAULT_LOCAL_MANIFEST, null, 2),
        'utf8'
      );
      return { ...DEFAULT_LOCAL_MANIFEST };
    }
  }

  private async persistInstall(
    dir: string,
    manifest: LocalEmbeddingManifest,
    modelPath: string
  ): Promise<void> {
    const layout = verifyInstalledLayout(dir, manifest);
    if (!layout.ok) {
      throw new Error(layout.reason);
    }
    resetOnnxSessionCache();
    this.vocabCache = undefined;
    const version = manifest.version || new Date().toISOString().slice(0, 10);
    await this.context.globalState.update(this.storageKey, {
      version,
      path: modelPath,
      modelId: manifest.modelId,
    } satisfies StoredAddonMeta);
  }
}

export { sha256Buffer };
