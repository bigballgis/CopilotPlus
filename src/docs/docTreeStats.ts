/** Document tree size metrics — R-DOCS-8.4 */

import type { DocLevel } from './frontmatter';
import type { DocEntry } from './documentTreeService';

export const DOC_TREE_SOFT_TOKEN_LIMIT = 500_000;

export interface DocLevelStats {
  level: DocLevel;
  docs: number;
  chars: number;
  tokens: number;
}

export interface DocTreeStats {
  totalChars: number;
  totalTokens: number;
  byLevel: DocLevelStats[];
  softLimitExceeded: boolean;
}

const LEVELS: DocLevel[] = ['system', 'module', 'feature', 'component'];

export function estimateDocTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function computeDocTreeStats(entries: DocEntry[]): DocTreeStats {
  const buckets = new Map<DocLevel, DocLevelStats>();
  for (const level of LEVELS) {
    buckets.set(level, { level, docs: 0, chars: 0, tokens: 0 });
  }

  let totalChars = 0;
  let totalTokens = 0;

  for (const entry of entries) {
    if (!entry.valid || entry.relativePath.includes('/archive/')) {
      continue;
    }
    const level = entry.frontmatter.level;
    if (!LEVELS.includes(level)) {
      continue;
    }
    const description = entry.frontmatter.description ?? '';
    const chars = entry.body.length + description.length;
    const tokens = estimateDocTokens(`${description}\n${entry.body}`);
    totalChars += chars;
    totalTokens += tokens;
    const bucket = buckets.get(level)!;
    bucket.docs += 1;
    bucket.chars += chars;
    bucket.tokens += tokens;
  }

  return {
    totalChars,
    totalTokens,
    byLevel: LEVELS.map((level) => buckets.get(level)!),
    softLimitExceeded: totalTokens > DOC_TREE_SOFT_TOKEN_LIMIT,
  };
}
