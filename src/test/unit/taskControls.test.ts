import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TaskNode } from '../../workflow/taskDag';
import {
  computeTaskElapsedMs,
  formatElapsedMs,
  resolveTaskActions,
} from '../../workflow/taskControls';

function task(overrides: Partial<TaskNode> = {}): TaskNode {
  return {
    id: 'task-1',
    title: 'Sample',
    description: 'desc',
    agent: 'Coder',
    inputs: {},
    depends_on: [],
    status: 'Pending',
    scope_doc: '.copilotPlus/docs/system/default.md',
    ...overrides,
  };
}

describe('R-INT-4 task controls', () => {
  it('allows pause on ready tasks and resume on user-paused blocked tasks', () => {
    const ready = resolveTaskActions(task({ status: 'Ready' }), false);
    assert.equal(ready.canPause, true);
    assert.equal(ready.canResume, false);

    const paused = resolveTaskActions(
      task({ status: 'Blocked', user_paused: true }),
      false
    );
    assert.equal(paused.canResume, true);
    assert.equal(paused.canPause, false);
  });

  it('allows skip and retry on failed tasks only for retry', () => {
    const failed = resolveTaskActions(task({ status: 'Failed' }), false);
    assert.equal(failed.canRetry, true);
    assert.equal(failed.canSkip, true);

    const done = resolveTaskActions(task({ status: 'Done' }), false);
    assert.equal(done.canRetry, false);
    assert.equal(done.canSkip, false);
  });

  it('computes elapsed time for running and completed tasks', () => {
    const started = '2026-05-23T10:00:00.000Z';
    const completed = '2026-05-23T10:00:45.000Z';
    const runningMs = computeTaskElapsedMs(
      task({ status: 'Running', started_at: started }),
      Date.parse('2026-05-23T10:00:30.000Z')
    );
    assert.equal(runningMs, 30_000);

    const doneMs = computeTaskElapsedMs(
      task({ status: 'Done', started_at: started, completed_at: completed })
    );
    assert.equal(doneMs, 45_000);
    assert.equal(formatElapsedMs(doneMs), '45s');
  });
});
