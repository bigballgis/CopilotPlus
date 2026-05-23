/** Skill frontmatter — R-EXT-1 */

const ID_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;

export interface SkillFrontmatter {
  id: string;
  title: string;
  scope: string;
  auto_attach?: boolean;
  triggers?: string[];
  tool_allowlist?: string[];
}

export interface ParsedSkill {
  frontmatter: SkillFrontmatter | null;
  body: string;
  errors: string[];
}

export function parseSkillFile(content: string): ParsedSkill {
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
  const raw = parseSimpleYaml(yamlBlock);
  const validation = validateSkillFrontmatter(raw);
  return {
    frontmatter: validation.valid ? (raw as unknown as SkillFrontmatter) : null,
    body,
    errors: validation.errors,
  };
}

export function validateSkillFrontmatter(raw: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const id = raw.id;
  const title = raw.title;
  const scope = raw.scope;

  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    errors.push('invalid id');
  }
  if (typeof title !== 'string' || title.length < 1 || title.length > 120) {
    errors.push('invalid title');
  }
  if (typeof scope !== 'string' || !isValidScope(scope)) {
    errors.push('invalid scope');
  }
  if (raw.auto_attach !== undefined && typeof raw.auto_attach !== 'boolean') {
    errors.push('invalid auto_attach');
  }
  if (raw.triggers !== undefined && !Array.isArray(raw.triggers)) {
    errors.push('invalid triggers');
  }
  if (raw.tool_allowlist !== undefined && !Array.isArray(raw.tool_allowlist)) {
    errors.push('invalid tool_allowlist');
  }

  return { valid: errors.length === 0, errors };
}

export function isValidScope(scope: string): boolean {
  if (scope === 'workspace') {
    return true;
  }
  return /^(module|feature|component):[a-z][a-z0-9-]*$/.test(scope);
}

export function skillMatchesScope(skillScope: string, scopeDocPath?: string, docId?: string): boolean {
  if (skillScope === 'workspace') {
    return true;
  }
  if (!scopeDocPath) {
    return false;
  }
  const [, id] = skillScope.split(':');
  if (!id) {
    return false;
  }
  if (docId === id) {
    return true;
  }
  const norm = scopeDocPath.replace(/\\/g, '/');
  return norm.includes(`/${id}.md`) || norm.includes(`/${id}/`);
}

export function composeSkillFile(fm: SkillFrontmatter, body: string): string {
  const lines = [
    '---',
    `id: ${fm.id}`,
    `title: ${fm.title}`,
    `scope: ${fm.scope}`,
    `auto_attach: ${fm.auto_attach ?? false}`,
  ];
  if (fm.triggers?.length) {
    lines.push('triggers:');
    for (const t of fm.triggers) {
      lines.push(`  - ${t}`);
    }
  }
  if (fm.tool_allowlist?.length) {
    lines.push('tool_allowlist:');
    for (const t of fm.tool_allowlist) {
      lines.push(`  - ${t}`);
    }
  }
  lines.push('---', body.trimStart());
  return lines.join('\n') + '\n';
}

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
    if (rest === 'true' || rest === 'false') {
      result[key] = rest === 'true';
    } else if (rest.startsWith('[')) {
      result[key] = JSON.parse(rest.replace(/'/g, '"'));
    } else {
      result[key] = rest.replace(/^["']|["']$/g, '');
    }
    i++;
  }
  return result;
}
