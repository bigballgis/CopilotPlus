import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateTaskDag, computeReadyTasks, markReadyStatuses, rollbackOrderTaskIds } from '../../workflow/taskDag.js';
import { canTransition } from '../../workflow/stageTransitions.js';
import { roleToPromptFile } from '../../agents/roleMapping.js';

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

  it('marks pending tasks ready when dependencies done', () => {
    const tasks = markReadyStatuses([
      {
        id: 'a',
        title: 'A',
        description: '',
        agent: 'Coder',
        inputs: {},
        depends_on: [],
        status: 'Done',
        scope_doc: '.copilotPlus/docs/system/default.md',
      },
      {
        id: 'b',
        title: 'B',
        description: '',
        agent: 'Coder',
        inputs: {},
        depends_on: ['a'],
        status: 'Pending',
        scope_doc: '.copilotPlus/docs/system/default.md',
      },
    ]);
    assert.equal(tasks.find((t) => t.id === 'b')?.status, 'Ready');
    const ready = computeReadyTasks(tasks);
    assert.equal(ready.length, 1);
    assert.equal(ready[0].id, 'b');
  });

  it('blocks pending tasks when a dependency failed', () => {
    const tasks = markReadyStatuses([
      {
        id: 'a',
        title: 'A',
        description: '',
        agent: 'Coder',
        inputs: {},
        depends_on: [],
        status: 'Failed',
        scope_doc: '.copilotPlus/docs/system/default.md',
      },
      {
        id: 'b',
        title: 'B',
        description: '',
        agent: 'Coder',
        inputs: {},
        depends_on: ['a'],
        status: 'Pending',
        scope_doc: '.copilotPlus/docs/system/default.md',
      },
    ]);
    assert.equal(tasks.find((t) => t.id === 'b')?.status, 'Blocked');
    assert.equal(computeReadyTasks(tasks).length, 0);
  });

  it('orders rollback in reverse topological order', () => {
    const order = rollbackOrderTaskIds([
      {
        id: 'a',
        title: 'A',
        description: '',
        agent: 'Coder',
        inputs: {},
        depends_on: [],
        status: 'Done',
        scope_doc: '.copilotPlus/docs/system/app/a.md',
      },
      {
        id: 'b',
        title: 'B',
        description: '',
        agent: 'Coder',
        inputs: {},
        depends_on: ['a'],
        status: 'Done',
        scope_doc: '.copilotPlus/docs/system/app/b.md',
      },
      {
        id: 'c',
        title: 'C',
        description: '',
        agent: 'Coder',
        inputs: {},
        depends_on: ['b'],
        status: 'Done',
        scope_doc: '.copilotPlus/docs/system/app/c.md',
      },
    ]);
    assert.deepEqual(order, ['c', 'b', 'a']);
  });

  it('rejects non-build agents and unknown scope docs', () => {
    const errors = validateTaskDag(
      {
        tasks: [
          {
            id: 'x',
            title: 'X',
            description: '',
            agent: 'Architect',
            inputs: {},
            depends_on: [],
            status: 'Pending',
            scope_doc: '.copilotPlus/docs/system/missing.md',
          },
        ],
      },
      { knownScopeDocs: new Set(['.copilotPlus/docs/system/default.md']) }
    );
    assert.ok(errors.some((e) => e.message.includes('Build-stage')));
    assert.ok(errors.some((e) => e.message.includes('not found')));
  });
});

describe('R-AG-2 role mapping', () => {
  it('maps Coder to coder prompt file', () => {
    assert.equal(roleToPromptFile('Coder'), 'coder');
    assert.equal(roleToPromptFile('Task_Planner'), 'task_planner');
  });
});

describe('R-WF-1 stage transitions', () => {
  it('allows Design to Build', () => {
    assert.equal(canTransition('Design', 'Build'), true);
    assert.equal(canTransition('Design', 'Deploy'), false);
  });
});
