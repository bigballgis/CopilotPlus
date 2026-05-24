import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyTextEdits } from '../../tools/textEditApply.js';

describe('R-TOOL-5 lsp text edits', () => {
  it('applies rename-style text edits in reverse order', () => {
    const original = 'function oldName() {\n  return oldName;\n}';
    const edits = [
      {
        range: { start: { line: 1, character: 9 }, end: { line: 1, character: 16 } },
        newText: 'newName',
      },
      {
        range: { start: { line: 0, character: 9 }, end: { line: 0, character: 16 } },
        newText: 'newName',
      },
    ];
    const proposed = applyTextEdits(original, edits);
    assert.match(proposed, /function newName\(\)/);
    assert.match(proposed, /return newName;/);
    assert.doesNotMatch(proposed, /oldName/);
  });
});
