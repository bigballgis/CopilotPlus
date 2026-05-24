/** @-mention token parsing — R-CTX-1 (pure, testable) */

export type MentionKind =
  | 'file'
  | 'folder'
  | 'symbol'
  | 'selection'
  | 'doc'
  | 'web'
  | 'skill';

export interface MentionAttachment {
  kind: MentionKind;
  target: string;
  label: string;
  /** Optional line range for @symbol attachments — "start-end" 1-based */
  range?: string;
}

const TOKEN = /@(file|folder|symbol|selection|doc|web|skill):([^\s]+)/g;

export function parseMentionTokens(text: string): MentionAttachment[] {
  const found: MentionAttachment[] = [];
  for (const match of text.matchAll(TOKEN)) {
    found.push({
      kind: match[1] as MentionKind,
      target: match[2],
      label: `${match[1]}:${match[2]}`,
    });
  }
  return found;
}

export function mergeAttachments(
  parsed: MentionAttachment[],
  explicit: MentionAttachment[]
): MentionAttachment[] {
  const seen = new Set<string>();
  const out: MentionAttachment[] = [];
  for (const a of [...explicit, ...parsed]) {
    const key = `${a.kind}:${a.target}:${a.range ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(a);
  }
  return out;
}

const SLASH_SKILL = /^\/([a-z][a-z0-9-]{2,63})(?:\s+([\s\S]*))?$/;

/** R-EXT-1.4 — `/skill-id` prefix attaches a Skill */
export function parseSlashSkill(text: string): { skillId?: string; message: string } {
  const match = text.trim().match(SLASH_SKILL);
  if (!match) {
    return { message: text };
  }
  return { skillId: match[1], message: (match[2] ?? '').trim() };
}

export const MENTION_KINDS: MentionKind[] = [
  'file',
  'folder',
  'symbol',
  'selection',
  'doc',
  'web',
  'skill',
];
