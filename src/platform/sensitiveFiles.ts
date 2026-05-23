/** Sensitive file matching — R-PLAT-6 */

import { DEFAULT_SENSITIVE_PATTERNS } from '../shared/constants';

export function normalizeWorkspacePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Minimal glob matcher for **, *, and literal segments (case-insensitive).
 * On pattern error, treat as sensitive per R-PLAT-6.6.
 */
function isValidGlobPattern(pattern: string): boolean {
  if (/[\[][^\]]*$/.test(pattern)) {
    return false;
  }
  try {
    globToRegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

export function matchesGlob(pattern: string, relativePath: string): boolean {
  if (!isValidGlobPattern(pattern)) {
    throw new Error('invalid glob pattern');
  }
  const normalized = normalizeWorkspacePath(relativePath).toLowerCase();
  const regex = globToRegExp(pattern.toLowerCase());
  return regex.test(normalized);
}

function globToRegExp(glob: string): RegExp {
  let regex = '^';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*' && glob[i + 1] === '*') {
      regex += '.*';
      i++;
      if (glob[i + 1] === '/') {
        i++;
      }
    } else if (ch === '*') {
      regex += '[^/]*';
    } else if (ch === '?') {
      regex += '.';
    } else if (/[.+^${}()|[\]\\]/.test(ch)) {
      regex += '\\' + ch;
    } else {
      regex += ch;
    }
  }
  regex += '$';
  return new RegExp(regex);
}

export class SensitiveFileGuard {
  private patterns: string[];

  constructor(extraPatterns: string[] = []) {
    this.patterns = [...DEFAULT_SENSITIVE_PATTERNS, ...extraPatterns];
  }

  updatePatterns(extraPatterns: string[]): void {
    this.patterns = [...DEFAULT_SENSITIVE_PATTERNS, ...extraPatterns];
  }

  isSensitive(relativePath: string): boolean {
    return this.check(relativePath).sensitive;
  }

  check(relativePath: string): { sensitive: boolean; pattern?: string } {
    const path = normalizeWorkspacePath(relativePath);
    for (const pattern of this.patterns) {
      if (!isValidGlobPattern(pattern)) {
        return { sensitive: true, pattern };
      }
      try {
        if (matchesGlob(pattern, path)) {
          return { sensitive: true, pattern };
        }
      } catch {
        return { sensitive: true, pattern };
      }
    }
    return { sensitive: false };
  }
}
