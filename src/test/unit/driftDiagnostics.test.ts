import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConsistencyQueue } from '../../docs/consistencyQueue.js';
import { hasSummarySection, scanDriftDiagnostics } from '../../docs/driftDiagnostics.js';
import type { DocEntry } from '../../docs/documentTreeService.js';

function entry(partial: Partial<DocEntry> & Pick<DocEntry, 'relativePath' | 'frontmatter' | 'body'>): DocEntry {
  return {
    valid: true,
    errors: [],
    ...partial,
  };
}

describe('R-DOCS-12/13 drift diagnostics', () => {
  it('detects missing summary sections', () => {
    const items = scanDriftDiagnostics(
      [
        entry({
          relativePath: '.copilotPlus/docs/module/a.md',
          frontmatter: {
            id: 'mod-a',
            level: 'module',
            title: 'A',
            parent: 'system',
            children: [],
          },
          body: '## Overview\nNo summary here.',
        }),
      ],
      [],
      new Set()
    );
    assert.ok(items.some((item) => item.type === 'Missing_Summary'));
  });

  it('detects dangling parent links', () => {
    const items = scanDriftDiagnostics(
      [
        entry({
          relativePath: '.copilotPlus/docs/feature/x.md',
          frontmatter: {
            id: 'feat-x',
            level: 'feature',
            title: 'X',
            parent: 'missing-parent',
            children: [],
          },
          body: '## Summary\nShort summary for the feature document.',
        }),
      ],
      [],
      new Set()
    );
    assert.ok(items.some((item) => item.type === 'Dangling_Link'));
  });

  it('detects orphan code files', () => {
    const items = scanDriftDiagnostics([], ['src/unowned.ts'], new Set());
    assert.ok(items.some((item) => item.type === 'Orphan_Code' && item.target === 'src/unowned.ts'));
  });

  it('recognizes summary headings', () => {
    assert.equal(hasSummarySection('## Summary\nHello'), true);
    assert.equal(hasSummarySection('## Overview\nHello'), false);
  });
});

describe('R-DOCS-12 consistency queue', () => {
  it('flushes when component reaches threshold', () => {
    const queue = new ConsistencyQueue();
    for (let i = 0; i < 20; i++) {
      queue.enqueue('comp-a', `src/file${i}.ts`);
    }
    assert.equal(queue.shouldFlush('comp-a'), true);
    assert.equal(queue.flush('comp-a').length, 20);
    assert.equal(queue.pendingCount(), 0);
  });

  it('tracks upward doc changes separately', () => {
    const queue = new ConsistencyQueue();
    queue.enqueueDocChange('.copilotPlus/docs/feature/a.md');
    assert.deepEqual(queue.flushDocChanges(), ['.copilotPlus/docs/feature/a.md']);
  });
});
