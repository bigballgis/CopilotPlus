import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type * as vscode from 'vscode';
import {
  mergeInvalidationPaths,
  sampleReferencePositions,
} from '../../editing/responseCacheSymbols.js';
import { describeNesDelegateStatus } from '../../editing/nesDelegateStatus.js';
import { isInternalEdit, runInternalEdit } from '../../editing/editOrigin.js';

function changeEvent(
  startLine: number,
  startChar: number,
  endLine: number,
  endChar: number,
  text: string,
  rangeLength: number
): vscode.TextDocumentContentChangeEvent {
  return {
    range: {
      start: { line: startLine, character: startChar },
      end: { line: endLine, character: endChar },
    } as vscode.Range,
    rangeOffset: 0,
    rangeLength,
    text,
  };
}

describe('R-EDIT-8.5 LSP symbol cache invalidation', () => {
  it('samples change positions for reference lookup', () => {
    const positions = sampleReferencePositions([
      changeEvent(4, 2, 4, 5, 'foo', 3),
      changeEvent(10, 0, 10, 0, '', 0),
    ]);
    assert.equal(positions.length, 1);
    assert.deepEqual(positions[0], { line: 4, character: 2 });
  });

  it('merges changed file with reference files', () => {
    const paths = mergeInvalidationPaths('src/a.ts', ['src/b.ts', 'src/a.ts', 'src/c.ts']);
    assert.deepEqual(paths.sort(), ['src/a.ts', 'src/b.ts', 'src/c.ts']);
  });
});

describe('R-EDIT-7 NES delegate', () => {
  it('describes disabled mode without notice', () => {
    const status = describeNesDelegateStatus(
      { nesMode: 'disabled' },
      { installed: true, active: true }
    );
    assert.equal(status.mode, 'disabled');
    assert.equal(status.noticeKey, undefined);
  });

  it('tracks internal edit origin depth', async () => {
    assert.equal(isInternalEdit(), false);
    await runInternalEdit(async () => {
      assert.equal(isInternalEdit(), true);
    });
    assert.equal(isInternalEdit(), false);
  });
});
