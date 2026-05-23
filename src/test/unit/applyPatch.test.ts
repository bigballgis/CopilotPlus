import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyEdits } from '../../tools/applyPatchLogic.js';

describe('R-TOOL-3 apply_patch', () => {
  it('applies unique replacement', () => {
    const result = applyEdits('hello world', [
      { oldString: 'hello world', newString: 'hello Copilot' },
    ]);
    assert.equal(result.ok && result.content, 'hello Copilot');
  });

  it('rejects ambiguous match', () => {
    const result = applyEdits('xxxxxxxxxx a xxxxxxxxxx b', [
      { oldString: 'xxxxxxxxxx', newString: 'yyyyyyyyyy' },
    ]);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'ambiguous_match');
    }
  });

  it('rejects short oldString', () => {
    const result = applyEdits('abcdef', [{ oldString: 'abc', newString: 'xyz' }]);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'old_string_too_short');
    }
  });
});
