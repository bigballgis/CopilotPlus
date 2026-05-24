import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  attachmentKey,
  estimateAttachmentsBudget,
  perAttachmentCharLimit,
  perAttachmentTokenLimit,
} from '../../context/mentionBudget.js';

describe('R-CTX-1 mention budget', () => {
  it('derives per-attachment limits from token budget', () => {
    assert.equal(perAttachmentTokenLimit(100_000), 25_000);
    assert.equal(perAttachmentCharLimit(100_000), 100_000);
  });

  it('detects combined attachment budget overflow', () => {
    const long = 'x'.repeat(400_000);
    const budget = estimateAttachmentsBudget([long], 'hello', 100_000);
    assert.equal(budget.exceedsBudget, true);
  });

  it('builds stable attachment keys', () => {
    assert.equal(
      attachmentKey({ kind: 'symbol', target: 'src/a.ts', label: 'Foo', range: '1-3' }),
      'symbol:src/a.ts'
    );
  });
});
