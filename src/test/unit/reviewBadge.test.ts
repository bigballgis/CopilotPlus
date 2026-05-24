import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeReviewBadge, formatUnreviewedDocNotice } from '../../docs/reviewBadge.js';
import type { DocEntry } from '../../docs/documentTreeService.js';

function entry(partial: Partial<DocEntry> & Pick<DocEntry, 'relativePath' | 'frontmatter' | 'body'>): DocEntry {
  return { valid: true, errors: [], ...partial };
}

describe('R-DOCS-10.5 unreviewed doc notice', () => {
  it('flags red system/module docs in sub-agent notice', () => {
    const notice = formatUnreviewedDocNotice([
      entry({
        relativePath: '.copilotPlus/docs/system/app.md',
        frontmatter: { id: 'sys', level: 'system', title: 'App', parent: '', children: [] },
        body: '## Summary\nx',
      }),
    ]);
    assert.match(notice, /Unreviewed scope documents/);
    assert.match(notice, /App/);
  });

  it('computes review badge colors by age', () => {
    const recent = entry({
      relativePath: '.copilotPlus/docs/module/a.md',
      frontmatter: {
        id: 'a',
        level: 'module',
        title: 'A',
        parent: 'sys',
        children: [],
        human_reviewed_at: new Date().toISOString(),
      },
      body: '## Summary\nx',
    });
    assert.equal(computeReviewBadge(recent), 'green');
  });
});
