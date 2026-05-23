/** Codebase + RAG index builder — R-CTX-2, R-CTX-3, R-CTX-5 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { COPILOT_PLUS_HOME } from '../shared/constants';
import { chunkMarkdownDoc, chunkSourceFile, isIndexableCodeFile } from './chunking';
import type { IndexChunk, IndexState } from './types';
import { UnifiedRetrieval } from './unifiedRetrieval';
import type { DocumentTreeService } from '../docs/documentTreeService';
import type { PlatformServices } from '../platform/services';
import { computeChunkEmbeddings, resolveEmbeddingMode, type EmbeddingResolution } from './embeddingResolver';
import type { LocalEmbeddingAddon } from './localEmbeddingAddon';

const CODE_INDEX = 'index/code/chunks.json';
const DOC_INDEX = 'index/docs/chunks.json';

export class IndexManager {
  readonly retrieval = new UnifiedRetrieval();
  private state: IndexState = {
    code: 'Idle',
    docs: 'Idle',
    embeddingMode: 'sparse_only',
    codeChunks: 0,
    docChunks: 0,
  };
  private resolution: EmbeddingResolution = { mode: 'sparse_only' };
  private watchers: vscode.Disposable[] = [];

  constructor(
    private readonly platform: PlatformServices,
    private readonly docs: DocumentTreeService,
    private readonly localAddon: LocalEmbeddingAddon
  ) {}

  getState(): IndexState {
    return { ...this.state };
  }

  getResolution(): EmbeddingResolution {
    return { ...this.resolution };
  }

  async resolveMode(): Promise<EmbeddingResolution> {
    this.resolution = await resolveEmbeddingMode(
      this.platform.getSettings().embeddingMode,
      this.localAddon
    );
    this.state.embeddingMode = this.resolution.mode;
    this.state.embeddingModelId = this.resolution.modelId;
    this.state.embeddingAddonVersion = this.resolution.addonVersion;
    this.state.embeddingNotice = this.resolution.notice;
    return this.resolution;
  }

  async start(context: vscode.ExtensionContext): Promise<void> {
    await this.resolveMode();
    await this.rebuildAll();
    this.watchWorkspace(context);
  }

  async rebuildAll(): Promise<void> {
    await this.resolveMode();
    if (!this.platform.getSettings().ragEnabled) {
      this.state.code = 'Ready';
      this.state.docs = 'Ready';
      return;
    }
    this.state.code = 'Rebuilding';
    this.state.docs = 'Rebuilding';
    try {
      const codeChunks = await this.buildCodeIndex();
      const docChunks = await this.buildDocIndex();
      this.retrieval.setCodeChunks(codeChunks);
      this.retrieval.setDocChunks(docChunks);
      this.retrieval.setEmbeddingMode(this.resolution.mode);
      this.state.codeChunks = codeChunks.length;
      this.state.docChunks = docChunks.length;
      this.state.embeddedChunks =
        codeChunks.filter((c) => c.embedding?.length).length +
        docChunks.filter((c) => c.embedding?.length).length;
      this.state.code = 'Ready';
      this.state.docs = 'Ready';
      this.state.lastError = undefined;
    } catch (err) {
      this.state.code = 'Failed';
      this.state.docs = 'Failed';
      this.state.lastError = err instanceof Error ? err.message : String(err);
    }
  }

  private async embedIfNeeded(chunks: IndexChunk[]): Promise<void> {
    if (this.resolution.mode === 'local') {
      return;
    }
    await computeChunkEmbeddings(chunks, this.resolution);
  }

  private async buildCodeIndex(): Promise<IndexChunk[]> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      return [];
    }
    const chunks: IndexChunk[] = [];
    await this.walkCode(root, root, async (rel, content) => {
      if (this.platform.isPathSensitive(rel).sensitive) {
        return;
      }
      if (!isIndexableCodeFile(rel)) {
        return;
      }
      if (rel.startsWith('.copilotPlus/')) {
        return;
      }
      for (const part of chunkSourceFile(rel, content)) {
        chunks.push({
          id: `code:${rel}:${part.line}`,
          corpus: 'code',
          path: rel.replace(/\\/g, '/'),
          line: part.line,
          text: part.text,
        });
      }
    });
    await this.embedIfNeeded(chunks);
    await this.persist(root, CODE_INDEX, chunks);
    return chunks;
  }

  private async buildDocIndex(): Promise<IndexChunk[]> {
    await this.docs.scan();
    const entries = this.docs.getEntries().filter((e) => e.valid && !e.relativePath.includes('/archive/'));
    const chunks: IndexChunk[] = [];
    for (const entry of entries) {
      for (const part of chunkMarkdownDoc(entry.relativePath, entry.body)) {
        chunks.push({
          id: `doc:${entry.relativePath}:${part.heading}`,
          corpus: 'doc',
          path: entry.relativePath,
          heading: part.heading,
          text: part.text,
          docPaths: [entry.relativePath],
        });
      }
    }
    await this.embedIfNeeded(chunks);
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) {
      await this.persist(root, DOC_INDEX, chunks);
    }
    return chunks;
  }

  private async persist(root: string, rel: string, chunks: IndexChunk[]): Promise<void> {
    const file = path.join(root, COPILOT_PLUS_HOME, rel);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(chunks), 'utf8');
  }

  private watchWorkspace(context: vscode.ExtensionContext): void {
    const root = vscode.workspace.workspaceFolders?.[0];
    if (!root) {
      return;
    }
    const pattern = new vscode.RelativePattern(root, '**/*');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    let timer: NodeJS.Timeout | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void this.rebuildAll(), 2000);
    };
    watcher.onDidCreate(schedule);
    watcher.onDidChange(schedule);
    watcher.onDidDelete(schedule);
    this.watchers.push(watcher);
    context.subscriptions.push(...this.watchers);
  }

  private async walkCode(
    root: string,
    dir: string,
    fn: (rel: string, content: string) => Promise<void>,
    relBase = ''
  ): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === 'node_modules' || name === '.git' || name === 'dist' || name === 'dist-test') {
        continue;
      }
      const abs = path.join(dir, name);
      const rel = relBase ? path.join(relBase, name) : name;
      const stat = await fs.stat(abs);
      if (stat.isDirectory()) {
        await this.walkCode(root, abs, fn, rel);
      } else if (isIndexableCodeFile(name)) {
        const content = await fs.readFile(abs, 'utf8').catch(() => '');
        await fn(rel.replace(/\\/g, '/'), content);
      }
    }
  }
}
