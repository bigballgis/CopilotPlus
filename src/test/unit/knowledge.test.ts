import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENTS_TOTAL_CAP,
  ancestorAgentsPaths,
  capAgentsLayers,
  isAgentsFilePath,
} from '../../knowledge/agentsFileLoader.js';
import { scanMemoryText } from '../../knowledge/memoryPrivacy.js';
import {
  evictSessionMemory,
  formatSessionMemoryForPrompt,
  newMemoryEntry,
  validateMemoryText,
} from '../../knowledge/sessionMemoryStore.js';
import {
  hasReflectionProposals,
  parseReflectionOutput,
  reflectionToProposals,
} from '../../knowledge/selfReflectionParse.js';
import { clampTabCompletionTimeoutMs, PLAT5 } from '../../platform/performanceBudget.js';

describe('R-KNOW-1 AGENTS loading', () => {
  it('collects ancestor AGENTS paths', () => {
    const paths = ancestorAgentsPaths('/root', 'src/features/auth/service.ts');
    assert.deepEqual(paths, ['src/AGENTS.md', 'src/features/AGENTS.md', 'src/features/auth/AGENTS.md']);
  });

  it('caps total AGENTS content by dropping longest layer', () => {
    const layers = [
      {
        kind: 'user' as const,
        relativePath: 'user',
        absolutePath: '/u',
        content: 'a'.repeat(30_000),
      },
      {
        kind: 'workspace' as const,
        relativePath: 'AGENTS.md',
        absolutePath: '/w',
        content: 'b'.repeat(30_000),
      },
    ];
    const capped = capAgentsLayers(layers);
    assert.ok(capped.text.length <= AGENTS_TOTAL_CAP);
    assert.equal(capped.dropped.length, 1);
  });

  it('detects AGENTS file paths', () => {
    assert.equal(isAgentsFilePath('AGENTS.md'), true);
    assert.equal(isAgentsFilePath('src/AGENTS.md'), true);
    assert.equal(isAgentsFilePath('src/readme.md'), false);
  });
});

describe('R-KNOW-4 session memory', () => {
  it('formats prompt within cap and evicts LRU', () => {
    const entries = Array.from({ length: 205 }, (_, i) =>
      newMemoryEntry(`memory item ${i}`, 'workspace')
    );
    const evicted = evictSessionMemory(entries);
    assert.ok(evicted.length <= 200);

    const formatted = formatSessionMemoryForPrompt(
      [newMemoryEntry('Prefer small commits', 'workspace')],
      undefined,
      100
    );
    assert.ok(formatted.text.includes('Prefer small commits'));
  });

  it('rejects invalid memory text', () => {
    assert.equal(validateMemoryText(''), 'memory_text_length');
    assert.equal(validateMemoryText('x'.repeat(501)), 'memory_text_length');
  });
});

describe('R-KNOW-5 memory privacy', () => {
  it('blocks github token patterns', () => {
    const result = scanMemoryText('token ghp_abcdefghijklmnopqrstuvwxyz1234567890AB');
    assert.equal(result.blocked, true);
  });
});

describe('R-KNOW-6 self reflection', () => {
  it('parses fenced JSON reflection output', () => {
    const output = parseReflectionOutput(
      '```json\n{"friction_points":["slow tests"],"proposed_agents_md_additions":["Use npm test"]}\n```'
    );
    assert.equal(output.friction_points[0], 'slow tests');
    assert.ok(hasReflectionProposals(output));
    assert.ok(reflectionToProposals(output).length >= 2);
  });
});

describe('R-PLAT-5 performance budget', () => {
  it('defines activation and tab completion budgets', () => {
    assert.equal(PLAT5.activationTargetMs, 2000);
    assert.equal(clampTabCompletionTimeoutMs(100), 500);
    assert.equal(clampTabCompletionTimeoutMs(99999), 10000);
  });
});
