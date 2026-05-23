import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseDocRelativePath, pathForDoc, systemDocPath } from '../../docs/paths.js';
import { composeDocument, normalizeFrontmatter } from '../../docs/frontmatterSerialize.js';
import { validateFrontmatter } from '../../docs/frontmatter.js';
import { resolveScope } from '../../docs/scopeResolution.js';
import { resolveOwners } from '../../docs/ownershipIndex.js';
import type { DocEntry } from '../../docs/documentTreeService.js';

describe('R-DOCS-1 paths', () => {
  it('builds valid system and nested paths', () => {
    assert.equal(systemDocPath('default'), '.copilotPlus/docs/system/default.md');
    assert.equal(pathForDoc('app', 'module', { moduleId: 'auth' }), '.copilotPlus/docs/system/app/auth.md');
    const parsed = parseDocRelativePath('.copilotPlus/docs/system/app/auth/login.md');
    assert.deepEqual(parsed, { systemId: 'app', level: 'feature', ids: ['auth', 'login'] });
  });
});

describe('R-DOCS-2 frontmatter', () => {
  it('round-trips compose and normalize', () => {
    const fm = normalizeFrontmatter({
      id: 'auth',
      level: 'module',
      title: 'Auth Module',
      parent: 'app',
      children: ['login'],
      ai_generated: true,
    });
    const body = '\n## Summary\n\nAuth module summary.\n';
    const content = composeDocument(fm, body);
    const validation = validateFrontmatter(fm as unknown as Record<string, unknown>, body);
    assert.equal(validation.valid, true);
    assert.match(content, /^---\nid: auth/);
  });
});

describe('R-DOCS-5 scope resolution', () => {
  it('includes ancestors, descendants, and lateral links', () => {
    const entries: DocEntry[] = [
      entry('.copilotPlus/docs/system/app.md', 'app', 'system', '', ['auth']),
      entry('.copilotPlus/docs/system/app/auth.md', 'auth', 'module', 'app', ['login'], [
        { target: 'billing', type: 'references' },
      ]),
      entry('.copilotPlus/docs/system/app/auth/login.md', 'login', 'feature', 'auth', []),
      entry('.copilotPlus/docs/system/app/billing.md', 'billing', 'module', 'app', []),
    ];

    const scope = resolveScope('.copilotPlus/docs/system/app/auth.md', entries);
    const paths = scope.map((s) => s.document_path);
    assert.ok(paths.includes('.copilotPlus/docs/system/app/auth.md'));
    assert.ok(paths.includes('.copilotPlus/docs/system/app.md'));
    assert.ok(paths.includes('.copilotPlus/docs/system/app/auth/login.md'));
    assert.ok(paths.includes('.copilotPlus/docs/system/app/billing.md'));
  });
});

describe('R-DOCS-11 ownership', () => {
  it('detects orphan and exclusive conflict', () => {
    const entries: DocEntry[] = [
      entry('.copilotPlus/docs/system/app/a.md', 'a', 'component', 'f1', [], undefined, ['src/a/**']),
      entry('.copilotPlus/docs/system/app/b.md', 'b', 'component', 'f2', [], undefined, ['src/shared/**'], 'exclusive'),
      entry('.copilotPlus/docs/system/app/c.md', 'c', 'component', 'f3', [], undefined, ['src/shared/**'], 'exclusive'),
    ];

    assert.equal(resolveOwners('src/unknown.ts', entries).orphan, true);
    const shared = resolveOwners('src/shared/util.ts', entries);
    assert.equal(shared.conflict, true);
    assert.equal(shared.owners.length, 2);
  });
});

function entry(
  relativePath: string,
  id: string,
  level: 'system' | 'module' | 'feature' | 'component',
  parent: string,
  children: string[],
  lateral?: DocEntry['frontmatter']['lateral'],
  code_paths?: string[],
  code_owner_authority?: 'exclusive' | 'shared'
): DocEntry {
  return {
    relativePath,
    body: '\n## Summary\n\nTest.\n',
    valid: true,
    errors: [],
    frontmatter: {
      id,
      level,
      title: id,
      parent,
      children,
      lateral,
      code_paths,
      code_owner_authority,
      ai_generated: true,
    },
  };
}
