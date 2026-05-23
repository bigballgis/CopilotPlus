import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { ConversationPaneProvider } from './conversationPane';
import { TabWorkspaceProvider } from './tabWorkspace';

let conversationProvider: ConversationPaneProvider | undefined;
let tabProvider: TabWorkspaceProvider | undefined;

export async function openWorkspace(context: vscode.ExtensionContext, app: AppServices): Promise<void> {
  const column = vscode.ViewColumn.One;

  if (!conversationProvider) {
    conversationProvider = new ConversationPaneProvider(context.extensionUri, context, app);
  }
  if (!tabProvider) {
    tabProvider = new TabWorkspaceProvider(context.extensionUri, app.platform);
  }

  await conversationProvider.show(column);
  await tabProvider.show(column === vscode.ViewColumn.One ? vscode.ViewColumn.Two : column + 1);

  await vscode.commands.executeCommand('setContext', 'copilotPlus.workspaceOpen', true);
}

export function getTabWorkspace(): TabWorkspaceProvider | undefined {
  return tabProvider;
}

export function getConversationPane(): ConversationPaneProvider | undefined {
  return conversationProvider;
}
