import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDriftItem, mergeDriftScanResults } from '../../docs/driftDiagnostics.js';

describe('drift scan merge', () => {
  it('preserves agent drift items when static scan runs', () => {
    const staticItems = [
      createDriftItem('Orphan_Code', 'code', 'src/orphan.ts', undefined, '2026-01-01T00:00:00.000Z'),
    ];
    const existing = [
      createDriftItem(
        'Doc_Update_Recommended',
        'component',
        '.copilotPlus/docs/component/a.md',
        'agent:update summary',
        '2026-01-01T00:00:00.000Z'
      ),
    ];
    const merged = mergeDriftScanResults(staticItems, existing, () => false);
    assert.equal(merged.length, 2);
    assert.ok(merged.some((i) => i.type === 'Orphan_Code'));
    assert.ok(merged.some((i) => i.detail?.startsWith('agent:')));
  });

  it('drops dismissed items from both sources', () => {
    const staticItems = [
      createDriftItem('Orphan_Code', 'code', 'src/orphan.ts', undefined, '2026-01-01T00:00:00.000Z'),
    ];
    const existing = [
      createDriftItem(
        'Code_Mismatch_Suspected',
        'component',
        '.copilotPlus/docs/component/a.md',
        'agent:mismatch',
        '2026-01-01T00:00:00.000Z'
      ),
    ];
    const dismissed = new Set(['.copilotPlus/docs/component/a.md']);
    const merged = mergeDriftScanResults(staticItems, existing, (item) => dismissed.has(item.target));
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.type, 'Orphan_Code');
  });
});
