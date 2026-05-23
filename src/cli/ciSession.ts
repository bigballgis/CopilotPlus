/** Active CI session state — R-DEP-7 */

import type { CiTranscript } from './ciTranscript';
import { DecisionResolver } from './decisionResolver';

export class CiSession {
  private active = true;

  constructor(
    readonly runId: string,
    readonly buildId: string,
    readonly transcript: CiTranscript,
    readonly resolver: DecisionResolver,
    readonly maxToolCalls: number,
    readonly maxBuildDurationSec: number
  ) {}

  isActive(): boolean {
    return this.active;
  }

  deactivate(): void {
    this.active = false;
  }

  recordDiff(path: string, operation: string, before: string, after: string): void {
    this.transcript.emit({
      type: 'file.diff',
      path,
      operation,
      before: truncateDiff(before),
      after: truncateDiff(after),
    });
  }
}

function truncateDiff(text: string, max = 8000): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}\n...[truncated ${text.length - max} chars]`;
}
