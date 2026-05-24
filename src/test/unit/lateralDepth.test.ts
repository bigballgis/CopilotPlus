import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeLateralDepth, findLateralDepthViolations } from '../../docs/lateralDepth.js';
import type { DocEntry } from '../../docs/documentTreeService.js';

describe('R-DOCS-4 lateral depth', () => {
  it('counts branch crossings between related modules', () => {
    const entries = tree([
      row('.copilotPlus/docs/system/app.md', 'app', 'system', '', ['auth', 'billing']),
      row('.copilotPlus/docs/system/app/auth.md', 'auth', 'module', 'app', ['login']),
      row('.copilotPlus/docs/system/app/auth/login.md', 'login', 'feature', 'auth', []),
      row('.copilotPlus/docs/system/app/billing.md', 'billing', 'module', 'app', []),
    ]);
    const login = entries.find((e) => e.frontmatter.id === 'login')!;
    const billing = entries.find((e) => e.frontmatter.id === 'billing')!;
    assert.equal(computeLateralDepth(login, billing, entries), 3);
  });

  it('flags lateral links beyond configured depth', () => {
    const entries = tree([
      row('.copilotPlus/docs/system/app.md', 'app', 'system', '', ['auth', 'billing']),
      row('.copilotPlus/docs/system/app/auth.md', 'auth', 'module', 'app', ['login']),
      row('.copilotPlus/docs/system/app/auth/login.md', 'login', 'feature', 'auth', [], [
        { target: 'billing', type: 'references' },
      ]),
      row('.copilotPlus/docs/system/app/billing.md', 'billing', 'module', 'app', []),
    ]);
    const login = entries.find((e) => e.frontmatter.id === 'login')!;
    const violations = findLateralDepthViolations(login, entries, 2);
    assert.equal(violations.length, 1);
    assert.equal(violations[0]!.targetId, 'billing');
  });
});

function row(
  relativePath: string,
  id: string,
  level: DocEntry['frontmatter']['level'],
  parent: string,
  children: string[],
  lateral?: DocEntry['frontmatter']['lateral']
): DocEntry {
  return {
    relativePath,
    body: '\n## Summary\n\nTest.\n',
    valid: true,
    errors: [],
    frontmatter: { id, level, title: id, parent, children, lateral, ai_generated: true },
  };
}

function tree(entries: DocEntry[]): DocEntry[] {
  return entries;
}
