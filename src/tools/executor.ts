/** Built-in tool executor — R-TOOL-1 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { AppServices } from '../app/appServices';
import type { DocumentTreeService } from '../docs/documentTreeService';
import { composeDocument, normalizeFrontmatter } from '../docs/frontmatterSerialize';
import { findLateralDepthViolations } from '../docs/lateralDepth';
import { findNamingCollision } from '../docs/namingConsistency';
import { applyEdits, type PatchEdit } from './applyPatchLogic';
import { SUB_AGENT_ALLOWLISTS } from './registry';
import { isToolVisible } from '../platform/toolPermissions';
import { runBash } from './bashRunner';
import {
  parseFilesChangedFromStat,
  parseGitCommitHash,
} from '../editing/commitHistoryParse';
import {
  getDefinition,
  getDiagnostics,
  getHover,
  getReferences,
} from './lspTools';
import { computeQueryEmbedding } from '../context/embeddingResolver';
import { parseMcpToolId } from '../extensibility/mcpConfig';
import { requiresAutonomyApproval, shouldBypassDiffReview } from '../workflow/autonomyGate';
import { matchesCommandDenyList } from '../platform/configuration';
import { t } from '../platform/l10n';

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; reason: string; pattern?: string; cap?: number; actual?: number };

const EXPLORER_PARENT_ROLES = new Set([
  'Coder',
  'Tester',
  'Reviewer',
  'Architect',
  'Designer',
]);

export class ToolExecutor {
  constructor(
    private readonly app: AppServices,
    private readonly docs: DocumentTreeService
  ) {}

  getEffectiveTools(role: string): string[] {
    const base = SUB_AGENT_ALLOWLISTS[role] ?? [];
    const tools = base.filter((toolId) => {
      const perm = this.app.platform.resolveToolPermission(toolId);
      return isToolVisible(perm.effective);
    });
    if (EXPLORER_PARENT_ROLES.has(role)) {
      tools.push('explore');
    }
    tools.push(...this.app.mcp.getInjectedTools(role));
    return tools;
  }

  async invoke(role: string, toolId: string, args: Record<string, unknown>): Promise<ToolResult> {
    const mcpParsed = parseMcpToolId(toolId);
    if (mcpParsed) {
      if (!this.getEffectiveTools(role).includes(toolId)) {
        return { ok: false, reason: 'tool_denied' };
      }
      const mcpDenied = await this.ensureToolApproved(toolId, args);
      if (mcpDenied) {
        return mcpDenied;
      }
      const buildLimit = this.maybeBlockBuildToolCall();
      if (buildLimit) {
        return buildLimit;
      }
      const result = await this.app.mcp.invokeTool(mcpParsed.serverId, mcpParsed.toolName, args);
      await this.app.hooks.fire('mcp.tool.called', {
        serverId: mcpParsed.serverId,
        toolName: mcpParsed.toolName,
        role,
        ok: result.ok,
      });
      return result;
    }

    if (!this.getEffectiveTools(role).includes(toolId)) {
      return { ok: false, reason: 'tool_denied' };
    }

    const denied = await this.ensureToolApproved(toolId, args);
    if (denied) {
      return denied;
    }

    const buildLimit = this.maybeBlockBuildToolCall();
    if (buildLimit) {
      return buildLimit;
    }

    if (toolId === 'explore') {
      return this.explore(args);
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
        return this.applyPatch(args, role);
      case 'write_file':
        return this.writeFile(args, role);
      case 'delete_file':
        return this.deleteFile(args);
      case 'code_search':
        return this.codeSearch(args);
      case 'task_create':
        return this.taskCreate(args);
      case 'task_update':
        return this.taskUpdate(args);
      case 'todowrite':
        return this.todoWrite(args);
      case 'todoread':
        return this.todoRead(args);
      case 'bash':
        return this.bash(args);
      case 'lsp_diagnostics':
        return this.lspDiagnostics(args);
      case 'lsp_definition':
        return this.lspDefinition(args);
      case 'lsp_references':
        return this.lspReferences(args);
      case 'lsp_hover':
        return this.lspHover(args);
      case 'git_status':
        return this.gitStatus();
      case 'git_diff':
        return this.gitDiff(args);
      case 'git_commit':
        return this.gitCommit(args);
      case 'run_tests':
        return this.runTests(args);
      case 'checkpoint_restore':
        return this.checkpointRestore(args);
      case 'question':
        return this.question(args);
      case 'propose_memory':
        return this.proposeMemory(args, role);
      case 'deploy_apply':
        return this.deployApply();
      case 'deploy_rollback':
        return this.deployRollback(args);
      default:
        return { ok: false, reason: 'not_implemented' };
    }
  }

  private workspaceRoot(): string | undefined {
    return (
      this.app.buildIsolation.getToolRoot() ??
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    );
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
    let docPath = String(args.path ?? '');
    const content = String(args.content ?? '');
    const parsed = parseFrontmatter(content);
    if (!parsed.frontmatter) {
      return { ok: false, reason: 'invalid_frontmatter' };
    }
    let fm = normalizeFrontmatter(parsed.frontmatter as unknown as Record<string, unknown>);
    const existing = this.docs.getByPath(docPath);
    const entries = this.docs.getEntries();
    const maxLateralDepth = this.app.platform.getSettings().maxLateralDepth;
    const resolveId = (id: string) => this.app.namingAliases.resolve(id);

    const draftEntry = {
      relativePath: docPath,
      frontmatter: fm,
      body: parsed.body,
      valid: true,
      errors: [],
    };
    const lateralViolations = findLateralDepthViolations(draftEntry, entries, maxLateralDepth, resolveId);
    if (lateralViolations.length > 0) {
      const first = lateralViolations[0]!;
      return {
        ok: false,
        reason: 'lateral_depth_exceeded',
        cap: first.maxDepth,
        actual: first.depth,
      };
    }

    const namingChanged =
      !existing ||
      fm.title !== existing.frontmatter.title ||
      fm.parent !== existing.frontmatter.parent ||
      fm.id !== existing.frontmatter.id;
    if (namingChanged) {
      const collision = findNamingCollision(fm, entries, existing?.frontmatter.id);
      if (collision) {
        const response = await this.app.decisions.ask({
          id: `naming-${fm.id}-${Date.now()}`,
          taskId: this.app.getToolExecutionContext().taskId,
          question: t('docs.namingCollisionQuestion', fm.id, collision.frontmatter.id),
          options: ['Reuse_Existing', 'Force_Create', 'Cancel'],
          defaultOption: 'Reuse_Existing',
          timeoutSec: this.app.platform.getSettings().decisionTimeoutSec,
        });
        const selected = response.selected;
        if (selected === 'Cancel') {
          return { ok: false, reason: 'user_rejected' };
        }
        if (selected === 'Reuse_Existing') {
          docPath = collision.relativePath;
          fm = { ...fm, id: collision.frontmatter.id, parent: collision.frontmatter.parent };
        }
      }
    }

    const composed = composeDocument(fm, parsed.body);
    const sizeCheck = validateDocumentSize(fm.level as DocLevel, parsed.body);
    if (!sizeCheck.ok) {
      return {
        ok: false,
        reason: sizeCheck.reason,
        cap: sizeCheck.cap,
        actual: sizeCheck.actual,
      };
    }
    const validation = validateFrontmatter(fm as unknown as Record<string, unknown>, parsed.body);
    if (!validation.valid) {
      return { ok: false, reason: validation.errors.join(', ') };
    }
    const ok = await this.docs.writeWithReview(docPath, composed, 'doc_write');
    return ok ? { ok: true, data: { path: docPath } } : { ok: false, reason: 'user_rejected' };
  }

  private async writeFile(args: Record<string, unknown>, role: string): Promise<ToolResult> {
    const rel = String(args.path ?? '');
    if (this.app.knowledge.isAgentsPath(rel) && role !== 'Architect') {
      return { ok: false, reason: 'agents_md_role_restricted' };
    }
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
      'write_file',
      undefined,
      { autoApply: shouldBypassDiffReview(this.app.platform.getSettings().autonomyLevel) }
    );
    if (ok) {
      await this.app.postEdit.recordEdit(rel);
    }
    return ok ? { ok: true, data: { path: rel } } : { ok: false, reason: 'user_rejected' };
  }

  private async applyPatch(args: Record<string, unknown>, role: string): Promise<ToolResult> {
    const rel = String(args.path ?? '');
    if (this.app.knowledge.isAgentsPath(rel) && role !== 'Architect') {
      return { ok: false, reason: 'agents_md_role_restricted' };
    }
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
    const ok = await this.app.diffReview.reviewFullFile(
      uri,
      original,
      result.content,
      'apply_patch',
      undefined,
      { autoApply: shouldBypassDiffReview(this.app.platform.getSettings().autonomyLevel) }
    );
    if (ok) {
      await this.app.postEdit.recordEdit(rel);
    }
    return ok ? { ok: true, data: { path: rel } } : { ok: false, reason: 'user_rejected' };
  }

  private async deleteFile(args: Record<string, unknown>): Promise<ToolResult> {
    const rel = String(args.path ?? '');
    const sens = this.checkSensitive(rel);
    if (sens) {
      return sens;
    }
    const root = this.workspaceRoot();
    if (!root) {
      return { ok: false, reason: 'no_workspace' };
    }
    const uri = vscode.Uri.file(path.join(root, rel));
    const original = await fs.readFile(uri.fsPath, 'utf8').catch(() => '');
    const ok = await this.app.diffReview.reviewFullFile(
      uri,
      original,
      '',
      'delete_file',
      undefined,
      { autoApply: shouldBypassDiffReview(this.app.platform.getSettings().autonomyLevel) }
    );
    if (!ok) {
      return { ok: false, reason: 'user_rejected' };
    }
    await fs.unlink(uri.fsPath).catch(() => undefined);
    await this.app.postEdit.recordEdit(rel);
    return { ok: true, data: { path: rel, deleted: true } };
  }

  private async codeSearch(args: Record<string, unknown>): Promise<ToolResult> {
    const query = String(args.query ?? args.pattern ?? '');
    if (!this.app.indexManager.isRetrievalAvailable()) {
      return this.grep({ pattern: query, max_results: args.max_results ?? 50 });
    }

    const resolution = this.app.indexManager.getResolution();
    const queryEmbedding =
      resolution.mode === 'proposed_lm' || resolution.mode === 'local'
        ? await computeQueryEmbedding(query, resolution, this.app.localEmbeddingAddon)
        : undefined;

    const model = await this.app.platform.models.resolveSelectionForSurface('subAgent');
    const tierOverride = this.app.platform.getSettings().tierOverride;
    const tier = model ? this.app.platform.models.getContextTier(model, tierOverride) : 'M';
    const response = this.app.indexManager.retrieval.search({
      query,
      scope: args.scope ? String(args.scope) : undefined,
      thoroughness: (args.thoroughness as 'quick' | 'medium' | 'thorough') ?? 'medium',
      topK: typeof args.top_k === 'number' ? args.top_k : undefined,
      tier,
      docEntries: this.docs.getEntries(),
      queryEmbedding,
      includeDocChunks: this.app.platform.getSettings().ragEnabled,
    });

    return {
      ok: true,
      data: {
        results: response.results,
        truncated: response.truncated,
        mode: response.mode,
      },
    };
  }

  private async taskCreate(args: Record<string, unknown>): Promise<ToolResult> {
    const buildId = this.app.buildExecutor.getActiveBuildId();
    if (!buildId) {
      return { ok: false, reason: 'no_active_build' };
    }
    const task = args.task as Record<string, unknown> | undefined;
    if (!task?.id || !task.title || !task.agent || !task.scope_doc) {
      return { ok: false, reason: 'invalid_task_payload' };
    }
    try {
      const dag = await this.app.buildExecutor.addTask({
        id: String(task.id),
        title: String(task.title),
        description: String(task.description ?? ''),
        agent: String(task.agent),
        inputs: (task.inputs as Record<string, unknown>) ?? {},
        depends_on: (task.depends_on as string[]) ?? [],
        status: 'Pending',
        scope_doc: String(task.scope_doc),
      });
      return { ok: true, data: { tasks: dag.tasks.length } };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  }

  private async taskUpdate(args: Record<string, unknown>): Promise<ToolResult> {
    const taskId = String(args.id ?? args.task_id ?? '');
    if (!taskId) {
      return { ok: false, reason: 'missing_task_id' };
    }
    const patch = (args.patch as Record<string, unknown>) ?? args;
    try {
      const dag = await this.app.buildExecutor.updateTask(
        taskId,
        patch as Partial<import('../workflow/taskDag').TaskNode>
      );
      return { ok: true, data: { task: dag.tasks.find((t) => t.id === taskId) } };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  }

  private todoPath(buildId: string, taskId: string): string | undefined {
    const root = this.workspaceRoot();
    if (!root) {
      return undefined;
    }
    return path.join(root, '.copilotPlus', 'builds', buildId, taskId, 'todos.json');
  }

  private async todoWrite(args: Record<string, unknown>): Promise<ToolResult> {
    const buildId = this.app.buildExecutor.getActiveBuildId() ?? String(args.build_id ?? '');
    const taskId = String(args.task_id ?? 'default');
    const file = this.todoPath(buildId, taskId);
    if (!file) {
      return { ok: false, reason: 'no_workspace' };
    }
    const todos = args.todos ?? args.items ?? [];
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(todos, null, 2), 'utf8');
    return { ok: true, data: { path: file } };
  }

  private async todoRead(args: Record<string, unknown>): Promise<ToolResult> {
    const buildId = this.app.buildExecutor.getActiveBuildId() ?? String(args.build_id ?? '');
    const taskId = String(args.task_id ?? 'default');
    const file = this.todoPath(buildId, taskId);
    if (!file) {
      return { ok: false, reason: 'no_workspace' };
    }
    try {
      const raw = await fs.readFile(file, 'utf8');
      return { ok: true, data: JSON.parse(raw) };
    } catch {
      return { ok: true, data: [] };
    }
  }

  private async explore(args: Record<string, unknown>): Promise<ToolResult> {
    const query = String(args.query ?? '');
    const thoroughness = String(args.thoroughness ?? 'medium') as 'quick' | 'medium' | 'thorough';
    const buildId = this.app.buildExecutor.getActiveBuildId() ?? 'explore';
    const taskId = String(args.task_id ?? 'parent');
    const token = new vscode.CancellationTokenSource().token;
    const result = await this.app.explorer.investigate(query, thoroughness, buildId, taskId, token);
    return { ok: true, data: result };
  }

  private async bash(args: Record<string, unknown>): Promise<ToolResult> {
    const command = String(args.command ?? '');
    const root = this.workspaceRoot();
    if (!root) {
      return { ok: false, reason: 'no_workspace' };
    }
    const timeout = Math.min(Number(args.timeout_ms) || 60_000, 600_000);
    const result = await runBash(command, root, timeout, args.cwd ? String(args.cwd) : undefined);
    return { ok: true, data: result };
  }

  private async lspDiagnostics(args: Record<string, unknown>): Promise<ToolResult> {
    const paths = args.paths as string[] | undefined;
    const diags = await getDiagnostics(paths);
    return { ok: true, data: { diagnostics: diags } };
  }

  private async lspDefinition(args: Record<string, unknown>): Promise<ToolResult> {
    const rel = String(args.path ?? '');
    const line = Number(args.line ?? 1);
    const character = Number(args.character ?? 0);
    const locations = await getDefinition(rel, line, character);
    return { ok: true, data: { locations } };
  }

  private async lspReferences(args: Record<string, unknown>): Promise<ToolResult> {
    const rel = String(args.path ?? '');
    const line = Number(args.line ?? 1);
    const character = Number(args.character ?? 0);
    const locations = await getReferences(rel, line, character);
    return { ok: true, data: { locations } };
  }

  private async lspHover(args: Record<string, unknown>): Promise<ToolResult> {
    const rel = String(args.path ?? '');
    const line = Number(args.line ?? 1);
    const character = Number(args.character ?? 0);
    const hover = await getHover(rel, line, character);
    return { ok: true, data: hover ?? { contents: '' } };
  }

  private async gitStatus(): Promise<ToolResult> {
    return this.gitCommand('git status --porcelain=v1');
  }

  private async gitDiff(args: Record<string, unknown>): Promise<ToolResult> {
    const staged = args.staged ? '--cached' : '';
    return this.gitCommand(`git diff ${staged}`.trim());
  }

  private async gitCommit(args: Record<string, unknown>): Promise<ToolResult> {
    const message = String(args.message ?? 'Copilot Plus commit');
    const paths = Array.isArray(args.paths)
      ? args.paths.map((value) => String(value)).filter(Boolean)
      : undefined;
    const stageCmd =
      paths && paths.length > 0
        ? `git add ${paths.map((p) => JSON.stringify(p)).join(' ')}`
        : 'git add -A';
    const result = await this.gitCommand(`${stageCmd} && git commit -m ${JSON.stringify(message)}`);
    if (result.ok) {
      await this.recordSuccessfulGitCommit(message, result.data);
    }
    return result;
  }

  private async recordSuccessfulGitCommit(message: string, data: unknown): Promise<void> {
    const bash = data as { stdout?: string; stderr?: string };
    const combined = `${bash.stdout ?? ''}\n${bash.stderr ?? ''}`;
    const hash = parseGitCommitHash(combined);
    if (!hash) {
      return;
    }
    const ctx = this.app.getToolExecutionContext();
    const root = this.workspaceRoot();
    let filesChanged = 0;
    if (root) {
      const stat = await runBash(`git show --shortstat -s ${hash}`, root);
      filesChanged = parseFilesChangedFromStat(stat.stdout);
    }
    await this.app.recordCopilotCommit({
      hash,
      message,
      taskId: ctx.taskId,
      stage: ctx.stage,
      filesChanged,
    });
  }

  private async gitCommand(command: string): Promise<ToolResult> {
    const root = this.workspaceRoot();
    if (!root) {
      return { ok: false, reason: 'no_workspace' };
    }
    const result = await runBash(command, root);
    if (result.exit_code === 0) {
      return { ok: true, data: result };
    }
    return { ok: false, reason: result.stderr || 'git_failed' };
  }

  private async runTests(args: Record<string, unknown>): Promise<ToolResult> {
    const command =
      String(args.command ?? '') ||
      vscode.workspace.getConfiguration('copilotPlus').get<string>('workflow.testCommand') ||
      'npm run test:unit';
    const root = this.workspaceRoot();
    if (!root) {
      return { ok: false, reason: 'no_workspace' };
    }
    const result = await runBash(command, root, Number(args.timeout_ms) || 120_000);
    if (result.exit_code === 0) {
      return { ok: true, data: result };
    }
    return { ok: false, reason: result.stderr || 'tests_failed' };
  }

  private async checkpointRestore(args: Record<string, unknown>): Promise<ToolResult> {
    const id = String(args.checkpoint_id ?? args.id ?? '');
    if (!id) {
      return { ok: false, reason: 'missing_checkpoint_id' };
    }
    try {
      const restored = await this.app.checkpoints.restore(id);
      return { ok: true, data: { restored } };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  }

  private async question(args: Record<string, unknown>): Promise<ToolResult> {
    const text = String(args.prompt ?? args.text ?? 'Proceed?');
    const options = (args.options as string[]) ?? ['Yes', 'No'];
    if (options.length < 2 || options.length > 5) {
      return { ok: false, reason: 'invalid_question_options' };
    }
    const settings = this.app.platform.getSettings();
    const ctx = this.app.getToolExecutionContext();
    const answer = await this.app.decisions.ask({
      id: `q-${Date.now()}`,
      taskId: ctx.taskId,
      question: text.slice(0, 500),
      options,
      defaultOption: typeof args.default === 'string' ? args.default : options[0],
      timeoutSec: settings.decisionTimeoutSec,
    });
    return { ok: true, data: { answer: answer.selected, timed_out: answer.timedOut } };
  }

  private static readonly PROPOSE_MEMORY_ROLES = new Set([
    'Coder',
    'Tester',
    'Reviewer',
    'Committer',
    'Deployer',
  ]);

  private async proposeMemory(args: Record<string, unknown>, role: string): Promise<ToolResult> {
    if (!ToolExecutor.PROPOSE_MEMORY_ROLES.has(role)) {
      return { ok: false, reason: 'propose_memory_role_restricted' };
    }
    const text = String(args.text ?? '').trim();
    if (!text) {
      return { ok: false, reason: 'missing_text' };
    }
    const taskId =
      typeof args.task_id === 'string' && args.task_id
        ? args.task_id
        : undefined;
    const result = await this.app.knowledge.proposeMemory(this.app, text, taskId);
    if (!result.ok) {
      return { ok: false, reason: result.reason, pattern: result.pattern };
    }
    return { ok: true, data: { outcome: result.outcome } };
  }

  private async deployApply(): Promise<ToolResult> {
    const result = await this.app.deployExecutor.applyManifest();
    if (result.ok) {
      return { ok: true, data: { runId: result.runId } };
    }
    return { ok: false, reason: result.reason ?? 'deploy_failed' };
  }

  private async deployRollback(args: Record<string, unknown>): Promise<ToolResult> {
    const runId =
      typeof args.run_id === 'string'
        ? args.run_id
        : this.app.deploy.getRuns().find((r) => r.status === 'Failed')?.id;
    if (!runId) {
      return { ok: false, reason: 'no_run' };
    }
    const result = await this.app.deployExecutor.rollbackRun(runId);
    if (result.ok) {
      return { ok: true, data: { runId } };
    }
    return { ok: false, reason: result.reason ?? 'rollback_failed' };
  }

  private maybeBlockBuildToolCall(): ToolResult | null {
    if (this.app.buildExecutor.getBuildStatus() !== 'Running') {
      return null;
    }
    if (this.app.buildExecutor.isBuildLimitReached()) {
      return { ok: false, reason: 'build_tool_limit' };
    }
    this.app.buildExecutor.recordToolCall();
    return null;
  }

  private async ensureToolApproved(
    toolId: string,
    args: Record<string, unknown>
  ): Promise<ToolResult | null> {
    const settings = this.app.platform.getSettings();
    const command = typeof args.command === 'string' ? args.command : undefined;
    const perm = this.app.platform.resolveToolPermission(toolId, command);
    if (perm.effective === 'deny') {
      return { ok: false, reason: 'tool_denied' };
    }

    const stage = this.app.stages.getStage();
    if (
      !requiresAutonomyApproval(stage, settings.autonomyLevel, toolId, perm.effective)
    ) {
      return null;
    }

    const onDenyList = command
      ? matchesCommandDenyList(command, settings.commandDenyList)
      : false;
    const question = command
      ? onDenyList
        ? t('autonomy.denyListPrompt', command.slice(0, 300))
        : t('autonomy.toolWithCommandPrompt', toolId, command.slice(0, 300))
      : t('autonomy.toolPrompt', toolId);

    const response = await this.app.decisions.ask({
      id: `tool-${toolId}-${Date.now()}`,
      question,
      options: ['Approve', 'Reject'],
      defaultOption: 'Reject',
      timeoutSec: settings.decisionTimeoutSec,
    });

    if (response.timedOut || response.selected !== 'Approve') {
      return { ok: false, reason: 'user_rejected' };
    }
    return null;
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
