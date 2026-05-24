/** Document tree structural operations — R-DOCS-6 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { DocLevel, DocFrontmatter, LateralLink } from './frontmatter';
import { composeDocument } from './frontmatterSerialize';
import { findLateralDepthViolations } from './lateralDepth';
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
  const updates: Array<{ relativePath: string; frontmatter: DocFrontmatter; body: string }> = [];
  for (const entry of entries) {
    if (!entry.valid || entry.relativePath.includes('/archive/')) {
      continue;
    }
    let changed = false;
    const fm = { ...entry.frontmatter };

    if (fm.children.includes(removedId)) {
      fm.children = fm.children.filter((id) => id !== removedId);
      changed = true;
    }
    if (fm.secondary_parents?.includes(removedId)) {
      fm.secondary_parents = fm.secondary_parents.filter((id) => id !== removedId);
      changed = true;
    }
    if (fm.lateral?.some((link) => link.target === removedId)) {
      fm.lateral = fm.lateral!.filter((link) => link.target !== removedId);
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
  if (oldId !== newId && (entry.frontmatter.children?.length ?? 0) > 0) {
    return { ok: false, reason: 'has_children' };
  }

  const newPath = pathForRenamedId(relativePath, newId);
  if (!newPath) {
    return { ok: false, reason: 'invalid_path' };
  }
  if (writer.getEntries().some((e) => e.valid && e.relativePath === newPath && e.relativePath !== relativePath)) {
    return { ok: false, reason: 'id_collision' };
  }

  const entries = writer.getEntries();
  const linkPatches = oldId !== newId ? patchLinksForIdRename(entries, oldId, newId) : [];

  const fm = {
    ...entry.frontmatter,
    id: newId,
    title: newTitle ?? entry.frontmatter.title,
  };
  const content = composeDocument(fm, entry.body);

  if (relativePath !== newPath) {
    await writer.renameRaw(relativePath, newPath);
  }
  await writer.writeRaw(newPath, content);

  for (const patch of linkPatches) {
    if (patch.relativePath === relativePath || patch.relativePath === newPath) {
      continue;
    }
    await writer.writeRaw(patch.relativePath, composeDocument(patch.frontmatter, patch.body));
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
  if ((entry.frontmatter.children?.length ?? 0) > 0) {
    return { ok: false, reason: 'has_children' };
  }

  const newPath = pathForMovedDoc(entry, newParent);
  if (!newPath) {
    return { ok: false, reason: 'invalid_path' };
  }
  if (writer.getEntries().some((e) => e.valid && e.relativePath === newPath && e.relativePath !== norm)) {
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

export async function deleteLeafDocumentTree(
  writer: TreeOpsWriter,
  relativePath: string
): Promise<TreeOpResult> {
  const norm = relativePath.replace(/\\/g, '/');
  const entry = writer.getEntries().find((e) => e.relativePath === norm);
  if (!entry?.valid) {
    return { ok: false, reason: 'document_not_found' };
  }
  if ((entry.frontmatter.children?.length ?? 0) > 0) {
    return { ok: false, reason: 'has_children' };
  }

  const entries = writer.getEntries();
  const removedId = entry.frontmatter.id;
  const parent = entries.find((e) => e.valid && e.frontmatter.id === entry.frontmatter.parent);
  const linkPatches = patchLinksForRemovedId(entries, removedId);

  await writer.deleteRaw(norm);

  if (parent) {
    const parentFm = {
      ...parent.frontmatter,
      children: parent.frontmatter.children.filter((id) => id !== removedId),
    };
    await writer.writeRaw(parent.relativePath, composeDocument(parentFm, parent.body));
  }

  for (const patch of linkPatches) {
    if (patch.relativePath === norm || patch.relativePath === parent?.relativePath) {
      continue;
    }
    await writer.writeRaw(patch.relativePath, composeDocument(patch.frontmatter, patch.body));
  }

  return { ok: true };
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
