import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  requiresAutonomyApproval,
  shouldBypassDiffReview,
} from '../../workflow/autonomyGate.js';

describe('R-WF-7 autonomy gate', () => {
  it('Manual Build asks even when permission is allow', () => {
    assert.equal(requiresAutonomyApproval('Build', 'Manual', 'read_file', 'allow'), true);
    assert.equal(requiresAutonomyApproval('Design', 'Manual', 'read_file', 'allow'), false);
  });

  it('Manual Deploy asks for sub-agent tools', () => {
    assert.equal(requiresAutonomyApproval('Deploy', 'Manual', 'grep', 'allow'), true);
  });

  it('question tool is exempt in Manual Build', () => {
    assert.equal(requiresAutonomyApproval('Build', 'Manual', 'question', 'allow'), false);
  });

  it('permission ask always requires approval', () => {
    assert.equal(requiresAutonomyApproval('Design', 'Full_Auto', 'bash', 'ask'), true);
  });

  it('Approve_Edits asks for write tools even if allow', () => {
    assert.equal(requiresAutonomyApproval('Build', 'Approve_Edits', 'write_file', 'allow'), true);
    assert.equal(requiresAutonomyApproval('Build', 'Approve_Edits', 'grep', 'allow'), false);
  });

  it('Approve_Commands asks for bash even if allow', () => {
    assert.equal(requiresAutonomyApproval('Build', 'Approve_Commands', 'bash', 'allow'), true);
    assert.equal(requiresAutonomyApproval('Build', 'Approve_Commands', 'write_file', 'allow'), false);
  });

  it('Full_Auto allows read tools without extra gate', () => {
    assert.equal(requiresAutonomyApproval('Build', 'Full_Auto', 'grep', 'allow'), false);
  });

  it('deny-list bash stays gated at Full_Auto via ask permission', () => {
    assert.equal(requiresAutonomyApproval('Build', 'Full_Auto', 'bash', 'ask'), true);
  });

  it('run_tests is not an extra Approve_Commands gate target', () => {
    assert.equal(requiresAutonomyApproval('Build', 'Approve_Commands', 'run_tests', 'allow'), false);
  });

  it('Full_Auto bypasses diff review', () => {
    assert.equal(shouldBypassDiffReview('Full_Auto'), true);
    assert.equal(shouldBypassDiffReview('Approve_Commands'), false);
  });
});
