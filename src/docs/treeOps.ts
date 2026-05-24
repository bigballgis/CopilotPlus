/** Document tree structural operations — R-DOCS-6 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { DocLevel, DocFrontmatter, LateralLink } from './frontmatter';
import { composeDocument } from './frontmatterSerialize';
import { findLateralDepthViolations } from './lateralDepth';
import { collectSubtreeDocPaths } from './docLifecycle';
import type { DocEntry } from './documentTreeService';
import { parseDocRelativePath, pathForDoc, systemDocPath } from './paths';

export type TreeOpResult =
  | { ok: true; path?: string }
  | { ok: false; reason: string; detail?: string };

export function childLevelFor(parentLevel: DocLevel): DocLevel | null {
  switch (parentLevel) {
    case 'system':
      return 'module';
    case 'module':
      return 'feature';
    case 'feature':
      return 'component';
    case 'component':
      return null;
  }
}

export function pathForRenamedId(relativePath: string, newId: string): string | null {
  const parsed = parseDocRelativePath(relativePath);
  if (!parsed) {
    return null;
  }
  if (parsed.level === 'system') {
    return systemDocPath(newId);
  }
  const [moduleId, featureId, componentId] = parsed.ids;
  switch (parsed.level) {
    case 'module':
      return pathForDoc(parsed.systemId, 'module', { moduleId: newId });
    case 'feature':
      return pathForDoc(parsed.systemId, 'feature', { moduleId: moduleId!, featureId: newId });
    case 'component':
      return pathForDoc(parsed.systemId, 'component', {
        moduleId: moduleId!,
        featureId: featureId!,
        componentId: newId,
      });
  }
}

export function pathForMovedDoc(entry: DocEntry, newParent: DocEntry): string | null {
  const parsed = parseDocRelativePath(entry.relativePath);
  if (!parsed) {
    return null;
  }
  const id = entry.frontmatter.id;
  switch (entry.frontmatter.level) {
    case 'system':
      return systemDocPath(id);
    case 'module':
      return pathForDoc(newParent.frontmatter.id, 'module', { moduleId: id });
    case 'feature':
      return pathForDoc(parsed.systemId, 'feature', {
        moduleId: newParent.frontmatter.id,
        featureId: id,
      });
    case 'component': {
      const featureParsed = parseDocRelativePath(newParent.relativePath);
      if (!featureParsed || featureParsed.level !== 'feature') {
        return null;
      }
      return pathForDoc(parsed.systemId, 'component', {
        moduleId: featureParsed.ids[0]!,
        featureId: newParent.frontmatter.id,
        componentId: id,
      });
    }
  }
}

export function patchLinksForIdRename(
  entries: DocEntry[],
  oldId: string,
  newId: string
): Array<{ relativePath: string; frontmatter: DocFrontmatter; body: string }> {
  const updates: Array<{ relativePath: string; frontmatter: DocFrontmatter; body: string }> = [];
  for (const entry of entries) {
    if (!entry.valid || entry.relativePath.includes('/archive/')) {
      continue;
    }
    let changed = false;
    const fm = { ...entry.frontmatter };

    if (fm.parent === oldId) {
      fm.parent = newId;
      changed = true;
    }
    if (fm.secondary_parents?.includes(oldId)) {
      fm.secondary_parents = fm.secondary_parents.map((id) => (id === oldId ? newId : id));
      changed = true;
    }
    if (fm.children.includes(oldId)) {
      fm.children = fm.children.map((id) => (id === oldId ? newId : id));
      changed = true;
    }
    if (fm.lateral?.some((link) => link.target === oldId)) {
      fm.lateral = fm.lateral!.map((link) =>
        link.target === oldId ? { ...link, target: newId } : link
      );
      changed = true;
    }
    if (changed) {
      updates.push({ relativePath: entry.relativePath, frontmatter: fm, body: entry.body });
    }
  }
  return updates;
}

export function patchLinksForRemovedId(
  entries: DocEntry[],
  removedId: string
): Array<{ relativePath: string; frontmatter: DocFrontmatter; body: string }> {
  return patchLinksForRemovedIds(entries, new Set([removedId]));
}

export function patchLinksForRemovedIds(
  entries: DocEntry[],
  removedIds: Set<string>,
  excludePaths: Set<string> = new Set()
): Array<{ relativePath: string; frontmatter: DocFrontmatter; body: string }> {
  const updates: Array<{ relativePath: string; frontmatter: DocFrontmatter; body: string }> = [];
  for (const entry of entries) {
    if (
      !entry.valid ||
      entry.relativePath.includes('/archive/') ||
      excludePaths.has(entry.relativePath) ||
      removedIds.has(entry.frontmatter.id)
    ) {
      continue;
    }
    let changed = false;
    const fm = { ...entry.frontmatter };

    const children = fm.children.filter((id) => !removedIds.has(id));
    if (children.length !== fm.children.length) {
      fm.children = children;
      changed = true;
    }
    if (fm.secondary_parents?.some((id) => removedIds.has(id))) {
      fm.secondary_parents = fm.secondary_parents.filter((id) => !removedIds.has(id));
      changed = true;
    }
    if (fm.lateral?.some((link) => removedIds.has(link.target))) {
      fm.lateral = fm.lateral!.filter((link) => !removedIds.has(link.target));
      changed = true;
    }
    if (changed) {
      updates.push({ relativePath: entry.relativePath, frontmatter: fm, body: entry.body });
    }
  }
  return updates;
}

export function filterLateralByDepth(
  entry: DocEntry,
  entries: DocEntry[],
  maxDepth: number,
  resolveId: (id: string) => string
): LateralLink[] {
  const kept: LateralLink[] = [];
  for (const link of entry.frontmatter.lateral ?? []) {
    const target = entries.find((e) => e.valid && e.frontmatter.id === resolveId(link.target));
    if (!target) {
      continue;
    }
    const violations = findLateralDepthViolations(
      { ...entry, frontmatter: { ...entry.frontmatter, lateral: [...kept, link] } },
      entries,
      maxDepth,
      resolveId
    );
    if (violations.length === 0) {
      kept.push(link);
    }
  }
  return kept;
}

/** Map descendant paths when a root document path changes — R-DOCS-6.2 */
export function mapSubtreePaths(
  oldRootPath: string,
  newRootPath: string,
  paths: Iterable<string>
): Map<string, string> {
  const normOld = oldRootPath.replace(/\\/g, '/');
  const normNew = newRootPath.replace(/\\/g, '/');
  const oldDir = normOld.replace(/\.md$/, '/');
  const newDir = normNew.replace(/\.md$/, '/');
  const map = new Map<string, string>();
  for (const raw of paths) {
    const p = raw.replace(/\\/g, '/');
    if (p === normOld) {
      map.set(p, normNew);
    } else if (p.startsWith(oldDir)) {
      map.set(p, newDir + p.slice(oldDir.length));
    }
  }
  return map;
}

function subtreePathSet(rootPath: string, entries: DocEntry[]): Set<string> {
  return new Set(collectSubtreeDocPaths(rootPath.replace(/\\/g, '/'), entries));
}

function hasPathCollision(
  writer: TreeOpsWriter,
  newPaths: Iterable<string>,
  excluding: Set<string>
): boolean {
  for (const np of newPaths) {
    if (
      writer
        .getEntries()
        .some((e) => e.valid && e.relativePath === np && !excluding.has(e.relativePath))
    ) {
      return true;
    }
  }
  return false;
}

async function renameSubtreeFiles(
  writer: TreeOpsWriter,
  oldRootPath: string,
  newRootPath: string,
  entries: DocEntry[]
): Promise<void> {
  const normOld = oldRootPath.replace(/\\/g, '/');
  const normNew = newRootPath.replace(/\\/g, '/');
  if (normOld === normNew) {
    return;
  }
  const descendants = collectSubtreeDocPaths(normOld, entries).filter((p) => p !== normOld);
  const pathMap = mapSubtreePaths(normOld, normNew, descendants);
  const sorted = [...pathMap.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of sorted) {
    await writer.renameRaw(from, to);
  }
}

function translatePatchPath(pathMap: Map<string, string>, relativePath: string): string {
  return pathMap.get(relativePath.replace(/\\/g, '/')) ?? relativePath.replace(/\\/g, '/');
}

export interface TreeOpsWriter {
  absFromRelative(relativePath: string): string;
  getEntries(): DocEntry[];
  writeRaw(relativePath: string, content: string): Promise<void>;
  deleteRaw(relativePath: string): Promise<void>;
  renameRaw(fromRel: string, toRel: string): Promise<void>;
}

export async function renameDocumentTree(
  writer: TreeOpsWriter,
  relativePath: string,
  newId: string,
  newTitle?: string
): Promise<TreeOpResult> {
  const entry = writer.getEntries().find((e) => e.relativePath === relativePath.replace(/\\/g, '/'));
  if (!entry?.valid) {
    return { ok: false, reason: 'document_not_found' };
  }
  if (entry.frontmatter.id === newId && (!newTitle || newTitle === entry.frontmatter.title)) {
    return { ok: true, path: relativePath };
  }

  const oldId = entry.frontmatter.id;

  const newPath = pathForRenamedId(relativePath, newId);
  if (!newPath) {
    return { ok: false, reason: 'invalid_path' };
  }

  const norm = relativePath.replace(/\\/g, '/');
  const entries = writer.getEntries();
  const subtree = subtreePathSet(norm, entries);
  const pathMap = mapSubtreePaths(norm, newPath, [...subtree]);
  if (hasPathCollision(writer, pathMap.values(), subtree)) {
    return { ok: false, reason: 'path_collision' };
  }

  const linkPatches = oldId !== newId ? patchLinksForIdRename(entries, oldId, newId) : [];

  const fm = {
    ...entry.frontmatter,
    id: newId,
    title: newTitle ?? entry.frontmatter.title,
  };
  const content = composeDocument(fm, entry.body);

  await renameSubtreeFiles(writer, norm, newPath, entries);
  if (norm !== newPath) {
    await writer.renameRaw(norm, newPath);
  }
  await writer.writeRaw(newPath, content);

  for (const patch of linkPatches) {
    const targetPath = translatePatchPath(pathMap, patch.relativePath);
    if (targetPath === newPath) {
      continue;
    }
    await writer.writeRaw(targetPath, composeDocument(patch.frontmatter, patch.body));
  }

  return { ok: true, path: newPath };
}

export async function moveDocumentTree(
  writer: TreeOpsWriter,
  relativePath: string,
  newParentId: string,
  maxLateralDepth: number,
  resolveId: (id: string) => string = (id) => id
): Promise<TreeOpResult> {
  const norm = relativePath.replace(/\\/g, '/');
  const entry = writer.getEntries().find((e) => e.relativePath === norm);
  if (!entry?.valid) {
    return { ok: false, reason: 'document_not_found' };
  }

  const entries = writer.getEntries();
  const newParent = entries.find((e) => e.valid && e.frontmatter.id === newParentId);
  if (!newParent) {
    return { ok: false, reason: 'parent_not_found' };
  }

  const expectedLevel = childLevelFor(newParent.frontmatter.level);
  if (!expectedLevel || entry.frontmatter.level !== expectedLevel) {
    return {
      ok: false,
      reason: 'level_violation',
      detail: `${entry.frontmatter.level}_under_${newParent.frontmatter.level}`,
    };
  }

  if (entry.frontmatter.parent === newParentId) {
    return { ok: true, path: norm };
  }

  const newPath = pathForMovedDoc(entry, newParent);
  if (!newPath) {
    return { ok: false, reason: 'invalid_path' };
  }

  const subtree = subtreePathSet(norm, entries);
  const pathMap = mapSubtreePaths(norm, newPath, [...subtree]);
  if (hasPathCollision(writer, pathMap.values(), subtree)) {
    return { ok: false, reason: 'path_collision' };
  }

  const oldParent = entries.find((e) => e.valid && e.frontmatter.id === entry.frontmatter.parent);
  const oldParentFm = oldParent
    ? {
        ...oldParent.frontmatter,
        children: oldParent.frontmatter.children.filter((id) => id !== entry.frontmatter.id),
      }
    : undefined;

  const newParentFm = {
    ...newParent.frontmatter,
    children: [...new Set([...newParent.frontmatter.children, entry.frontmatter.id])],
  };

  const lateral = filterLateralByDepth(
    { ...entry, frontmatter: { ...entry.frontmatter, parent: newParentId } },
    entries,
    maxLateralDepth,
    resolveId
  );
  const movedFm = { ...entry.frontmatter, parent: newParentId, lateral };
  const movedContent = composeDocument(movedFm, entry.body);

  await renameSubtreeFiles(writer, norm, newPath, entries);
  if (norm !== newPath) {
    await writer.renameRaw(norm, newPath);
  }
  await writer.writeRaw(newPath, movedContent);

  if (oldParent && oldParentFm) {
    await writer.writeRaw(oldParent.relativePath, composeDocument(oldParentFm, oldParent.body));
  }
  await writer.writeRaw(newParent.relativePath, composeDocument(newParentFm, newParent.body));

  return { ok: true, path: newPath };
}

export async function deleteDocumentTree(
  writer: TreeOpsWriter,
  relativePath: string
): Promise<TreeOpResult & { deletedCount?: number }> {
  const norm = relativePath.replace(/\\/g, '/');
  const entry = writer.getEntries().find((e) => e.relativePath === norm);
  if (!entry?.valid) {
    return { ok: false, reason: 'document_not_found' };
  }

  const entries = writer.getEntries();
  const subtreePaths = collectSubtreeDocPaths(norm, entries);
  const subtreeSet = new Set(subtreePaths);
  const removedIds = new Set<string>();
  for (const path of subtreePaths) {
    const doc = entries.find((e) => e.relativePath === path);
    if (doc) {
      removedIds.add(doc.frontmatter.id);
    }
  }

  const linkPatches = patchLinksForRemovedIds(entries, removedIds, subtreeSet);
  const sortedPaths = [...subtreePaths].sort((a, b) => b.length - a.length);
  for (const path of sortedPaths) {
    await writer.deleteRaw(path);
  }

  for (const patch of linkPatches) {
    await writer.writeRaw(patch.relativePath, composeDocument(patch.frontmatter, patch.body));
  }

  return { ok: true, deletedCount: subtreePaths.length };
}

/** @deprecated use deleteDocumentTree */
export async function deleteLeafDocumentTree(
  writer: TreeOpsWriter,
  relativePath: string
): Promise<TreeOpResult> {
  return deleteDocumentTree(writer, relativePath);
}

export async function unlinkLateralTree(
  writer: TreeOpsWriter,
  sourcePath: string,
  targetId: string,
  resolveId: (id: string) => string = (id) => id
): Promise<TreeOpResult> {
  const norm = sourcePath.replace(/\\/g, '/');
  const entry = writer.getEntries().find((e) => e.relativePath === norm);
  if (!entry?.valid) {
    return { ok: false, reason: 'document_not_found' };
  }
  const resolved = resolveId(targetId);
  const lateral = (entry.frontmatter.lateral ?? []).filter((link) => link.target !== resolved);
  if (lateral.length === (entry.frontmatter.lateral ?? []).length) {
    return { ok: false, reason: 'link_not_found' };
  }
  const fm = { ...entry.frontmatter, lateral };
  await writer.writeRaw(norm, composeDocument(fm, entry.body));
  return { ok: true };
}

/** Rename file on disk when relative path changes */
export async function renameDocFile(
  workspaceRoot: string,
  fromRel: string,
  toRel: string
): Promise<void> {
  const fromAbs = path.join(workspaceRoot, fromRel.replace(/\//g, path.sep));
  const toAbs = path.join(workspaceRoot, toRel.replace(/\//g, path.sep));
  await fs.mkdir(path.dirname(toAbs), { recursive: true });
  await fs.rename(fromAbs, toAbs);
}
