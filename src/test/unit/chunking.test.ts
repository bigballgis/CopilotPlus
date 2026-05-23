import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chunkMarkdownDoc, chunkSourceFile } from '../../context/chunking.js';

describe('R-CTX chunking', () => {
  it('splits markdown by headings', () => {
    const chunks = chunkMarkdownDoc('doc.md', '# Title\n\n## Summary\n\nHello\n\n## Details\n\nMore');
    assert.ok(chunks.some((c) => c.heading === 'Summary'));
    assert.ok(chunks.some((c) => c.heading === 'Details'));
  });

  it('windows long source files', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
    const chunks = chunkSourceFile('src/big.ts', lines);
    assert.ok(chunks.length > 1);
  });
});
