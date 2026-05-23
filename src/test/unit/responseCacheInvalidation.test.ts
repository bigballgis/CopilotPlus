import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeAutoAttachFingerprint } from '../../editing/responseCacheKey.js';

describe('R-EDIT-8.5 Response Cache invalidation', () => {
  it('computes stable auto_attach fingerprint', () => {
    const skills = [
      {
        id: 'lint',
        scope: 'workspace',
        auto_attach: true,
        valid: true,
        enabled: true,
      },
      {
        id: 'tests',
        scope: 'component:api',
        auto_attach: true,
        valid: true,
        enabled: true,
      },
      {
        id: 'manual',
        scope: 'workspace',
        auto_attach: false,
        valid: true,
        enabled: true,
      },
    ];
    const a = computeAutoAttachFingerprint(skills);
    const b = computeAutoAttachFingerprint([...skills].reverse());
    assert.equal(a, b);
    assert.notEqual(a, computeAutoAttachFingerprint([]));
  });

  it('changes fingerprint when auto_attach skill set changes', () => {
    const base = [
      {
        id: 'lint',
        scope: 'workspace',
        auto_attach: true,
        valid: true,
        enabled: true,
      },
    ];
    const before = computeAutoAttachFingerprint(base);
    const after = computeAutoAttachFingerprint([
      ...base,
      {
        id: 'deploy',
        scope: 'feature:release',
        auto_attach: true,
        valid: true,
        enabled: true,
      },
    ]);
    assert.notEqual(before, after);
  });

  it('changes fingerprint when skill disabled', () => {
    const enabled = computeAutoAttachFingerprint([
      {
        id: 'lint',
        scope: 'workspace',
        auto_attach: true,
        valid: true,
        enabled: true,
      },
    ]);
    const disabled = computeAutoAttachFingerprint([
      {
        id: 'lint',
        scope: 'workspace',
        auto_attach: true,
        valid: true,
        enabled: false,
      },
    ]);
    assert.notEqual(enabled, disabled);
  });
});
