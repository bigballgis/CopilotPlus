/** Layer consistency Reviewer/Architect verdict parsing — R-DOCS-12.4 */

export type ConsistencyVerdictStatus =
  | 'Consistent'
  | 'Doc_Update_Recommended'
  | 'Code_Mismatch_Suspected'
  | 'Cannot_Determine';

export interface ConsistencyCheckVerdict {
  status: ConsistencyVerdictStatus;
  summary: string;
  rationale?: string;
  proposedDocPath?: string;
  proposedDocContent?: string;
}

export function parseConsistencyVerdict(raw: string): ConsistencyCheckVerdict {
  const json = tryParseJson(raw);
  if (json) {
    const status = normalizeStatus(json.status ?? json.verdict ?? json.layer_consistency);
    return {
      status,
      summary: stringOr(json.summary, raw.slice(0, 500)),
      rationale: typeof json.rationale === 'string' ? json.rationale : undefined,
      proposedDocPath:
        typeof json.proposed_doc_path === 'string'
          ? json.proposed_doc_path
          : typeof json.doc_path === 'string'
            ? json.doc_path
            : undefined,
      proposedDocContent:
        typeof json.proposed_doc_content === 'string'
          ? json.proposed_doc_content
          : typeof json.proposed_content === 'string'
            ? json.proposed_content
            : undefined,
    };
  }

  const lower = raw.toLowerCase();
  if (/doc_update_recommended|update the component doc|update component doc/i.test(raw)) {
    return { status: 'Doc_Update_Recommended', summary: raw.trim().slice(0, 500) };
  }
  if (/code_mismatch|mismatch suspected|does not match implementation/i.test(lower)) {
    return { status: 'Code_Mismatch_Suspected', summary: raw.trim().slice(0, 500) };
  }
  if (/cannot_determine|cannot determine|insufficient context/i.test(lower)) {
    return { status: 'Cannot_Determine', summary: raw.trim().slice(0, 500) };
  }
  if (/\bconsistent\b/i.test(lower) && !/inconsistent/i.test(lower)) {
    return { status: 'Consistent', summary: raw.trim().slice(0, 500) };
  }
  return { status: 'Cannot_Determine', summary: raw.trim().slice(0, 500) };
}

function normalizeStatus(value: unknown): ConsistencyVerdictStatus {
  const text = String(value ?? '').trim();
  switch (text) {
    case 'Consistent':
    case 'Doc_Update_Recommended':
    case 'Code_Mismatch_Suspected':
    case 'Cannot_Determine':
      return text;
    default:
      return 'Cannot_Determine';
  }
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

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
