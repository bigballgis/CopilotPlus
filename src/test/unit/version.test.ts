import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compareSemver, isSupportedHostVersion } from '../../platform/version.js';

describe('R-PLAT-1 version gate', () => {
  it('compareSemver orders correctly', () => {
    assert.ok(compareSemver('1.109.5', '1.109.0') > 0);
    assert.ok(compareSemver('1.108.0', '1.109.0') < 0);
    assert.equal(compareSemver('1.109.0', '1.109.0'), 0);
  });

  it('isSupportedHostVersion accepts 1.109.5', () => {
    assert.equal(isSupportedHostVersion('1.109.5', '1.109.0'), true);
    assert.equal(isSupportedHostVersion('1.108.0', '1.109.0'), false);
  });
});
