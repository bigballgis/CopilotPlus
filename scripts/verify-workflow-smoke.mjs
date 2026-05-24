#!/usr/bin/env node
/** Headless workflow smoke checks — R-WF-5.4 / R-WF-6 / R-INT-12 (no VS Code runtime) */

import { interpretRollbackBuildDecision } from '../dist-test/agents/buildPipelineDecisions.js';
import { reconcileForkDag } from '../dist-test/workflow/taskFork.js';
import { rollbackOrderTaskIds, tasksRollbackable } from '../dist-test/workflow/taskDag.js';
import { evaluateStageTransition } from '../dist-test/workflow/stageTransitionGate.js';

const errors = [];

function assert(cond, msg) {
  if (!cond) {
    errors.push(msg);
  }
}

const tasks = [
  {
    id: 'root',
    title: 'Root',
    description: '',
    agent: 'Coder',
    inputs: {},
    depends_on: [],
    status: 'Done',
    scope_doc: '.copilotPlus/docs/system/default.md',
  },
  {
    id: 'child',
    title: 'Child',
    description: '',
    agent: 'Coder',
    inputs: {},
    depends_on: ['root'],
    status: 'Done',
    scope_doc: '.copilotPlus/docs/system/default.md',
  },
  {
    id: 'leaf',
    title: 'Leaf',
    description: '',
    agent: 'Tester',
    inputs: {},
    depends_on: ['child'],
    status: 'Failed',
    scope_doc: '.copilotPlus/docs/system/default.md',
  },
];

const order = rollbackOrderTaskIds(tasks);
assert(order[0] === 'leaf' && order[1] === 'child' && order[2] === 'root', 'rollbackOrderTaskIds invalid');
assert(tasksRollbackable(tasks).length === 3, 'tasksRollbackable invalid');

assert(interpretRollbackBuildDecision('Retry', false) === 'retry', 'rollback decision retry');
assert(interpretRollbackBuildDecision('Skip', false) === 'skip', 'rollback decision skip');
assert(interpretRollbackBuildDecision('Terminate', false) === 'terminate', 'rollback decision terminate');

const { dag: restored, added } = reconcileForkDag({ tasks: [tasks[0]] }, {
  forks: [
    {
      parentTaskId: 'root',
      childTaskId: 'root-fork-1',
      iteration: 1,
      createdAt: '2026-05-23T00:00:00.000Z',
    },
  ],
});
assert(added === 1 && restored.tasks.length === 2, 'reconcileForkDag invalid');
assert(restored.tasks[1]?.parent_task_id === 'root', 'reconcileForkDag parent link invalid');

const readyDocs = [
  { level: 'system', valid: true },
  { level: 'module', valid: true },
  { level: 'feature', valid: true },
  { level: 'component', valid: true },
];
const validDag = {
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

const blockedDesignBuild = evaluateStageTransition('Design', 'Build', {
  designStep: 'Architecture_Generation',
  docs: readyDocs,
  tasksDag: validDag,
  runningTaskCount: 0,
});
assert(!blockedDesignBuild.allowed, 'Design→Build should require Task_List_Generation');

const buildDesignConfirm = evaluateStageTransition('Build', 'Design', {
  designStep: 'Task_List_Generation',
  docs: readyDocs,
  tasksDag: validDag,
  runningTaskCount: 1,
});
assert(buildDesignConfirm.allowed && buildDesignConfirm.needsConfirm, 'Build→Design should confirm when running');

const blockedDeploy = evaluateStageTransition('Build', 'Deploy', {
  designStep: 'Task_List_Generation',
  docs: readyDocs,
  tasksDag: { tasks: [{ ...validDag.tasks[0], status: 'Running' }] },
  runningTaskCount: 1,
});
assert(!blockedDeploy.allowed, 'Build→Deploy should require Done/RolledBack tasks');

if (errors.length > 0) {
  console.error('Workflow smoke verification FAILED (run npm run test:unit first)');
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log(
  'Workflow smoke verification OK (rollback order, fork reconcile, rollback decisions, stage gates)'
);
