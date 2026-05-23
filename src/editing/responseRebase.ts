/** Response rebase via apply_patch-style matching — R-EDIT-8.3 */

import { applyEdits } from '../tools/applyPatchLogic';

export interface RebaseInput {
  currentFileContent: string;
  originalSelectedText: string;
  cachedResponse: string;
  contextBefore?: string;
  contextAfter?: string;
}

export type RebaseResult =
  | { ok: true; replacement: string }
  | { ok: false; reason: 'not_found' | 'ambiguous_match' | 'timeout' };

export function tryRebaseResponse(input: RebaseInput): RebaseResult {
  const { currentFileContent, originalSelectedText, cachedResponse, contextBefore, contextAfter } =
    input;

  if (originalSelectedText.length >= 10) {
    const direct = applyEdits(currentFileContent, [
      { oldString: originalSelectedText, newString: cachedResponse },
    ]);
    if (direct.ok) {
      return { ok: true, replacement: cachedResponse };
    }
  }

  if (contextBefore !== undefined && contextAfter !== undefined) {
    const oldBlock = `${contextBefore}${originalSelectedText}${contextAfter}`;
    const newBlock = `${contextBefore}${cachedResponse}${contextAfter}`;
    if (oldBlock.length >= 10) {
      const contextual = applyEdits(currentFileContent, [
        { oldString: oldBlock, newString: newBlock },
      ]);
      if (contextual.ok) {
        return { ok: true, replacement: cachedResponse };
      }
    }
  }

  return { ok: false, reason: 'not_found' };
}

export async function tryRebaseWithTimeout(
  input: RebaseInput,
  timeoutMs: number
): Promise<RebaseResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), timeoutMs);
    queueMicrotask(() => {
      clearTimeout(timer);
      resolve(tryRebaseResponse(input));
    });
  });
}
