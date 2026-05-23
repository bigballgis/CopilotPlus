import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSelectionRange,
  hashFullCacheKey,
  hashPartialCacheKey,
  sha256Text,
} from '../../editing/responseCacheKey.js';
import { tryRebaseResponse } from '../../editing/responseRebase.js';

describe('R-EDIT-8 Response Cache', () => {
  it('builds stable full and partial keys', () => {
    const base = {
      surface: 'inlineEdit' as const,
      promptText: 'add logging',
      modelId: 'gpt-4',
      mentionSet: ['@file:src/a.ts'],
      agentsMdSha256: sha256Text(''),
    };
    const fullA = hashFullCacheKey({
      ...base,
      fileSha256: sha256Text('content-a'),
      selectionRange: '1:0-1:10',
    });
    const fullB = hashFullCacheKey({
      ...base,
      fileSha256: sha256Text('content-b'),
      selectionRange: '1:0-1:10',
    });
    assert.notEqual(fullA, fullB);

    const partialA = hashPartialCacheKey(base);
    const partialB = hashPartialCacheKey({ ...base, promptText: 'add logging' });
    assert.equal(partialA, partialB);
  });

  it('formats selection ranges', () => {
    const formatted = formatSelectionRange({
      start: { line: 2, character: 4 },
      end: { line: 3, character: 0 },
    });
    assert.equal(formatted, '2:4-3:0');
  });

  it('rebases when original selection is unique', () => {
    const result = tryRebaseResponse({
      currentFileContent: 'const x = 1;\nconst y = oldValue;\n',
      originalSelectedText: 'const y = oldValue;',
      cachedResponse: 'const y = newValue;',
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.replacement, 'const y = newValue;');
    }
  });

  it('rebases with surrounding context when direct match fails', () => {
    const result = tryRebaseResponse({
      currentFileContent: 'prefix\nconst y = movedOld;\nsuffix\n',
      originalSelectedText: 'const y = oldValue;',
      cachedResponse: 'const y = newValue;',
      contextBefore: 'prefix\n',
      contextAfter: '\nsuffix\n',
    });
    assert.equal(result.ok, false);

    const moved = tryRebaseResponse({
      currentFileContent: 'prefix\nconst y = oldValue;\nsuffix\n',
      originalSelectedText: 'const y = oldValue;',
      cachedResponse: 'const y = newValue;',
      contextBefore: 'prefix\n',
      contextAfter: '\nsuffix\n',
    });
    assert.equal(moved.ok, true);
  });
});
