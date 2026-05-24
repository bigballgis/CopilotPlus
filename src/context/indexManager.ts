/** Codebase + RAG index builder — R-CTX-2, R-CTX-3, R-CTX-5 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { COPILOT_PLUS_HOME } from '../shared/constants';
import { chunkMarkdownDoc, chunkSourceFile, isIndexableCodeFile } from './chunking';
import { GitignoreStore, shouldSkipCodeIndexPath } from './gitignoreFilter';
import type { IndexChunk, IndexState } from './types';
import { UnifiedRetrieval } from './unifiedRetrieval';
import type { DocumentTreeService } from '../docs/documentTreeService';
import type { PlatformServices } from '../platform/services';
import { computeChunkEmbeddings, resolveEmbeddingMode, type EmbeddingResolution } from './embeddingResolver';
import type { LocalEmbeddingAddon } from './localEmbeddingAddon';

const CODE_INDEX = 'index/code/chunks.json';
const DOC_INDEX = 'index/docs/chunks.json';
const STARTUP_REBUILD_DELAY_MS = 100;
const FS_UPDATE_DEBOUNCE_MS = 2000;

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
  private codeChunks: IndexChunk[] = [];
  private docChunks: IndexChunk[] = [];
  private debounceTimer: NodeJS.Timeout | undefined;
  private pendingCodePaths = new Set<string>();
  private rebuildInFlight = false;

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

  isRetrievalAvailable(): boolean {
    return this.state.code !== 'Failed' && this.state.docs !== 'Failed';
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
    this.state.code = 'Building';
    if (this.platform.getSettings().ragEnabled) {
      this.state.docs = 'Building';
    }
    await this.loadPersistedIndexes();
    this.watchWorkspace(context);
    this.scheduleStartupRebuild();
  }

  async rebuildAll(): Promise<void> {
    if (this.rebuildInFlight) {
      return;
    }
    this.rebuildInFlight = true;
    await this.resolveMode();
    this.state.code = 'Rebuilding';
    if (this.platform.getSettings().ragEnabled) {
      this.state.docs = 'Rebuilding';
    }
    try {
      this.codeChunks = await this.buildCodeIndex();
      this.retrieval.setCodeChunks(this.codeChunks);
      this.state.codeChunks = this.codeChunks.length;
      this.state.code = 'Ready';

      if (this.platform.getSettings().ragEnabled) {
        this.docChunks = await this.buildDocIndex();
        this.retrieval.setDocChunks(this.docChunks);
        this.state.docChunks = this.docChunks.length;
        this.state.docs = 'Ready';
      }

      this.retrieval.setEmbeddingMode(this.resolution.mode);
      this.state.embeddedChunks =
        this.codeChunks.filter((c) => c.embedding?.length).length +
        this.docChunks.filter((c) => c.embedding?.length).length;
      this.state.lastError = undefined;
    } catch (err) {
      this.state.code = 'Failed';
      if (this.platform.getSettings().ragEnabled) {
        this.state.docs = 'Failed';
      }
      this.state.lastError = err instanceof Error ? err.message : String(err);
    } finally {
      this.rebuildInFlight = false;
    }
  }

  private scheduleStartupRebuild(): void {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      void this.rebuildAll();
    }, STARTUP_REBUILD_DELAY_MS);
  }

  private async loadPersistedIndexes(): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      return;
    }
    this.codeChunks = await this.readPersisted(root, CODE_INDEX);
    if (this.platform.getSettings().ragEnabled) {
      this.docChunks = await this.readPersisted(root, DOC_INDEX);
    }
    if (this.codeChunks.length) {
      this.retrieval.setCodeChunks(this.codeChunks);
      this.state.codeChunks = this.codeChunks.length;
      this.state.code = 'Ready';
    }
    if (this.docChunks.length) {
      this.retrieval.setDocChunks(this.docChunks);
      this.state.docChunks = this.docChunks.length;
      this.state.docs = 'Ready';
    }
    this.retrieval.setEmbeddingMode(this.resolution.mode);
    this.state.embeddedChunks =
      this.codeChunks.filter((c) => c.embedding?.length).length +
      this.docChunks.filter((c) => c.embedding?.length).length;
  }

  private async readPersisted(root: string, rel: string): Promise<IndexChunk[]> {
    const file = path.join(root, COPILOT_PLUS_HOME, rel);
    try {
      const raw = await fs.readFile(file, 'utf8');
      const parsed = JSON.parse(raw) as IndexChunk[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async embedIfNeeded(chunks: IndexChunk[]): Promise<void> {
    await computeChunkEmbeddings(chunks, this.resolution, this.localAddon);
  }

  private async buildCodeIndex(): Promise<IndexChunk[]> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      return [];
    }
    const gitignore = this.platform.getSettings().respectGitignore
      ? await GitignoreStore.load(root)
      : null;
    const chunks: IndexChunk[] = [];
    await this.walkCode(root, root, gitignore, async (rel, content) => {
      chunks.push(...this.chunksForCodeFile(rel, content));
    });
    await this.embedIfNeeded(chunks);
    await this.persist(root, CODE_INDEX, chunks);
    return chunks;
  }

  private chunksForCodeFile(rel: string, content: string): IndexChunk[] {
    const norm = rel.replace(/\\/g, '/');
    return chunkSourceFile(norm, content).map((part) => ({
      id: `code:${norm}:${part.line}`,
      corpus: 'code' as const,
      path: norm,
      line: part.line,
      text: part.text,
    }));
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
    watcher.onDidCreate((uri) => this.scheduleCodePathUpdate(uri));
    watcher.onDidChange((uri) => this.scheduleCodePathUpdate(uri));
    watcher.onDidDelete((uri) => void this.removeCodePath(uri));
    this.watchers.push(watcher);

    const gitignorePattern = new vscode.RelativePattern(root, '**/.gitignore');
    const gitignoreWatcher = vscode.workspace.createFileSystemWatcher(gitignorePattern);
    const onGitignoreChange = () => {
      void this.rebuildAll();
    };
    gitignoreWatcher.onDidCreate(onGitignoreChange);
    gitignoreWatcher.onDidChange(onGitignoreChange);
    gitignoreWatcher.onDidDelete(onGitignoreChange);
    this.watchers.push(gitignoreWatcher);

    context.subscriptions.push(...this.watchers);
  }

  private scheduleCodePathUpdate(uri: vscode.Uri): void {
    const rel = this.toWorkspaceRel(uri);
    if (!rel || !isIndexableCodeFile(path.basename(rel))) {
      return;
    }
    this.pendingCodePaths.add(rel);
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => void this.flushIncrementalUpdates(), FS_UPDATE_DEBOUNCE_MS);
  }

  private async flushIncrementalUpdates(): Promise<void> {
    if (!this.pendingCodePaths.size || this.rebuildInFlight) {
      return;
    }
    const paths = [...this.pendingCodePaths];
    this.pendingCodePaths.clear();
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      return;
    }
    this.state.code = 'Building';
    try {
      const gitignore = this.platform.getSettings().respectGitignore
        ? await GitignoreStore.load(root)
        : null;
      for (const rel of paths) {
        await this.updateCodePath(root, rel, gitignore);
      }
      this.retrieval.setCodeChunks(this.codeChunks);
      this.state.codeChunks = this.codeChunks.length;
      this.state.embeddedChunks =
        this.codeChunks.filter((c) => c.embedding?.length).length +
        this.docChunks.filter((c) => c.embedding?.length).length;
      await this.persist(root, CODE_INDEX, this.codeChunks);
      this.state.code = 'Ready';
      this.state.lastError = undefined;
    } catch (err) {
      this.state.code = 'Failed';
      this.state.lastError = err instanceof Error ? err.message : String(err);
    }
  }

  private async updateCodePath(
    root: string,
    rel: string,
    gitignore: GitignoreStore | null
  ): Promise<void> {
    const norm = rel.replace(/\\/g, '/');
    this.codeChunks = this.codeChunks.filter((c) => c.path !== norm);
    if (
      shouldSkipCodeIndexPath(norm, {
        respectGitignore: Boolean(gitignore),
        gitignore,
        isSensitive: (p) => this.platform.isPathSensitive(p).sensitive,
      })
    ) {
      return;
    }
    const abs = path.join(root, norm);
    const content = await fs.readFile(abs, 'utf8').catch(() => undefined);
    if (content === undefined) {
      return;
    }
    const fresh = this.chunksForCodeFile(norm, content);
    await this.embedIfNeeded(fresh);
    this.codeChunks.push(...fresh);
  }

  private async removeCodePath(uri: vscode.Uri): Promise<void> {
    const rel = this.toWorkspaceRel(uri);
    if (!rel) {
      return;
    }
    const norm = rel.replace(/\\/g, '/');
    const before = this.codeChunks.length;
    this.codeChunks = this.codeChunks.filter((c) => c.path !== norm);
    if (this.codeChunks.length === before) {
      return;
    }
    this.retrieval.setCodeChunks(this.codeChunks);
    this.state.codeChunks = this.codeChunks.length;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) {
      await this.persist(root, CODE_INDEX, this.codeChunks);
    }
  }

  private toWorkspaceRel(uri: vscode.Uri): string | undefined {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      return undefined;
    }
    const rel = path.relative(root, uri.fsPath).replace(/\\/g, '/');
    if (rel.startsWith('..')) {
      return undefined;
    }
    return rel;
  }

  private async walkCode(
    root: string,
    dir: string,
    gitignore: GitignoreStore | null,
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
      if (!gitignore && (name === 'node_modules' || name === '.git' || name === 'dist' || name === 'dist-test')) {
        continue;
      }
      const abs = path.join(dir, name);
      const rel = relBase ? path.join(relBase, name) : name;
      const relPosix = rel.replace(/\\/g, '/');
      let stat;
      try {
        stat = await fs.stat(abs);
      } catch {
        continue;
      }
      if (
        shouldSkipCodeIndexPath(relPosix, {
          respectGitignore: Boolean(gitignore),
          gitignore,
          isSensitive: (p) => this.platform.isPathSensitive(p).sensitive,
          isDirectory: stat.isDirectory(),
        })
      ) {
        continue;
      }
      if (stat.isDirectory()) {
        await this.walkCode(root, abs, gitignore, fn, relPosix);
      } else if (isIndexableCodeFile(name)) {
        const content = await fs.readFile(abs, 'utf8').catch(() => '');
        await fn(relPosix, content);
      }
    }
  }
}
