import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_TOOLS, SUB_AGENT_ALLOWLISTS } from '../../tools/registry.js';
import { resolveToolPermission } from '../../platform/toolPermissions.js';

const PROPOSE_MEMORY_ROLES = ['Coder', 'Tester', 'Reviewer', 'Committer', 'Deployer'] as const;

describe('R-KNOW-3 propose_memory tool', () => {
  it('registers propose_memory in built-in tools', () => {
    assert.ok(BUILTIN_TOOLS.some((t) => t.id === 'propose_memory'));
  });

  it('allows propose_memory for build pipeline roles only', () => {
    for (const role of PROPOSE_MEMORY_ROLES) {
      assert.ok(
        SUB_AGENT_ALLOWLISTS[role]?.includes('propose_memory'),
        `${role} should include propose_memory`
      );
    }
    assert.ok(!SUB_AGENT_ALLOWLISTS.Architect?.includes('propose_memory'));
    assert.ok(!SUB_AGENT_ALLOWLISTS.Task_Planner?.includes('propose_memory'));
  });

  it('defaults propose_memory to allow (Decision_Notification handles consent)', () => {
    const r = resolveToolPermission('propose_memory', {}, 'Manual', false);
    assert.equal(r.effective, 'allow');
  });
});
