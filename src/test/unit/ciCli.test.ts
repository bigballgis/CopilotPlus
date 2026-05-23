import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAction,
  DecisionUnresolvedError,
  parseDecisionResolverConfig,
} from '../../cli/decisionResolver.js';
import { validateTaskAgents } from '../../cli/buildConfig.js';

describe('R-DEP-7 Decision resolver', () => {
  it('always-approve picks Approve option', () => {
    const selected = applyAction('always-approve', undefined, {
      id: '1',
      question: 'Allow bash?',
      options: ['Approve', 'Reject'],
      timeoutSec: 60,
    });
    assert.equal(selected, 'Approve');
  });

  it('fail-on-decision throws', () => {
    assert.throws(
      () =>
        applyAction('fail-on-decision', undefined, {
          id: '1',
          question: 'Unknown?',
          options: ['Yes', 'No'],
          timeoutSec: 60,
        }),
      DecisionUnresolvedError
    );
  });

  it('parses config with rules', () => {
    const cfg = parseDecisionResolverConfig({
      default: 'fail-on-decision',
      rules: [{ pattern: 'deploy', action: 'always-reject', select: 'Reject' }],
    });
    assert.equal(cfg.rules.length, 1);
    assert.equal(cfg.default, 'fail-on-decision');
  });
});

describe('R-DEP-7 CI agents', () => {
  it('rejects unsupported agents', () => {
    assert.match(validateTaskAgents(['Architect']) ?? '', /Architect/);
    assert.equal(validateTaskAgents(['Coder', 'Tester']), undefined);
  });
});
