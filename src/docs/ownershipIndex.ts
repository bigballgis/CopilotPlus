/** Code-to-component ownership — R-DOCS-11 */

import { matchesGlob, normalizeWorkspacePath } from '../platform/sensitiveFiles';
import type { DocEntry } from './documentTreeService';

export interface OwnershipResult {
  file: string;
  owners: string[];
  conflict: boolean;
  orphan: boolean;
}

export function buildOwnershipIndex(entries: DocEntry[]): Map<string, OwnershipResult> {
  const index = new Map<string, OwnershipResult>();
  const components = entries.filter((e) => e.valid && e.frontmatter.level === 'component');

  for (const comp of components) {
    for (const pattern of comp.frontmatter.code_paths ?? []) {
      // Patterns are workspace-relative globs; index by scanning is done at query time
      void pattern;
    }
  }

  return index;
}

export function resolveOwners(filePath: string, entries: DocEntry[]): OwnershipResult {
  const rel = normalizeWorkspacePath(filePath);
  const owners: string[] = [];
  let exclusiveConflict = false;

  for (const entry of entries) {
    if (entry.frontmatter.level !== 'component') {
      continue;
    }
    const authority = entry.frontmatter.code_owner_authority ?? 'exclusive';
    for (const pattern of entry.frontmatter.code_paths ?? []) {
      if (matchesGlob(pattern, rel)) {
        owners.push(entry.frontmatter.id);
        if (authority === 'exclusive' && owners.length > 1) {
          exclusiveConflict = true;
        }
      }
    }
  }

  return {
    file: rel,
    owners: [...new Set(owners)],
    conflict: exclusiveConflict,
    orphan: owners.length === 0,
  };
}
