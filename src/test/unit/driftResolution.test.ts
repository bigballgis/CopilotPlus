import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDriftResolutionPrompt,
  extraToolsForDriftRole,
  resolveDriftAgentRole,
  resolveDriftScopeDoc,
} from '../../docs/driftResolution.js';
import type { DocEntry } from '../../docs/documentTreeService.js';
import type { DriftItem } from '../../docs/driftTypes.js';

function drift(partial: Partial<DriftItem> & Pick<DriftItem, 'type' | 'layer' | 'target'>): DriftItem {
  return {
    id: 'id-1',
    detectedAt: '2026-05-23T00:00:00.000Z',
    ...partial,
  };
}

describe('R-DOCS-13 drift resolution routing', () => {
  it('routes doc hierarchy drift to Architect', () => {
    assert.equal(
      resolveDriftAgentRole(drift({ type: 'Missing_Summary', layer: 'module', target: '.copilotPlus/docs/module/a.md' })),
      'Architect'
    );
    assert.equal(
      resolveDriftAgentRole(drift({ type: 'Orphan_Code', layer: 'code', target: 'src/orphan.ts' })),
      'Architect'
    );
  });

  it('routes component code mismatch to Reviewer', () => {
    assert.equal(
      resolveDriftAgentRole(
        drift({ type: 'Code_Mismatch_Suspected', layer: 'component', target: '.copilotPlus/docs/component/x.md' })
      ),
      'Reviewer'
    );
  });

  it('resolves scope doc from code ownership', () => {
    const entries: DocEntry[] = [
      {
        relativePath: '.copilotPlus/docs/component/auth.md',
        valid: true,
        errors: [],
        body: '## Summary\nAuth',
        frontmatter: {
          id: 'comp-auth',
          level: 'component',
          title: 'Auth',
          parent: 'feat',
          children: [],
          code_paths: ['src/auth/**'],
          code_owner_authority: 'exclusive',
        },
      },
    ];
    const scope = resolveDriftScopeDoc(
      drift({ type: 'Orphan_Code', layer: 'code', target: 'src/auth/login.ts' }),
      entries
    );
    assert.equal(scope, '.copilotPlus/docs/component/auth.md');
  });

  it('includes dismissal context in prompts', () => {
    const prompt = buildDriftResolutionPrompt(
      drift({ type: 'Dangling_Link', layer: 'feature', target: '.copilotPlus/docs/feature/x.md', detail: 'missing parent' }),
      [{ driftId: 'id-1', target: '.copilotPlus/docs/feature/x.md', rationale: 'intentional WIP', dismissedAt: '2026-05-23' }]
    );
    assert.match(prompt, /Dangling_Link/);
    assert.match(prompt, /intentional WIP/);
  });

  it('adds write tools for Reviewer on code targets', () => {
    const tools = extraToolsForDriftRole(
      'Reviewer',
      drift({ type: 'Code_Mismatch_Suspected', layer: 'component', target: 'src/foo.ts' })
    );
    assert.ok(tools.includes('doc_write'));
    assert.ok(tools.includes('write_file'));
  });
});
