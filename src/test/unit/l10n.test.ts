import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function formatArgs(text: string, args: (string | number)[]): string {
  return args.reduce<string>(
    (acc, arg, i) => acc.replace(`{${i}}`, String(arg)),
    text
  );
}

function extractFallbackKeys(l10nTs: string): string[] {
  const keys: string[] = [];
  const re = /'([^']+)':\s*'/g;
  let m;
  while ((m = re.exec(l10nTs)) !== null) {
    keys.push(m[1]);
  }
  return keys;
}

const bundle = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'l10n', 'bundle.l10n.json'), 'utf8')
);
const l10nTs = fs.readFileSync(path.join(process.cwd(), 'src', 'platform', 'l10n.ts'), 'utf8');
const fallbackKeys = extractFallbackKeys(l10nTs);

describe('l10n', () => {
  it('formatArgs replaces positional placeholders', () => {
    assert.equal(formatArgs('Hello {0}, build {1}', ['world', 42]), 'Hello world, build 42');
  });

  it('FALLBACK keys match bundle.l10n.json', () => {
    const bundleKeys = Object.keys(bundle).sort();
    assert.deepEqual([...fallbackKeys].sort(), bundleKeys);
  });

  it('bundle values are non-empty', () => {
    for (const [key, value] of Object.entries(bundle)) {
      assert.ok(typeof value === 'string' && value.length > 0, `empty bundle value: ${key}`);
    }
  });
});
