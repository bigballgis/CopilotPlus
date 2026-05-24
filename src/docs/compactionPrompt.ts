/** Architect compaction prompt — R-DOCS-9.2 */

import type { DocEntry } from './documentTreeService';

export function buildCompactionPrompt(stale: DocEntry[], thresholdDays: number): string {
  const lines = stale.map(
    (e) =>
      `- ${e.frontmatter.title} (${e.frontmatter.level}) path=${e.relativePath} last_referenced_at=${e.frontmatter.last_referenced_at ?? 'never'} parent=${e.frontmatter.parent ?? 'none'}`
  );
  return `
Review the following stale documents (no reference in >${thresholdDays} days).
Return a JSON compaction plan with an "items" array. Each item must include:
- document_path (workspace-relative, e.g. .copilotPlus/docs/feature/x.md)
- action: one of archive | merge_into_parent | delete | keep
- rationale (short string)
- parent_path (required only for merge_into_parent when not obvious from hierarchy)

Rules:
- Prefer archive for deprecated features with historical value.
- Use merge_into_parent only when the parent summary should absorb key content, then archive the child.
- Use delete only when no inbound hierarchical or lateral links reference the document.
- Use keep when the document is still relevant despite low reference counts.

Stale documents:
${lines.join('\n')}

Respond with ONLY a JSON object, optionally wrapped in a \`\`\`json fence.
`.trim();
}
