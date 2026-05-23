import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveToolPermission } from '../../platform/toolPermissions.js';

describe('R-PLAT-10 tool permissions', () => {
  it('defaults read_file to allow', () => {
    const r = resolveToolPermission('read_file', {}, 'Manual', false);
    assert.equal(r.effective, 'allow');
  });

  it('deny overrides autonomy', () => {
    const r = resolveToolPermission('read_file', { read_file: 'deny' }, 'Full_Auto', false);
    assert.equal(r.effective, 'deny');
  });

  it('Approve_Edits upgrades grep to allow from ask', () => {
    const r = resolveToolPermission('write_file', {}, 'Approve_Edits', false);
    assert.equal(r.effective, 'ask');
    const grep = resolveToolPermission('grep', {}, 'Approve_Edits', false);
    assert.equal(grep.effective, 'allow');
  });

  it('bash stays ask under Full_Auto', () => {
    const r = resolveToolPermission('bash', {}, 'Full_Auto', false);
    assert.equal(r.effective, 'ask');
  });
});
