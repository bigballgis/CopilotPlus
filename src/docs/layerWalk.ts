/** Layer walk retrieval — R-DOCS-14 */

import type { DocFrontmatter } from './frontmatter';
import type { ContextTier } from '../shared/types';

export interface LayerWalkEntry {
  documentPath: string;
  level: DocFrontmatter['level'];
  content: string;
  compact: boolean;
}

export function buildLayerWalk(
  chain: Array<{ path: string; doc: DocFrontmatter; body: string }>,
  tier: ContextTier
): LayerWalkEntry[] {
  return chain.map((item, index) => {
    const isTarget = index === chain.length - 1;
    const compact = tier === 'S' && !isTarget;
    return {
      documentPath: item.path,
      level: item.doc.level,
      content: compact ? summarizeDoc(item.doc, item.body) : item.body,
      compact,
    };
  });
}

function summarizeDoc(doc: DocFrontmatter, body: string): string {
  const summaryMatch = body.match(/## Summary\s*\n([\s\S]*?)(\n## |\n---|$)/);
  const summary = summaryMatch?.[1]?.trim() ?? '';
  return `---\nid: ${doc.id}\nlevel: ${doc.level}\ntitle: ${doc.title}\n---\n## Summary\n${summary}`;
}
