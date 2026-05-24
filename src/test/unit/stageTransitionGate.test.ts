import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStageTransition } from '../../workflow/stageTransitionGate.js';
import type { DocArtifactSummary } from '../../workflow/designArtifactCheck.js';
import type { TaskDagFile } from '../../workflow/taskDag.js';

const readyDocs: DocArtifactSummary[] = [
  { level: 'system', valid: true },
  { level: 'module', valid: true },
  { level: 'feature', valid: true },
  { level: 'component', valid: true },
];

const validDag: TaskDagFile = {
  tasks: [
    {
      id: 'a',
      title: 'A',
      description: '',
      agent: 'Coder',
      inputs: {},
      depends_on: [],
      status: 'Pending',
      scope_doc: '.copilotPlus/docs/system/default.md',
    },
  ],
};

describe('R-WF-6 stage transition gate', () => {
  it('blocks Design → Build when not on Task_List_Generation', () => {
    const result = evaluateStageTransition('Design', 'Build', {
      designStep: 'Architecture_Generation',
      docs: readyDocs,
      tasksDag: validDag,
      runningTaskCount: 0,
    });
    assert.equal(result.allowed, false);
    assert.equal(result.reasonKey, 'stage.designBuildWrongStep');
  });

  it('blocks Design → Build when task DAG is invalid', () => {
    const cyclic: TaskDagFile = {
      tasks: [
        {
          id: 'a',
          title: 'A',
          description: '',
          agent: 'Coder',
          inputs: {},
          depends_on: ['b'],
          status: 'Pending',
          scope_doc: '.copilotPlus/docs/system/a.md',
        },
        {
          id: 'b',
          title: 'B',
          description: '',
          agent: 'Coder',
          inputs: {},
          depends_on: ['a'],
          status: 'Pending',
          scope_doc: '.copilotPlus/docs/system/b.md',
        },
      ],
    };
    const result = evaluateStageTransition('Design', 'Build', {
      designStep: 'Task_List_Generation',
      docs: readyDocs,
      tasksDag: cyclic,
      runningTaskCount: 0,
    });
    assert.equal(result.allowed, false);
    assert.equal(result.reasonKey, 'design.continueBlocked');
  });

  it('allows Design → Build when step and DAG are ready', () => {
    const result = evaluateStageTransition('Design', 'Build', {
      designStep: 'Task_List_Generation',
      docs: readyDocs,
      tasksDag: validDag,
      runningTaskCount: 0,
    });
    assert.equal(result.allowed, true);
  });

  it('requires confirm and pause for Build → Design with running tasks', () => {
    const result = evaluateStageTransition('Build', 'Design', {
      designStep: 'Task_List_Generation',
      docs: readyDocs,
      tasksDag: validDag,
      runningTaskCount: 2,
    });
    assert.equal(result.allowed, true);
    assert.equal(result.needsConfirm, true);
    assert.equal(result.pauseRunningTasks, true);
  });

  it('allows Build → Design without confirm when nothing is running', () => {
    const result = evaluateStageTransition('Build', 'Design', {
      designStep: 'Task_List_Generation',
      docs: readyDocs,
      tasksDag: validDag,
      runningTaskCount: 0,
    });
    assert.equal(result.allowed, true);
    assert.equal(result.needsConfirm, undefined);
  });

  it('blocks Build → Deploy when tasks are incomplete', () => {
    const result = evaluateStageTransition('Build', 'Deploy', {
      designStep: 'Task_List_Generation',
      docs: readyDocs,
      tasksDag: {
        tasks: [
          { ...validDag.tasks[0], status: 'Done' },
          {
            id: 'b',
            title: 'B',
            description: '',
            agent: 'Coder',
            inputs: {},
            depends_on: ['a'],
            status: 'Running',
            scope_doc: '.copilotPlus/docs/system/default.md',
          },
        ],
      },
      runningTaskCount: 1,
    });
    assert.equal(result.allowed, false);
    assert.equal(result.reasonKey, 'stage.buildDeployIncomplete');
  });

  it('allows Build → Deploy when every task is Done or RolledBack', () => {
    const result = evaluateStageTransition('Build', 'Deploy', {
      designStep: 'Task_List_Generation',
      docs: readyDocs,
      tasksDag: {
        tasks: [
          { ...validDag.tasks[0], status: 'Done' },
          {
            id: 'b',
            title: 'B',
            description: '',
            agent: 'Coder',
            inputs: {},
            depends_on: ['a'],
            status: 'RolledBack',
            scope_doc: '.copilotPlus/docs/system/default.md',
          },
        ],
      },
      runningTaskCount: 0,
    });
    assert.equal(result.allowed, true);
  });

  it('allows Deploy → Build and Deploy → Design without extra gates', () => {
    assert.equal(
      evaluateStageTransition('Deploy', 'Build', {
        designStep: 'Task_List_Generation',
        docs: readyDocs,
        runningTaskCount: 0,
      }).allowed,
      true
    );
    assert.equal(
      evaluateStageTransition('Deploy', 'Design', {
        designStep: 'Requirement_Clarification',
        docs: readyDocs,
        runningTaskCount: 0,
      }).allowed,
      true
    );
  });
});
