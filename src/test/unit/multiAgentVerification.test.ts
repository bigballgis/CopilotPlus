import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clusterByStructuralSimilarity,
  mergeUnionOutputs,
  selectVerificationOutput,
  structuralSimilarity,
  type VerificationCandidate,
} from '../../agents/multiAgentVerification.js';

describe('R-AG-8 multi-agent verification', () => {
  it('clusters structurally similar outputs', () => {
    const texts = [
      'Use module A for auth',
      'Use module A for auth.',
      'Split into services B and C',
    ];
    const clusters = clusterByStructuralSimilarity(texts);
    assert.equal(clusters.length, 2);
    assert.equal(clusters[0].length, 2);
  });

  it('selects majority vote winner', () => {
    const candidates: VerificationCandidate[] = [
      { index: 0, text: 'Plan: use REST API', ok: true },
      { index: 1, text: 'Plan: use REST API.', ok: true },
      { index: 2, text: 'Plan: use GraphQL only', ok: true },
    ];
    const result = selectVerificationOutput(candidates, 'majority_vote', 0);
    assert.equal(result.escalate, false);
    assert.match(result.selectedText, /REST API/);
  });

  it('escalates when all candidates fail', () => {
    const candidates: VerificationCandidate[] = [
      { index: 0, text: '', ok: false, reason: 'timeout' },
      { index: 1, text: '', ok: false, reason: 'timeout' },
    ];
    const result = selectVerificationOutput(candidates, 'majority_vote', 0);
    assert.equal(result.escalate, true);
    assert.equal(result.escalationReason, 'all_failed');
  });

  it('merges union outputs without duplicate sections', () => {
    const merged = mergeUnionOutputs([
      '## Scope\nAuth module',
      '## Scope\nAuth module',
      '## Risks\nToken rotation',
    ]);
    assert.match(merged, /Auth module/);
    assert.match(merged, /Token rotation/);
    assert.equal((merged.match(/## Scope/g) ?? []).length, 1);
  });

  it('scores identical structural text as 1', () => {
    assert.equal(structuralSimilarity('Hello  World', 'hello world'), 1);
  });
});
