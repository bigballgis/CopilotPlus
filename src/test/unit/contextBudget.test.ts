import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  contextItem,
  fitContextToBudget,
  hasDroppedContext,
  resolveTokenBudget,
} from '../../context/contextBudget.js';
import {
  defaultRetrievalTopK,
  resolveEffectiveSessionCap,
  scopeMaxDocs,
  shouldCapAgentsLayers,
} from '../../context/tierPolicy.js';

describe('R-CTX-4 context budget', () => {
  it('resolves token budget from model limit', () => {
    assert.equal(resolveTokenBudget(128_000, 100_000), 128_000);
    assert.equal(resolveTokenBudget(undefined, 100_000), 100_000);
  });

  it('drops lower-priority context items first', () => {
    const result = fitContextToBudget(
      [
        contextItem('mentions', 'aaa'),
        contextItem('ragRetrievals', 'bbb'.repeat(200)),
        contextItem('chatHistory', 'ccc'.repeat(200)),
      ],
      50
    );
    assert.equal(result.included[0]?.category, 'mentions');
    assert.equal(result.dropped.ragRetrievals, 1);
    assert.equal(result.dropped.chatHistory, 1);
    assert.equal(hasDroppedContext(result.dropped), true);
  });

  it('blocks when the first priority item alone exceeds budget', () => {
    const result = fitContextToBudget([contextItem('mentions', 'x'.repeat(400))], 10);
    assert.equal(result.blocked, true);
  });
});

describe('R-CTX-8 tier policy', () => {
  it('raises scope cap for tier L', () => {
    assert.equal(scopeMaxDocs('S'), 100);
    assert.equal(scopeMaxDocs('L'), 1000);
  });

  it('relaxes session cap for tier M/L', () => {
    assert.equal(resolveEffectiveSessionCap(200_000, 100_000, 'M'), 100_000);
    assert.equal(resolveEffectiveSessionCap(200_000, 100_000, 'S'), 100_000);
  });

  it('caps agents layers only on tier S', () => {
    assert.equal(shouldCapAgentsLayers('S'), true);
    assert.equal(shouldCapAgentsLayers('M'), false);
    assert.equal(defaultRetrievalTopK('M'), 50);
    assert.equal(defaultRetrievalTopK('S'), 10);
  });
});
