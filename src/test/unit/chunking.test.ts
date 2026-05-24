import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkMarkdownDoc,
  chunkSlidingWindow,
  chunkSourceFile,
  FALLBACK_CHUNK_OVERLAP,
  FALLBACK_CHUNK_SIZE,
} from '../../context/chunking.js';
import {
  isPathIgnoredByGitignore,
  matchGitignoreRules,
  parseGitignore,
} from '../../context/gitignoreFilter.js';

describe('R-CTX chunking', () => {
  it('splits markdown by headings', () => {
    const chunks = chunkMarkdownDoc('doc.md', '# Title\n\n## Summary\n\nHello\n\n## Details\n\nMore');
    assert.ok(chunks.some((c) => c.heading === 'Summary'));
    assert.ok(chunks.some((c) => c.heading === 'Details'));
  });

  it('uses 800/200 sliding windows for long source files', () => {
    const content = 'x'.repeat(FALLBACK_CHUNK_SIZE + 500);
    const chunks = chunkSlidingWindow(content);
    assert.ok(chunks.length >= 2);
    assert.equal(chunks[0]?.text.length, FALLBACK_CHUNK_SIZE);
    assert.equal(chunks[1]?.text.length, 500 + FALLBACK_CHUNK_OVERLAP);
  });

  it('splits TypeScript by semantic boundaries when file is large enough', () => {
    const source = [
      'function alpha() {',
      '  return 1;',
      '}',
      'export class Beta {',
      '  run() {}',
      '}',
      ...Array.from({ length: 120 }, (_, i) => `const v${i} = ${i};`),
    ].join('\n');
    const chunks = chunkSourceFile('src/app.ts', source);
    assert.ok(chunks.length >= 2);
    assert.ok(chunks.some((c) => c.text.includes('class Beta')));
  });

  it('windows long source files', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
    const chunks = chunkSourceFile('src/big.ts', lines);
    assert.ok(chunks.length > 1);
  });
});

describe('R-CTX-2 gitignore', () => {
  it('parses negated and directory-only patterns', () => {
    const rules = parseGitignore('dist/\n!important.log\n# comment\n');
    assert.equal(rules.length, 2);
    assert.equal(rules[0]?.directoryOnly, true);
    assert.equal(rules[1]?.negated, true);
  });

  it('matches root gitignore rules with last-match wins', () => {
    const rules = parseGitignore('*.log\n!important.log');
    assert.equal(matchGitignoreRules('debug.log', false, rules), true);
    assert.equal(matchGitignoreRules('important.log', false, rules), false);
  });

  it('applies nested gitignore directories', () => {
    const rulesByDirectory = new Map([
      ['', parseGitignore('build/*')],
      ['src', parseGitignore('*.generated.ts')],
    ]);
    assert.equal(isPathIgnoredByGitignore('build/out.js', false, rulesByDirectory), true);
    assert.equal(isPathIgnoredByGitignore('src/foo.generated.ts', false, rulesByDirectory), true);
    assert.equal(isPathIgnoredByGitignore('src/foo.ts', false, rulesByDirectory), false);
  });
});
