import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDesignMessage,
  isContinueOnlyMessage,
  shouldAdvanceDesignStep,
} from '../../workflow/designStepClassifier.js';
import {
  DESIGN_STEP_TO_ROLE,
  nextDesignStep,
  roleForDesignStep,
} from '../../workflow/designSteps.js';

describe('R-AG-3 design step classifier', () => {
  it('maps each step to the bound sub-agent role', () => {
    assert.equal(roleForDesignStep('Requirement_Clarification'), 'Requirement_Clarifier');
    assert.equal(DESIGN_STEP_TO_ROLE.Architecture_Generation, 'Architect');
    assert.equal(DESIGN_STEP_TO_ROLE.Task_List_Generation, 'Task_Planner');
  });

  it('keeps the current step when no keyword matches', () => {
    const result = classifyDesignMessage('hello there', 'Architecture_Generation');
    assert.equal(result.step, 'Architecture_Generation');
    assert.equal(result.role, 'Architect');
    assert.equal(result.reason, 'current');
  });

  it('classifies architecture keywords', () => {
    const result = classifyDesignMessage(
      'Please draft the module architecture for auth',
      'Requirement_Clarification'
    );
    assert.equal(result.step, 'Architecture_Generation');
    assert.equal(result.role, 'Architect');
    assert.equal(result.reason, 'keyword');
  });

  it('parses explicit step overrides', () => {
    const result = classifyDesignMessage('/step: task_planner break down work', 'Requirement_Clarification');
    assert.equal(result.step, 'Task_List_Generation');
    assert.equal(result.role, 'Task_Planner');
    assert.equal(result.reason, 'explicit');
  });

  it('detects continue-only commands without changing classification step', () => {
    assert.equal(shouldAdvanceDesignStep('continue'), true);
    assert.equal(isContinueOnlyMessage('continue'), true);
    assert.equal(isContinueOnlyMessage('continue please'), false);
    assert.equal(shouldAdvanceDesignStep('下一步'), true);
    const result = classifyDesignMessage('continue', 'Requirement_Clarification');
    assert.equal(result.step, 'Requirement_Clarification');
    assert.equal(result.reason, 'continue');
  });

  it('advances through ordered design steps', () => {
    assert.equal(nextDesignStep('Requirement_Clarification'), 'Architecture_Generation');
    assert.equal(nextDesignStep('Task_List_Generation'), undefined);
  });
});
