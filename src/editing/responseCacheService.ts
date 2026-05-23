/** Response cache — R-EDIT-8 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { COPILOT_PLUS_HOME } from '../shared/constants';
import type { PlatformServices } from '../platform/services';
import {
  formatSelectionRange,
  hashFullCacheKey,
  hashPartialCacheKey,
  sha256Text,
  type ResponseCacheKeyInput,
  type ResponseSurface,
} from './responseCacheKey';
import { tryRebaseWithTimeout } from './responseRebase';

const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_BYTES = 100 * 1024 * 1024;
const REBASE_TIMEOUT_MS = 200;

export type ResponseCacheBadge = 'Cached' | 'Rebased';

export interface ResponseCacheLookup {
  hit: true;
  text: string;
  badge: ResponseCacheBadge;
}

interface StoredResponseEntry {
  fullKey: string;
  partialKey: string;
  surface: ResponseSurface;
  createdAt: string;
  lastAccess: string;
  sizeBytes: number;
  modelId: string;
  fileSha256: string;
  fileRelative: string;
  selectionRange: string;
  promptText: string;
  mentionSet: string[];
  agentsMdSha256: string;
  originalSelectedText: string;
  contextBefore?: string;
  contextAfter?: string;
  responseText: string;
}

interface CacheIndex {
  entries: Array<{ key: string; lastAccess: string; sizeBytes: number }>;
  totalBytes: number;
}

export interface ResponseCacheStoreInput {
  surface: ResponseSurface;
  promptText: string;
  modelId: string;
  fileRelative: string;
  fileContent: string;
  selectionRange: vscode.Range;
  mentionSet?: readonly string[];
  originalSelectedText: string;
  contextBefore?: string;
  contextAfter?: string;
  responseText: string;
}

export class ResponseCacheService {
  private agentsMdSha256 = '';

  constructor(private readonly platform: PlatformServices) {
    void this.refreshAgentsMdSha256();
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (this.isAgentsMdUri(e.document.uri)) {
        void this.refreshAgentsMdSha256();
        void this.clearAll();
      }
    });
  }

  async lookup(
    input: Omit<ResponseCacheStoreInput, 'originalSelectedText' | 'contextBefore' | 'contextAfter' | 'responseText'> & {
      originalSelectedText: string;
      contextBefore?: string;
      contextAfter?: string;
    }
  ): Promise<ResponseCacheLookup | undefined> {
    if (!this.platform.getSettings().cacheEnabled) {
      return undefined;
    }

    const agentsMdSha256 = await this.getAgentsMdSha256();
    const mentionSet = input.mentionSet ?? [];
    const fileSha256 = sha256Text(input.fileContent);
    const selectionRange = formatSelectionRange(input.selectionRange);
    const keyInput: ResponseCacheKeyInput = {
      surface: input.surface,
      promptText: input.promptText,
      modelId: input.modelId,
      fileSha256,
      selectionRange,
      mentionSet,
      agentsMdSha256,
    };
    const fullKey = hashFullCacheKey(keyInput);
    const root = this.cacheRoot();
    if (!root) {
      return undefined;
    }

    const exact = await this.readEntry(root, fullKey);
    if (exact && this.isFresh(exact)) {
      await this.touchEntry(root, exact);
      return { hit: true, text: exact.responseText, badge: 'Cached' };
    }

    const partialKey = hashPartialCacheKey({
      surface: input.surface,
      promptText: input.promptText,
      modelId: input.modelId,
      mentionSet,
      agentsMdSha256,
    });
    const candidates = await this.findByPartialKey(root, partialKey, input.surface);
    for (const entry of candidates) {
      if (!this.isFresh(entry)) {
        continue;
      }
      const rebase = await tryRebaseWithTimeout(
        {
          currentFileContent: input.fileContent,
          originalSelectedText: input.originalSelectedText,
          cachedResponse: entry.responseText,
          contextBefore: input.contextBefore ?? entry.contextBefore,
          contextAfter: input.contextAfter ?? entry.contextAfter,
        },
        REBASE_TIMEOUT_MS
      );
      if (rebase.ok) {
        await this.touchEntry(root, entry);
        return { hit: true, text: rebase.replacement, badge: 'Rebased' };
      }
    }

    return undefined;
  }

  async store(input: ResponseCacheStoreInput): Promise<void> {
    if (!this.platform.getSettings().cacheEnabled) {
      return;
    }

    const root = this.cacheRoot();
    if (!root) {
      return;
    }

    const agentsMdSha256 = await this.getAgentsMdSha256();
    const mentionSet = [...(input.mentionSet ?? [])].sort();
    const fileSha256 = sha256Text(input.fileContent);
    const selectionRange = formatSelectionRange(input.selectionRange);
    const keyInput: ResponseCacheKeyInput = {
      surface: input.surface,
      promptText: input.promptText,
      modelId: input.modelId,
      fileSha256,
      selectionRange,
      mentionSet,
      agentsMdSha256,
    };
    const fullKey = hashFullCacheKey(keyInput);
    const partialKey = hashPartialCacheKey({
      surface: input.surface,
      promptText: input.promptText,
      modelId: input.modelId,
      mentionSet,
      agentsMdSha256,
    });

    const entry: StoredResponseEntry = {
      fullKey,
      partialKey,
      surface: input.surface,
      createdAt: new Date().toISOString(),
      lastAccess: new Date().toISOString(),
      sizeBytes: 0,
      modelId: input.modelId,
      fileSha256,
      fileRelative: input.fileRelative,
      selectionRange,
      promptText: input.promptText,
      mentionSet,
      agentsMdSha256,
      originalSelectedText: input.originalSelectedText,
      contextBefore: input.contextBefore,
      contextAfter: input.contextAfter,
      responseText: input.responseText,
    };
    const serialized = JSON.stringify(entry);
    entry.sizeBytes = Buffer.byteLength(serialized, 'utf8');

    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, `${fullKey}.json`), JSON.stringify(entry), 'utf8');
    await this.updateIndex(root, fullKey, entry.sizeBytes);
    await this.evictIfNeeded(root);
  }

  async invalidateForFile(relativePath: string): Promise<void> {
    const norm = relativePath.replace(/\\/g, '/');
    const root = this.cacheRoot();
    if (!root) {
      return;
    }
    const index = await this.readIndex(root);
    const keep: CacheIndex['entries'] = [];
    for (const item of index.entries) {
      try {
        const raw = await fs.readFile(path.join(root, `${item.key}.json`), 'utf8');
        const entry = JSON.parse(raw) as StoredResponseEntry;
        if (entry.fileRelative.replace(/\\/g, '/') === norm) {
          await fs.rm(path.join(root, `${item.key}.json`), { force: true });
          index.totalBytes -= item.sizeBytes;
        } else {
          keep.push(item);
        }
      } catch {
        index.totalBytes -= item.sizeBytes;
      }
    }
    index.entries = keep;
    await this.writeIndex(root, index);
  }

  /** Drop entries for a file when on-disk content no longer matches cached file_sha256. */
  async invalidateIfFileContentChanged(relativePath: string, content: string): Promise<void> {
    const norm = relativePath.replace(/\\/g, '/');
    const root = this.cacheRoot();
    if (!root) {
      return;
    }
    const currentSha = sha256Text(content);
    const index = await this.readIndex(root);
    for (const item of index.entries) {
      const entry = await this.readEntry(root, item.key);
      if (
        entry &&
        entry.fileRelative.replace(/\\/g, '/') === norm &&
        entry.fileSha256 !== currentSha
      ) {
        await this.invalidateForFile(norm);
        return;
      }
    }
  }

  async clearAll(): Promise<void> {
    const root = this.cacheRoot();
    if (!root) {
      return;
    }
    try {
      await fs.rm(root, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  private cacheRoot(): string | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return undefined;
    }
    return path.join(folder.uri.fsPath, COPILOT_PLUS_HOME, 'cache', 'responses');
  }

  private isFresh(entry: StoredResponseEntry): boolean {
    const age = Date.now() - Date.parse(entry.createdAt);
    return age >= 0 && age <= CACHE_TTL_MS;
  }

  private async readEntry(root: string, key: string): Promise<StoredResponseEntry | undefined> {
    try {
      const raw = await fs.readFile(path.join(root, `${key}.json`), 'utf8');
      return JSON.parse(raw) as StoredResponseEntry;
    } catch {
      return undefined;
    }
  }

  private async findByPartialKey(
    root: string,
    partialKey: string,
    surface: ResponseSurface
  ): Promise<StoredResponseEntry[]> {
    const index = await this.readIndex(root);
    const out: StoredResponseEntry[] = [];
    for (const item of index.entries) {
      const entry = await this.readEntry(root, item.key);
      if (entry && entry.partialKey === partialKey && entry.surface === surface) {
        out.push(entry);
      }
    }
    out.sort((a, b) => Date.parse(b.lastAccess) - Date.parse(a.lastAccess));
    return out;
  }

  private async touchEntry(root: string, entry: StoredResponseEntry): Promise<void> {
    entry.lastAccess = new Date().toISOString();
    await fs.writeFile(path.join(root, `${entry.fullKey}.json`), JSON.stringify(entry), 'utf8');
    await this.updateIndex(root, entry.fullKey, entry.sizeBytes);
  }

  private async readIndex(root: string): Promise<CacheIndex> {
    try {
      const raw = await fs.readFile(path.join(root, 'index.json'), 'utf8');
      return JSON.parse(raw) as CacheIndex;
    } catch {
      return { entries: [], totalBytes: 0 };
    }
  }

  private async writeIndex(root: string, index: CacheIndex): Promise<void> {
    await fs.writeFile(path.join(root, 'index.json'), JSON.stringify(index), 'utf8');
  }

  private async updateIndex(root: string, key: string, sizeBytes: number): Promise<void> {
    const index = await this.readIndex(root);
    const existing = index.entries.findIndex((e) => e.key === key);
    if (existing >= 0) {
      index.totalBytes -= index.entries[existing].sizeBytes;
      index.entries.splice(existing, 1);
    }
    index.entries.push({ key, lastAccess: new Date().toISOString(), sizeBytes });
    index.totalBytes += sizeBytes;
    await this.writeIndex(root, index);
  }

  private async evictIfNeeded(root: string): Promise<void> {
    let index = await this.readIndex(root);
    index.entries.sort((a, b) => Date.parse(a.lastAccess) - Date.parse(b.lastAccess));
    while (index.totalBytes > MAX_CACHE_BYTES && index.entries.length > 0) {
      const oldest = index.entries.shift();
      if (!oldest) {
        break;
      }
      index.totalBytes -= oldest.sizeBytes;
      await fs.rm(path.join(root, `${oldest.key}.json`), { force: true }).catch(() => undefined);
    }
    await this.writeIndex(root, index);
  }

  private async getAgentsMdSha256(): Promise<string> {
    if (!this.agentsMdSha256) {
      await this.refreshAgentsMdSha256();
    }
    return this.agentsMdSha256;
  }

  private async refreshAgentsMdSha256(): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      this.agentsMdSha256 = '';
      return;
    }
    const agentsUri = vscode.Uri.joinPath(folder.uri, 'AGENTS.md');
    try {
      const bytes = await vscode.workspace.fs.readFile(agentsUri);
      this.agentsMdSha256 = sha256Text(Buffer.from(bytes).toString('utf8'));
    } catch {
      this.agentsMdSha256 = sha256Text('');
    }
  }

  private isAgentsMdUri(uri: vscode.Uri): boolean {
    return uri.path.endsWith('/AGENTS.md') || uri.path.endsWith('\\AGENTS.md');
  }
}
