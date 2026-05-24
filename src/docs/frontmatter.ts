/** Document frontmatter schema — R-DOCS-2 */

export type DocLevel = 'system' | 'module' | 'feature' | 'component';

export interface LateralLink {
  target: string;
  type: 'references' | 'depends_on' | 'extends' | 'conflicts_with';
}

export interface DocFrontmatter {
  id: string;
  level: DocLevel;
  title: string;
  parent: string;
  secondary_parents?: string[];
  children: string[];
  lateral?: LateralLink[];
  code_paths?: string[];
  code_owner_authority?: 'exclusive' | 'shared';
  description?: string;
  placeholder?: boolean;
  human_reviewed_at?: string | null;
  human_reviewed_by?: string | null;
  ai_generated?: boolean;
  last_referenced_at?: string;
}

const ID_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;

const BODY_CAPS: Record<DocLevel, number> = {
  system: 4000,
  module: 4000,
  feature: 2000,
  component: 1000,
};

export interface DocumentSizeViolation {
  reason: 'document_too_large';
  cap: number;
  actual: number;
  level: DocLevel;
}

export function validateDocumentSize(
  level: DocLevel,
  body: string
): { ok: true } | ({ ok: false } & DocumentSizeViolation) {
  const cap = BODY_CAPS[level];
  if (body.length > cap) {
    return { ok: false, reason: 'document_too_large', cap, actual: body.length, level };
  }
  return { ok: true };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function parseFrontmatter(content: string): { frontmatter: DocFrontmatter | null; body: string; errors: string[] } {
  const errors: string[] = [];
  if (!content.startsWith('---\n')) {
    return { frontmatter: null, body: content, errors: ['missing frontmatter delimiter'] };
  }
  const end = content.indexOf('\n---\n', 4);
  if (end < 0) {
    return { frontmatter: null, body: content, errors: ['unclosed frontmatter'] };
  }
  const yamlBlock = content.slice(4, end);
  const body = content.slice(end + 5);
  try {
    const raw = parseSimpleYaml(yamlBlock);
    const result = validateFrontmatter(raw, body);
    return { frontmatter: result.valid ? (raw as unknown as DocFrontmatter) : null, body, errors: result.errors };
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    return { frontmatter: null, body, errors };
  }
}

export function validateFrontmatter(raw: Record<string, unknown>, body = ''): ValidationResult {
  const errors: string[] = [];
  const id = raw.id;
  const level = raw.level;
  const title = raw.title;

  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    errors.push('invalid id');
  }
  if (typeof level !== 'string' || !['system', 'module', 'feature', 'component'].includes(level)) {
    errors.push('invalid level');
  }
  if (typeof title !== 'string' || title.length < 1 || title.length > 120) {
    errors.push('invalid title');
  }
  if (level !== 'system' && typeof raw.parent !== 'string') {
    errors.push('parent required for non-system docs');
  }

  const desc = raw.description;
  if (typeof desc === 'string' && desc.length > 500) {
    errors.push('description exceeds 500 characters');
  }

  if (typeof level === 'string' && level in BODY_CAPS) {
    const size = validateDocumentSize(level as DocLevel, body);
    if (!size.ok) {
      errors.push(`document_too_large: cap ${size.cap}, actual ${size.actual}`);
    }
  }

  if (!body.includes('## Summary')) {
    errors.push('missing ## Summary section');
  }

  return { valid: errors.length === 0, errors };
}

/** Minimal YAML parser for frontmatter keys used in specs */
function parseSimpleYaml(block: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = block.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (!match) {
      i++;
      continue;
    }
    const [, key, rest] = match;
    if (rest === '' || rest === '|') {
      const list: unknown[] = [];
      i++;
      while (i < lines.length && /^\s+-\s/.test(lines[i])) {
        list.push(lines[i].replace(/^\s+-\s/, '').trim());
        i++;
      }
      result[key] = list;
      continue;
    }
    if (rest.startsWith('[')) {
      result[key] = JSON.parse(rest.replace(/'/g, '"'));
    } else {
      result[key] = rest.replace(/^["']|["']$/g, '');
    }
    i++;
  }
  return result;
}

export function docPathValid(relativePath: string): boolean {
  const norm = relativePath.replace(/\\/g, '/');
  return /^\.copilotPlus\/docs\/system\/[a-z][a-z0-9-]*(\/[a-z][a-z0-9-]*)*\.md$/.test(norm);
}
