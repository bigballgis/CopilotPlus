/** Response cache invalidation wiring — R-EDIT-8.5 */

import * as vscode from 'vscode';
import type { ResponseCacheService } from './responseCacheService';
import { computeAutoAttachFingerprint, type AutoAttachSkillLike } from './responseCacheKey';

export { computeAutoAttachFingerprint, type AutoAttachSkillLike };

export class ResponseCacheInvalidation {
  private lastAutoAttachFp = '';

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
      })
    );
  }
}
