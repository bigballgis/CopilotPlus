/** Built-in tool executor — R-TOOL-1 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { AppServices } from '../app/appServices';
import type { DocumentTreeService } from '../docs/documentTreeService';
import { composeDocument, normalizeFrontmatter } from '../docs/frontmatterSerialize';
import { parseFrontmatter, validateFrontmatter } from '../docs/frontmatter';
import { applyEdits, type PatchEdit } from './applyPatchLogic';
import { SUB_AGENT_ALLOWLISTS } from './registry';
import { isToolVisible } from '../platform/toolPermissions';

export type ToolResult = { ok: true; data: unknown } | { ok: false; reason: string; pattern?: string };

export class ToolExecutor {
  constructor(
    private readonly app: AppServices,
    private readonly docs: DocumentTreeService
  ) {}

  getEffectiveTools(role: string): string[] {
    const base = SUB_AGENT_ALLOWLISTS[role] ?? [];
    return base.filter((toolId) => {
      const perm = this.app.platform.resolveToolPermission(toolId);
      return isToolVisible(perm.effective);
    });
  }

  async invoke(role: string, toolId: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.getEffectiveTools(role).includes(toolId)) {
      return { ok: false, reason: 'tool_denied' };
    }

    const perm = this.app.platform.resolveToolPermission(
      toolId,
      typeof args.command === 'string' ? args.command : undefined
    );
    if (perm.effective === 'deny') {
      return { ok: false, reason: 'tool_denied' };
    }
    if (perm.effective === 'ask') {
      const approved = await this.app.decisions.ask({
        id: `tool-${Date.now()}`,
        question: `Allow ${toolId}?`,
        options: ['Approve', 'Reject'],
        defaultOption: 'Reject',
        timeoutSec: 300,
      });
      if (approved.selected !== 'Approve') {
        return { ok: false, reason: 'user_rejected' };
      }
    }

    switch (toolId) {
      case 'read_file':
        return this.readFile(args);
      case 'grep':
        return this.grep(args);
      case 'glob':
        return this.glob(args);
      case 'list_dir':
        return this.listDir(args);
      case 'doc_read':
        return this.docRead(args);
      case 'doc_write':
        return this.docWrite(args);
      case 'apply_patch':
        return this.applyPatch(args);
      case 'write_file':
        return this.writeFile(args);
      case 'question':
        return this.question(args);
      default:
        return { ok: false, reason: 'not_implemented' };
    }
  }

  private workspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private checkSensitive(rel: string): ToolResult | null {
    const check = this.app.platform.isPathSensitive(rel);
    if (check.sensitive) {
      return { ok: false, reason: 'sensitive_file', pattern: check.pattern };
    }
    return null;
  }

  private async readFile(args: Record<string, unknown>): Promise<ToolResult> {
    const rel = String(args.path ?? '');
    const sens = this.checkSensitive(rel);
    if (sens) {
      return sens;
    }
    const root = this.workspaceRoot();
    if (!root) {
      return { ok: false, reason: 'no_workspace' };
    }
    const abs = path.join(root, rel);
    const content = await fs.readFile(abs, 'utf8');
    const lines = content.split('\n');
    const start = typeof args.start_line === 'number' ? args.start_line - 1 : 0;
    const end = typeof args.end_line === 'number' ? args.end_line : lines.length;
    const slice = lines.slice(start, end).join('\n');
    const truncated = slice.length > 200_000 || end - start > 2000;
    return {
      ok: true,
      data: {
        content: truncated ? slice.slice(0, 200_000) : slice,
        total_lines: lines.length,
        truncated,
      },
    };
  }

  private async grep(args: Record<string, unknown>): Promise<ToolResult> {
    const pattern = String(args.pattern ?? '');
    const re = new RegExp(pattern, args.case_sensitive ? '' : 'i');
    const root = this.workspaceRoot();
    if (!root) {
      return { ok: false, reason: 'no_workspace' };
    }
    const base = args.path ? path.join(root, String(args.path)) : root;
    const max = Math.min(Number(args.max_results) || 100, 1000);
    const matches: Array<{ file: string; line: number; text: string }> = [];

    await this.walkFiles(base, (rel, content) => {
      if (this.checkSensitive(rel)) {
        return;
      }
      const lines = content.split('\n');
      for (let i = 0; i < lines.length && matches.length < max; i++) {
        if (re.test(lines[i])) {
          matches.push({ file: rel, line: i + 1, text: lines[i] });
        }
      }
    });

    return { ok: true, data: { matches, truncated: matches.length >= max } };
  }

  private async glob(args: Record<string, unknown>): Promise<ToolResult> {
    const pattern = String(args.pattern ?? '**/*');
    const root = this.workspaceRoot();
    if (!root) {
      return { ok: false, reason: 'no_workspace' };
    }
    const base = args.base ? path.join(root, String(args.base)) : root;
    const max = Math.min(Number(args.max_results) || 500, 5000);
    const paths: string[] = [];
    const needle = pattern.replace(/\*\*/g, '').replace(/\*/g, '');

    await this.walkFiles(base, (rel) => {
      if (paths.length >= max) {
        return;
      }
      if (!needle || rel.includes(needle.replace(/\//g, path.sep))) {
        if (!this.checkSensitive(rel)) {
          paths.push(rel.replace(/\\/g, '/'));
        }
      }
    });

    return { ok: true, data: { paths, truncated: paths.length >= max } };
  }

  private async listDir(args: Record<string, unknown>): Promise<ToolResult> {
    const rel = String(args.path ?? '.');
    const sens = this.checkSensitive(rel);
    if (sens) {
      return sens;
    }
    const root = this.workspaceRoot();
    if (!root) {
      return { ok: false, reason: 'no_workspace' };
    }
    const abs = path.join(root, rel);
    const entries = await fs.readdir(abs, { withFileTypes: true });
    const children = entries.slice(0, 1000).map((e) => ({
      name: e.name,
      kind: e.isDirectory() ? 'directory' : 'file',
    }));
    return { ok: true, data: { children } };
  }

  private async docRead(args: Record<string, unknown>): Promise<ToolResult> {
    const docPath = String(args.path ?? '');
    try {
      const doc = await this.docs.read(docPath);
      return { ok: true, data: doc };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  }

  private async docWrite(args: Record<string, unknown>): Promise<ToolResult> {
    const docPath = String(args.path ?? '');
    const content = String(args.content ?? '');
    const parsed = parseFrontmatter(content);
    if (!parsed.frontmatter) {
      return { ok: false, reason: 'invalid_frontmatter' };
    }
    const fm = normalizeFrontmatter(parsed.frontmatter as unknown as Record<string, unknown>);
    const validation = validateFrontmatter(fm as unknown as Record<string, unknown>, parsed.body);
    if (!validation.valid) {
      return { ok: false, reason: validation.errors.join(', ') };
    }
    const ok = await this.docs.writeWithReview(docPath, content, 'doc_write');
    return ok ? { ok: true, data: { path: docPath } } : { ok: false, reason: 'user_rejected' };
  }

  private async writeFile(args: Record<string, unknown>): Promise<ToolResult> {
    const rel = String(args.path ?? '');
    const sens = this.checkSensitive(rel);
    if (sens) {
      return sens;
    }
    const content = String(args.content ?? '');
    const root = this.workspaceRoot()!;
    const uri = vscode.Uri.file(path.join(root, rel));
    const ok = await this.app.diffReview.reviewFullFile(
      uri,
      await fs.readFile(uri.fsPath, 'utf8').catch(() => ''),
      content,
      'write_file'
    );
    return ok ? { ok: true, data: { path: rel } } : { ok: false, reason: 'user_rejected' };
  }

  private async applyPatch(args: Record<string, unknown>): Promise<ToolResult> {
    const rel = String(args.path ?? '');
    const sens = this.checkSensitive(rel);
    if (sens) {
      return sens;
    }
    const edits = (args.edits as PatchEdit[]) ?? [];
    const root = this.workspaceRoot()!;
    const uri = vscode.Uri.file(path.join(root, rel));
    const original = await fs.readFile(uri.fsPath, 'utf8');
    const result = applyEdits(original, edits);
    if (!result.ok) {
      return { ok: false, reason: result.reason };
    }
    const ok = await this.app.diffReview.reviewFullFile(uri, original, result.content, 'apply_patch');
    return ok ? { ok: true, data: { path: rel } } : { ok: false, reason: 'user_rejected' };
  }

  private async question(args: Record<string, unknown>): Promise<ToolResult> {
    const text = String(args.text ?? 'Proceed?');
    const options = (args.options as string[]) ?? ['Yes', 'No'];
    const answer = await this.app.decisions.ask({
      id: `q-${Date.now()}`,
      question: text.slice(0, 500),
      options,
      defaultOption: options[0],
      timeoutSec: 300,
    });
    return { ok: true, data: { answer: answer.selected } };
  }

  private async walkFiles(
    dir: string,
    fn: (rel: string, content?: string) => void,
    relBase = ''
  ): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return;
    }
    const root = this.workspaceRoot()!;
    for (const name of entries) {
      if (name === 'node_modules' || name === '.git') {
        continue;
      }
      const abs = path.join(dir, name);
      const rel = relBase ? path.join(relBase, name) : name;
      const stat = await fs.stat(abs);
      if (stat.isDirectory()) {
        await this.walkFiles(abs, fn, rel);
      } else {
        const content = await fs.readFile(abs, 'utf8').catch(() => undefined);
        if (content !== undefined) {
          fn(rel.replace(/\\/g, '/'), content);
        }
      }
    }
    void root;
  }
}
