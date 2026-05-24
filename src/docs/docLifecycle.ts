/** Document lifecycle helpers — R-DOCS-9 */

import type { DocEntry } from './documentTreeService';

export function isDocumentStale(
  entry: Pick<DocEntry, 'relativePath' | 'frontmatter'>,
  thresholdDays: number,
  nowMs = Date.now()
): boolean {
  if (!entry.relativePath.includes('.copilotPlus/docs/') || entry.relativePath.includes('/archive/')) {
    return false;
  }
  const cutoff = nowMs - thresholdDays * 86_400_000;
  const ref = entry.frontmatter.last_referenced_at;
  if (!ref) {
    return true;
  }
  return new Date(ref).getTime() < cutoff;
}

export function isPathInSubtree(path: string, rootPath: string): boolean {
  const normPath = path.replace(/\\/g, '/');
  const normRoot = rootPath.replace(/\\/g, '/').replace(/\/$/, '');
  return normPath === normRoot || normPath.startsWith(`${normRoot}/`);
}

/** Walk hierarchical children from a root document path */
export function collectSubtreeDocPaths(rootPath: string, entries: DocEntry[]): string[] {
  const normRoot = rootPath.replace(/\\/g, '/');
  const root = entries.find((e) => e.valid && e.relativePath === normRoot);
  if (!root) {
    return [];
  }
  const out: string[] = [];
  const visit = (entry: DocEntry) => {
    out.push(entry.relativePath);
    for (const childId of entry.frontmatter.children ?? []) {
      const child = entries.find((e) => e.valid && e.frontmatter.id === childId);
      if (child) {
        visit(child);
      }
    }
  };
  visit(root);
  return out;
}
