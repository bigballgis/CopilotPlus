/** Per-build operation limits — R-WF-8 */

export type BuildLimitReason = 'tool_calls' | 'duration';

export interface BuildLimitsSnapshot {
  toolCallCount: number;
  maxToolCalls: number;
  elapsedSec: number;
  maxDurationSec: number;
}

export class BuildLimitsTracker {
  private toolCallCount = 0;
  private maxToolCalls = 200;
  private maxDurationSec = 7200;
  private startedAtMs = 0;
  private bonusToolCalls = 0;
  private bonusDurationSec = 0;

  reset(maxToolCalls: number, maxDurationSec: number): void {
    this.toolCallCount = 0;
    this.maxToolCalls = maxToolCalls;
    this.maxDurationSec = maxDurationSec;
    this.startedAtMs = Date.now();
    this.bonusToolCalls = 0;
    this.bonusDurationSec = 0;
  }

  isActive(): boolean {
    return this.startedAtMs > 0;
  }

  recordToolCall(): boolean {
    this.toolCallCount += 1;
    return this.isToolCallLimitReached();
  }

  isToolCallLimitReached(): boolean {
    return this.toolCallCount >= this.effectiveMaxToolCalls();
  }

  isDurationLimitReached(): boolean {
    if (!this.startedAtMs) {
      return false;
    }
    return this.getElapsedSec() >= this.effectiveMaxDurationSec();
  }

  getRemainingToolCalls(): number {
    return Math.max(0, this.effectiveMaxToolCalls() - this.toolCallCount);
  }

  getElapsedSec(): number {
    if (!this.startedAtMs) {
      return 0;
    }
    return Math.floor((Date.now() - this.startedAtMs) / 1000);
  }

  raiseLimits(): void {
    this.bonusToolCalls += Math.max(50, Math.floor(this.maxToolCalls * 0.5));
    this.bonusDurationSec += Math.max(600, Math.floor(this.maxDurationSec * 0.25));
  }

  snapshot(): BuildLimitsSnapshot {
    return {
      toolCallCount: this.toolCallCount,
      maxToolCalls: this.effectiveMaxToolCalls(),
      elapsedSec: this.getElapsedSec(),
      maxDurationSec: this.effectiveMaxDurationSec(),
    };
  }

  private effectiveMaxToolCalls(): number {
    return this.maxToolCalls + this.bonusToolCalls;
  }

  private effectiveMaxDurationSec(): number {
    return this.maxDurationSec + this.bonusDurationSec;
  }
}

export type BuildLimitDecision = 'continue' | 'pause' | 'terminate';

export function interpretBuildLimitDecision(
  selected: string,
  timedOut: boolean
): BuildLimitDecision {
  if (timedOut || selected === 'Pause') {
    return 'pause';
  }
  if (selected === 'Continue') {
    return 'continue';
  }
  if (selected === 'Terminate') {
    return 'terminate';
  }
  return 'pause';
}
