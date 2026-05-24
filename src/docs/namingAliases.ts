/** Retired document id aliases — R-DOCS-7.4–7.5 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { COPILOT_PLUS_HOME } from '../shared/constants';
import { composeDocument } from './frontmatterSerialize';
import type { DocumentTreeService, DocEntry } from './documentTreeService';

const ALIAS_FILE = '.copilotPlus/docs/naming_aliases.json';

export interface NamingAliasRewrite {
  documentPath: string;
  field: string;
  fromId: string;
  toId: string;
}

interface NamingAliasFile {
  aliases: Record<string, string>;
}

export class NamingAliasStore {
  private aliases = new Map<string, string>();
  private rewrites: NamingAliasRewrite[] = [];

  getRecentRewrites(): NamingAliasRewrite[] {
    return [...this.rewrites];
  }

  clearRewrites(): void {
    this.rewrites = [];
  }

  async load(workspaceRoot?: string): Promise<void> {
    if (!workspaceRoot) {
      this.aliases.clear();
      return;
    }
    const file = path.join(workspaceRoot, ALIAS_FILE);
    try {
      const raw = await fs.readFile(file, 'utf8');
      const parsed = JSON.parse(raw) as NamingAliasFile;
      this.aliases = new Map(Object.entries(parsed.aliases ?? {}));
    } catch {
      this.aliases.clear();
    }
  }

  async save(workspaceRoot?: string): Promise<void> {
    if (!workspaceRoot) {
      return;
    }
    const file = path.join(workspaceRoot, ALIAS_FILE);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const payload: NamingAliasFile = { aliases: Object.fromEntries(this.aliases.entries()) };
    await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf8');
  }

  register(oldId: string, newId: string): void {
    if (!oldId || !newId || oldId === newId) {
      return;
    }
    this.aliases.set(oldId, newId);
  }

  resolve(id: string): string {
    let current = id;
    const seen = new Set<string>();
    while (this.aliases.has(current) && !seen.has(current)) {
      seen.add(current);
      current = this.aliases.get(current)!;
    }
    return current;
  }

  compressForPrompt(limit = 20): string {
    const lines = [...this.aliases.entries()]
      .slice(0, limit)
      .map(([from, to]) => `${from} → ${to}`);
    return lines.length ? lines.join(', ') : '';
  }

  async syncDocumentLinks(docs: DocumentTreeService, entries: DocEntry[]): Promise<number> {
    if (this.aliases.size === 0) {
      return 0;
    }

    let updated = 0;
    for (const entry of entries) {
      if (!entry.valid || entry.relativePath.includes('/archive/')) {
        continue;
      }

      const fm = { ...entry.frontmatter };
      let changed = false;

      const rewriteId = (field: string, current: string | undefined): string | undefined => {
        if (!current) {
          return current;
        }
        const resolved = this.resolve(current);
        if (resolved !== current) {
          this.rewrites.push({
            documentPath: entry.relativePath,
            field,
            fromId: current,
            toId: resolved,
          });
          changed = true;
          return resolved;
        }
        return current;
      };

      fm.parent = rewriteId('parent', fm.parent) ?? fm.parent;
      fm.children = (fm.children ?? []).map((id) => rewriteId('children', id) ?? id);
      fm.secondary_parents = (fm.secondary_parents ?? []).map((id) => rewriteId('secondary_parents', id) ?? id);
      fm.lateral = (fm.lateral ?? []).map((link) => {
        const target = rewriteId('lateral', link.target) ?? link.target;
        return target === link.target ? link : { ...link, target };
      });

      if (!changed) {
        continue;
      }

      await docs.writeRaw(entry.relativePath, composeDocument(fm, entry.body));
      updated += 1;
    }

    return updated;
  }
}

export function namingAliasPath(): string {
  return path.posix.join(COPILOT_PLUS_HOME, 'docs', 'naming_aliases.json');
}
