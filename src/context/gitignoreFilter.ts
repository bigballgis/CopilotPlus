/** Gitignore matching for Codebase_Index — R-CTX-2.2 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface GitignoreRule {
  pattern: string;
  negated: boolean;
  anchored: boolean;
  directoryOnly: boolean;
}

export function parseGitignore(content: string): GitignoreRule[] {
  const rules: GitignoreRule[] = [];
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    let pattern = line;
    let negated = false;
    if (pattern.startsWith('!')) {
      negated = true;
      pattern = pattern.slice(1);
    }
    if (!pattern) {
      continue;
    }
    const anchored = pattern.startsWith('/');
    if (anchored) {
      pattern = pattern.slice(1);
    }
    const directoryOnly = pattern.endsWith('/');
    if (directoryOnly) {
      pattern = pattern.slice(0, -1);
    }
    rules.push({ pattern, negated, anchored, directoryOnly });
  }
  return rules;
}

function escapeRegex(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

function patternToRegex(rule: GitignoreRule): RegExp {
  let source = rule.pattern;
  if (source.includes('**')) {
    const parts = source.split('**');
    source = parts.map((part) => escapeRegex(part).replace(/\*/g, '[^/]*')).join('.*');
  } else {
    source = escapeRegex(source).replace(/\*/g, '[^/]*');
  }
  if (rule.anchored) {
    return new RegExp(`^${source}$`);
  }
  return new RegExp(`(^|/)${source}$`);
}

function ruleMatches(rule: GitignoreRule, relativePath: string, isDirectory: boolean): boolean {
  if (rule.directoryOnly && !isDirectory) {
    return false;
  }
  const target = relativePath.replace(/\\/g, '/');
  const basename = target.split('/').pop() ?? target;
  const regex = patternToRegex(rule);
  if (rule.anchored) {
    return regex.test(target);
  }
  return regex.test(target) || regex.test(basename);
}

/** Last matching rule wins (gitignore semantics). */
export function matchGitignoreRules(
  relativePath: string,
  isDirectory: boolean,
  rules: GitignoreRule[]
): boolean | undefined {
  let ignored: boolean | undefined;
  for (const rule of rules) {
    if (ruleMatches(rule, relativePath, isDirectory)) {
      ignored = !rule.negated;
    }
  }
  return ignored;
}

export function isPathIgnoredByGitignore(
  relativePosixPath: string,
  isDirectory: boolean,
  rulesByDirectory: Map<string, GitignoreRule[]>
): boolean {
  const normalized = relativePosixPath.replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (!normalized) {
    return false;
  }
  const segments = normalized.split('/');
  let ignored = false;

  for (let depth = 0; depth < segments.length; depth++) {
    const dirKey = depth === 0 ? '' : segments.slice(0, depth).join('/');
    const rules = rulesByDirectory.get(dirKey);
    if (!rules?.length) {
      continue;
    }
    const remainder = segments.slice(depth).join('/');
    const match = matchGitignoreRules(
      remainder,
      isDirectory && depth === segments.length - 1,
      rules
    );
    if (match !== undefined) {
      ignored = match;
    }
  }

  return ignored;
}

export class GitignoreStore {
  private readonly rulesByDirectory = new Map<string, GitignoreRule[]>();

  static async load(root: string): Promise<GitignoreStore> {
    const store = new GitignoreStore();
    await store.scan(root, root, '');
    return store;
  }

  isIgnored(relativePosixPath: string, isDirectory: boolean): boolean {
    return isPathIgnoredByGitignore(relativePosixPath, isDirectory, this.rulesByDirectory);
  }

  private async scan(root: string, dir: string, relDir: string): Promise<void> {
    const gitignorePath = path.join(dir, '.gitignore');
    try {
      const content = await fs.readFile(gitignorePath, 'utf8');
      this.rulesByDirectory.set(relDir.replace(/\\/g, '/'), parseGitignore(content));
    } catch {
      // no .gitignore in this directory
    }

    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return;
    }

    for (const name of entries) {
      if (name === '.git') {
        continue;
      }
      const abs = path.join(dir, name);
      const rel = relDir ? path.join(relDir, name) : name;
      const relPosix = rel.replace(/\\/g, '/');
      let stat;
      try {
        stat = await fs.stat(abs);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) {
        continue;
      }
      if (this.isIgnored(relPosix, true)) {
        continue;
      }
      await this.scan(root, abs, relPosix);
    }
  }
}

export function shouldSkipCodeIndexPath(
  relativePath: string,
  options: {
    respectGitignore: boolean;
    gitignore?: GitignoreStore | null;
    isSensitive: (p: string) => boolean;
    isDirectory?: boolean;
  }
): boolean {
  const norm = relativePath.replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (norm.startsWith('.copilotPlus/')) {
    return true;
  }
  if (options.isSensitive(norm)) {
    return true;
  }
  if (options.respectGitignore && options.gitignore?.isIgnored(norm, options.isDirectory ?? false)) {
    return true;
  }
  return false;
}
