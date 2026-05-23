import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPOSER_MAX_FILES,
  COMPOSER_MAX_GOAL,
  parseComposerResponse,
  validateComposerInput,
} from '../../editing/composerParse.js';

describe('R-EDIT-3 Composer', () => {
  it('rejects empty goal', () => {
    const err = validateComposerInput('  ', [{ relativePath: 'a.ts', sizeBytes: 10 }], { stage: 'Build' });
    assert.equal(err?.code, 'empty_goal');
  });

  it('rejects too many files', () => {
    const files = Array.from({ length: COMPOSER_MAX_FILES + 1 }, (_, i) => ({
      relativePath: `f${i}.ts`,
      sizeBytes: 1,
    }));
    const err = validateComposerInput('goal', files, { stage: 'Build' });
    assert.equal(err?.code, 'too_many_files');
  });

  it('rejects goal over limit', () => {
    const err = validateComposerInput('x'.repeat(COMPOSER_MAX_GOAL + 1), [{ relativePath: 'a.ts', sizeBytes: 1 }], {
      stage: 'Build',
    });
    assert.equal(err?.code, 'goal_too_long');
  });

  it('parses fenced JSON edits', () => {
    const parsed = parseComposerResponse(
      'Here you go:\n```json\n{"edits":[{"path":"src/a.ts","content":"export const a = 1;\\n"}]}\n```'
    );
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.edits.length, 1);
      assert.equal(parsed.edits[0].path, 'src/a.ts');
    }
  });

  it('rejects invalid response', () => {
    const parsed = parseComposerResponse('no json here');
    assert.equal(parsed.ok, false);
  });
});
