/** Scope preheat key — R-PLAT-11 */

import { hashSpeculativeKey } from '../platform/speculativeRequests';
import type { MentionAttachment } from './mentionTokens';

export function buildScopePreheatKey(userText: string, attachments: readonly MentionAttachment[]): string {
  const attachmentSig = [...attachments]
    .map((a) => `${a.kind}:${a.target}`)
    .sort()
    .join('\n');
  return hashSpeculativeKey('scopePreheat', {
    text: userText.trim(),
    attachments: attachmentSig,
  });
}
