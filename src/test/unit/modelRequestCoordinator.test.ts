import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type * as vscode from 'vscode';
import { ModelRequestCoordinator } from '../../platform/modelRequestCoordinator.js';

function mockCancellationSource(): vscode.CancellationTokenSource {
  let cancelled = false;
  return {
    token: {
      get isCancellationRequested() {
        return cancelled;
      },
      onCancellationRequested: () => ({ dispose: () => undefined }),
    },
    cancel() {
      cancelled = true;
    },
    dispose() {
      cancelled = false;
    },
  } as vscode.CancellationTokenSource;
}

describe('R-PLAT-2.7 model request coordinator', () => {
  it('cancels all registered in-flight requests', () => {
    const coordinator = new ModelRequestCoordinator();
    const first = mockCancellationSource();
    const second = mockCancellationSource();
    coordinator.register(first);
    coordinator.register(second);

    coordinator.cancelAll();

    assert.equal(first.token.isCancellationRequested, true);
    assert.equal(second.token.isCancellationRequested, true);
  });

  it('stops tracking after dispose', () => {
    const coordinator = new ModelRequestCoordinator();
    const source = mockCancellationSource();
    const registration = coordinator.register(source);
    registration.dispose();

    coordinator.cancelAll();
    assert.equal(source.token.isCancellationRequested, false);
  });
});
