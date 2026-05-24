/** @-mention resolution — R-CTX-1 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { AppServices } from '../app/appServices';
import {
  mergeAttachments,
  MENTION_KINDS,
  parseMentionTokens,
  type MentionAttachment,
  type MentionKind,
} from './mentionTokens';
import { perAttachmentCharLimit, perAttachmentTokenLimit } from './mentionBudget';
import { listFolderFiles } from './mentionFolder';
import { fetchWebMention } from './mentionWebFetch';
import { resolveScope } from '../docs/scopeResolution';
import { computeQueryEmbedding } from './embeddingResolver';
import { t } from '../platform/l10n';

export type { MentionAttachment, MentionKind } from './mentionTokens';
export { mergeAttachments, parseMentionTokens, parseSlashSkill, MENTION_KINDS } from './mentionTokens';

interface MentionKindPick extends vscode.QuickPickItem {
  mentionKind: MentionKind;
}

export async function pickMention(app: AppServices): Promise<MentionAttachment | undefined> {
  const kind = await vscode.window.showQuickPick<MentionKindPick>(
    MENTION_KINDS.map((mentionKind) => ({
      label: `@${mentionKind}`,
      description: t(`mentions.kind.${mentionKind}`),
      mentionKind,
    })),
    { placeHolder: t('mentions.pickKind') }
  );
  if (!kind) {
    return undefined;
  }

  const tokenBudget = app.platform.getSettings().sessionTokenCap;
  const charLimit = perAttachmentCharLimit(tokenBudget);

  switch (kind.mentionKind) {
    case 'file':
      return pickFile(app, charLimit);
    case 'folder':
      return pickFolder();
    case 'symbol':
      return pickSymbol();
    case 'selection':
      return pickSelection();
    case 'doc':
      return pickDoc(app);
    case 'web':
      return pickWeb();
    case 'skill':
      return pickSkill(app);
  }
}

async function pickFile(app: AppServices, charLimit: number): Promise<MentionAttachment | undefined> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) {
    return undefined;
  }
  const uri = await vscode.window.showOpenDialog({ canSelectMany: false, defaultUri: root.uri });
  if (!uri?.[0]) {
    return undefined;
  }
  const rel = path.relative(root.uri.fsPath, uri[0].fsPath).replace(/\\/g, '/');
  const sens = app.platform.isPathSensitive(rel);
  if (sens.sensitive) {
    void vscode.window.showWarningMessage(t('mentions.sensitiveBlocked', rel, sens.pattern ?? ''));
    return undefined;
  }
  const stat = await fs.stat(uri[0].fsPath).catch(() => undefined);
  if (stat && stat.size > charLimit) {
    void vscode.window.showWarningMessage(
      t('mentions.fileTooLarge', rel, String(perAttachmentTokenLimit(app.platform.getSettings().sessionTokenCap)))
    );
    return undefined;
  }
  return { kind: 'file', target: rel, label: path.basename(rel) };
}

async function pickFolder(): Promise<MentionAttachment | undefined> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) {
    return undefined;
  }
  const uri = await vscode.window.showOpenDialog({
    canSelectMany: false,
    canSelectFolders: true,
    canSelectFiles: false,
    defaultUri: root.uri,
  });
  if (!uri?.[0]) {
    return undefined;
  }
  const rel = path.relative(root.uri.fsPath, uri[0].fsPath).replace(/\\/g, '/');
  return { kind: 'folder', target: rel || '.', label: path.basename(rel) || rel };
}

async function pickSymbol(): Promise<MentionAttachment | undefined> {
  const query = await vscode.window.showInputBox({ prompt: t('mentions.symbolPrompt') });
  if (!query?.trim()) {
    return undefined;
  }
  const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
    'vscode.executeWorkspaceSymbolProvider',
    query.trim()
  );
  if (!symbols?.length) {
    void vscode.window.showWarningMessage(t('mentions.noSymbols'));
    return undefined;
  }
  const pick = await vscode.window.showQuickPick(
    symbols.slice(0, 100).map((symbol) => ({
      label: symbol.name,
      description: `${symbol.containerName} — ${vscode.workspace.asRelativePath(symbol.location.uri)}`,
      symbol,
    })),
    { placeHolder: t('mentions.pickSymbol') }
  );
  if (!pick) {
    return undefined;
  }
  const rel = vscode.workspace.asRelativePath(pick.symbol.location.uri).replace(/\\/g, '/');
  const start = pick.symbol.location.range.start.line + 1;
  const end = pick.symbol.location.range.end.line + 1;
  return {
    kind: 'symbol',
    target: rel,
    label: pick.symbol.name,
    range: `${start}-${end}`,
  };
}

async function pickSelection(): Promise<MentionAttachment | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    void vscode.window.showWarningMessage(t('mentions.noSelection'));
    return undefined;
  }
  const rel = vscode.workspace.asRelativePath(editor.document.uri).replace(/\\/g, '/');
  return { kind: 'selection', target: rel, label: 'selection' };
}

async function pickDoc(app: AppServices): Promise<MentionAttachment | undefined> {
  const docs = app.docs.getEntries().filter((e) => e.valid);
  const pick = await vscode.window.showQuickPick(
    docs.map((d) => ({ label: d.frontmatter.title, target: d.relativePath })),
    { placeHolder: t('mentions.pickDoc') }
  );
  if (!pick) {
    return undefined;
  }
  return { kind: 'doc', target: pick.target, label: pick.label };
}

async function pickWeb(): Promise<MentionAttachment | undefined> {
  const target = await vscode.window.showInputBox({
    prompt: t('mentions.webPrompt'),
    placeHolder: 'https://example.com/docs',
  });
  if (!target?.trim()) {
    return undefined;
  }
  return { kind: 'web', target: target.trim(), label: target.trim().slice(0, 48) };
}

async function pickSkill(app: AppServices): Promise<MentionAttachment | undefined> {
  const skills = app.skills.getSkills().filter((s) => s.valid && s.enabled);
  const pick = await vscode.window.showQuickPick(
    skills.map((s) => ({ label: s.title, description: s.scope, target: s.id })),
    { placeHolder: t('mentions.pickSkill') }
  );
  if (!pick) {
    return undefined;
  }
  return { kind: 'skill', target: pick.target, label: pick.label };
}

export interface ResolvedMentionBlock {
  attachment: MentionAttachment;
  text: string;
  blocked?: boolean;
}

export async function resolveMentionBlocks(
  attachments: MentionAttachment[],
  app: AppServices,
  tokenBudget = 100_000
): Promise<ResolvedMentionBlock[]> {
  const maxChars = perAttachmentCharLimit(tokenBudget);
  const blocks: ResolvedMentionBlock[] = [];

  for (const attachment of attachments) {
    const block = await resolveOneMention(attachment, app, maxChars, tokenBudget);
    blocks.push(block);
  }
  return blocks;
}

export async function resolveMentionContext(
  attachments: MentionAttachment[],
  app: AppServices,
  tokenBudget = 100_000
): Promise<string> {
  const blocks = await resolveMentionBlocks(attachments, app, tokenBudget);
  return blocks.map((b) => b.text).join('\n\n');
}

async function resolveOneMention(
  attachment: MentionAttachment,
  app: AppServices,
  maxChars: number,
  tokenBudget: number
): Promise<ResolvedMentionBlock> {
  const clip = (text: string): string =>
    text.length > maxChars ? `${text.slice(0, maxChars)}\n...[truncated]` : text;

  switch (attachment.kind) {
    case 'file': {
      const sens = app.platform.isPathSensitive(attachment.target);
      if (sens.sensitive) {
        return {
          attachment,
          text: `[@file ${attachment.target}] blocked: sensitive (${sens.pattern})`,
          blocked: true,
        };
      }
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        return { attachment, text: `[@file ${attachment.target}] unavailable`, blocked: true };
      }
      const content = await fs.readFile(path.join(root, attachment.target), 'utf8').catch(() => '');
      if (content.length > maxChars) {
        void vscode.window.showWarningMessage(
          t('mentions.fileTooLarge', attachment.target, String(perAttachmentTokenLimit(tokenBudget)))
        );
        return {
          attachment,
          text: `[@file ${attachment.target}] blocked: exceeds attachment limit`,
          blocked: true,
        };
      }
      return { attachment, text: `[@file ${attachment.target}]\n${clip(content)}` };
    }
    case 'folder': {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        return { attachment, text: `[@folder ${attachment.target}] unavailable`, blocked: true };
      }
      const files = await listFolderFiles(root, attachment.target);
      let snippetBlock = '';
      const folderPrefix = attachment.target.replace(/\\/g, '/').replace(/\/$/, '');
      const resolution = app.indexManager.getResolution();
      const queryEmbedding =
        resolution.mode === 'proposed_lm' || resolution.mode === 'local'
          ? await computeQueryEmbedding(folderPrefix, resolution, app.localEmbeddingAddon)
          : undefined;
      const model = await app.platform.models.resolveSelectionForSurface('subAgent');
      const tier = model ? app.platform.models.getContextTier(model) : 'M';
      const response = app.indexManager.retrieval.search({
        query: folderPrefix,
        thoroughness: 'quick',
        topK: 12,
        tier,
        docEntries: app.docs.getEntries(),
        queryEmbedding,
      });
      snippetBlock = response.results
        .filter((hit) => hit.kind === 'code' && hit.path.replace(/\\/g, '/').startsWith(folderPrefix))
        .slice(0, 6)
        .map((hit) => `${hit.path}${hit.line != null ? `:${hit.line}` : ''}\n${hit.snippet}`)
        .join('\n\n');
      const listing = files.map((f) => `- ${f}`).join('\n');
      return {
        attachment,
        text: `[@folder ${attachment.target}]\nFiles (${files.length}${files.length >= 1000 ? '+' : ''}):\n${clip(listing)}${
          snippetBlock ? `\n\nRelevant snippets:\n${clip(snippetBlock)}` : ''
        }`,
      };
    }
    case 'symbol': {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        return { attachment, text: `[@symbol ${attachment.target}] unavailable`, blocked: true };
      }
      const uri = vscode.Uri.file(path.join(root, attachment.target));
      const doc = await vscode.workspace.openTextDocument(uri);
      if (attachment.range) {
        const [startLine, endLine] = attachment.range.split('-').map((n) => Number(n));
        const start = Math.max(0, startLine - 1);
        const end = Math.min(doc.lineCount, endLine);
        const range = new vscode.Range(start, 0, end, 0);
        const text = doc.getText(range);
        return { attachment, text: `[@symbol ${attachment.label} ${attachment.target}:${attachment.range}]\n${clip(text)}` };
      }
      return { attachment, text: `[@symbol ${attachment.label} ${attachment.target}]\n${clip(doc.getText())}` };
    }
    case 'selection': {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return { attachment, text: `[@selection ${attachment.target}] no active selection`, blocked: true };
      }
      const text = editor.document.getText(editor.selection);
      if (!text.trim()) {
        return { attachment, text: `[@selection ${attachment.target}] empty selection`, blocked: true };
      }
      return { attachment, text: `[@selection ${attachment.target}]\n${clip(text)}` };
    }
    case 'doc': {
      const doc = await app.docs.read(attachment.target);
      const scope = resolveScope(attachment.target, app.docs.getEntries());
      const scopeBlock = scope.length ? `\n\nScope:\n${formatScopeBlock(scope)}` : '';
      const body = `${doc.frontmatter.title}\n${doc.body}${scopeBlock}`;
      if (body.length > maxChars) {
        void vscode.window.showWarningMessage(
          t('mentions.docTooLarge', attachment.target, String(perAttachmentTokenLimit(tokenBudget)))
        );
        return {
          attachment,
          text: `[@doc ${attachment.target}] blocked: exceeds attachment limit`,
          blocked: true,
        };
      }
      return { attachment, text: `[@doc ${attachment.target}]\n${body}` };
    }
    case 'web': {
      const fetched = await fetchWebMention(attachment.target);
      if (!fetched.ok) {
        void vscode.window.showWarningMessage(t('mentions.webFailed', attachment.target, fetched.reason));
        return {
          attachment,
          text: `[@web ${attachment.target}] fetch failed: ${fetched.reason}`,
          blocked: true,
        };
      }
      return { attachment, text: `[@web ${attachment.target}]\n${clip(fetched.text)}` };
    }
    case 'skill': {
      const skill = app.skills.getById(attachment.target);
      if (!skill) {
        return { attachment, text: `[@skill ${attachment.target}] not found or disabled`, blocked: true };
      }
      const body = `# ${skill.title}\n${skill.body}`;
      return { attachment, text: `[@skill ${skill.id}]\n${clip(body)}` };
    }
  }
}

function formatScopeBlock(
  scope: ReturnType<typeof resolveScope>
): string {
  return scope.map((entry) => `- ${entry.level} ${entry.title} (${entry.link_type})`).join('\n');
}
