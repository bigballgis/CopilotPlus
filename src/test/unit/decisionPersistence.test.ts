import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { remainingSecFromStored } from '../../interaction/decisionPersistence.js';

describe('decision persistence', () => {
  it('remainingSecFromStored prefers remainingSecAtSave (paused timeout)', () => {
    const remaining = remainingSecFromStored({
      id: 'd1',
      question: 'Proceed?',
      options: ['Yes', 'No'],
      timeoutSec: 300,
      createdAt: new Date(Date.now() - 120_000).toISOString(),
      remainingSecAtSave: 180,
    });
    assert.equal(remaining, 180);
  });

  it('remainingSecFromStored subtracts elapsed time when not paused', () => {
    const remaining = remainingSecFromStored({
      id: 'd2',
      question: 'Proceed?',
      options: ['Yes', 'No'],
      timeoutSec: 100,
      createdAt: new Date(Date.now() - 40_000).toISOString(),
    });
    assert.ok(remaining <= 61 && remaining >= 59);
  });
});
