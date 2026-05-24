import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildComponentCodeContext,
  buildLayerWalkForCodeFile,
  listComponentCodeFiles,
} from '../../docs/scopeResolution.js';
import type { DocEntry } from '../../docs/documentTreeService.js';

function entry(partial: Partial<DocEntry> & Pick<DocEntry, 'relativePath' | 'frontmatter' | 'body'>): DocEntry {
  return { valid: true, errors: [], ...partial };
}

describe('R-DOCS-14.3 component code context', () => {
  const component = entry({
    relativePath: '.copilotPlus/docs/component/session.md',
    frontmatter: {
      id: 'comp-session',
      level: 'component',
      title: 'Session',
      parent: 'feat-login',
      children: [],
      code_paths: ['src/auth/**'],
    },
    body: '## Summary\nSession component.',
  });

  const feature = entry({
    relativePath: '.copilotPlus/docs/feature/login.md',
    frontmatter: {
      id: 'feat-login',
      level: 'feature',
      title: 'Login',
      parent: 'mod-auth',
      children: ['comp-session'],
    },
    body: '## Summary\nLogin feature.',
  });

  const moduleDoc = entry({
    relativePath: '.copilotPlus/docs/module/auth.md',
    frontmatter: {
      id: 'mod-auth',
      level: 'module',
      title: 'Auth',
      parent: 'sys',
      children: ['feat-login'],
    },
    body: '## Summary\nAuth module.',
  });

  const system = entry({
    relativePath: '.copilotPlus/docs/system/app.md',
    frontmatter: { id: 'sys', level: 'system', title: 'App', parent: '', children: ['mod-auth'] },
    body: '## Summary\nApp system.',
  });

  const entries = [system, moduleDoc, feature, component];
  const indexed = ['src/auth/session.ts', 'src/auth/token.ts', 'src/other.ts'];

  it('lists sibling files under component code_paths', () => {
    const siblings = listComponentCodeFiles(component, indexed);
    assert.deepEqual(siblings, ['src/auth/session.ts', 'src/auth/token.ts']);
  });

  it('builds code context with siblings and active file', () => {
    const block = buildComponentCodeContext(component.relativePath, entries, indexed, 'src/auth/session.ts');
    assert.match(block, /Sibling code files/);
    assert.match(block, /src\/auth\/session.ts/);
    assert.match(block, /src\/auth\/token.ts/);
  });

  it('extends layer walk for code files with ownership appendix', () => {
    const walk = buildLayerWalkForCodeFile('src/auth/session.ts', entries, indexed, 'M');
    assert.ok(walk.length >= 4);
    const componentLayer = walk[walk.length - 1]!;
    assert.match(componentLayer.content, /Component code ownership/);
    assert.match(componentLayer.content, /Sibling code files/);
  });
});
