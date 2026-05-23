/** Document tree path helpers — R-DOCS-1 */

import * as path from 'path';
import type { DocLevel } from './frontmatter';

export function docsRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.copilotPlus', 'docs');
}

export function systemDocPath(systemId: string): string {
  return path.posix.join('.copilotPlus', 'docs', 'system', `${systemId}.md`);
}

export function childDocPath(systemId: string, segments: string[]): string {
  return path.posix.join('.copilotPlus', 'docs', 'system', systemId, ...segments.map((s) => `${s}.md`));
}

export function pathForDoc(systemId: string, level: DocLevel, ids: { moduleId?: string; featureId?: string; componentId?: string }): string {
  switch (level) {
    case 'system':
      return systemDocPath(systemId);
    case 'module':
      return childDocPath(systemId, [ids.moduleId!]);
    case 'feature':
      return childDocPath(systemId, [ids.moduleId!, ids.featureId!]);
    case 'component':
      return childDocPath(systemId, [ids.moduleId!, ids.featureId!, ids.componentId!]);
  }
}

export function parseDocRelativePath(relativePath: string): {
  systemId: string;
  level: DocLevel;
  ids: string[];
} | null {
  const norm = relativePath.replace(/\\/g, '/');
  const m = norm.match(/^\.copilotPlus\/docs\/system\/([a-z][a-z0-9-]*)(?:\/([a-z][a-z0-9-]*))*\.md$/);
  if (!m) {
    return null;
  }
  const parts = norm.split('/');
  const fileName = parts[parts.length - 1].replace(/\.md$/, '');
  const systemId = parts[3];
  const ids = parts.slice(4).map((p) => p.replace(/\.md$/, ''));

  if (ids.length === 0) {
    return { systemId, level: 'system', ids: [fileName] };
  }
  if (ids.length === 1) {
    return { systemId, level: 'module', ids };
  }
  if (ids.length === 2) {
    return { systemId, level: 'feature', ids };
  }
  if (ids.length === 3) {
    return { systemId, level: 'component', ids };
  }
  return null;
}
