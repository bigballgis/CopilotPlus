import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeLateralDepth } from '../../docs/lateralDepth.js';
import type { DocEntry } from '../../docs/documentTreeService.js';

describe('R-TOOL-7 doc_link depth guard', () => {
  it('blocks links beyond maxLateralDepth threshold', () => {
    const entries: DocEntry[] = [
      row('.copilotPlus/docs/system/app.md', 'app', 'system', '', ['auth', 'billing']),
      row('.copilotPlus/docs/system/app/auth.md', 'auth', 'module', 'app', ['login']),
      row('.copilotPlus/docs/system/app/auth/login.md', 'login', 'feature', 'auth', []),
      row('.copilotPlus/docs/system/app/billing.md', 'billing', 'module', 'app', []),
    ];
    const login = entries.find((e) => e.frontmatter.id === 'login')!;
    const billing = entries.find((e) => e.frontmatter.id === 'billing')!;
    const depth = computeLateralDepth(login, billing, entries);
    assert.equal(depth, 3);
    assert.ok(depth > 2);
  });
});

function row(
  relativePath: string,
  id: string,
  level: DocEntry['frontmatter']['level'],
  parent: string,
  children: string[]
): DocEntry {
  return {
    relativePath,
    body: '\n## Summary\n\nTest.\n',
    valid: true,
    errors: [],
    frontmatter: { id, level, title: id, parent, children, ai_generated: true },
  };
}
