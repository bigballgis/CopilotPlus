/** Speculative request pool — R-PLAT-11 */

import * as crypto from 'crypto';

export type SpeculativeSurface = 'tabCompletion' | 'scopePreheat';

export interface SpeculativeHeld<T> {
  key: string;
  value: T;
  estimatedTokens: number;
  heldAt: number;
}

export interface SpeculativeConsumeResult<T> {
  hit: true;
  value: T;
  estimatedTokens: number;
}

const DEFAULT_TTL_MS = 30_000;

export function hashSpeculativeKey(surface: SpeculativeSurface, parts: Record<string, string>): string {
  const payload = JSON.stringify({ surface, ...parts });
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function applySpeculativeTokenDiscount(estimatedTokens: number): number {
  return Math.ceil(Math.max(0, estimatedTokens) * 0.5);
}

export class SpeculativeRequestPool {
  private held = new Map<string, SpeculativeHeld<unknown>>();
  private inflight = new Map<string, AbortController>();
  private inflightCount = 0;

  constructor(
    private ttlMs = DEFAULT_TTL_MS,
    private maxConcurrent = 2,
    private enabled = true
  ) {}

  configure(enabled: boolean, maxConcurrent: number): void {
    this.enabled = enabled;
    this.maxConcurrent = Math.max(0, maxConcurrent);
    if (!enabled) {
      this.cancelAll();
    }
  }

  schedule<T>(
    surface: SpeculativeSurface,
    key: string,
    estimatedTokens: number,
    run: (signal: AbortSignal) => Promise<T>,
    onComplete?: (estimatedTokens: number, consumed: boolean) => void
  ): boolean {
    if (!this.enabled || this.maxConcurrent <= 0) {
      return false;
    }
    this.pruneExpired();
    if (this.inflight.has(key) || this.held.has(key)) {
      return false;
    }
    if (this.inflightCount >= this.maxConcurrent) {
      return false;
    }

    const abort = new AbortController();
    this.inflight.set(key, abort);
    this.inflightCount += 1;

    void run(abort.signal)
      .then((value) => {
        if (abort.signal.aborted) {
          return;
        }
        this.held.set(key, {
          key,
          value,
          estimatedTokens,
          heldAt: Date.now(),
        });
        onComplete?.(estimatedTokens, false);
      })
      .catch(() => {
        // ignore speculative failures
      })
      .finally(() => {
        this.inflight.delete(key);
        this.inflightCount = Math.max(0, this.inflightCount - 1);
      });

    return true;
  }

  tryConsume<T>(key: string): SpeculativeConsumeResult<T> | undefined {
    this.pruneExpired();
    const entry = this.held.get(key);
    if (!entry) {
      return undefined;
    }
    this.held.delete(key);
    this.cancelInflight(key);
    return {
      hit: true,
      value: entry.value as T,
      estimatedTokens: entry.estimatedTokens,
    };
  }

  discard(key: string): void {
    this.cancelInflight(key);
    this.held.delete(key);
  }

  discardExcept(key: string | undefined): void {
    for (const heldKey of [...this.held.keys()]) {
      if (heldKey !== key) {
        this.discard(heldKey);
      }
    }
    for (const inflightKey of [...this.inflight.keys()]) {
      if (inflightKey !== key) {
        this.cancelInflight(inflightKey);
      }
    }
  }

  cancelAll(): void {
    for (const key of [...this.inflight.keys()]) {
      this.cancelInflight(key);
    }
    this.held.clear();
  }

  private cancelInflight(key: string): void {
    const abort = this.inflight.get(key);
    if (!abort) {
      return;
    }
    abort.abort();
    this.inflight.delete(key);
    this.inflightCount = Math.max(0, this.inflightCount - 1);
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.held.entries()) {
      if (now - entry.heldAt > this.ttlMs) {
        this.held.delete(key);
      }
    }
  }
}
