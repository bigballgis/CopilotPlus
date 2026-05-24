/** Document link metadata for RAG chunks — R-CTX-3.2, R-CTX-3.6 */

export interface DocLinkSource {
  relativePath: string;
  frontmatter: {
    id: string;
    parent?: string;
    children?: string[];
    lateral?: Array<{ target: string }>;
  };
}

export function collectDocLinkTargets(entry: DocLinkSource, entries: DocLinkSource[]): string[] {
  const targets = new Set<string>();
  const byId = new Map(entries.map((e) => [e.frontmatter.id, e]));

  if (entry.frontmatter.parent) {
    const parent = byId.get(entry.frontmatter.parent);
    if (parent) {
      targets.add(parent.relativePath.replace(/\\/g, '/'));
    }
  }

  for (const childId of entry.frontmatter.children ?? []) {
    const child = byId.get(childId);
    if (child) {
      targets.add(child.relativePath.replace(/\\/g, '/'));
    }
  }

  for (const link of entry.frontmatter.lateral ?? []) {
    const target = byId.get(link.target);
    if (target) {
      targets.add(target.relativePath.replace(/\\/g, '/'));
    }
  }

  return [...targets];
}
