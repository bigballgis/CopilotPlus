#!/usr/bin/env node
/** Fixture-based CI headless verification — no VS Code runtime required */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { loadBuildConfig, validateTaskAgents } from '../dist-test/cli/buildConfig.js';
import { parseCliArgs } from '../dist-test/cli/cliArgs.js';
import {
  assertCiStartupNotice,
  verifyRunDirectory,
  verifyTranscriptLines,
} from '../dist-test/cli/ciHeadlessVerify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const fixturesDir = path.join(root, 'fixtures', 'ci');

async function main() {
  const errors = [];

  const cli = parseCliArgs(['build', 'run', 'fixtures/ci/example-build-config.json']);
  if (cli.command.kind !== 'build' || cli.command.action !== 'run') {
    errors.push('parseCliArgs failed for build run');
  }

  const configPath = path.join(fixturesDir, 'example-build-config.json');
  const loaded = await loadBuildConfig(configPath);
  if (!loaded.ok) {
    errors.push(`loadBuildConfig: ${loaded.error.reason}`);
  } else {
    if (loaded.config.buildId !== 'example-build') {
      errors.push('unexpected buildId in fixture config');
    }
    const tasksRaw = await fs.readFile(path.join(fixturesDir, 'sample-tasks.json'), 'utf8');
    const tasks = JSON.parse(tasksRaw);
    const agentErr = validateTaskAgents(tasks.tasks.map((t) => t.agent));
    if (agentErr) {
      errors.push(agentErr);
    }
  }

  const transcriptRaw = await fs.readFile(path.join(fixturesDir, 'sample-transcript.jsonl'), 'utf8');
  const transcriptResult = verifyTranscriptLines(transcriptRaw.split('\n').filter(Boolean));
  if (!transcriptResult.ok) {
    errors.push(...transcriptResult.errors.map((e) => `transcript: ${e}`));
  }

  const notice = assertCiStartupNotice();
  if (!notice.includes('Disabled: Diff Review UI')) {
    errors.push('startup notice missing disabled feature list');
  }

  const tempRunDir = path.join(root, '.tmp-ci-verify-run');
  await fs.rm(tempRunDir, { recursive: true, force: true });
  await fs.mkdir(tempRunDir, { recursive: true });
  await fs.copyFile(path.join(fixturesDir, 'sample-transcript.jsonl'), path.join(tempRunDir, 'transcript.jsonl'));
  await fs.copyFile(path.join(fixturesDir, 'sample-meta.json'), path.join(tempRunDir, 'meta.json'));
  const runDirResult = await verifyRunDirectory(tempRunDir);
  await fs.rm(tempRunDir, { recursive: true, force: true });
  if (!runDirResult.ok) {
    errors.push(...runDirResult.errors.map((e) => `runDir: ${e}`));
  }

  if (errors.length > 0) {
    console.error('CI headless verification FAILED');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    return 1;
  }

  console.log('CI headless verification OK (fixtures + transcript schema)');
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
