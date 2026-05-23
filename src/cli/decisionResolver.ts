/** CI Decision_Resolver — R-DEP-7.5 */

import type { DecisionRequest } from '../interaction/decisionCenter';

export type DecisionRuleAction =
  | 'always-approve'
  | 'always-reject'
  | 'match-by-prompt-pattern'
  | 'fail-on-decision';

export interface DecisionRule {
  pattern: string;
  action: DecisionRuleAction;
  /** Used when action is always-approve/reject — picks matching option */
  select?: string;
}

export interface DecisionResolverConfig {
  default: DecisionRuleAction;
  rules: DecisionRule[];
}

export class DecisionResolver {
  constructor(private readonly config: DecisionResolverConfig) {}

  resolve(request: DecisionRequest): string {
    const question = request.question;
    for (const rule of this.config.rules) {
      if (!matchesPattern(question, rule.pattern)) {
        continue;
      }
      return applyAction(rule.action, rule.select, request);
    }
    return applyAction(this.config.default, undefined, request);
  }
}

export function applyAction(
  action: DecisionRuleAction,
  select: string | undefined,
  request: DecisionRequest
): string {
  switch (action) {
    case 'always-approve':
      return pickOption(request, select ?? 'Approve', 'Approve', request.options[0]);
    case 'always-reject':
      return pickOption(request, select ?? 'Reject', 'Reject', request.options[0]);
    case 'match-by-prompt-pattern':
      return pickOption(request, select ?? request.options[0], request.options[0]);
    case 'fail-on-decision':
      throw new DecisionUnresolvedError(request.question);
    default:
      throw new DecisionUnresolvedError(request.question);
  }
}

export class DecisionUnresolvedError extends Error {
  constructor(readonly prompt: string) {
    super(`Unresolved decision: ${prompt.slice(0, 500)}`);
    this.name = 'DecisionUnresolvedError';
  }
}

function pickOption(
  request: DecisionRequest,
  preferred: string,
  ...fallbacks: string[]
): string {
  if (request.options.includes(preferred)) {
    return preferred;
  }
  for (const fb of fallbacks) {
    if (request.options.includes(fb)) {
      return fb;
    }
  }
  if (request.options.length > 0) {
    return request.options[0];
  }
  throw new DecisionUnresolvedError(request.question);
}

function matchesPattern(text: string, pattern: string): boolean {
  if (!pattern) {
    return false;
  }
  try {
    return new RegExp(pattern, 'i').test(text);
  } catch {
    return text.toLowerCase().includes(pattern.toLowerCase());
  }
}

export function parseDecisionResolverConfig(raw: unknown): DecisionResolverConfig {
  const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const defaultAction = parseAction(obj.default) ?? 'fail-on-decision';
  const rulesRaw = Array.isArray(obj.rules) ? obj.rules : [];
  const rules: DecisionRule[] = [];
  for (const entry of rulesRaw) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const r = entry as Record<string, unknown>;
    const pattern = typeof r.pattern === 'string' ? r.pattern : String(r.match ?? '');
    const action = parseAction(r.action);
    if (!pattern || !action) {
      continue;
    }
    rules.push({
      pattern,
      action,
      select: typeof r.select === 'string' ? r.select : undefined,
    });
  }
  return { default: defaultAction, rules };
}

function parseAction(value: unknown): DecisionRuleAction | undefined {
  if (value === 'always-approve' || value === 'always-reject' || value === 'match-by-prompt-pattern' || value === 'fail-on-decision') {
    return value;
  }
  return undefined;
}
