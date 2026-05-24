import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIsolationBranchName,
  formatIsolationDisplayPath,
  interpretBuildCompletionDecision,
} from '../../workflow/buildIsolationTypes.js';

describe('R-WF-9 build isolation', () => {
  it('formats branch display path', () => {
    assert.equal(
      formatIsolationDisplayPath({
        effectiveMode: 'worktree_branch',
        branch: 'copilot-plus/build/build-1',
      }),
      'worktree:copilot-plus/build/build-1'
    );
    assert.equal(formatIsolationDisplayPath({ effectiveMode: 'inline' }), 'inline');
  });

  it('builds stable branch names', () => {
    assert.equal(buildIsolationBranchName('build-123'), 'copilot-plus/build/build-123');
  });

  it('formats detached worktree display path', () => {
    assert.equal(
      formatIsolationDisplayPath({ effectiveMode: 'worktree' }),
      'worktree:detached'
    );
  });

  it('maps completion decisions', () => {
    assert.equal(interpretBuildCompletionDecision('Merge_To_Main', false), 'merge');
    assert.equal(interpretBuildCompletionDecision('Discard', false), 'discard');
    assert.equal(interpretBuildCompletionDecision('Merge_To_Main', true), 'keep');
  });
});
