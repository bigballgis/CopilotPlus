import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatCodeLayerPathTooltip, resolveCodeLayerPath } from '../../docs/codeLayerPath.js';
import type { DocEntry } from '../../docs/documentTreeService.js';

function entry(partial: Partial<DocEntry> & Pick<DocEntry, 'relativePath' | 'frontmatter' | 'body'>): DocEntry {
  return {
    valid: true,
    errors: [],
    ...partial,
  };
}

describe('R-DOCS-11.6 code layer path', () => {
  const entries: DocEntry[] = [
    entry({
      relativePath: '.copilotPlus/docs/system/platform.md',
      frontmatter: { id: 'sys-platform', level: 'system', title: 'Platform', parent: '', children: ['mod-auth'] },
      body: '## Summary\nPlatform system doc.',
    }),
    entry({
      relativePath: '.copilotPlus/docs/module/auth.md',
      frontmatter: {
        id: 'mod-auth',
        level: 'module',
        title: 'Auth',
        parent: 'sys-platform',
        children: ['feat-login'],
      },
      body: '## Summary\nAuth module doc.',
    }),
    entry({
      relativePath: '.copilotPlus/docs/feature/login.md',
      frontmatter: {
        id: 'feat-login',
        level: 'feature',
        title: 'Login',
        parent: 'mod-auth',
        children: ['comp-session'],
      },
      body: '## Summary\nLogin feature doc.',
    }),
    entry({
      relativePath: '.copilotPlus/docs/component/session.md',
      frontmatter: {
        id: 'comp-session',
        level: 'component',
        title: 'Session',
        parent: 'feat-login',
        children: [],
        code_paths: ['src/auth/**'],
      },
      body: '## Summary\nSession component doc.',
    }),
  ];

  it('walks from code file to system layer', () => {
    const path = resolveCodeLayerPath('src/auth/session.ts', entries);
    assert.equal(path.orphan, false);
    assert.equal(path.component?.title, 'Session');
    assert.equal(path.feature?.title, 'Login');
    assert.equal(path.module?.title, 'Auth');
    assert.equal(path.system?.title, 'Platform');
  });

  it('marks orphan files without component ownership', () => {
    const path = resolveCodeLayerPath('src/unowned.ts', entries);
    assert.equal(path.orphan, true);
    assert.equal(path.component, undefined);
  });

  it('formats tooltip with layer segments', () => {
    const path = resolveCodeLayerPath('src/auth/session.ts', entries);
    const tooltip = formatCodeLayerPathTooltip(path);
    assert.match(tooltip, /System: Platform/);
    assert.match(tooltip, /Component: Session/);
    assert.match(tooltip, /src\/auth\/session.ts/);
  });
});
