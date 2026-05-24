/** Document tree CRUD and index — R-DOCS-1, R-DOCS-6 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  docPathValid,
  parseFrontmatter,
  validateFrontmatter,
  type DocFrontmatter,
  type DocLevel,
} from './frontmatter';
import { composeDocument, defaultBody, normalizeFrontmatter, serializeFrontmatter } from './frontmatterSerialize';
import { computeReviewBadge, shouldAutoMarkReviewedOnAccept, type ReviewBadge } from './reviewBadge';
import { isDocumentStale, collectSubtreeDocPaths } from './docLifecycle';
import { NamingAliasStore } from './namingAliases';
import { docsRoot, parseDocRelativePath, pathForDoc, systemDocPath } from './paths';
import type { DiffReviewService } from '../editing/diffReview';

export interface DocEntry {
  relativePath: string;
  frontmatter: DocFrontmatter;
  body: string;
  valid: boolean;
  errors: string[];
}

export interface DocTreeNode {
  id: string;
  title: string;
  level: DocLevel;
  path: string;
  children: DocTreeNode[];
  lateral: DocFrontmatter['lateral'];
}

export class DocumentTreeService {
  private cache: DocEntry[] = [];
  private watcher: vscode.FileSystemWatcher | undefined;
  private readonly onChangeEmitter = new vscode.EventEmitter<void>();
  readonly onChange = this.onChangeEmitter.event;

  constructor(
    private readonly diffReview?: DiffReviewService,
    private readonly namingAliases?: NamingAliasStore
  ) {}

  startWatching(context: vscode.ExtensionContext): void {
    const root = this.workspaceRoot();
    if (!root) {
      return;
    }
    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(path.join(root, '.copilotPlus', 'docs')),
      '**/*.md'
    );
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const refresh = () => void this.scan();
    this.watcher.onDidCreate(refresh);
    this.watcher.onDidChange(refresh);
    this.watcher.onDidDelete(refresh);
    context.subscriptions.push(this.watcher);
    void this.scan();
  }

  async scan(): Promise<DocEntry[]> {
    return this.scanEntries(false);
  }

  private async scanEntries(aliasSynced: boolean): Promise<DocEntry[]> {
    const docsRootPath = this.docsAbsoluteRoot();
    if (!docsRootPath) {
      this.cache = [];
      return [];
    }
    const entries: DocEntry[] = [];
    await this.walkMd(docsRootPath, async (abs, rel) => {
      const workspaceRel = path.posix.join('.copilotPlus', 'docs', rel.replace(/\\/g, '/'));
      const content = await fs.readFile(abs, 'utf8');
      const parsed = parseFrontmatter(content);
      const fm = parsed.frontmatter
        ? normalizeFrontmatter(parsed.frontmatter as unknown as Record<string, unknown>)
        : null;
      entries.push({
        relativePath: workspaceRel,
        frontmatter: fm ?? ({} as DocFrontmatter),
        body: parsed.body,
        valid: parsed.errors.length === 0 && !!fm,
        errors: parsed.errors,
      });
    });

    if (!aliasSynced && this.namingAliases) {
      const workspaceRoot = this.workspaceRoot();
      if (workspaceRoot) {
        this.namingAliases.clearRewrites();
        await this.namingAliases.load(workspaceRoot);
        const updated = await this.namingAliases.syncDocumentLinks(this, entries);
        if (updated > 0) {
          return this.scanEntries(true);
        }
      }
    }

    this.cache = entries;
    this.onChangeEmitter.fire();
    return entries;
  }

  getEntries(): DocEntry[] {
    return this.cache;
  }

  getTree(): DocTreeNode[] {
    const byId = new Map<string, DocTreeNode>();
    for (const e of this.cache) {
      if (!e.valid || e.relativePath.includes('/archive/')) {
        continue;
      }
      byId.set(e.frontmatter.id, {
        id: e.frontmatter.id,
        title: e.frontmatter.title,
        level: e.frontmatter.level,
        path: e.relativePath,
        children: [],
        lateral: e.frontmatter.lateral,
      });
    }
    const roots: DocTreeNode[] = [];
    for (const e of this.cache) {
      if (!e.valid || e.frontmatter.level !== 'system' || e.relativePath.includes('/archive/')) {
        continue;
      }
      roots.push(byId.get(e.frontmatter.id)!);
    }
    for (const e of this.cache) {
      if (!e.valid || e.relativePath.includes('/archive/')) {
        continue;
      }
      const node = byId.get(e.frontmatter.id);
      if (!node) {
        continue;
      }
      for (const childId of e.frontmatter.children ?? []) {
        const child = byId.get(childId);
        if (child) {
          node.children.push(child);
        }
      }
    }
    return roots.filter(Boolean);
  }

  getByPath(relativePath: string): DocEntry | undefined {
    return this.cache.find((e) => e.relativePath === relativePath.replace(/\\/g, '/'));
  }

  async ensureDefaultSystem(systemId = 'default'): Promise<DocEntry> {
    const rel = systemDocPath(systemId);
    const existing = this.getByPath(rel);
    if (existing) {
      return existing;
    }
    return this.createDocument({
      systemId,
      level: 'system',
      id: systemId,
      title: 'Default System',
      parent: '',
    });
  }

  async createDocument(input: {
    systemId: string;
    level: DocLevel;
    id: string;
    title: string;
    parent: string;
    moduleId?: string;
    featureId?: string;
  }): Promise<DocEntry> {
    let rel: string;
    switch (input.level) {
      case 'system':
        rel = systemDocPath(input.systemId);
        break;
      case 'module':
        rel = pathForDoc(input.systemId, 'module', { moduleId: input.id });
        break;
      case 'feature':
        rel = pathForDoc(input.systemId, 'feature', {
          moduleId: input.moduleId!,
          featureId: input.id,
        });
        break;
      case 'component':
        rel = pathForDoc(input.systemId, 'component', {
          moduleId: input.moduleId!,
          featureId: input.featureId!,
          componentId: input.id,
        });
        break;
    }
    if (!docPathValid(rel)) {
      throw new Error(`Invalid document path: ${rel}`);
    }

    const fm: DocFrontmatter = {
      id: input.id,
      level: input.level,
      title: input.title,
      parent: input.parent,
      children: [],
      lateral: [],
      ai_generated: true,
    };
    const body = defaultBody(input.title);
    const validation = validateFrontmatter(fm as unknown as Record<string, unknown>, body);
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '));
    }

    const content = composeDocument(fm, body);
    await this.writeDocumentFile(rel, content);

    if (input.parent) {
      await this.scan();
      await this.addChildToParent(input.parent, input.id);
    }

    await this.scan();
    return this.getByPath(rel)!;
  }

  async writeWithReview(relativePath: string, content: string, operation: string): Promise<boolean> {
    const abs = this.absFromRelative(relativePath);
    await fs.mkdir(path.dirname(abs), { recursive: true });

    let original = '';
    try {
      await fs.access(abs);
      original = await fs.readFile(abs, 'utf8');
    } catch {
      /* new file */
    }

    if (this.diffReview) {
      const accepted = await this.diffReview.reviewFullFile(
        vscode.Uri.file(abs),
        original,
        content,
        operation
      );
      if (accepted) {
        await this.scan();
        await this.applyAutoReviewMarkerIfNeeded(relativePath);
      }
      return accepted;
    }

    await fs.writeFile(abs, content, 'utf8');
    await this.scan();
    await this.applyAutoReviewMarkerIfNeeded(relativePath);
    return true;
  }

  /** R-DOCS-10.2 — mark system/module docs reviewed when user accepts doc_write diff */
  private async applyAutoReviewMarkerIfNeeded(relativePath: string): Promise<void> {
    const entry = this.getByPath(relativePath);
    if (!entry?.valid || !shouldAutoMarkReviewedOnAccept(entry.frontmatter.level)) {
      return;
    }
    const reviewer =
      (await vscode.authentication.getSession('github', [], { createIfNone: false }))?.account?.label ?? 'user';
    const fm = {
      ...entry.frontmatter,
      human_reviewed_at: new Date().toISOString(),
      human_reviewed_by: reviewer,
    };
    const abs = this.absFromRelative(relativePath);
    await fs.writeFile(abs, composeDocument(fm, entry.body), 'utf8');
    await this.scan();
  }

  async read(relativePath: string): Promise<{ frontmatter: DocFrontmatter; body: string }> {
    const entry = this.getByPath(relativePath) ?? (await this.scan(), this.getByPath(relativePath));
    if (!entry) {
      const abs = this.absFromRelative(relativePath);
      const content = await fs.readFile(abs, 'utf8');
      const parsed = parseFrontmatter(content);
      if (!parsed.frontmatter) {
        throw new Error('Invalid document');
      }
      return {
        frontmatter: normalizeFrontmatter(parsed.frontmatter as unknown as Record<string, unknown>),
        body: parsed.body,
      };
    }
    return { frontmatter: entry.frontmatter, body: entry.body };
  }

  async markReviewed(relativePath: string, reviewer: string): Promise<void> {
    const { frontmatter, body } = await this.read(relativePath);
    const fm = {
      ...frontmatter,
      human_reviewed_at: new Date().toISOString(),
      human_reviewed_by: reviewer,
    };
    const content = composeDocument(fm, body);
    await this.writeWithReview(relativePath, content, 'mark reviewed');
  }

  findStaleDocuments(thresholdDays: number): DocEntry[] {
    return this.cache.filter((e) => e.valid && isDocumentStale(e, thresholdDays));
  }

  findStaleInSubtree(rootPath: string, thresholdDays: number): DocEntry[] {
    const subtree = new Set(collectSubtreeDocPaths(rootPath, this.cache));
    return this.findStaleDocuments(thresholdDays).filter((e) => subtree.has(e.relativePath));
  }

  /** R-DOCS-9.1 — update last_referenced_at when docs enter scope resolution */
  async touchLastReferenced(relativePaths: string[]): Promise<void> {
    const now = new Date().toISOString();
    const unique = [...new Set(relativePaths.map((p) => p.replace(/\\/g, '/')))];
    let changed = false;
    for (const rel of unique) {
      const entry = this.getByPath(rel);
      if (!entry?.valid || rel.includes('/archive/')) {
        continue;
      }
      if (entry.frontmatter.last_referenced_at === now) {
        continue;
      }
      const fm = { ...entry.frontmatter, last_referenced_at: now };
      await fs.writeFile(this.absFromRelative(rel), composeDocument(fm, entry.body), 'utf8');
      changed = true;
    }
    if (changed) {
      await this.scan();
      this.onChangeEmitter.fire();
    }
  }

  reviewBadge(entry: DocEntry): ReviewBadge {
    return computeReviewBadge(entry);
  }

  getArchivedEntries(): DocEntry[] {
    return this.cache.filter((e) => e.valid && e.relativePath.includes('/archive/'));
  }

  async readRaw(relativePath: string): Promise<string> {
    return fs.readFile(this.absFromRelative(relativePath), 'utf8');
  }

  async writeRaw(relativePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(this.absFromRelative(relativePath)), { recursive: true });
    await fs.writeFile(this.absFromRelative(relativePath), content, 'utf8');
  }

  async deleteDocument(relativePath: string): Promise<void> {
    await fs.unlink(this.absFromRelative(relativePath));
    await this.scan();
  }

  async archiveDocument(relativePath: string): Promise<string> {
    const entry = this.getByPath(relativePath);
    if (!entry) {
      throw new Error('Document not found');
    }
    const archiveRel = relativePath.replace('.copilotPlus/docs/', '.copilotPlus/docs/archive/');
    const abs = this.absFromRelative(relativePath);
    const archiveAbs = this.absFromRelative(archiveRel);
    await fs.mkdir(path.dirname(archiveAbs), { recursive: true });
    await fs.rename(abs, archiveAbs);
    await this.scan();
    return archiveRel;
  }

  async openInEditor(relativePath: string): Promise<void> {
    const root = this.workspaceRoot();
    if (!root) {
      return;
    }
    const uri = vscode.Uri.file(path.join(root, relativePath.replace(/\//g, path.sep)));
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });
  }

  private async writeDocumentFile(rel: string, content: string): Promise<void> {
    const abs = this.absFromRelative(rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf8');
  }

  private async addChildToParent(parentId: string, childId: string): Promise<void> {
    const parent = this.cache.find((e) => e.frontmatter.id === parentId);
    if (!parent) {
      return;
    }
    const fm = { ...parent.frontmatter, children: [...new Set([...parent.frontmatter.children, childId])] };
    const content = composeDocument(fm, parent.body);
    await fs.writeFile(this.absFromRelative(parent.relativePath), content, 'utf8');
  }

  private async walkMd(dir: string, fn: (abs: string, relFromDocs: string) => Promise<void>, rel = ''): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const abs = path.join(dir, name);
      const nextRel = rel ? path.join(rel, name) : name;
      const stat = await fs.stat(abs);
      if (stat.isDirectory()) {
        await this.walkMd(abs, fn, nextRel);
      } else if (name.endsWith('.md')) {
        await fn(abs, nextRel);
      }
    }
  }

  private workspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private docsAbsoluteRoot(): string | undefined {
    const root = this.workspaceRoot();
    return root ? docsRoot(root) : undefined;
  }

  private absFromRelative(relativePath: string): string {
    return path.join(this.workspaceRoot()!, relativePath.replace(/\//g, path.sep));
  }
}

export { parseDocRelativePath };
