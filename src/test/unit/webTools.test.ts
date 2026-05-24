import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWebSearchUrl,
  parseWebSearchResponse,
  resolveWebFetchMaxChars,
  resolveWebSearchMaxResults,
  validateHttpsUrl,
} from '../../tools/webTools.js';

describe('R-TOOL-12 web tools', () => {
  it('allows only https URLs for webfetch', () => {
    const http = validateHttpsUrl('http://example.com');
    assert.equal(http.ok, false);
    if (!http.ok) {
      assert.equal(http.reason, 'scheme_not_allowed');
    }
    assert.equal(validateHttpsUrl('https://example.com/docs').ok, true);
  });

  it('clamps webfetch max_chars', () => {
    assert.equal(resolveWebFetchMaxChars('truncated', undefined), 30_000);
    assert.equal(resolveWebFetchMaxChars('full', undefined), 200_000);
    assert.equal(resolveWebFetchMaxChars('truncated', 50_000), 50_000);
    assert.equal(resolveWebFetchMaxChars('truncated', 999_999), 200_000);
  });

  it('clamps websearch max_results to 1-20', () => {
    assert.equal(resolveWebSearchMaxResults(undefined), 10);
    assert.equal(resolveWebSearchMaxResults(0), 1);
    assert.equal(resolveWebSearchMaxResults(99), 20);
  });

  it('builds search endpoint URLs', () => {
    assert.equal(
      buildWebSearchUrl('https://search.example/api?q={query}', 'hello world'),
      'https://search.example/api?q=hello%20world'
    );
    assert.equal(
      buildWebSearchUrl('https://search.example/api', 'hello'),
      'https://search.example/api?q=hello'
    );
  });

  it('parses provider JSON results', () => {
    const results = parseWebSearchResponse({
      results: [
        { title: 'A', url: 'https://a.test', snippet: 'one', published: '2026-01-01' },
        { title: 'B', url: 'https://b.test', snippet: 'two' },
        { bad: true },
      ],
    });
    assert.equal(results.length, 2);
    assert.equal(results[0]!.title, 'A');
    assert.equal(results[0]!.published, '2026-01-01');
  });
});
