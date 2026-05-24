import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { maybeEmitDocTreeTelemetry, type DocTreeTelemetrySink } from '../../docs/docTreeTelemetry.js';
import type { TelemetryService } from '../../platform/telemetry.js';
import type { DocTreeStats } from '../../docs/docTreeStats.js';

const stats: DocTreeStats = {
  totalChars: 1200,
  totalTokens: 300,
  byLevel: [
    { level: 'system', docs: 1, chars: 400, tokens: 100 },
    { level: 'module', docs: 2, chars: 800, tokens: 200 },
    { level: 'feature', docs: 0, chars: 0, tokens: 0 },
    { level: 'component', docs: 0, chars: 0, tokens: 0 },
  ],
  softLimitExceeded: false,
};

function mockTelemetry() {
  const events: Array<{ name: string; fields: Record<string, string | number | boolean> }> = [];
  return {
    emit(name: string, fields: Record<string, string | number | boolean> = {}) {
      events.push({ name, fields });
    },
    events,
  };
}

describe('R-DOCS-8.5 doc tree telemetry', () => {
  let roots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      roots.map(async (root) => {
        await fs.rm(root, { recursive: true, force: true });
      })
    );
    roots = [];
  });

  it('emits docs.tree.size once per month window', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cp-doc-tree-tel-'));
    roots.push(root);
    const telemetry = mockTelemetry();
    const emitted = await maybeEmitDocTreeTelemetry(root, telemetry, stats);
    assert.equal(emitted, true);
    assert.equal(telemetry.events.length, 1);
    assert.equal(telemetry.events[0]!.name, 'docs.tree.size');

    const statePath = path.join(root, '.copilotPlus', 'telemetry', 'doc_tree_monthly.json');
    const stateRaw = await fs.readFile(statePath, 'utf8');
    assert.match(stateRaw, /lastEmittedAt/);

    const skipped = await maybeEmitDocTreeTelemetry(root, telemetry, stats);
    assert.equal(skipped, false);
    assert.equal(telemetry.events.length, 1);
  });

  it('skips when workspace root is missing', async () => {
    const telemetry = mockTelemetry();
    const emitted = await maybeEmitDocTreeTelemetry(undefined, telemetry, stats);
    assert.equal(emitted, false);
    assert.equal(telemetry.events.length, 0);
  });
});
