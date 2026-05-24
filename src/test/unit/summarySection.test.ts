import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDraftSummary,
  extractSummaryText,
  isSummaryLengthValid,
  isSummaryMissingOrInvalid,
  upsertSummarySection,
  SUMMARY_MIN_CHARS,
} from '../../docs/summarySection.js';

describe('R-DOCS-14.6 summary section', () => {
  it('detects missing or invalid summary length', () => {
    assert.equal(isSummaryMissingOrInvalid('## Overview\n\nHello'), true);
    assert.equal(isSummaryMissingOrInvalid('## Summary\n\nshort'), true);
    assert.equal(
      isSummaryMissingOrInvalid(`## Summary\n\n${'x'.repeat(SUMMARY_MIN_CHARS)}`),
      false
    );
  });

  it('builds draft summary at least 100 characters', () => {
    const draft = buildDraftSummary({
      frontmatter: { id: 'auth', level: 'module', title: 'Auth', parent: 'app', children: [] },
    });
    assert.ok(isSummaryLengthValid(draft));
  });

  it('upserts ## Summary as first body section', () => {
    const body = upsertSummarySection('## Details\n\nMore', 'y'.repeat(SUMMARY_MIN_CHARS));
    assert.match(body, /^## Summary\n\n/);
    assert.equal(extractSummaryText(body).length, SUMMARY_MIN_CHARS);
  });
});
