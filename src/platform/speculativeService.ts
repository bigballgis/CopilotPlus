/** Speculative request orchestration — R-PLAT-11 */

import type { PlatformServices } from './services';
import {
  applySpeculativeTokenDiscount,
  hashSpeculativeKey,
  SpeculativeRequestPool,
  type SpeculativeSurface,
} from './speculativeRequests';

export type TokenSink = (discountedTokens: number) => void;

export class SpeculativeService {
  private readonly pool = new SpeculativeRequestPool();
  private tokenSink: TokenSink | undefined;

  constructor(private readonly platform: PlatformServices) {
    this.syncSettings();
    this.platform.config.onDidChange(() => this.syncSettings());
  }

  setTokenSink(sink: TokenSink | undefined): void {
    this.tokenSink = sink;
  }

  makeKey(surface: SpeculativeSurface, parts: Record<string, string>): string {
    return hashSpeculativeKey(surface, parts);
  }

  schedule<T>(
    surface: SpeculativeSurface,
    key: string,
    estimatedTokens: number,
    run: (signal: AbortSignal) => Promise<T>
  ): boolean {
    return this.pool.schedule(surface, key, estimatedTokens, run, (tokens) => {
      this.recordTokens(tokens);
    });
  }

  tryConsume<T>(key: string): { hit: true; value: T } | undefined {
    const result = this.pool.tryConsume<T>(key);
    if (!result) {
      return undefined;
    }
    return { hit: true, value: result.value };
  }

  discard(key: string): void {
    this.pool.discard(key);
  }

  discardExcept(key: string | undefined): void {
    this.pool.discardExcept(key);
  }

  cancelAll(): void {
    this.pool.cancelAll();
  }

  private recordTokens(estimatedTokens: number): void {
    this.tokenSink?.(applySpeculativeTokenDiscount(estimatedTokens));
  }

  private syncSettings(): void {
    const settings = this.platform.getSettings();
    this.pool.configure(settings.speculativeEnabled, settings.speculativeMaxConcurrent);
  }
}
