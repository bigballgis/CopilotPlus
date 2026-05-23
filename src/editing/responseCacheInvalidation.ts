/** Response cache invalidation wiring — R-EDIT-8.5 */

import * as vscode from 'vscode';
import type { ResponseCacheService } from './responseCacheService';
import { computeAutoAttachFingerprint, type AutoAttachSkillLike } from './responseCacheKey';
import { isInternalEdit } from './editOrigin';
import {
  mergeInvalidationPaths,
  sampleReferencePositions,
  type ReferencePosition,
} from './responseCacheSymbols';

export { computeAutoAttachFingerprint, type AutoAttachSkillLike };

const SYMBOL_INVALIDATION_DEBOUNCE_MS = 300;

export class ResponseCacheInvalidation {
  private lastAutoAttachFp = '';
  private symbolTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingSymbolInvalidation:
    | {
        relativePath: string;
        changes: readonly vscode.TextDocumentContentChangeEvent[];
        skipSelf: boolean;
      }
    | undefined;

  constructor(private readonly cache: ResponseCacheService) {}

  normalizeRelativePath(relativePath: string): string {
    return relativePath.replace(/\\/g, '/');
  }

  shouldSkipPath(relativePath: string): boolean {
    const rel = this.normalizeRelativePath(relativePath);
    return !rel || rel.startsWith('.copilotPlus/');
  }

  async invalidateFile(relativePath: string): Promise<void> {
    if (this.shouldSkipPath(relativePath)) {
      return;
    }
    await this.cache.invalidateForFile(this.normalizeRelativePath(relativePath));
  }

  async invalidateFiles(relativePaths: readonly string[]): Promise<void> {
    const unique = [...new Set(relativePaths.map((p) => this.normalizeRelativePath(p)))].filter(
      (p) => !this.shouldSkipPath(p)
    );
    if (unique.length === 0) {
      return;
    }
    await this.cache.invalidateForFiles(unique);
  }

  scheduleSymbolInvalidation(
    document: vscode.TextDocument,
    changes: readonly vscode.TextDocumentContentChangeEvent[]
  ): void {
    const rel = this.normalizeRelativePath(vscode.workspace.asRelativePath(document.uri));
    if (this.shouldSkipPath(rel) || rel === 'AGENTS.md' || changes.length === 0) {
      return;
    }
    this.pendingSymbolInvalidation = {
      relativePath: rel,
      changes,
      skipSelf: isInternalEdit(),
    };
    if (this.symbolTimer) {
      clearTimeout(this.symbolTimer);
    }
    this.symbolTimer = setTimeout(() => {
      void this.flushSymbolInvalidation();
    }, SYMBOL_INVALIDATION_DEBOUNCE_MS);
  }

  private async flushSymbolInvalidation(): Promise<void> {
    const pending = this.pendingSymbolInvalidation;
    this.pendingSymbolInvalidation = undefined;
    this.symbolTimer = undefined;
    if (!pending) {
      return;
    }
    const positions = sampleReferencePositions(pending.changes);
    const referenceFiles = positions.length
      ? await this.collectReferenceFiles(pending.relativePath, positions)
      : [];
    const paths = pending.skipSelf
      ? referenceFiles
      : mergeInvalidationPaths(pending.relativePath, referenceFiles);
    await this.invalidateFiles(paths);
  }

  private async collectReferenceFiles(
    relativePath: string,
    positions: readonly ReferencePosition[]
  ): Promise<string[]> {
    const { getReferences } = await import('../tools/lspTools');
    const files = new Set<string>();
    for (const pos of positions) {
      try {
        const refs = await getReferences(relativePath, pos.line + 1, pos.character);
        for (const ref of refs) {
          const norm = ref.file.replace(/\\/g, '/');
          if (norm) {
            files.add(norm);
          }
        }
      } catch {
        // LSP unavailable — caller falls back to file-only invalidation
      }
    }
    return [...files];
  }

  async onDocumentSaved(document: vscode.TextDocument): Promise<void> {
    const rel = this.normalizeRelativePath(vscode.workspace.asRelativePath(document.uri));
    if (this.shouldSkipPath(rel) || rel === 'AGENTS.md') {
      return;
    }
    await this.cache.invalidateIfFileContentChanged(rel, document.getText());
  }

  onSkillsReload(skills: readonly AutoAttachSkillLike[]): void {
    const fp = computeAutoAttachFingerprint(skills);
    if (this.lastAutoAttachFp && fp !== this.lastAutoAttachFp) {
      void this.cache.clearAll();
    }
    this.lastAutoAttachFp = fp;
  }

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        void this.onDocumentSaved(doc);
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        this.scheduleSymbolInvalidation(event.document, event.contentChanges);
      })
    );
  }
}
