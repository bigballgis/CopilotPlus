/** Mention attachment budgeting — R-CTX-1, R-CTX-4 */

import type { MentionAttachment } from './mentionTokens';

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function perAttachmentTokenLimit(tokenBudget: number): number {
  return Math.floor(tokenBudget * 0.25);
}

export function perAttachmentCharLimit(tokenBudget: number): number {
  return perAttachmentTokenLimit(tokenBudget) * 4;
}

export function estimateAttachmentTokens(content: string): number {
  return estimateTokens(content);
}

export function estimateAttachmentsBudget(
  resolvedBlocks: string[],
  userText: string,
  tokenBudget: number
): { estimatedTokens: number; exceedsBudget: boolean; perAttachmentLimit: number } {
  const attachmentTokens = resolvedBlocks.reduce((n, block) => n + estimateTokens(block), 0);
  const estimatedTokens = attachmentTokens + estimateTokens(userText);
  return {
    estimatedTokens,
    exceedsBudget: estimatedTokens > tokenBudget,
    perAttachmentLimit: perAttachmentTokenLimit(tokenBudget),
  };
}

export function attachmentKey(attachment: MentionAttachment): string {
  return `${attachment.kind}:${attachment.target}`;
}
