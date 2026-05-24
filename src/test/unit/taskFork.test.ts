import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { after, before, describe, it } from 'node:test';
import type { TaskNode } from '../../workflow/taskDag';
import {
  appendForkInstruction,
  buildForkTask,
  countForkTasks,
  createTaskFork,
  forkEdgesFromTasks,
  loadForks,
  truncateTranscriptAtIteration,
} from '../../workflow/taskFork';
import { groupTranscriptIterations, parseTranscriptLines } from '../../workflow/taskTranscript';

const parentTask: TaskNode = {
  id: 'task-a',
  title: 'Implement feature',
  description: 'Do work',
  agent: 'Coder',
  inputs: { file: 'src/a.ts' },
  depends_on: ['task-root'],
  status: 'Done',
  scope_doc: '.copilotPlus/docs/system/app/feature/component.md',
};

describe('R-INT-12 task fork', () => {
  let tempDir = '';

  before(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-fork-'));
  });

  after(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('groups transcript lines into iterations with markers', () => {
    const lines = parseTranscriptLines(
      [
        JSON.stringify({ role: 'system', content: 'sys' }),
        JSON.stringify({ role: 'user', content: 'go' }),
        JSON.stringify({ role: 'assistant', content: 'step 1' }),
        JSON.stringify({ role: 'iteration', content: 'Iteration 1 complete', iteration: 1 }),
        JSON.stringify({ role: 'assistant', content: 'step 2' }),
        JSON.stringify({ role: 'iteration', content: 'Iteration 2 complete', iteration: 2 }),
      ].join('\n')
    );
    const groups = groupTranscriptIterations(lines);
    assert.equal(groups.length, 2);
    assert.equal(groups[0]!.iteration, 1);
    assert.equal(groups[1]!.iteration, 2);
  });

  it('truncates transcript at chosen iteration', () => {
    const lines = parseTranscriptLines(
      [
        JSON.stringify({ role: 'assistant', content: 'one' }),
        JSON.stringify({ role: 'iteration', content: 'Iteration 1 complete', iteration: 1 }),
        JSON.stringify({ role: 'assistant', content: 'two' }),
        JSON.stringify({ role: 'iteration', content: 'Iteration 2 complete', iteration: 2 }),
      ].join('\n')
    );
    const truncated = truncateTranscriptAtIteration(lines, 1);
    assert.equal(truncated.length, 2);
    assert.equal(truncated[1]?.role, 'iteration');
  });

  it('appends optional fork instruction as user message', () => {
    const seeded = appendForkInstruction([], 'Try another approach');
    assert.equal(seeded.length, 1);
    assert.equal(seeded[0]?.role, 'user');
    assert.match(seeded[0]?.content ?? '', /another approach/);
  });

  it('builds fork task metadata from parent', () => {
    const child = buildForkTask(parentTask, 'task-a-fork-1', 2, 'Use tests first');
    assert.equal(child.parent_task_id, 'task-a');
    assert.equal(child.forked_from_iteration, 2);
    assert.equal(child.agent, 'Coder');
    assert.equal(child.scope_doc, parentTask.scope_doc);
    assert.deepEqual(child.depends_on, parentTask.depends_on);
    assert.equal(child.status, 'Pending');
  });

  it('creates fork artifacts and persists forks.json', async () => {
    const buildId = 'build-fork-test';
    const taskDir = path.join(tempDir, '.copilotPlus', 'builds', buildId, parentTask.id);
    await fs.mkdir(taskDir, { recursive: true });
    await fs.writeFile(
      path.join(taskDir, 'messages.jsonl'),
      [
        JSON.stringify({ role: 'assistant', content: 'first' }),
        JSON.stringify({ role: 'iteration', content: 'Iteration 1 complete', iteration: 1 }),
        JSON.stringify({ role: 'assistant', content: 'second' }),
        JSON.stringify({ role: 'iteration', content: 'Iteration 2 complete', iteration: 2 }),
      ].join('\n') + '\n',
      'utf8'
    );

    const { childTask, record } = await createTaskFork({
      workspaceRoot: tempDir,
      buildId,
      parent: parentTask,
      iteration: 1,
      instruction: 'Pivot',
    });

    assert.equal(record.parentTaskId, parentTask.id);
    assert.equal(record.iteration, 1);
    assert.equal(record.instruction, 'Pivot');
    assert.match(childTask.id, /^task-a-fork-/);

    const childMessages = await fs.readFile(
      path.join(tempDir, '.copilotPlus', 'builds', buildId, childTask.id, 'messages.jsonl'),
      'utf8'
    );
    assert.match(childMessages, /Pivot/);
    assert.match(childMessages, /Iteration 1 complete/);
    assert.doesNotMatch(childMessages, /Iteration 2 complete/);

    const forks = await loadForks(tempDir, buildId);
    assert.equal(forks.forks.length, 1);
    assert.equal(forks.forks[0]?.childTaskId, childTask.id);
  });

  it('derives fork edges and counts from task nodes', () => {
    const tasks: TaskNode[] = [
      parentTask,
      {
        ...parentTask,
        id: 'task-b',
        parent_task_id: 'task-a',
        forked_from_iteration: 1,
        status: 'Pending',
      },
      {
        ...parentTask,
        id: 'task-c',
        parent_task_id: 'task-b',
        forked_from_iteration: 2,
        status: 'Pending',
      },
    ];
    assert.equal(countForkTasks(tasks), 2);
    assert.deepEqual(forkEdgesFromTasks(tasks), [
      { from: 'task-a', to: 'task-b' },
      { from: 'task-b', to: 'task-c' },
    ]);
  });
});
