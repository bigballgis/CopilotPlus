import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDocTreeStats,
  DOC_TREE_SOFT_TOKEN_LIMIT,
  estimateDocTokens,
} from '../../docs/docTreeStats.js';
import type { DocEntry } from '../../docs/documentTreeService.js';

describe('R-DOCS-8.4 doc tree stats', () => {
  it('estimates tokens from character length', () => {
    assert.equal(estimateDocTokens('abcd'), 1);
    assert.equal(estimateDocTokens('a'.repeat(400)), 100);
  });

  it('aggregates per-level totals and soft limit flag', () => {
    const entries: DocEntry[] = [
      row('system/app.md', 'app', 'system', 'x'.repeat(100)),
      row('system/app/auth.md', 'auth', 'module', 'y'.repeat(200)),
      row('archive/old.md', 'old', 'feature', 'z'.repeat(500), true),
    ];
    const stats = computeDocTreeStats(entries);
    assert.equal(stats.byLevel.find((b) => b.level === 'system')!.docs, 1);
    assert.equal(stats.byLevel.find((b) => b.level === 'module')!.docs, 1);
    assert.equal(stats.byLevel.find((b) => b.level === 'feature')!.docs, 0);
    assert.equal(stats.totalChars, 100 + 200);
    assert.equal(stats.softLimitExceeded, stats.totalTokens > DOC_TREE_SOFT_TOKEN_LIMIT);
  });
});

function row(
  relativePath: string,
  id: string,
  level: DocEntry['frontmatter']['level'],
  body: string,
  archived = false
): DocEntry {
  return {
    relativePath: archived ? `.copilotPlus/docs/archive/${relativePath}` : `.copilotPlus/docs/${relativePath}`,
    body,
    valid: true,
    errors: [],
    frontmatter: {
      id,
      level,
      title: id,
      parent: level === 'system' ? '' : 'app',
      children: [],
      ai_generated: true,
    },
  };
}
