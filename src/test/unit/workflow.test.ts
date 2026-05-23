import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateTaskDag } from '../../workflow/taskDag.js';
import { canTransition } from '../../workflow/stageTransitions.js';

describe('R-WF-3 task DAG', () => {
  it('detects cycle', () => {
    const errors = validateTaskDag({
      tasks: [
        {
          id: 'a',
          title: 'A',
          description: '',
          agent: 'Coder',
          inputs: {},
          depends_on: ['b'],
          status: 'Pending',
          scope_doc: '.copilotPlus/docs/system/app/a.md',
        },
        {
          id: 'b',
          title: 'B',
          description: '',
          agent: 'Coder',
          inputs: {},
          depends_on: ['a'],
          status: 'Pending',
          scope_doc: '.copilotPlus/docs/system/app/b.md',
        },
      ],
    });
    assert.ok(errors.some((e) => e.message.includes('cycle')));
  });
});

describe('R-WF-1 stage transitions', () => {
  it('allows Design to Build', () => {
    assert.equal(canTransition('Design', 'Build'), true);
    assert.equal(canTransition('Design', 'Deploy'), false);
  });
});
