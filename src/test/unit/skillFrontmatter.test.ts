import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSkillFile,
  skillMatchesScope,
  validateSkillFrontmatter,
} from '../../extensibility/skillFrontmatter.js';

describe('R-EXT-1 Skills', () => {
  it('parses valid skill frontmatter', () => {
    const parsed = parseSkillFile(`---
id: api-style
title: API Style Guide
scope: workspace
auto_attach: true
---
# Rules
Use REST.
`);
    assert.equal(parsed.errors.length, 0);
    assert.equal(parsed.frontmatter?.id, 'api-style');
    assert.equal(parsed.frontmatter?.auto_attach, true);
  });

  it('rejects invalid scope', () => {
    const result = validateSkillFrontmatter({
      id: 'x',
      title: 'T',
      scope: 'invalid',
    });
    assert.equal(result.valid, false);
  });

  it('matches scoped skills', () => {
    assert.ok(skillMatchesScope('workspace'));
    assert.ok(skillMatchesScope('module:auth', '.copilotPlus/docs/system/default/auth.md', 'auth'));
    assert.ok(!skillMatchesScope('module:other', '.copilotPlus/docs/system/default/auth.md', 'auth'));
  });
});
