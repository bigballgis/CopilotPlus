/** Self-reflection output — R-KNOW-6 */

export interface ReflectionProposal {
  kind:
    | 'agents_md'
    | 'skill_add'
    | 'skill_delete'
    | 'hook_add'
    | 'friction'
    | 'pattern';
  summary: string;
  detail?: string;
}

export interface ReflectionOutput {
  friction_points: string[];
  repeated_patterns: string[];
  proposed_agents_md_additions: string[];
  proposed_skill_additions: string[];
  proposed_skill_deletions: string[];
  proposed_hook_additions: string[];
}

export function emptyReflectionOutput(): ReflectionOutput {
  return {
    friction_points: [],
    repeated_patterns: [],
    proposed_agents_md_additions: [],
    proposed_skill_additions: [],
    proposed_skill_deletions: [],
    proposed_hook_additions: [],
  };
}

export function parseReflectionOutput(raw: string): ReflectionOutput {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  try {
    const parsed = JSON.parse(candidate) as Partial<ReflectionOutput>;
    return {
      friction_points: stringArray(parsed.friction_points),
      repeated_patterns: stringArray(parsed.repeated_patterns),
      proposed_agents_md_additions: stringArray(parsed.proposed_agents_md_additions),
      proposed_skill_additions: stringArray(parsed.proposed_skill_additions),
      proposed_skill_deletions: stringArray(parsed.proposed_skill_deletions),
      proposed_hook_additions: stringArray(parsed.proposed_hook_additions),
    };
  } catch {
    return parseMarkdownSections(raw);
  }
}

export function reflectionToProposals(output: ReflectionOutput): ReflectionProposal[] {
  const out: ReflectionProposal[] = [];
  for (const item of output.friction_points) {
    out.push({ kind: 'friction', summary: item });
  }
  for (const item of output.repeated_patterns) {
    out.push({ kind: 'pattern', summary: item });
  }
  for (const item of output.proposed_agents_md_additions) {
    out.push({ kind: 'agents_md', summary: item, detail: item });
  }
  for (const item of output.proposed_skill_additions) {
    out.push({ kind: 'skill_add', summary: item, detail: item });
  }
  for (const item of output.proposed_skill_deletions) {
    out.push({ kind: 'skill_delete', summary: item, detail: item });
  }
  for (const item of output.proposed_hook_additions) {
    out.push({ kind: 'hook_add', summary: item, detail: item });
  }
  return out;
}

export function hasReflectionProposals(output: ReflectionOutput): boolean {
  return reflectionToProposals(output).length > 0;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

function parseMarkdownSections(raw: string): ReflectionOutput {
  const out = emptyReflectionOutput();
  const sections: Array<[keyof ReflectionOutput, RegExp]> = [
    ['friction_points', /friction_points?\s*:?\s*\n([\s\S]*?)(?=\n#{1,3}\s|\n[a-z_]+:|$)/i],
    ['repeated_patterns', /repeated_patterns?\s*:?\s*\n([\s\S]*?)(?=\n#{1,3}\s|\n[a-z_]+:|$)/i],
    [
      'proposed_agents_md_additions',
      /proposed_agents_md_additions\s*:?\s*\n([\s\S]*?)(?=\n#{1,3}\s|\n[a-z_]+:|$)/i,
    ],
    [
      'proposed_skill_additions',
      /proposed_skill_additions\s*:?\s*\n([\s\S]*?)(?=\n#{1,3}\s|\n[a-z_]+:|$)/i,
    ],
    [
      'proposed_skill_deletions',
      /proposed_skill_deletions\s*:?\s*\n([\s\S]*?)(?=\n#{1,3}\s|\n[a-z_]+:|$)/i,
    ],
    [
      'proposed_hook_additions',
      /proposed_hook_additions\s*:?\s*\n([\s\S]*?)(?=\n#{1,3}\s|\n[a-z_]+:|$)/i,
    ],
  ];
  for (const [key, re] of sections) {
    const match = raw.match(re);
    if (match?.[1]) {
      out[key] = bulletLines(match[1]);
    }
  }
  return out;
}

function bulletLines(block: string): string[] {
  return block
    .split('\n')
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
}
