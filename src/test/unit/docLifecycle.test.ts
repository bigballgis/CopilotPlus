import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectSubtreeDocPaths,
  isDocumentStale,
  isPathInSubtree,
} from '../../docs/docLifecycle.js';
import type { DocEntry } from '../../docs/documentTreeService.js';

function entry(partial: Partial<DocEntry> & Pick<DocEntry, 'relativePath' | 'frontmatter' | 'body'>): DocEntry {
  return {
    valid: true,
    errors: [],
    ...partial,
  };
}

describe('R-DOCS-9 document lifecycle', () => {
  const now = Date.parse('2026-05-23T12:00:00.000Z');

  it('marks docs without last_referenced_at as stale', () => {
    const stale = isDocumentStale(
      entry({
        relativePath: '.copilotPlus/docs/module/a.md',
        frontmatter: { id: 'a', level: 'module', title: 'A', parent: 'sys', children: [] },
        body: '## Summary\nHello',
      }),
      90,
      now
    );
    assert.equal(stale, true);
  });

  it('treats recently referenced docs as fresh', () => {
    const stale = isDocumentStale(
      entry({
        relativePath: '.copilotPlus/docs/feature/x.md',
        frontmatter: {
          id: 'x',
          level: 'feature',
          title: 'X',
          parent: 'mod',
          children: [],
          last_referenced_at: '2026-05-20T00:00:00.000Z',
        },
        body: '## Summary\nHello',
      }),
      90,
      now
    );
    assert.equal(stale, false);
  });

  it('matches subtree paths', () => {
    assert.equal(isPathInSubtree('.copilotPlus/docs/feature/a.md', '.copilotPlus/docs/feature'), true);
    assert.equal(isPathInSubtree('.copilotPlus/docs/module/a.md', '.copilotPlus/docs/feature'), false);
  });

  it('collects subtree doc paths', () => {
    const entries = [
      entry({
        relativePath: '.copilotPlus/docs/module/root.md',
        frontmatter: { id: 'root', level: 'module', title: 'Root', parent: 'sys', children: ['child'] },
        body: '## Summary\nRoot',
      }),
      entry({
        relativePath: '.copilotPlus/docs/feature/child.md',
        frontmatter: { id: 'child', level: 'feature', title: 'Child', parent: 'root', children: [] },
        body: '## Summary\nChild',
      }),
      entry({
        relativePath: '.copilotPlus/docs/module/other.md',
        frontmatter: { id: 'other', level: 'module', title: 'Other', parent: 'sys', children: [] },
        body: '## Summary\nOther',
      }),
    ];
    const paths = collectSubtreeDocPaths('.copilotPlus/docs/module/root.md', entries);
    assert.deepEqual(paths.sort(), [
      '.copilotPlus/docs/feature/child.md',
      '.copilotPlus/docs/module/root.md',
    ]);
  });
});
