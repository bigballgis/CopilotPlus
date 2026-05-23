import * as vscode from 'vscode';
import { activatePlatform } from './platform/activation';
import type { AppServices } from './app/appServices';

let app: AppServices | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const result = await activatePlatform(context);
  app = result.app;
}

export function deactivate(): void {
  app = undefined;
}

export function getAppServices(): AppServices | undefined {
  return app;
}

/** @deprecated use getAppServices().platform */
export function getPlatformServices() {
  return app?.platform;
}
