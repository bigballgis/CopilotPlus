/** Platform service container — DESIGN §5.1 */

import * as vscode from 'vscode';
import { ConfigurationService, matchesCommandDenyList } from './configuration';
import { CopilotAuthService } from './copilotAuth';
import { ModelService } from './modelService';
import { SensitiveFileGuard } from './sensitiveFiles';
import { TelemetryService, isGlobalTelemetryEnabled } from './telemetry';
import { NetworkMonitor } from './errors';
import { resolveToolPermission, type PermissionResolution } from './toolPermissions';
import { ModelRequestCoordinator } from './modelRequestCoordinator';
import { t } from './l10n';

export class PlatformServices {
  readonly config: ConfigurationService;
  readonly auth: CopilotAuthService;
  readonly models: ModelService;
  readonly sensitiveFiles: SensitiveFileGuard;
  readonly telemetry: TelemetryService;
  readonly network: NetworkMonitor;
  readonly modelRequests: ModelRequestCoordinator;

  private settings: ReturnType<ConfigurationService['read']>;
  private readonly entitlementLostHandlers = new Set<() => void>();

  constructor(private readonly context: vscode.ExtensionContext) {
    this.config = new ConfigurationService((key, reason) => {
      void vscode.window.showWarningMessage(t('settings.invalid', key, reason));
    });
    this.settings = this.config.read();
    this.auth = new CopilotAuthService();
    this.models = new ModelService(context, this.auth);
    this.sensitiveFiles = new SensitiveFileGuard();
    this.telemetry = new TelemetryService(() => this.isTelemetryOn());
    this.network = new NetworkMonitor();
    this.modelRequests = new ModelRequestCoordinator();
    this.applySettings();
  }

  onEntitlementLost(handler: () => void): vscode.Disposable {
    this.entitlementLostHandlers.add(handler);
    return {
      dispose: () => {
        this.entitlementLostHandlers.delete(handler);
      },
    };
  }

  register(): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    disposables.push(
      this.config.onDidChange(() => {
        this.applySettings();
      })
    );

    disposables.push(
      this.auth.watchEntitlement(() => {
        this.modelRequests.cancelAll();
        for (const handler of this.entitlementLostHandlers) {
          handler();
        }
        void this.models.refresh();
      })
    );

    disposables.push(
      vscode.lm.onDidChangeChatModels(() => {
        void this.models.refresh();
      })
    );

    return disposables;
  }

  getSettings() {
    return this.settings;
  }

  resolveToolPermission(toolId: string, command?: string): PermissionResolution {
    const deny = command
      ? matchesCommandDenyList(command, this.settings.commandDenyList)
      : false;
    return resolveToolPermission(
      toolId,
      this.settings.toolPermissions,
      this.settings.autonomyLevel,
      deny
    );
  }

  isPathSensitive(relativePath: string): ReturnType<SensitiveFileGuard['check']> {
    return this.sensitiveFiles.check(relativePath);
  }

  private isTelemetryOn(): boolean {
    return isGlobalTelemetryEnabled() && this.settings.telemetryEnabled;
  }

  private applySettings(): void {
    this.settings = this.config.read();
    this.sensitiveFiles.updatePatterns(this.settings.sensitiveFilePatterns);
    this.telemetry.setEnabled(this.isTelemetryOn());
  }
}

export async function createPlatformServices(
  context: vscode.ExtensionContext
): Promise<PlatformServices> {
  const services = new PlatformServices(context);
  context.subscriptions.push(...services.register());
  await services.models.refresh();
  return services;
}
