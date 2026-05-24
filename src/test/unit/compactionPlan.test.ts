import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterExecutablePlan,
  hasInboundLinks,
  parseCompactionPlan,
} from '../../docs/compactionPlan.js';
import type { DocEntry } from '../../docs/documentTreeService.js';

function entry(partial: Partial<DocEntry> & Pick<DocEntry, 'relativePath' | 'frontmatter' | 'body'>): DocEntry {
  return { valid: true, errors: [], ...partial };
}

describe('R-DOCS-9.3 compaction plan parsing', () => {
  it('parses architect JSON plan items', () => {
    const plan = parseCompactionPlan(`
\`\`\`json
{
  "items": [
    { "document_path": ".copilotPlus/docs/feature/old.md", "action": "archive", "rationale": "deprecated" },
    { "document_path": ".copilotPlus/docs/feature/keep.md", "action": "keep" }
  ]
}
\`\`\`
`);
    assert.equal(plan.items.length, 2);
    assert.equal(plan.items[0]?.action, 'archive');
    assert.equal(plan.items[1]?.action, 'keep');
  });

  it('blocks delete when inbound links exist', () => {
    const entries = [
      entry({
        relativePath: '.copilotPlus/docs/feature/child.md',
        frontmatter: {
          id: 'child',
          level: 'feature',
          title: 'Child',
          parent: 'mod',
          children: [],
        },
        body: '## Summary\nChild',
      }),
      entry({
        relativePath: '.copilotPlus/docs/module/mod.md',
        frontmatter: {
          id: 'mod',
          level: 'module',
          title: 'Mod',
          parent: 'sys',
          children: ['child'],
        },
        body: '## Summary\nMod',
      }),
    ];
    assert.equal(hasInboundLinks('.copilotPlus/docs/feature/child.md', entries), true);
    const executable = filterExecutablePlan(
      parseCompactionPlan(
        '{"items":[{"document_path":".copilotPlus/docs/feature/child.md","action":"delete"}]}'
      ),
      entries
    );
    assert.equal(executable.length, 0);
  });
});
