/** Code file → layer walk path — R-DOCS-11.6 */

import type { DocEntry } from './documentTreeService';
import { resolveOwners } from './ownershipIndex';

export interface LayerDocRef {
  id: string;
  path: string;
  title: string;
}

export interface CodeLayerPath {
  file: string;
  component?: LayerDocRef;
  coComponents?: LayerDocRef[];
  feature?: LayerDocRef;
  module?: LayerDocRef;
  system?: LayerDocRef;
  orphan: boolean;
  conflict: boolean;
}

export function resolveCodeLayerPath(filePath: string, entries: DocEntry[]): CodeLayerPath {
  const ownership = resolveOwners(filePath, entries);
  const result: CodeLayerPath = {
    file: filePath.replace(/\\/g, '/'),
    orphan: ownership.orphan,
    conflict: ownership.conflict,
  };
  if (ownership.owners.length === 0) {
    return result;
  }

  const ownerEntry = entries.find((e) => e.valid && e.frontmatter.id === ownership.owners[0]);
  if (!ownerEntry) {
    return result;
  }

  result.component = toRef(ownerEntry);
  if (ownership.owners.length > 1 && !ownership.conflict) {
    result.coComponents = ownership.owners
      .slice(1)
      .map((id) => entries.find((e) => e.valid && e.frontmatter.id === id))
      .filter((e): e is DocEntry => Boolean(e))
      .map(toRef);
  }
  let current: DocEntry | undefined = ownerEntry;
  while (current?.frontmatter.parent) {
    const parent = entries.find((e) => e.valid && e.frontmatter.id === current!.frontmatter.parent);
    if (!parent) {
      break;
    }
    switch (parent.frontmatter.level) {
      case 'feature':
        result.feature = toRef(parent);
        break;
      case 'module':
        result.module = toRef(parent);
        break;
      case 'system':
        result.system = toRef(parent);
        break;
    }
    current = parent;
  }
  return result;
}

export function formatCodeLayerPathTooltip(path: CodeLayerPath): string {
  if (path.orphan) {
    return path.file;
  }
  const parts: string[] = [];
  if (path.system) {
    parts.push(`System: ${path.system.title}`);
  }
  if (path.module) {
    parts.push(`Module: ${path.module.title}`);
  }
  if (path.feature) {
    parts.push(`Feature: ${path.feature.title}`);
  }
  if (path.component) {
    parts.push(`Component: ${path.component.title}`);
  }
  if (path.coComponents?.length) {
    parts.push(`Co-owners: ${path.coComponents.map((c) => c.title).join(', ')}`);
  }
  parts.push(`File: ${path.file}`);
  if (path.conflict) {
    parts.push('(ownership conflict)');
  }
  return parts.join('\n');
}

function toRef(entry: DocEntry): LayerDocRef {
  return {
    id: entry.frontmatter.id,
    path: entry.relativePath,
    title: entry.frontmatter.title,
  };
}
