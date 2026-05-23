import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  applyAction,
  DecisionUnresolvedError,
  parseDecisionResolverConfig,
} from '../../cli/decisionResolver.js';
import { loadBuildConfig, validateTaskAgents } from '../../cli/buildConfig.js';
import { parseCliArgs, CLI_USAGE_LINES } from '../../cli/cliArgs.js';
import {
  assertCiStartupNotice,
  verifyRunDirectory,
  verifyTranscriptLines,
} from '../../cli/ciHeadlessVerify.js';

const fixturesDir = path.join(process.cwd(), 'fixtures', 'ci');

describe('R-DEP-7 Decision resolver', () => {
  it('always-approve picks Approve option', () => {
    const selected = applyAction('always-approve', undefined, {
      id: '1',
      question: 'Allow bash?',
      options: ['Approve', 'Reject'],
      timeoutSec: 60,
    });
    assert.equal(selected, 'Approve');
  });

  it('fail-on-decision throws', () => {
    assert.throws(
      () =>
        applyAction('fail-on-decision', undefined, {
          id: '1',
          question: 'Unknown?',
          options: ['Yes', 'No'],
          timeoutSec: 60,
        }),
      DecisionUnresolvedError
    );
  });

  it('parses config with rules', () => {
    const cfg = parseDecisionResolverConfig({
      default: 'fail-on-decision',
      rules: [{ pattern: 'deploy', action: 'always-reject', select: 'Reject' }],
    });
    assert.equal(cfg.rules.length, 1);
    assert.equal(cfg.default, 'fail-on-decision');
  });
});

describe('R-DEP-7 CI agents', () => {
  it('rejects unsupported agents', () => {
    assert.match(validateTaskAgents(['Architect']) ?? '', /Architect/);
    assert.equal(validateTaskAgents(['Coder', 'Tester']), undefined);
  });
});

describe('R-DEP-7 CLI args', () => {
  it('parses build run', () => {
    const parsed = parseCliArgs(['build', 'run', 'config.json']);
    assert.equal(parsed.exitCode, 0);
    if (parsed.command.kind === 'build') {
      assert.equal(parsed.command.action, 'run');
      assert.equal(parsed.command.param, 'config.json');
    } else {
      assert.fail('expected build command');
    }
  });

  it('returns usage for invalid input', () => {
    const parsed = parseCliArgs(['deploy']);
    assert.equal(parsed.exitCode, 1);
    assert.equal(parsed.command.kind, 'usage');
  });

  it('documents headless invocation', () => {
    assert.ok(CLI_USAGE_LINES.some((line) => line.includes('headless')));
  });
});

describe('R-DEP-7 headless fixtures', () => {
  it('loads example build config', async () => {
    const loaded = await loadBuildConfig(path.join(fixturesDir, 'example-build-config.json'));
    assert.equal(loaded.ok, true);
    if (loaded.ok) {
      assert.equal(loaded.config.buildId, 'example-build');
      assert.equal(loaded.config.maxToolCalls, 80);
    }
  });

  it('validates sample transcript and run directory', async () => {
    const transcriptRaw = await fs.readFile(path.join(fixturesDir, 'sample-transcript.jsonl'), 'utf8');
    const lines = transcriptRaw.split('\n').filter(Boolean);
    const transcript = verifyTranscriptLines(lines);
    assert.equal(transcript.ok, true, transcript.errors.join('; '));

    const tempDir = path.join(process.cwd(), '.tmp-ci-unit-verify');
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.mkdir(tempDir, { recursive: true });
    await fs.copyFile(path.join(fixturesDir, 'sample-transcript.jsonl'), path.join(tempDir, 'transcript.jsonl'));
    await fs.copyFile(path.join(fixturesDir, 'sample-meta.json'), path.join(tempDir, 'meta.json'));
    const runDir = await verifyRunDirectory(tempDir);
    await fs.rm(tempDir, { recursive: true, force: true });
    assert.equal(runDir.ok, true, runDir.errors.join('; '));
  });

  it('includes startup notice text', () => {
    const notice = assertCiStartupNotice();
    assert.match(notice, /Coder, Tester, Committer, Deployer/);
    assert.match(notice, /Diff Review UI/);
  });
});
