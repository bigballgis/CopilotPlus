import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseDocRelativePath, pathForDoc, systemDocPath } from '../../docs/paths.js';
import { composeDocument, normalizeFrontmatter } from '../../docs/frontmatterSerialize.js';
import { validateDocumentSize, validateFrontmatter } from '../../docs/frontmatter.js';
import { resolveScope, buildDocBreadcrumb, buildDocPreviewNav } from '../../docs/scopeResolution.js';
import { resolveOwners, CodeOwnershipIndex } from '../../docs/ownershipIndex.js';
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
      lateral: [{ target: 'billing', type: 'references' }],
      ai_generated: true,
    });
    const body = '\n## Summary\n\nAuth module summary.\n';
    const content = composeDocument(fm, body);
    const validation = validateFrontmatter(fm as unknown as Record<string, unknown>, body);
    assert.equal(validation.valid, true);
    assert.match(content, /^---\nid: auth/);
    assert.match(content, /lateral:/);
    assert.match(content, /target: billing/);
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

  it('includes secondary_parents as lateral scope', () => {
    const entries: DocEntry[] = [
      entry('.copilotPlus/docs/system/app.md', 'app', 'system', '', ['auth']),
      entry('.copilotPlus/docs/system/app/auth.md', 'auth', 'module', 'app', ['login']),
      entry(
        '.copilotPlus/docs/system/app/auth/login.md',
        'login',
        'feature',
        'auth',
        [],
        undefined,
        undefined,
        undefined,
        ['billing']
      ),
      entry('.copilotPlus/docs/system/app/billing.md', 'billing', 'module', 'app', []),
    ];

    const scope = resolveScope('.copilotPlus/docs/system/app/auth/login.md', entries);
    const paths = scope.map((s) => s.document_path);
    assert.ok(paths.includes('.copilotPlus/docs/system/app/billing.md'));
    const billing = scope.find((s) => s.document_path.includes('billing.md'));
    assert.equal(billing?.link_type, 'lateral');
  });

  it('builds hierarchical breadcrumb', () => {
    const entries: DocEntry[] = [
      entry('.copilotPlus/docs/system/app.md', 'app', 'system', '', ['auth']),
      entry('.copilotPlus/docs/system/app/auth.md', 'auth', 'module', 'app', ['login']),
      entry('.copilotPlus/docs/system/app/auth/login.md', 'login', 'feature', 'auth', []),
    ];
    const crumbs = buildDocBreadcrumb('.copilotPlus/docs/system/app/auth/login.md', entries);
    assert.deepEqual(
      crumbs.map((c) => c.title),
      ['app', 'auth', 'login']
    );
  });

  it('builds preview nav with children and lateral links by type', () => {
    const entries: DocEntry[] = [
      entry('.copilotPlus/docs/system/app.md', 'app', 'system', '', ['auth']),
      entry('.copilotPlus/docs/system/app/auth.md', 'auth', 'module', 'app', ['login'], [
        { target: 'billing', type: 'references' },
        { target: 'audit', type: 'depends_on' },
      ]),
      entry('.copilotPlus/docs/system/app/auth/login.md', 'login', 'feature', 'auth', []),
      entry('.copilotPlus/docs/system/app/billing.md', 'billing', 'module', 'app', []),
      entry('.copilotPlus/docs/system/app/audit.md', 'audit', 'module', 'app', []),
    ];

    const nav = buildDocPreviewNav('.copilotPlus/docs/system/app/auth.md', entries);
    assert.deepEqual(
      nav.children.map((c) => c.path),
      ['.copilotPlus/docs/system/app/auth/login.md']
    );
    assert.deepEqual(
      nav.lateralByType.references?.map((l) => l.path),
      ['.copilotPlus/docs/system/app/billing.md']
    );
    assert.deepEqual(
      nav.lateralByType.depends_on?.map((l) => l.path),
      ['.copilotPlus/docs/system/app/audit.md']
    );
  });

  it('resolves lateral targets through alias resolver', () => {
    const entries: DocEntry[] = [
      entry('.copilotPlus/docs/system/app.md', 'app', 'system', '', ['auth']),
      entry('.copilotPlus/docs/system/app/auth.md', 'auth', 'module', 'app', [], [
        { target: 'billing-old', type: 'references' },
      ]),
      entry('.copilotPlus/docs/system/app/billing.md', 'billing', 'module', 'app', []),
    ];

    const nav = buildDocPreviewNav('.copilotPlus/docs/system/app/auth.md', entries, (id) =>
      id === 'billing-old' ? 'billing' : id
    );
    assert.deepEqual(nav.lateralByType.references?.map((l) => l.title), ['billing']);
  });

  it('filters lateral scope by max depth', () => {
    const entries: DocEntry[] = [
      entry('.copilotPlus/docs/system/app.md', 'app', 'system', '', ['auth', 'billing']),
      entry('.copilotPlus/docs/system/app/auth.md', 'auth', 'module', 'app', ['login']),
      entry('.copilotPlus/docs/system/app/auth/login.md', 'login', 'feature', 'auth', [], [
        { target: 'billing', type: 'references' },
      ]),
      entry('.copilotPlus/docs/system/app/billing.md', 'billing', 'module', 'app', []),
    ];

    const full = resolveScope('.copilotPlus/docs/system/app/auth/login.md', entries, 100, {
      maxLateralDepth: 8,
    });
    const filtered = resolveScope('.copilotPlus/docs/system/app/auth/login.md', entries, 100, {
      maxLateralDepth: 2,
    });
    assert.ok(full.some((s) => s.document_path.includes('billing.md')));
    assert.ok(!filtered.some((s) => s.document_path.includes('billing.md')));
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

  it('CodeOwnershipIndex caches lookups for indexed paths', () => {
    const entries: DocEntry[] = [
      entry('.copilotPlus/docs/system/app/a.md', 'a', 'component', 'f1', [], undefined, ['src/a/**']),
    ];
    const index = new CodeOwnershipIndex();
    index.rebuild(entries, ['src/a/foo.ts', 'src/other.ts']);

    const owned = index.lookup('src/a/foo.ts');
    assert.ok(owned);
    assert.equal(owned!.orphan, false);
    assert.deepEqual(owned!.owners, ['a']);

    assert.equal(index.lookup('src/other.ts')!.orphan, true);

    index.updateFile('src/a/foo.ts', [
      ...entries,
      entry('.copilotPlus/docs/system/app/b.md', 'b', 'component', 'f2', [], undefined, ['src/a/**'], 'exclusive'),
    ]);
    assert.equal(index.lookup('src/a/foo.ts')!.conflict, true);

    index.removeFile('src/a/foo.ts');
    assert.equal(index.lookup('src/a/foo.ts'), undefined);
  });
});

describe('R-DOCS-8 document size', () => {
  it('returns structured document_too_large violation', () => {
    const result = validateDocumentSize('component', 'x'.repeat(1001));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'document_too_large');
      assert.equal(result.cap, 1000);
      assert.equal(result.actual, 1001);
    }
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
  code_owner_authority?: 'exclusive' | 'shared',
  secondary_parents?: string[]
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
      secondary_parents,
      code_paths,
      code_owner_authority,
      ai_generated: true,
    },
  };
}
