/** Scope resolution and layer walk — R-DOCS-5, R-DOCS-14 */

import type { DocEntry } from './documentTreeService';
import { buildLayerWalk, type LayerWalkEntry } from './layerWalk';
import { resolveOwners } from './ownershipIndex';
import { matchesGlob } from '../platform/sensitiveFiles';
import type { ContextTier } from '../shared/types';

export interface ScopeDoc {
  document_path: string;
  level: string;
  title: string;
  link_type: 'hierarchical' | 'lateral' | 'root';
}

export function resolveScope(startPath: string, entries: DocEntry[], maxDocs = 100): ScopeDoc[] {
  const start = entries.find((e) => e.relativePath === startPath.replace(/\\/g, '/'));
  if (!start) {
    return [];
  }

  const result: ScopeDoc[] = [];
  const seen = new Set<string>();

  const add = (e: DocEntry, link_type: ScopeDoc['link_type']) => {
    if (e.relativePath.includes('/archive/')) {
      return;
    }
    if (seen.has(e.relativePath) || result.length >= maxDocs) {
      return;
    }
    seen.add(e.relativePath);
    result.push({
      document_path: e.relativePath,
      level: e.frontmatter.level,
      title: e.frontmatter.title,
      link_type,
    });
  };

  add(start, 'root');

  // Walk up via parent ids
  let current: DocEntry | undefined = start;
  while (current?.frontmatter.parent) {
    const parent = entries.find((e) => e.frontmatter.id === current!.frontmatter.parent);
    if (!parent) {
      break;
    }
    add(parent, 'hierarchical');
    current = parent;
  }

  // Walk down children recursively
  const descend = (entry: DocEntry) => {
    for (const childId of entry.frontmatter.children ?? []) {
      const child = entries.find((e) => e.frontmatter.id === childId);
      if (child) {
        add(child, 'hierarchical');
        descend(child);
      }
    }
  };
  descend(start);

  for (const link of start.frontmatter.lateral ?? []) {
    const target = entries.find((e) => e.frontmatter.id === link.target);
    if (target) {
      add(target, 'lateral');
    }
  }

  return result;
}

export function buildLayerWalkForDoc(startPath: string, entries: DocEntry[], tier: ContextTier) {
  const chain: Array<{ path: string; doc: DocEntry['frontmatter']; body: string }> = [];
  const start = entries.find((e) => e.relativePath === startPath.replace(/\\/g, '/'));
  if (!start) {
    return [];
  }

  const ancestors: DocEntry[] = [];
  let cur: DocEntry | undefined = start;
  while (cur) {
    ancestors.unshift(cur);
    if (!cur.frontmatter.parent) {
      break;
    }
    cur = entries.find((e) => e.frontmatter.id === cur!.frontmatter.parent);
  }

  for (const e of ancestors) {
    chain.push({ path: e.relativePath, doc: e.frontmatter, body: e.body });
  }

  return buildLayerWalk(
    chain.map((c) => ({ path: c.path, doc: c.doc, body: c.body })),
    tier
  );
}

/** R-DOCS-14.3 — layer walk for a code file through its owning component(s) */
export function buildLayerWalkForCodeFile(
  filePath: string,
  entries: DocEntry[],
  indexedCodePaths: string[],
  tier: ContextTier
): LayerWalkEntry[] {
  const ownership = resolveOwners(filePath, entries);
  if (ownership.orphan || ownership.owners.length === 0) {
    return [];
  }

  const primary = entries.find((e) => e.valid && e.frontmatter.id === ownership.owners[0]);
  if (!primary) {
    return [];
  }

  const walk = buildLayerWalkForDoc(primary.relativePath, entries, tier);
  const appendix = buildComponentCodeContext(
    primary.relativePath,
    entries,
    indexedCodePaths,
    filePath,
    ownership.owners.slice(1)
  );
  if (!appendix || walk.length === 0) {
    return walk;
  }

  const last = walk[walk.length - 1]!;
  return [
    ...walk.slice(0, -1),
    {
      ...last,
      content: `${last.content}\n\n${appendix}`,
    },
  ];
}

export function listComponentCodeFiles(componentEntry: DocEntry, indexedCodePaths: string[]): string[] {
  const patterns = componentEntry.frontmatter.code_paths ?? [];
  if (patterns.length === 0) {
    return [];
  }
  return indexedCodePaths
    .filter((file) => patterns.some((pattern) => matchesGlob(pattern, file)))
    .sort();
}

/** Code_paths + sibling files (+ shared co-owners) for component scope — R-DOCS-14.3 / R-DOCS-11.4 */
export function buildComponentCodeContext(
  componentDocPath: string,
  entries: DocEntry[],
  indexedCodePaths: string[],
  activeFile?: string,
  coOwnerIds: string[] = [],
  allEntries: DocEntry[] = entries
): string {
  const entry = entries.find((e) => e.valid && e.relativePath === componentDocPath.replace(/\\/g, '/'));
  if (!entry || entry.frontmatter.level !== 'component') {
    return '';
  }

  const siblings = listComponentCodeFiles(entry, indexedCodePaths);
  const lines = [
    '## Component code ownership',
    `code_paths: ${(entry.frontmatter.code_paths ?? []).join(', ') || '(none)'}`,
  ];
  if (activeFile) {
    lines.push(`Active file: ${activeFile.replace(/\\/g, '/')}`);
  }
  lines.push('Sibling code files:');
  lines.push(...(siblings.length ? siblings.map((f) => `- ${f}`) : ['- (none indexed)']));

  if (coOwnerIds.length > 0) {
    lines.push('Co-owner components (shared authority):');
    for (const id of coOwnerIds) {
      const co = allEntries.find((e) => e.valid && e.frontmatter.id === id);
      if (co) {
        lines.push(`- ${co.frontmatter.title} (${co.relativePath})`);
      }
    }
  }
  return lines.join('\n');
}
