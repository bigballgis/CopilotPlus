/** Content-free telemetry — R-PLAT-7 */

import * as vscode from 'vscode';

export type TelemetryEventName =
  | 'activation.completed'
  | 'activation.failed'
  | 'locale.fallback'
  | 'nes.suggested'
  | 'nes.accepted'
  | 'nes.skipped'
  | 'nes.dismissed';

const ALLOWED_FIELDS = new Set([
  'durationMs',
  'locale',
  'fallbackLocale',
  'reason',
  'count',
]);

export class TelemetryService {
  private queue: Array<{ name: TelemetryEventName; fields: Record<string, string | number | boolean> }> =
    [];

  constructor(private enabled: () => boolean) {}

  setEnabled(_enabled: boolean): void {
    if (!this.enabled()) {
      this.queue = [];
    }
  }

  emit(name: TelemetryEventName, fields: Record<string, string | number | boolean> = {}): void {
    if (!this.enabled()) {
      return;
    }
    if (!this.validate(name, fields)) {
      return;
    }
    this.queue.push({ name, fields });
    // Extension host has no public telemetry sink; log for enterprise forwarding hooks.
    console.log(`[CopilotPlus Telemetry] ${name}`, fields);
  }

  flush(): void {
    this.queue = [];
  }

  private validate(name: TelemetryEventName, fields: Record<string, string | number | boolean>): boolean {
    for (const key of Object.keys(fields)) {
      if (!ALLOWED_FIELDS.has(key)) {
        return false;
      }
      const val = fields[key];
      if (typeof val === 'string' && (val.includes('/') || val.includes('\\'))) {
        return false;
      }
    }
    void name;
    return true;
  }
}

export function isGlobalTelemetryEnabled(): boolean {
  return vscode.env.isTelemetryEnabled;
}
