import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { levenshtein, titleTokenOverlap, findNamingCollision } from '../../docs/namingConsistency.js';
import type { DocEntry } from '../../docs/documentTreeService.js';

describe('R-DOCS-7 naming consistency', () => {
  it('computes levenshtein distance', () => {
    assert.equal(levenshtein('auth', 'auths'), 1);
    assert.equal(levenshtein('login', 'logout'), 3);
  });

  it('detects title token overlap above threshold', () => {
    assert.ok(titleTokenOverlap('Auth Login', 'Auth Login Service') > 0.6);
    assert.ok(titleTokenOverlap('Billing Module', 'Authentication Module') < 0.6);
  });

  it('finds sibling naming collisions', () => {
    const entries: DocEntry[] = [
      entry('.copilotPlus/docs/system/app/auth.md', 'auth', 'module', 'app'),
      entry('.copilotPlus/docs/system/app/auths.md', 'auths', 'module', 'app'),
    ];
    const collision = findNamingCollision(
      { id: 'authn', level: 'module', title: 'Auth Module', parent: 'app', children: [] },
      entries
    );
    assert.equal(collision?.frontmatter.id, 'auth');
  });
});

function entry(relativePath: string, id: string, level: DocEntry['frontmatter']['level'], parent: string): DocEntry {
  return {
    relativePath,
    body: '\n## Summary\n\nTest.\n',
    valid: true,
    errors: [],
    frontmatter: { id, level, title: id, parent, children: [], ai_generated: true },
  };
}
