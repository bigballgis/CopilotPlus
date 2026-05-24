/** Compaction plan parsing and execution — R-DOCS-9.3–9.4 */

import type { DocEntry } from './documentTreeService';

export type CompactionAction = 'archive' | 'merge_into_parent' | 'delete' | 'keep';

export interface CompactionPlanItem {
  documentPath: string;
  action: CompactionAction;
  rationale?: string;
  parentPath?: string;
}

export interface CompactionPlan {
  items: CompactionPlanItem[];
}

export function parseCompactionPlan(raw: string): CompactionPlan {
  const json = tryParseJson(raw);
  const list = Array.isArray(json?.items) ? json!.items : Array.isArray(json?.plan) ? json!.plan : [];
  const items: CompactionPlanItem[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const documentPath = normalizeDocPath(
      String(record.document_path ?? record.path ?? record.documentPath ?? '')
    );
    const action = normalizeAction(record.action ?? record.category);
    if (!documentPath || !action) {
      continue;
    }
    items.push({
      documentPath,
      action,
      rationale: typeof record.rationale === 'string' ? record.rationale : undefined,
      parentPath:
        typeof record.parent_path === 'string'
          ? normalizeDocPath(record.parent_path)
          : typeof record.merged_parent_path === 'string'
            ? normalizeDocPath(record.merged_parent_path)
            : undefined,
    });
  }
  return { items: dedupePlanItems(items) };
}

export function hasInboundLinks(documentPath: string, entries: DocEntry[]): boolean {
  const norm = normalizeDocPath(documentPath);
  const target = entries.find((e) => e.valid && e.relativePath === norm);
  if (!target) {
    return false;
  }
  const targetId = target.frontmatter.id;
  for (const entry of entries) {
    if (!entry.valid || entry.relativePath === norm) {
      continue;
    }
    if (entry.frontmatter.parent === targetId) {
      return true;
    }
    if ((entry.frontmatter.children ?? []).includes(targetId)) {
      return true;
    }
    if ((entry.frontmatter.lateral ?? []).some((link) => link.target === targetId)) {
      return true;
    }
    if ((entry.frontmatter.secondary_parents ?? []).includes(targetId)) {
      return true;
    }
  }
  return false;
}

export function filterExecutablePlan(plan: CompactionPlan, entries: DocEntry[]): CompactionPlanItem[] {
  return plan.items.filter((item) => {
    if (item.action === 'keep') {
      return false;
    }
    const exists = entries.some((e) => e.valid && e.relativePath === item.documentPath);
    if (!exists) {
      return false;
    }
    if (item.action === 'delete' && hasInboundLinks(item.documentPath, entries)) {
      return false;
    }
    return true;
  });
}

function dedupePlanItems(items: CompactionPlanItem[]): CompactionPlanItem[] {
  const seen = new Set<string>();
  const out: CompactionPlanItem[] = [];
  for (const item of items) {
    const key = `${item.documentPath}:${item.action}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return out;
}

function normalizeAction(value: unknown): CompactionAction | undefined {
  const text = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  switch (text) {
    case 'archive':
      return 'archive';
    case 'merge_into_parent':
    case 'merge':
      return 'merge_into_parent';
    case 'delete':
      return 'delete';
    case 'keep':
      return 'keep';
    default:
      return undefined;
  }
}

function normalizeDocPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function tryParseJson(raw: string): Record<string, unknown> | undefined {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* fall through */
    }
  }
  return undefined;
}
