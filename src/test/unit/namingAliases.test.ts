import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NamingAliasStore } from '../../docs/namingAliases.js';

describe('R-DOCS-7 naming aliases', () => {
  it('resolves alias chains and compresses for prompt', () => {
    const store = new NamingAliasStore();
    store.register('old-login', 'login');
    store.register('legacy-auth', 'old-login');
    assert.equal(store.resolve('legacy-auth'), 'login');
    assert.match(store.compressForPrompt(), /legacy-auth → old-login/);
  });
});
