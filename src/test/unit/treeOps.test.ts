import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  childLevelFor,
  patchLinksForIdRename,
  patchLinksForRemovedId,
  pathForRenamedId,
} from '../../docs/treeOps.js';
import type { DocEntry } from '../../docs/documentTreeService.js';

describe('R-DOCS-6 tree operations', () => {
  it('maps parent levels to child levels', () => {
    assert.equal(childLevelFor('system'), 'module');
    assert.equal(childLevelFor('module'), 'feature');
    assert.equal(childLevelFor('feature'), 'component');
    assert.equal(childLevelFor('component'), null);
  });

  it('computes renamed paths from document ids', () => {
    assert.equal(
      pathForRenamedId('.copilotPlus/docs/system/app/auth.md', 'identity'),
      '.copilotPlus/docs/system/app/identity.md'
    );
  });

  it('patches hierarchical and lateral links when an id is renamed', () => {
    const entries = tree([
      row('.copilotPlus/docs/system/app.md', 'app', 'system', '', ['auth']),
      row('.copilotPlus/docs/system/app/auth.md', 'auth', 'module', 'app', ['login'], [
        { target: 'billing', type: 'references' },
      ]),
      row('.copilotPlus/docs/system/app/billing.md', 'billing', 'module', 'app', []),
      row('.copilotPlus/docs/system/app/auth/login.md', 'login', 'feature', 'auth', []),
    ]);
    const patches = patchLinksForIdRename(entries, 'auth', 'identity');
    const paths = patches.map((p) => p.relativePath);
    assert.ok(paths.includes('.copilotPlus/docs/system/app.md'));
    assert.ok(paths.includes('.copilotPlus/docs/system/app/auth/login.md'));
    assert.equal(paths.includes('.copilotPlus/docs/system/app/auth.md'), false);
    const parent = patches.find((p) => p.relativePath.endsWith('/app.md'))!;
    assert.deepEqual(parent.frontmatter.children, ['identity']);
    const login = patches.find((p) => p.frontmatter.id === 'login')!;
    assert.equal(login.frontmatter.parent, 'identity');
    const renamedSource = entries.find((e) => e.frontmatter.id === 'auth')!;
    assert.equal(renamedSource.frontmatter.lateral?.[0]?.target, 'billing');
  });

  it('removes inbound links when a document is deleted', () => {
    const entries = tree([
      row('.copilotPlus/docs/system/app.md', 'app', 'system', '', ['leaf']),
      row('.copilotPlus/docs/system/app/leaf.md', 'leaf', 'module', 'app', [], [
        { target: 'peer', type: 'references' },
      ]),
      row('.copilotPlus/docs/system/app/peer.md', 'peer', 'module', 'app', []),
    ]);
    const patches = patchLinksForRemovedId(entries, 'peer');
    assert.equal(patches.length, 1);
    assert.equal(patches[0]!.frontmatter.lateral?.length, 0);
  });
});

function row(
  relativePath: string,
  id: string,
  level: DocEntry['frontmatter']['level'],
  parent: string,
  children: string[],
  lateral?: DocEntry['frontmatter']['lateral']
): DocEntry {
  return {
    relativePath,
    body: '\n## Summary\n\nTest.\n',
    valid: true,
    errors: [],
    frontmatter: { id, level, title: id, parent, children, lateral, ai_generated: true },
  };
}

function tree(entries: DocEntry[]): DocEntry[] {
  return entries;
}
