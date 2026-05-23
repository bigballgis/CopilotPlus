import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseExplorerOutput } from '../../agents/explorerParse.js';

describe('R-AG-5 Explorer output', () => {
  it('parses structured json summary', () => {
    const text = 'Done\n```json\n{"findings":[{"path":"src/a.ts","summary":"entry"}],"recommended_files":["src/a.ts"]}\n```';
    const result = parseExplorerOutput(text);
    assert.equal(result.findings.length, 1);
    assert.equal(result.recommended_files[0], 'src/a.ts');
  });
});

describe('R-AG-5 Explorer budgets', () => {
  it('defines quick/medium/thorough caps', () => {
    const budgets = {
      quick: { maxToolCalls: 5, wallMs: 30_000 },
      medium: { maxToolCalls: 20, wallMs: 120_000 },
      thorough: { maxToolCalls: 60, wallMs: 600_000 },
    };
    assert.ok(budgets.quick.maxToolCalls < budgets.medium.maxToolCalls);
    assert.ok(budgets.medium.maxToolCalls < budgets.thorough.maxToolCalls);
  });
});
