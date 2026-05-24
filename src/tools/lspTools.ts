/** LSP tool helpers — R-TOOL-5 */

import * as vscode from 'vscode';
import * as path from 'path';
import { applyTextEdits as applyTextEditsPure } from './textEditApply';

export interface LspDiagnostic {
  file: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  severity: string;
  message: string;
  source?: string;
  code?: string | number;
}

export interface LspLocation {
  file: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
}

function workspaceRel(uri: vscode.Uri): string {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    return uri.fsPath;
  }
  return path.relative(root, uri.fsPath).replace(/\\/g, '/');
}

function toRange(range: vscode.Range) {
  return {
    start: { line: range.start.line, character: range.start.character },
    end: { line: range.end.line, character: range.end.character },
  };
}

export async function getDiagnostics(paths?: string[]): Promise<LspDiagnostic[]> {
  const out: LspDiagnostic[] = [];
  const all = vscode.languages.getDiagnostics();

  for (const [uri, diags] of all) {
    const rel = workspaceRel(uri);
    if (paths?.length && !paths.some((p) => rel === p.replace(/\\/g, '/') || rel.endsWith(p))) {
      continue;
    }
    for (const d of diags) {
      out.push({
        file: rel,
        range: toRange(d.range),
        severity: vscode.DiagnosticSeverity[d.severity] ?? 'Unknown',
        message: d.message,
        source: d.source,
        code: d.code as string | number | undefined,
      });
      if (out.length >= 500) {
        return out;
      }
    }
  }
  return out;
}

export async function getDefinition(
  relPath: string,
  line: number,
  character: number
): Promise<LspLocation[]> {
  const uri = vscode.Uri.file(absPath(relPath));
  const pos = new vscode.Position(Math.max(0, line - 1), character);
  const links = await vscode.commands.executeCommand<vscode.LocationLink[] | vscode.Location[]>(
    'vscode.executeDefinitionProvider',
    uri,
    pos
  );
  return flattenLocations(links).slice(0, 50);
}

export async function getReferences(
  relPath: string,
  line: number,
  character: number
): Promise<LspLocation[]> {
  const uri = vscode.Uri.file(absPath(relPath));
  const pos = new vscode.Position(Math.max(0, line - 1), character);
  const links = await vscode.commands.executeCommand<vscode.Location[]>(
    'vscode.executeReferenceProvider',
    uri,
    pos
  );
  return (links ?? []).map((loc) => ({
    file: workspaceRel(loc.uri),
    range: toRange(loc.range),
  })).slice(0, 500);
}

export async function getHover(
  relPath: string,
  line: number,
  character: number
): Promise<{ contents: string } | null> {
  const uri = vscode.Uri.file(absPath(relPath));
  const pos = new vscode.Position(Math.max(0, line - 1), character);
  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    'vscode.executeHoverProvider',
    uri,
    pos
  );
  const hover = hovers?.[0];
  if (!hover) {
    return null;
  }
  const contents = hover.contents
    .map((c) => (typeof c === 'string' ? c : 'value' in c ? String(c.value) : ''))
    .join('\n');
  return { contents: contents.slice(0, 5000) };
}

export async function getRenameEdit(
  relPath: string,
  line: number,
  character: number,
  newName: string
): Promise<vscode.WorkspaceEdit | null> {
  const uri = vscode.Uri.file(absPath(relPath));
  const pos = new vscode.Position(Math.max(0, line - 1), character);
  const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit | undefined>(
    'vscode.executeDocumentRenameProvider',
    uri,
    pos,
    newName
  );
  if (!edit || edit.size === 0) {
    return null;
  }
  return edit;
}

export function applyTextEdits(original: string, edits: readonly vscode.TextEdit[]): string {
  return applyTextEditsPure(original, edits);
}

function absPath(rel: string): string {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    return rel;
  }
  return path.join(root, rel);
}

function flattenLocations(
  links: vscode.LocationLink[] | vscode.Location[] | undefined
): LspLocation[] {
  if (!links?.length) {
    return [];
  }
  const out: LspLocation[] = [];
  for (const link of links) {
    if ('targetUri' in link) {
      out.push({ file: workspaceRel(link.targetUri), range: toRange(link.targetRange) });
    } else {
      out.push({ file: workspaceRel(link.uri), range: toRange(link.range) });
    }
  }
  return out;
}

export function filterErrorDiagnostics(diags: LspDiagnostic[]): LspDiagnostic[] {
  return diags.filter((d) => d.severity === 'Error');
}
