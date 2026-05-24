/** Lateral link depth — R-DOCS-4 */

import type { DocEntry } from './documentTreeService';

export function ancestorChain(entry: DocEntry, entries: DocEntry[]): DocEntry[] {
  const chain: DocEntry[] = [];
  let cur: DocEntry | undefined = entry;
  while (cur) {
    chain.unshift(cur);
    if (!cur.frontmatter.parent) {
      break;
    }
    cur = entries.find((e) => e.valid && e.frontmatter.id === cur!.frontmatter.parent);
  }
  return chain;
}

/** Branch crossings between two documents in the hierarchy tree — R-DOCS-4.1 */
export function computeLateralDepth(from: DocEntry, to: DocEntry, entries: DocEntry[]): number {
  const a = ancestorChain(from, entries);
  const b = ancestorChain(to, entries);
  if (a.length === 0 || b.length === 0 || a[0]!.frontmatter.id !== b[0]!.frontmatter.id) {
    return Number.MAX_SAFE_INTEGER;
  }

  let lca = 0;
  while (lca < a.length && lca < b.length && a[lca]!.frontmatter.id === b[lca]!.frontmatter.id) {
    lca += 1;
  }
  return a.length - lca + (b.length - lca);
}

export function lateralDepthAllowed(
  from: DocEntry,
  to: DocEntry,
  entries: DocEntry[],
  maxDepth: number
): boolean {
  return computeLateralDepth(from, to, entries) <= maxDepth;
}

export interface LateralDepthViolation {
  targetId: string;
  depth: number;
  maxDepth: number;
}

export function findLateralDepthViolations(
  entry: DocEntry,
  entries: DocEntry[],
  maxDepth: number,
  resolveId: (id: string) => string = (id) => id
): LateralDepthViolation[] {
  const violations: LateralDepthViolation[] = [];
  const seen = new Set<string>();

  const checkTarget = (targetId: string) => {
    const resolved = resolveId(targetId);
    if (seen.has(resolved)) {
      return;
    }
    seen.add(resolved);
    const target = entries.find((e) => e.valid && e.frontmatter.id === resolved);
    if (!target) {
      return;
    }
    const depth = computeLateralDepth(entry, target, entries);
    if (depth > maxDepth) {
      violations.push({ targetId: resolved, depth, maxDepth });
    }
  };

  for (const link of entry.frontmatter.lateral ?? []) {
    checkTarget(link.target);
  }
  for (const parentId of entry.frontmatter.secondary_parents ?? []) {
    checkTarget(parentId);
  }

  return violations;
}
