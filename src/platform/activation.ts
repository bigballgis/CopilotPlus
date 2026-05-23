/** Extension activation orchestration — R-PLAT-1 */

import * as vscode from 'vscode';
import { ACTIVATION_HARD_LIMIT_MS, ACTIVATION_SLOW_MS, MIN_VSCODE_VERSION } from '../shared/constants';
import { isSupportedHostVersion } from './version';
import { createPlatformServices, PlatformServices } from './services';
import { TelemetryService, isGlobalTelemetryEnabled } from './telemetry';
import { t, loadLocaleBundle } from './l10n';
import { registerCommands } from './commands';
import { ControlConsoleProvider } from '../interaction/controlConsole';

export interface ActivationResult {
  services: PlatformServices | undefined;
  aborted: boolean;
}

export async function activatePlatform(
  context: vscode.ExtensionContext
): Promise<ActivationResult> {
  const started = Date.now();

  if (!isSupportedHostVersion(vscode.version, MIN_VSCODE_VERSION)) {
    void vscode.window.showErrorMessage(
      t('activation.unsupported', MIN_VSCODE_VERSION, vscode.version)
    );
    return { services: undefined, aborted: true };
  }

  const slowTimer = setTimeout(() => {
    void vscode.window.showInformationMessage(t('activation.slow'));
  }, ACTIVATION_SLOW_MS);

  try {
    const services = await createPlatformServices(context);
    const registrations: vscode.Disposable[] = [];

    registrations.push(...registerCommands(context, services));
    registrations.push(
      vscode.window.registerWebviewViewProvider(
        ControlConsoleProvider.viewId,
        new ControlConsoleProvider(services)
      )
    );

    for (const d of registrations) {
      context.subscriptions.push(d);
    }

    clearTimeout(slowTimer);
    const duration = Date.now() - started;

    if (duration > ACTIVATION_HARD_LIMIT_MS) {
      console.warn(`Copilot Plus activation took ${duration}ms`);
    }

    emitActivationTelemetry(services, duration);
    logLocaleFallback();

    return { services, aborted: false };
  } catch (err) {
    clearTimeout(slowTimer);
    void vscode.window.showErrorMessage(
      t('activation.failed', err instanceof Error ? err.message : String(err))
    );
    return { services: undefined, aborted: true };
  }
}

function emitActivationTelemetry(services: PlatformServices, durationMs: number): void {
  services.telemetry.emit('activation.completed', { durationMs });
}

function logLocaleFallback(): void {
  const locale = loadLocaleBundle();
  if (locale && !locale.startsWith('en')) {
    // Bundle may be missing — R-PLAT-9.7
    const telemetry = new TelemetryService(() => isGlobalTelemetryEnabled());
    telemetry.emit('locale.fallback', { locale, fallbackLocale: 'en' });
  }
}
