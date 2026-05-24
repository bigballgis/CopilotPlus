/** Prompts for Reviewer/Architect layer consistency checks — R-DOCS-12.3–12.7 */

import type { DriftDismissal } from './driftTypes';

function formatDismissals(dismissals: DriftDismissal[], target: string): string {
  const recent = dismissals
    .filter((d) => d.target === target)
    .slice(-3)
    .map((d) => `- ${d.rationale} (${d.dismissedAt})`)
    .join('\n');
  return recent ? `\nRecent false-positive dismissals (do not repeat):\n${recent}` : '';
}

export function buildComponentConsistencyPrompt(
  componentDocPath: string,
  changedFiles: string[],
  gitDiff: string,
  dismissals: DriftDismissal[]
): string {
  const diffBlock = gitDiff.slice(0, 12_000);
  return `
Layer consistency check — Component level (R-DOCS-12).

Component doc: ${componentDocPath}
Changed owned code files since last check:
${changedFiles.map((f) => `- ${f}`).join('\n') || '(none)'}

Cumulative git diff:
\`\`\`diff
${diffBlock}
\`\`\`

Compare the Component doc (from Layer Walk) with the code changes. Do NOT modify files.

Return ONLY a JSON object:
{
  "status": "Consistent" | "Doc_Update_Recommended" | "Code_Mismatch_Suspected" | "Cannot_Determine",
  "summary": "brief summary",
  "rationale": "optional detail",
  "proposed_doc_path": "optional path when Doc_Update_Recommended",
  "proposed_doc_content": "optional full markdown when Doc_Update_Recommended"
}
${formatDismissals(dismissals, componentDocPath)}
`.trim();
}

export function buildUpwardConsistencyPrompt(
  childDocPath: string,
  parentDocPath: string,
  dismissals: DriftDismissal[]
): string {
  return `
Layer consistency check — upward summary (R-DOCS-12.7).

Child document changed: ${childDocPath}
Parent document to validate: ${parentDocPath}

Determine whether the parent's ## Summary still accurately reflects its child documents.
Do NOT modify files.

Return ONLY a JSON object:
{
  "status": "Consistent" | "Doc_Update_Recommended" | "Cannot_Determine",
  "summary": "brief summary",
  "rationale": "optional detail",
  "proposed_doc_path": "${parentDocPath}",
  "proposed_doc_content": "optional full parent markdown when Doc_Update_Recommended"
}
${formatDismissals(dismissals, parentDocPath)}
`.trim();
}
