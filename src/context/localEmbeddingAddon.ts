/** Local embedding add-on (Mode B) — R-CTX-5 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

export interface LocalAddonStatus {
  installed: boolean;
  version?: string;
  notice?: string;
}

export class LocalEmbeddingAddon {
  private readonly storageKey = 'copilotPlus.localEmbedding';

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getUrl: () => string,
    private readonly getSha256: () => string
  ) {}

  async getStatus(): Promise<LocalAddonStatus> {
    const meta = this.context.globalState.get<{ version: string; path: string }>(this.storageKey);
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
      return { installed: true, version: meta.version };
    } catch {
      return { installed: false, notice: 'Local add-on path missing — reinstall required' };
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

    const response = await fetch(url);
    if (!response.ok) {
      return { ok: false, reason: `download_failed_${response.status}` };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const digest = crypto.createHash('sha256').update(buffer).digest('hex');
    if (digest.toLowerCase() !== expectedSha.toLowerCase()) {
      return { ok: false, reason: 'sha256_mismatch' };
    }

    const dir = path.join(this.context.globalStorageUri.fsPath, 'embedding-addon');
    await fs.mkdir(dir, { recursive: true });
    const target = path.join(dir, 'model.onnx');
    await fs.writeFile(target, buffer);

    const version = new Date().toISOString().slice(0, 10);
    await this.context.globalState.update(this.storageKey, { version, path: target });
    return { ok: true };
  }
}
