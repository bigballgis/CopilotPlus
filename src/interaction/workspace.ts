import * as vscode from 'vscode';
import type { PlatformServices } from '../platform/services';
import { ConversationPaneProvider } from './conversationPane';
import { TabWorkspaceProvider } from './tabWorkspace';

let conversationProvider: ConversationPaneProvider | undefined;
let tabProvider: TabWorkspaceProvider | undefined;

export async function openWorkspace(
  context: vscode.ExtensionContext,
  services: PlatformServices
): Promise<void> {
  const column = vscode.ViewColumn.One;

  if (!conversationProvider) {
    conversationProvider = new ConversationPaneProvider(context.extensionUri, services);
  }
  if (!tabProvider) {
    tabProvider = new TabWorkspaceProvider(context.extensionUri, services);
  }

  await conversationProvider.show(column);
  await tabProvider.show(column === vscode.ViewColumn.One ? vscode.ViewColumn.Two : column + 1);

  await vscode.commands.executeCommand('setContext', 'copilotPlus.workspaceOpen', true);
}

export function getTabWorkspace(): TabWorkspaceProvider | undefined {
  return tabProvider;
}
