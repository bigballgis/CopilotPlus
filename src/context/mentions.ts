/** @-mention resolution — R-CTX-1 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { AppServices } from '../app/appServices';
import {
  mergeAttachments,
  parseMentionTokens,
  type MentionAttachment,
  type MentionKind,
} from './mentionTokens';

export type { MentionAttachment, MentionKind } from './mentionTokens';
export { mergeAttachments, parseMentionTokens, parseSlashSkill } from './mentionTokens';

interface MentionKindPick extends vscode.QuickPickItem {
  mentionKind: MentionKind;
}

export async function pickMention(app: AppServices): Promise<MentionAttachment | undefined> {
  const kind = await vscode.window.showQuickPick<MentionKindPick>(
    [
      { label: '@file — attach a workspace file', mentionKind: 'file' },
      { label: '@doc — attach a document tree file', mentionKind: 'doc' },
      { label: '@selection — attach active editor selection', mentionKind: 'selection' },
      { label: '@skill — attach a project Skill', mentionKind: 'skill' },
    ],
    { placeHolder: 'Select mention type' }
  );
  if (!kind) {
    return undefined;
  }

  switch (kind.mentionKind) {
    case 'file': {
      const root = vscode.workspace.workspaceFolders?.[0];
      if (!root) {
        return undefined;
      }
      const uri = await vscode.window.showOpenDialog({ canSelectMany: false, defaultUri: root.uri });
      if (!uri?.[0]) {
        return undefined;
      }
      const rel = path.relative(root.uri.fsPath, uri[0].fsPath).replace(/\\/g, '/');
      return { kind: 'file', target: rel, label: path.basename(rel) };
    }
    case 'doc': {
      const docs = app.docs.getEntries().filter((e) => e.valid);
      const pick = await vscode.window.showQuickPick(
        docs.map((d) => ({ label: d.frontmatter.title, target: d.relativePath })),
        { placeHolder: 'Select document' }
      );
      if (!pick) {
        return undefined;
      }
      return { kind: 'doc', target: pick.target, label: pick.label };
    }
    case 'selection': {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        void vscode.window.showWarningMessage('No active editor selection.');
        return undefined;
      }
      const rel = vscode.workspace.asRelativePath(editor.document.uri).replace(/\\/g, '/');
      return { kind: 'selection', target: rel, label: 'selection' };
    }
    case 'skill': {
      const skills = app.skills.getSkills().filter((s) => s.valid && s.enabled);
      const pick = await vscode.window.showQuickPick(
        skills.map((s) => ({ label: s.title, description: s.scope, target: s.id })),
        { placeHolder: 'Select skill' }
      );
      if (!pick) {
        return undefined;
      }
      return { kind: 'skill', target: pick.target, label: pick.label };
    }
  }
}

export async function resolveMentionContext(
  attachments: MentionAttachment[],
  app: AppServices,
  tokenBudget = 100_000
): Promise<string> {
  const maxAttachment = Math.floor(tokenBudget * 0.25);
  const blocks: string[] = [];

  for (const attachment of attachments) {
    switch (attachment.kind) {
      case 'file': {
        const sens = app.platform.isPathSensitive(attachment.target);
        if (sens.sensitive) {
          blocks.push(`[@file ${attachment.target}] blocked: sensitive (${sens.pattern})`);
          break;
        }
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) {
          break;
        }
        const content = await fs.readFile(path.join(root, attachment.target), 'utf8').catch(() => '');
        const clipped = content.slice(0, maxAttachment);
        blocks.push(
          `[@file ${attachment.target}]\n${clipped}${content.length > clipped.length ? '\n...[truncated]' : ''}`
        );
        break;
      }
      case 'doc': {
        const doc = await app.docs.read(attachment.target);
        const body = `${doc.frontmatter.title}\n${doc.body}`.slice(0, maxAttachment);
        blocks.push(`[@doc ${attachment.target}]\n${body}`);
        break;
      }
      case 'selection': {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          break;
        }
        const text = editor.document.getText(editor.selection).slice(0, maxAttachment);
        blocks.push(`[@selection ${attachment.target}]\n${text}`);
        break;
      }
      case 'skill': {
        const skill = app.skills.getById(attachment.target);
        if (!skill) {
          blocks.push(`[@skill ${attachment.target}] not found or disabled`);
          break;
        }
        const body = skill.body.slice(0, maxAttachment);
        blocks.push(`[@skill ${skill.id}]\n# ${skill.title}\n${body}`);
        break;
      }
    }
  }

  return blocks.join('\n\n');
}
