/** Human review badge — R-DOCS-10.4 */

import type { DocEntry } from './documentTreeService';

export type ReviewBadge = 'green' | 'yellow' | 'red';

export function computeReviewBadge(entry: Pick<DocEntry, 'frontmatter'>): ReviewBadge {
  const reviewed = entry.frontmatter.human_reviewed_at;
  if (!reviewed) {
    return entry.frontmatter.level === 'system' || entry.frontmatter.level === 'module' ? 'red' : 'yellow';
  }
  const ageDays = (Date.now() - new Date(reviewed).getTime()) / 86_400_000;
  if (ageDays <= 30) {
    return 'green';
  }
  if (ageDays <= 90) {
    return 'yellow';
  }
  return 'red';
}

/** R-DOCS-10.5 — notice for Sub-Agent prompts when scope docs lack review */
export function formatUnreviewedDocNotice(entries: DocEntry[]): string {
  const flagged = entries.filter(
    (e) =>
      e.valid &&
      (e.frontmatter.level === 'system' || e.frontmatter.level === 'module') &&
      computeReviewBadge(e) === 'red'
  );
  if (flagged.length === 0) {
    return '';
  }
  const lines = flagged.map((e) => `- ${e.frontmatter.title} (${e.relativePath})`).join('\n');
  return `
## Unreviewed scope documents
The following system/module documents lack recent human review. Flag any divergence between these documents and the codebase to the user:
${lines}
`.trim();
}
