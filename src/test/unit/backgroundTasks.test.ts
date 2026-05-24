import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterEnabledTasks,
  isUserIdle,
  pickNextBackgroundTask,
  shouldBlockBackground,
  shouldScheduleBackground,
} from '../../agents/backgroundTasks.js';

describe('R-AG-9 background scheduling', () => {
  it('detects idle after threshold', () => {
    const now = 1_000_000;
    assert.equal(isUserIdle(now - 301_000, now, 300), true);
    assert.equal(isUserIdle(now - 120_000, now, 300), false);
  });

  it('blocks during active build operations in Build or Deploy stage', () => {
    assert.equal(shouldBlockBackground('Build', 'Running'), true);
    assert.equal(shouldBlockBackground('Deploy', 'Paused'), true);
    assert.equal(shouldBlockBackground('Design', 'Running'), false);
    assert.equal(shouldBlockBackground('Build', 'Idle'), false);
  });

  it('filters unknown task identifiers', () => {
    assert.deepEqual(filterEnabledTasks(['index_rebuild', 'unknown', 'doc_drift_scan']), [
      'index_rebuild',
      'doc_drift_scan',
    ]);
  });

  it('resumes paused task before rotating', () => {
    assert.equal(
      pickNextBackgroundTask(['doc_drift_scan', 'index_rebuild'], 'doc_drift_scan', 'index_rebuild'),
      'index_rebuild'
    );
    assert.equal(
      pickNextBackgroundTask(['doc_drift_scan', 'index_rebuild'], 'doc_drift_scan'),
      'index_rebuild'
    );
  });

  it('schedules only when enabled and waiting', () => {
    assert.equal(
      shouldScheduleBackground({
        enabled: true,
        offline: false,
        stage: 'Design',
        buildStatus: 'Idle',
        phase: 'waiting_idle',
      }),
      true
    );
    assert.equal(
      shouldScheduleBackground({
        enabled: false,
        offline: false,
        stage: 'Design',
        buildStatus: 'Idle',
        phase: 'waiting_idle',
      }),
      false
    );
  });
});
