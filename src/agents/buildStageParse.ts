/** Build pipeline stage verdict parsing — R-WF-4.5–4.9 */

export interface TesterVerdict {
  passed: boolean;
  summary: string;
  failureOutput: string;
}

export interface ReviewerVerdict {
  passed: boolean;
  blocking: boolean;
  issues: string[];
  layerConsistency?: string;
  summary: string;
}

export interface CommitterVerdict {
  committed: boolean;
  commitHash?: string;
  summary: string;
  error?: string;
}

export function parseTesterVerdict(raw: string): TesterVerdict {
  const json = tryParseJson(raw);
  if (json) {
    const passed =
      json.passed === true ||
      json.status === 'pass' ||
      json.result === 'pass' ||
      json.verdict === 'pass';
    return {
      passed,
      summary: stringOr(json.summary, raw.slice(0, 500)),
      failureOutput: stringOr(json.failure_output ?? json.output ?? json.stderr, ''),
    };
  }

  const lower = raw.toLowerCase();
  const mentionsFail = /\bfail(ed|ure)?\b/i.test(lower) || /\btests?\s+did\s+not\s+pass/i.test(lower);
  const mentionsPass =
    /\ball tests pass/i.test(lower) ||
    /\btests passed/i.test(lower) ||
    (/\bpass(ed)?\b/i.test(lower) && !mentionsFail);

  return {
    passed: mentionsPass && !mentionsFail,
    summary: raw.trim().slice(0, 500),
    failureOutput: mentionsFail ? raw.trim() : '',
  };
}

export function parseReviewerVerdict(raw: string): ReviewerVerdict {
  const json = tryParseJson(raw);
  if (json) {
    const issues = stringArray(json.blocking_issues ?? json.issues ?? json.comments);
    const blocking =
      json.blocking === true ||
      json.verdict === 'block' ||
      json.status === 'blocked' ||
      issues.length > 0;
    const passed =
      json.passed === true ||
      json.verdict === 'pass' ||
      json.status === 'pass' ||
      (!blocking && json.blocking === false);
    return {
      passed,
      blocking,
      issues,
      layerConsistency:
        typeof json.layer_consistency === 'string' ? json.layer_consistency : undefined,
      summary: stringOr(json.summary, raw.slice(0, 500)),
    };
  }

  const noBlocking = /\bno blocking/i.test(raw);
  const blocking =
    (/\bblocking\b/i.test(raw) && !noBlocking) ||
    (/\bblock(er|ing)\s+issue/i.test(raw) && !noBlocking) ||
    /\bmust fix\b/i.test(raw);
  const passed = /\bpass(ed)?\b/i.test(raw) && !blocking;

  return {
    passed,
    blocking,
    issues: blocking ? [raw.trim().slice(0, 500)] : [],
    summary: raw.trim().slice(0, 500),
  };
}

export function parseCommitterVerdict(raw: string): CommitterVerdict {
  const json = tryParseJson(raw);
  if (json) {
    const committed =
      json.committed === true ||
      json.status === 'committed' ||
      typeof json.commit_hash === 'string';
    return {
      committed,
      commitHash: typeof json.commit_hash === 'string' ? json.commit_hash : undefined,
      summary: stringOr(json.summary, raw.slice(0, 500)),
      error: typeof json.error === 'string' ? json.error : undefined,
    };
  }

  const failed =
    /\bfail(ed|ure)?\b/i.test(raw) ||
    /\bhook rejected\b/i.test(raw) ||
    /\bnothing to commit\b/i.test(raw);
  const committed =
    !failed &&
    (/\bcommitted\b/i.test(raw) ||
      /\bcommit hash\b/i.test(raw) ||
      /\b[0-9a-f]{7,40}\b/i.test(raw));

  return {
    committed,
    summary: raw.trim().slice(0, 500),
    error: failed ? raw.trim().slice(0, 500) : undefined,
  };
}

function tryParseJson(raw: string): Record<string, unknown> | undefined {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* fall through */
  }
  return undefined;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}
