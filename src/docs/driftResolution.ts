/** Drift resolution routing — R-DOCS-13.3 */

import type { DocEntry } from './documentTreeService';
import type { DriftDismissal, DriftItem, DriftType } from './driftTypes';
import { resolveOwners } from './ownershipIndex';

export type DriftResolutionRole = 'Architect' | 'Reviewer';

const ARCHITECT_TYPES: ReadonlySet<DriftType> = new Set([
  'Dangling_Link',
  'Stale_Summary',
  'Missing_Summary',
  'Doc_Update_Recommended',
  'Orphan_Code',
  'Ownership_Conflict',
]);

export function resolveDriftAgentRole(item: DriftItem): DriftResolutionRole {
  if (ARCHITECT_TYPES.has(item.type)) {
    return 'Architect';
  }
  if (item.layer === 'system' || item.layer === 'module' || item.layer === 'feature') {
    return 'Architect';
  }
  return 'Reviewer';
}

export function resolveDriftScopeDoc(item: DriftItem, entries: DocEntry[]): string {
  if (item.target.startsWith('.copilotPlus/docs/')) {
    return item.target;
  }
  const ownership = resolveOwners(item.target, entries);
  if (ownership.owners.length > 0) {
    const owner = entries.find((e) => e.valid && e.frontmatter.id === ownership.owners[0]);
    if (owner) {
      return owner.relativePath;
    }
  }
  const system = entries.find((e) => e.valid && e.frontmatter.level === 'system');
  return system?.relativePath ?? '.copilotPlus/docs/system/default.md';
}

export function buildDriftResolutionPrompt(
  item: DriftItem,
  dismissals: DriftDismissal[]
): string {
  const recent = dismissals
    .filter((d) => d.target === item.target || d.driftId === item.id)
    .slice(-3)
    .map((d) => `- ${d.rationale} (${d.dismissedAt})`)
    .join('\n');

  const dismissalBlock = recent
    ? `\n\nRecent false-positive dismissals for this target (do not repeat):\n${recent}`
    : '';

  return [
    `Resolve this drift item via Document_Tree updates (use doc_write / write_file — Diff Review applies):`,
    `- type: ${item.type}`,
    `- layer: ${item.layer}`,
    `- target: ${item.target}`,
    item.detail ? `- detail: ${item.detail}` : '',
    `- detectedAt: ${item.detectedAt}`,
    '',
    'Requirements:',
    '- Propose the minimum doc/frontmatter/body changes needed to clear the drift.',
    '- For Missing_Summary or Stale_Summary, add or refresh a ## Summary section (100–800 chars).',
    '- For Dangling_Link, fix parent/children/lateral frontmatter to valid document ids.',
    '- For Orphan_Code, propose or update a Component_Doc with matching code_paths.',
    '- For Ownership_Conflict, adjust code_owner_authority or code_paths to remove exclusive overlap.',
    '- For Code_Mismatch_Suspected, align Component_Doc with indexed code or mark placeholder when intentional.',
    '- Do not modify unrelated documents.',
    dismissalBlock,
  ]
    .filter(Boolean)
    .join('\n');
}

export function extraToolsForDriftRole(role: DriftResolutionRole, item: DriftItem): string[] {
  if (role === 'Architect') {
    return [];
  }
  if (item.target.startsWith('.copilotPlus/docs/')) {
    return ['doc_write'];
  }
  return ['doc_write', 'write_file', 'apply_patch'];
}
