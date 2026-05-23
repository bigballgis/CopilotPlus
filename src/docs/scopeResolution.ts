/** Scope resolution and layer walk — R-DOCS-5, R-DOCS-14 */

import type { DocEntry } from './documentTreeService';
import { buildLayerWalk } from './layerWalk';
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
