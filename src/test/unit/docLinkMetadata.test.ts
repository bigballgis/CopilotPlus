import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { collectDocLinkTargets } from '../../context/docLinkMetadata.js';

describe('R-CTX-3 doc link metadata', () => {
  it('collects hierarchical and lateral link targets', () => {
    const entries = [
      {
        relativePath: '.copilotPlus/docs/system.md',
        frontmatter: { id: 'system', parent: '', children: ['module-a'] },
      },
      {
        relativePath: '.copilotPlus/docs/module-a.md',
        frontmatter: {
          id: 'module-a',
          parent: 'system',
          children: ['feature-x'],
          lateral: [{ target: 'module-b' }],
        },
      },
      {
        relativePath: '.copilotPlus/docs/feature-x.md',
        frontmatter: { id: 'feature-x', parent: 'module-a', children: [] },
      },
      {
        relativePath: '.copilotPlus/docs/module-b.md',
        frontmatter: { id: 'module-b', parent: 'system', children: [] },
      },
    ];
    const targets = collectDocLinkTargets(entries[1]!, entries);
    assert.ok(targets.includes('.copilotPlus/docs/system.md'));
    assert.ok(targets.includes('.copilotPlus/docs/feature-x.md'));
    assert.ok(targets.includes('.copilotPlus/docs/module-b.md'));
  });
});
