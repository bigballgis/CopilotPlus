import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applySpeculativeTokenDiscount,
  hashSpeculativeKey,
  SpeculativeRequestPool,
} from '../../platform/speculativeRequests.js';
import { buildScopePreheatKey } from '../../context/scopePreheatKey.js';
import { buildTabCompletionSpecKey } from '../../editing/tabCompletionSpecKey.js';

describe('R-PLAT-11 Speculative requests', () => {
  it('hashes stable speculative keys', () => {
    const a = hashSpeculativeKey('tabCompletion', { key: 'abc' });
    const b = hashSpeculativeKey('tabCompletion', { key: 'abc' });
    assert.equal(a, b);
    assert.notEqual(a, hashSpeculativeKey('scopePreheat', { key: 'abc' }));
  });

  it('applies 50% token discount', () => {
    assert.equal(applySpeculativeTokenDiscount(101), 51);
    assert.equal(applySpeculativeTokenDiscount(0), 0);
  });

  it('holds and consumes speculative results', async () => {
    const pool = new SpeculativeRequestPool(30_000, 2, true);
    const key = hashSpeculativeKey('tabCompletion', { key: 'demo' });
    let completed = false;
    pool.schedule('tabCompletion', key, 100, async () => {
      completed = true;
      return 'done';
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(completed, true);
    const consumed = pool.tryConsume<string>(key);
    assert.ok(consumed);
    assert.equal(consumed?.value, 'done');
    assert.equal(pool.tryConsume<string>(key), undefined);
  });

  it('builds tab completion confirmation keys', () => {
    const key = buildTabCompletionSpecKey('src/a.ts', 'typescript', 3, 4, 'foo', 'ctx');
    assert.match(key, /src\/a\.ts:typescript:3:4:foo\|ctx/);
  });

  it('builds scope preheat keys from draft text and attachments', () => {
    const a = buildScopePreheatKey('hello', [{ kind: 'doc', target: 'x.md', label: 'x' }]);
    const b = buildScopePreheatKey('hello', [{ kind: 'doc', target: 'x.md', label: 'x' }]);
    assert.equal(a, b);
  });
});
