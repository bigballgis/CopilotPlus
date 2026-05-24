import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  interpretCommitFailureDecision,
  interpretReviewDecision,
  interpretTestExhaustedDecision,
} from '../../agents/buildPipelineDecisions';

describe('R-WF-4 build pipeline decisions', () => {
  it('maps test exhaustion options', () => {
    assert.equal(interpretTestExhaustedDecision('Retry_Task', false), 'retry');
    assert.equal(interpretTestExhaustedDecision('Skip_Task', false), 'skip');
    assert.equal(interpretTestExhaustedDecision('Pause Task', false), 'pause');
    assert.equal(interpretTestExhaustedDecision('Terminate_Build', false), 'terminate');
  });

  it('maps review blocking options', () => {
    assert.equal(interpretReviewDecision('Feed_to_Coder', false), 'retry');
    assert.equal(interpretReviewDecision('Accept_anyway', false), 'skip');
    assert.equal(interpretReviewDecision('Pause Task', false), 'pause');
    assert.equal(interpretReviewDecision('Terminate', false), 'terminate');
  });

  it('maps commit failure options', () => {
    assert.equal(interpretCommitFailureDecision('Retry_Commit'), 'retry');
    assert.equal(interpretCommitFailureDecision('Skip_Commit'), 'skip');
    assert.equal(interpretCommitFailureDecision('Pause Task'), 'pause');
    assert.equal(interpretCommitFailureDecision('Terminate_Task'), 'terminate');
  });
});
