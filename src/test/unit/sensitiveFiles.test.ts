import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SensitiveFileGuard, matchesGlob } from '../../platform/sensitiveFiles.js';

describe('R-PLAT-6 sensitive files', () => {
  it('matches default .env pattern', () => {
    const guard = new SensitiveFileGuard();
    assert.equal(guard.check('src/.env').sensitive, true);
    assert.equal(guard.check('config/.env.production').sensitive, true);
  });

  it('does not match normal source files', () => {
    const guard = new SensitiveFileGuard();
    assert.equal(guard.check('src/index.ts').sensitive, false);
  });

  it('treats invalid user glob as sensitive per R-PLAT-6.6', () => {
    const guard = new SensitiveFileGuard(['[invalid']);
    assert.equal(guard.check('foo.txt').sensitive, true);
  });
});
