/** Response cache key hashing — R-EDIT-8.1 */

import * as crypto from 'crypto';

export type ResponseSurface = 'inlineEdit' | 'tabCompletion' | 'nes' | 'composer';

export interface ResponseCacheKeyInput {
  surface: ResponseSurface;
  promptText: string;
  modelId: string;
  fileSha256: string;
  selectionRange: string;
  mentionSet: readonly string[];
  agentsMdSha256: string;
}

export function formatSelectionRange(range: {
  start: { line: number; character: number };
  end: { line: number; character: number };
}): string {
  return `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
}

export function sha256Text(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

export function hashFullCacheKey(input: ResponseCacheKeyInput): string {
  const payload = JSON.stringify({
    surface: input.surface,
    promptText: input.promptText,
    modelId: input.modelId,
    fileSha256: input.fileSha256,
    selectionRange: input.selectionRange,
    mentionSet: [...input.mentionSet].sort(),
    agentsMdSha256: input.agentsMdSha256,
  });
  return sha256Text(payload);
}

/** Partial key: same prompt, model, mentions — used for rebase lookup (R-EDIT-8.3). */
export function hashPartialCacheKey(
  input: Omit<ResponseCacheKeyInput, 'fileSha256' | 'selectionRange'>
): string {
  const payload = JSON.stringify({
    surface: input.surface,
    promptText: input.promptText,
    modelId: input.modelId,
    mentionSet: [...input.mentionSet].sort(),
    agentsMdSha256: input.agentsMdSha256,
  });
  return sha256Text(payload);
}

export interface AutoAttachSkillLike {
  id: string;
  scope: string;
  auto_attach: boolean;
  valid: boolean;
  enabled: boolean;
}

/** Fingerprint of enabled auto_attach skills — R-EDIT-8.5(c). */
export function computeAutoAttachFingerprint(skills: readonly AutoAttachSkillLike[]): string {
  const payload = skills
    .filter((s) => s.valid && s.enabled && s.auto_attach)
    .map((s) => `${s.id}\0${s.scope}`)
    .sort()
    .join('\n');
  return sha256Text(payload);
}
