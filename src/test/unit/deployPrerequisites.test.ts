import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePrerequisiteExit, requiresCli } from '../../deploy/deployPrerequisites.js';

describe('R-DEP-5 deploy prerequisites', () => {
  it('Local requires no CLI', () => {
    assert.equal(requiresCli('Local'), 'none');
    assert.deepEqual(evaluatePrerequisiteExit('Local', 1, 1, 1), { ok: true });
  });

  it('Docker requires docker exit 0', () => {
    assert.equal(requiresCli('Docker'), 'docker');
    assert.equal(evaluatePrerequisiteExit('Docker', 0, 0, 0).ok, true);
    assert.equal(evaluatePrerequisiteExit('Docker', 1, 0, 0).ok, false);
  });

  it('Kubernetes requires kubectl and context', () => {
    assert.equal(requiresCli('Kubernetes'), 'kubectl');
    assert.equal(evaluatePrerequisiteExit('Kubernetes', 0, 0, 0).ok, true);
    assert.equal(evaluatePrerequisiteExit('Kubernetes', 0, 1, 0).ok, false);
    assert.equal(evaluatePrerequisiteExit('Kubernetes', 0, 0, 1).ok, false);
  });
});
