import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BuildLimitsTracker,
  interpretBuildLimitDecision,
} from '../../workflow/buildLimits.js';

describe('R-WF-8 build limits', () => {
  it('tracks tool calls against max', () => {
    const tracker = new BuildLimitsTracker();
    tracker.reset(3, 7200);
    assert.equal(tracker.recordToolCall(), false);
    assert.equal(tracker.recordToolCall(), false);
    assert.equal(tracker.recordToolCall(), true);
    assert.equal(tracker.isToolCallLimitReached(), true);
  });

  it('allows exactly max tool calls before blocking the next', () => {
    const tracker = new BuildLimitsTracker();
    tracker.reset(2, 7200);
    tracker.recordToolCall();
    assert.equal(tracker.isToolCallLimitReached(), false);
    tracker.recordToolCall();
    assert.equal(tracker.isToolCallLimitReached(), true);
  });

  it('raises limits on continue decision', () => {
    const tracker = new BuildLimitsTracker();
    tracker.reset(200, 7200);
    for (let i = 0; i < 200; i++) {
      tracker.recordToolCall();
    }
    assert.equal(tracker.isToolCallLimitReached(), true);
    tracker.raiseLimits();
    assert.equal(tracker.isToolCallLimitReached(), false);
    assert.equal(tracker.getRemainingToolCalls(), 100);
  });

  it('maps limit decisions', () => {
    assert.equal(interpretBuildLimitDecision('Continue', false), 'continue');
    assert.equal(interpretBuildLimitDecision('Pause', false), 'pause');
    assert.equal(interpretBuildLimitDecision('Terminate', false), 'terminate');
    assert.equal(interpretBuildLimitDecision('Continue', true), 'pause');
  });
});
