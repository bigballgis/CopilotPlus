/** Frontmatter YAML serialization — R-DOCS-2 */

import type { DocFrontmatter, DocLevel } from './frontmatter';

export function normalizeFrontmatter(raw: Record<string, unknown>): DocFrontmatter {
  return {
    id: String(raw.id ?? ''),
    level: raw.level as DocLevel,
    title: String(raw.title ?? ''),
    parent: String(raw.parent ?? ''),
    secondary_parents: Array.isArray(raw.secondary_parents)
      ? raw.secondary_parents.map(String)
      : undefined,
    children: Array.isArray(raw.children) ? raw.children.map(String) : [],
    lateral: Array.isArray(raw.lateral)
      ? (raw.lateral as DocFrontmatter['lateral'])
      : [],
    code_paths: Array.isArray(raw.code_paths) ? raw.code_paths.map(String) : undefined,
    code_owner_authority: raw.code_owner_authority as DocFrontmatter['code_owner_authority'],
    description: typeof raw.description === 'string' ? raw.description : undefined,
    placeholder: typeof raw.placeholder === 'boolean' ? raw.placeholder : undefined,
    human_reviewed_at: raw.human_reviewed_at as string | null | undefined,
    human_reviewed_by: raw.human_reviewed_by as string | null | undefined,
    ai_generated: typeof raw.ai_generated === 'boolean' ? raw.ai_generated : true,
    last_referenced_at:
      typeof raw.last_referenced_at === 'string' ? raw.last_referenced_at : undefined,
  };
}

export function serializeFrontmatter(fm: DocFrontmatter): string {
  const lines: string[] = ['---'];
  lines.push(`id: ${fm.id}`);
  lines.push(`level: ${fm.level}`);
  lines.push(`title: "${escapeYaml(fm.title)}"`);
  lines.push(`parent: ${fm.level === 'system' ? '""' : fm.parent}`);
  lines.push('children:');
  for (const c of fm.children ?? []) {
    lines.push(`  - ${c}`);
  }
  if (fm.secondary_parents?.length) {
    lines.push('secondary_parents:');
    for (const p of fm.secondary_parents) {
      lines.push(`  - ${p}`);
    }
  }
  if (fm.lateral?.length) {
    lines.push('lateral:');
    for (const link of fm.lateral) {
      lines.push(`  - target: ${link.target}`);
      lines.push(`    type: ${link.type}`);
    }
  }
  if (fm.code_paths?.length) {
    lines.push('code_paths:');
    for (const p of fm.code_paths) {
      lines.push(`  - "${escapeYaml(p)}"`);
    }
  }
  if (fm.code_owner_authority) {
    lines.push(`code_owner_authority: ${fm.code_owner_authority}`);
  }
  if (fm.description) {
    lines.push(`description: "${escapeYaml(fm.description)}"`);
  }
  lines.push(`ai_generated: ${fm.ai_generated ?? true}`);
  lines.push('---');
  return lines.join('\n');
}

export function composeDocument(fm: DocFrontmatter, body: string): string {
  return serializeFrontmatter(fm) + '\n' + body.trimStart();
}

export function defaultBody(title: string): string {
  return `\n## Summary\n\n${title} — summary placeholder.\n`;
}

function escapeYaml(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
