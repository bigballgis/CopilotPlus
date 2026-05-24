/** Code-to-component ownership — R-DOCS-11 */

import { matchesGlob, normalizeWorkspacePath } from '../platform/sensitiveFiles';
import type { DocEntry } from './documentTreeService';

export interface OwnershipResult {
  file: string;
  owners: string[];
  conflict: boolean;
  orphan: boolean;
}

/** Precomputed file → ownership map — R-DOCS-11.1 */
export class CodeOwnershipIndex {
  private byFile = new Map<string, OwnershipResult>();

  rebuild(entries: DocEntry[], codePaths: string[]): void {
    this.byFile.clear();
    for (const file of codePaths) {
      const norm = normalizeWorkspacePath(file);
      this.byFile.set(norm, resolveOwners(norm, entries));
    }
  }

  lookup(filePath: string): OwnershipResult | undefined {
    return this.byFile.get(normalizeWorkspacePath(filePath));
  }

  updateFile(filePath: string, entries: DocEntry[]): void {
    const norm = normalizeWorkspacePath(filePath);
    this.byFile.set(norm, resolveOwners(norm, entries));
  }

  removeFile(filePath: string): void {
    this.byFile.delete(normalizeWorkspacePath(filePath));
  }

  size(): number {
    return this.byFile.size;
  }
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
