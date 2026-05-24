import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canAdvanceFromStep,
  checkDesignStepArtifacts,
  type DocArtifactSummary,
} from '../../workflow/designArtifactCheck.js';

function docs(...levels: Array<DocArtifactSummary['level']>): DocArtifactSummary[] {
  return levels.map((level) => ({ level, valid: true }));
}

describe('R-WF-2 design artifact completeness', () => {
  it('requires system and module docs before leaving requirement clarification', () => {
    const incomplete = checkDesignStepArtifacts('Requirement_Clarification', docs('system'), undefined);
    assert.equal(incomplete.complete, false);
    assert.ok(incomplete.missing.includes('module document'));

    const complete = checkDesignStepArtifacts(
      'Requirement_Clarification',
      docs('system', 'module'),
      undefined
    );
    assert.equal(complete.complete, true);
  });

  it('requires module and feature docs before leaving architecture generation', () => {
    const incomplete = checkDesignStepArtifacts(
      'Architecture_Generation',
      docs('system', 'module'),
      undefined
    );
    assert.equal(incomplete.complete, false);

    const complete = checkDesignStepArtifacts(
      'Architecture_Generation',
      docs('system', 'module', 'feature'),
      undefined
    );
    assert.equal(complete.complete, true);
  });

  it('requires feature and component docs before leaving design document generation', () => {
    const incomplete = checkDesignStepArtifacts(
      'Design_Document_Generation',
      docs('feature'),
      undefined
    );
    assert.equal(incomplete.complete, false);

    const complete = checkDesignStepArtifacts(
      'Design_Document_Generation',
      docs('feature', 'component'),
      undefined
    );
    assert.equal(complete.complete, true);
  });

  it('requires a valid tasks.json before completing task list generation', () => {
    const incomplete = checkDesignStepArtifacts('Task_List_Generation', docs('feature', 'component'), {
      tasks: [],
    });
    assert.equal(incomplete.complete, false);

    const complete = checkDesignStepArtifacts('Task_List_Generation', docs('feature', 'component'), {
      tasks: [
        {
          id: 'task-1',
          title: 'Implement',
          description: 'Build feature',
          agent: 'Coder',
          inputs: {},
          depends_on: [],
          status: 'Pending',
          scope_doc: '.copilotPlus/docs/system/default.md',
        },
      ],
    });
    assert.equal(complete.complete, true);
    assert.equal(
      canAdvanceFromStep('Task_List_Generation', docs('feature', 'component'), {
        tasks: [
          {
            id: 'task-1',
            title: 'Implement',
            description: 'Build feature',
            agent: 'Coder',
            inputs: {},
            depends_on: [],
            status: 'Pending',
            scope_doc: '.copilotPlus/docs/system/default.md',
          },
        ],
      }),
      true
    );
  });
});
