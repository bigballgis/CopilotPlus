import * as vscode from 'vscode';
import { activatePlatform } from './platform/activation';
import type { PlatformServices } from './platform/services';

let services: PlatformServices | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const result = await activatePlatform(context);
  services = result.services;
}

export function deactivate(): void {
  services = undefined;
}

export function getPlatformServices(): PlatformServices | undefined {
  return services;
}
