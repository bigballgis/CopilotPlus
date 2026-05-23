/** LSP symbol reference helpers for response cache invalidation — R-EDIT-8.5(a) */

import type * as vscode from 'vscode';

export interface ReferencePosition {
  line: number;
  character: number;
}

const MAX_POSITIONS = 5;

export function sampleReferencePositions(
  changes: readonly vscode.TextDocumentContentChangeEvent[]
): ReferencePosition[] {
  const out: ReferencePosition[] = [];
  for (const change of changes) {
    if (change.rangeLength === 0 && change.text.length === 0) {
      continue;
    }
    out.push({
      line: change.range.start.line,
      character: change.range.start.character,
    });
    if (out.length >= MAX_POSITIONS) {
      break;
    }
  }
  return out;
}

export function mergeInvalidationPaths(changedFile: string, referenceFiles: readonly string[]): string[] {
  const normChanged = normalizeRelativePath(changedFile);
  const merged = new Set<string>([normChanged]);
  for (const file of referenceFiles) {
    const norm = normalizeRelativePath(file);
    if (norm) {
      merged.add(norm);
    }
  }
  return [...merged];
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/');
}
