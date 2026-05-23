import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LspDiagnostic } from '../../tools/lspTools.js';

function diagKey(d: LspDiagnostic): string {
  return `${d.file}:${d.range.start.line}:${d.message}`;
}

function detectRegressions(
  before: LspDiagnostic[],
  after: LspDiagnostic[]
): LspDiagnostic[] {
  const regressions: LspDiagnostic[] = [];
  for (const diag of after) {
    const key = diagKey(diag);
    if (!before.some((b) => diagKey(b) === key)) {
      regressions.push(diag);
    }
  }
  return regressions;
}

describe('R-AG-6 post-edit verification', () => {
  it('detects new error diagnostics', () => {
    const before = [{ file: 'a.ts', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, severity: 'Error', message: 'old' }];
    const after = [
      ...before,
      { file: 'a.ts', range: { start: { line: 1, character: 0 }, end: { line: 1, character: 1 } }, severity: 'Error', message: 'new' },
    ];
    const regressions = detectRegressions(before, after);
    assert.equal(regressions.length, 1);
    assert.equal(regressions[0].message, 'new');
  });

  it('ignores unchanged errors', () => {
    const before = [{ file: 'a.ts', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, severity: 'Error', message: 'same' }];
    const regressions = detectRegressions(before, before);
    assert.equal(regressions.length, 0);
  });
});
