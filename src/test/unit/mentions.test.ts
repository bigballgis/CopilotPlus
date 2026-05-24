import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeAttachments,
  parseMentionTokens,
  parseSlashSkill,
  MENTION_KINDS,
} from '../../context/mentionTokens.js';
import {
  estimateAttachmentsBudget,
  perAttachmentCharLimit,
  perAttachmentTokenLimit,
} from '../../context/mentionBudget.js';
import { listFolderFiles } from '../../context/mentionFolder.js';
import { fetchWebMention } from '../../context/mentionWebFetch.js';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

describe('R-CTX-1 Mentions', () => {
  it('parses inline mention tokens for all kinds', () => {
    const parsed = parseMentionTokens(
      '@file:src/a.ts @folder:src @symbol:src/a.ts @selection:b.ts @doc:docs/x.md @web:https://x.com @skill:api-style'
    );
    assert.equal(parsed.length, 7);
    assert.deepEqual(parsed.map((p) => p.kind), MENTION_KINDS);
  });

  it('deduplicates merged attachments including range', () => {
    const merged = mergeAttachments(
      [{ kind: 'symbol', target: 'a.ts', label: 'foo', range: '1-5' }],
      [
        { kind: 'symbol', target: 'a.ts', label: 'foo', range: '1-5' },
        { kind: 'symbol', target: 'a.ts', label: 'foo', range: '6-10' },
      ]
    );
    assert.equal(merged.length, 2);
  });

  it('parses slash skill prefix', () => {
    const parsed = parseSlashSkill('/api-style Review the API layer');
    assert.equal(parsed.skillId, 'api-style');
    assert.equal(parsed.message, 'Review the API layer');
  });

  it('parses folder and web mention tokens', () => {
    const parsed = parseMentionTokens('See @folder:src/lib and @web:example.com/docs');
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0]?.kind, 'folder');
    assert.equal(parsed[1]?.kind, 'web');
  });
});

describe('R-CTX-4 Mention budget', () => {
  it('applies 25% per-attachment limit', () => {
    assert.equal(perAttachmentTokenLimit(100_000), 25_000);
    assert.equal(perAttachmentCharLimit(100_000), 100_000);
  });

  it('detects combined budget exceedance', () => {
    const budget = estimateAttachmentsBudget(['x'.repeat(400_000)], 'hello', 100_000);
    assert.equal(budget.exceedsBudget, true);
  });
});

describe('R-CTX-1 folder listing', () => {
  it('lists files recursively up to max', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cp-folder-'));
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'a.ts'), 'a');
    await fs.writeFile(path.join(root, 'src', 'b.ts'), 'b');
    const files = await listFolderFiles(root, 'src', 10);
    assert.deepEqual(files.sort(), ['src/a.ts', 'src/b.ts']);
    await fs.rm(root, { recursive: true, force: true });
  });
});

describe('R-CTX-1 web fetch', () => {
  it('rejects invalid url', async () => {
    const result = await fetchWebMention('');
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'invalid_url');
    }
  });
});
