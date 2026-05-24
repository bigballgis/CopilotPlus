import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseCommitterVerdict,
  parseReviewerVerdict,
  parseTesterVerdict,
} from '../../agents/buildStageParse';

describe('R-WF-4 build stage parse', () => {
  it('parses tester JSON pass', () => {
    const verdict = parseTesterVerdict('```json\n{"passed": true, "summary": "all green"}\n```');
    assert.equal(verdict.passed, true);
    assert.equal(verdict.summary, 'all green');
  });

  it('parses tester JSON fail with output', () => {
    const verdict = parseTesterVerdict(
      '{"passed": false, "failure_output": "AssertionError: expected 1"}'
    );
    assert.equal(verdict.passed, false);
    assert.match(verdict.failureOutput, /AssertionError/);
  });

  it('parses tester prose failure', () => {
    const verdict = parseTesterVerdict('Tests failed: 2 suites, 5 assertions.');
    assert.equal(verdict.passed, false);
    assert.match(verdict.failureOutput, /Tests failed/);
  });

  it('parses reviewer blocking JSON', () => {
    const verdict = parseReviewerVerdict(
      '{"blocking": true, "blocking_issues": ["SQL injection risk"], "summary": "block"}'
    );
    assert.equal(verdict.blocking, true);
    assert.equal(verdict.passed, false);
    assert.deepEqual(verdict.issues, ['SQL injection risk']);
  });

  it('parses reviewer pass prose', () => {
    const verdict = parseReviewerVerdict('Review pass — no blocking issues.');
    assert.equal(verdict.passed, true);
    assert.equal(verdict.blocking, false);
  });

  it('parses committer success and failure', () => {
    const ok = parseCommitterVerdict('{"committed": true, "commit_hash": "abc1234"}');
    assert.equal(ok.committed, true);
    assert.equal(ok.commitHash, 'abc1234');

    const bad = parseCommitterVerdict('Commit failed: pre-commit hook rejected.');
    assert.equal(bad.committed, false);
    assert.match(bad.error ?? '', /hook rejected/);
  });
});
