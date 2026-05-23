/** Knowledge and memory orchestration — R-KNOW-1..6 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { AppServices } from '../app/appServices';
import type { PlatformServices } from '../platform/services';
import {
  composeAgentsText,
  isAgentsFilePath,
  loadAgentsLayers,
  workspaceAgentsPath,
} from './agentsFileLoader';
import {
  evictSessionMemory,
  formatSessionMemoryForPrompt,
  loadSessionMemory,
  newMemoryEntry,
  saveSessionMemory,
  type SessionMemoryEntry,
  type SessionMemoryScope,
  validateMemoryText,
} from './sessionMemoryStore';
import { scanMemoryText } from './memoryPrivacy';
import {
  hasReflectionProposals,
  parseReflectionOutput,
  reflectionToProposals,
  type ReflectionOutput,
} from './selfReflectionParse';
import { streamChat } from '../platform/chatClient';
import { COPILOT_PLUS_HOME } from '../shared/constants';
import { t } from '../platform/l10n';

export type ProposeMemoryOutcome = 'rejected' | 'agents_md' | 'session_memory';

export type ProposeMemoryResult =
  | { ok: true; outcome: ProposeMemoryOutcome }
  | { ok: false; reason: 'blocked' | 'invalid'; pattern?: string };

export class KnowledgeService {
  private agentsCache:
    | { key: string; text: string; dropped: string[]; mtime: number }
    | undefined;
  private sessionEntries: SessionMemoryEntry[] = [];
  private reflectionSummaries: string[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly platform: PlatformServices
  ) {}

  async initialize(context: vscode.ExtensionContext): Promise<void> {
    await this.reloadSessionMemory();
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (this.isAgentsDocument(doc.uri)) {
          this.agentsCache = undefined;
        }
      }),
      vscode.workspace.onDidCreateFiles((e) => {
        if (e.files.some((f) => this.isAgentsDocument(f))) {
          this.agentsCache = undefined;
        }
      }),
      vscode.workspace.onDidDeleteFiles((e) => {
        if (e.files.some((f) => this.isAgentsDocument(f))) {
          this.agentsCache = undefined;
        }
      })
    );
  }

  getSessionEntries(): SessionMemoryEntry[] {
    return [...this.sessionEntries];
  }

  getReflectionSummaries(): string[] {
    return [...this.reflectionSummaries];
  }

  async buildContextBlock(fileRelative?: string, taskId?: string): Promise<string> {
    const agents = await this.getAgentsInstruction(fileRelative);
    const memory = await this.getSessionMemoryInstruction(taskId);
    return [agents.text, memory.text].filter(Boolean).join('\n\n');
  }

  async getAgentsInstruction(fileRelative?: string): Promise<{ text: string; dropped: string[] }> {
    const root = this.workspaceRoot();
    if (!root) {
      return { text: '', dropped: [] };
    }
    const key = `${root}:${fileRelative ?? ''}`;
    if (this.agentsCache && this.agentsCache.key === key) {
      return { text: this.agentsCache.text, dropped: this.agentsCache.dropped };
    }
    const loaded = await loadAgentsLayers(root, fileRelative);
    this.agentsCache = {
      key,
      text: loaded.text,
      dropped: loaded.dropped,
      mtime: Date.now(),
    };
    return { text: loaded.text, dropped: loaded.dropped };
  }

  async getSessionMemoryInstruction(taskId?: string): Promise<{ text: string; usedIds: string[] }> {
    await this.reloadSessionMemory();
    const formatted = formatSessionMemoryForPrompt(this.sessionEntries, taskId);
    if (formatted.usedIds.length > 0) {
      const now = new Date().toISOString();
      for (const entry of this.sessionEntries) {
        if (formatted.usedIds.includes(entry.id)) {
          entry.last_used_at = now;
        }
      }
      await this.persistSessionMemory();
    }
    return formatted;
  }

  async addSessionMemory(
    text: string,
    scope: SessionMemoryScope,
    taskId?: string
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const err = validateMemoryText(text);
    if (err) {
      return { ok: false, reason: err };
    }
    this.sessionEntries.push(newMemoryEntry(text, scope, taskId));
    this.sessionEntries = evictSessionMemory(this.sessionEntries);
    await this.persistSessionMemory();
    return { ok: true };
  }

  async removeSessionMemory(id: string): Promise<void> {
    this.sessionEntries = this.sessionEntries.filter((e) => e.id !== id);
    await this.persistSessionMemory();
  }

  async togglePinSessionMemory(id: string): Promise<void> {
    const entry = this.sessionEntries.find((e) => e.id === id);
    if (entry) {
      entry.pinned = !entry.pinned;
      await this.persistSessionMemory();
    }
  }

  scanAgentsEdit(content: string) {
    return scanMemoryText(content);
  }

  isAgentsPath(relativePath: string): boolean {
    return isAgentsFilePath(relativePath);
  }

  async initAgentsMd(app: AppServices): Promise<void> {
    const root = this.workspaceRoot();
    if (!root) {
      void vscode.window.showWarningMessage(t('knowledge.noWorkspace'));
      return;
    }

    const detected = await detectProjectConventions(root);
    const target = workspaceAgentsPath(root);
    const existing = await fs.readFile(target, 'utf8').catch(() => '');
    const proposed = mergeAgentsContent(existing, detected);
    const privacy = scanMemoryText(proposed);
    if (privacy.blocked) {
      void vscode.window.showErrorMessage(t('knowledge.agentsBlocked', privacy.pattern ?? ''));
      return;
    }

    const uri = vscode.Uri.file(target);
    const ok = await app.diffReview.reviewFullFile(uri, existing, proposed, 'AGENTS.md init');
    if (ok) {
      this.agentsCache = undefined;
      void vscode.window.showInformationMessage(t('knowledge.agentsUpdated'));
    }
  }

  async proposeMemory(
    app: AppServices,
    text: string,
    taskId?: string
  ): Promise<ProposeMemoryResult> {
    const err = validateMemoryText(text);
    if (err) {
      return { ok: false, reason: 'invalid' };
    }
    const privacy = scanMemoryText(text);
    if (privacy.blocked) {
      void vscode.window.showErrorMessage(t('knowledge.memoryBlocked', privacy.pattern ?? ''));
      return { ok: false, reason: 'blocked', pattern: privacy.pattern };
    }
    const acceptAgents = t('knowledge.proposeAgents');
    const acceptSession = t('knowledge.proposeSession');
    const reject = t('knowledge.proposeReject');
    const response = await app.decisions.ask({
      id: `memory-${Date.now()}`,
      question: t('knowledge.proposeMemoryQuestion', text.slice(0, 400)),
      options: [acceptAgents, acceptSession, reject],
      defaultOption: reject,
      timeoutSec: 300,
    });
    if (response.selected === reject) {
      return { ok: true, outcome: 'rejected' };
    }
    if (response.selected === acceptSession) {
      const result = await this.addSessionMemory(text, taskId ? 'task' : 'workspace', taskId);
      if (!result.ok) {
        void vscode.window.showErrorMessage(t('knowledge.sessionRejected', result.reason));
        return { ok: false, reason: 'invalid' };
      }
      return { ok: true, outcome: 'session_memory' };
    }
    if (response.selected === acceptAgents) {
      await this.appendAgentsMd(app, text);
      return { ok: true, outcome: 'agents_md' };
    }
    return { ok: true, outcome: 'rejected' };
  }

  async runSelfReflection(
    app: AppServices,
    buildId: string,
    taskCount: number,
    outcome: string,
    transcriptSummary: string
  ): Promise<void> {
    const settings = this.platform.getSettings();
    if (!settings.selfReflectionEnabled) {
      return;
    }
    if (taskCount < settings.selfReflectionMinBuildTasks) {
      return;
    }

    const model = await this.platform.models.resolveSelectionForSurface('primaryAgent');
    if (!model) {
      return;
    }

    const prompt = [
      'Produce a JSON object for a build self-reflection pass with keys:',
      'friction_points, repeated_patterns, proposed_agents_md_additions,',
      'proposed_skill_additions, proposed_skill_deletions, proposed_hook_additions.',
      'Each value is a string array. Keep entries concise.',
      `Build id: ${buildId}`,
      `Outcome: ${outcome}`,
      `Tasks: ${taskCount}`,
      'Transcript summary:',
      transcriptSummary.slice(0, 12_000),
    ].join('\n');

    try {
      const result = await streamChat(
        model,
        [vscode.LanguageModelChatMessage.User(prompt)],
        new vscode.CancellationTokenSource().token
      );
      const output = parseReflectionOutput(result.text);
      await this.persistReflection(buildId, output, transcriptSummary);
      await this.queueReflectionProposals(app, output);
      this.reflectionSummaries.unshift(
        `[${buildId}] ${outcome} — ${reflectionToProposals(output).length} proposal(s)`
      );
      this.reflectionSummaries = this.reflectionSummaries.slice(0, 10);
    } catch {
      // Non-blocking reflection failure.
    }
  }

  private async appendAgentsMd(app: AppServices, line: string): Promise<void> {
    const root = this.workspaceRoot();
    if (!root) {
      return;
    }
    const target = workspaceAgentsPath(root);
    const existing = await fs.readFile(target, 'utf8').catch(() => '');
    const proposed = `${existing.trim()}\n\n- ${line.trim()}\n`;
    const privacy = scanMemoryText(proposed);
    if (privacy.blocked) {
      void vscode.window.showErrorMessage(t('knowledge.agentsEditBlocked', privacy.pattern ?? ''));
      return;
    }
    const uri = vscode.Uri.file(target);
    await app.diffReview.reviewFullFile(uri, existing, proposed, 'AGENTS.md memory');
    this.agentsCache = undefined;
  }

  private async persistReflection(
    buildId: string,
    output: ReflectionOutput,
    transcriptSummary: string
  ): Promise<void> {
    const root = this.workspaceRoot();
    if (!root) {
      return;
    }
    const dir = path.join(root, COPILOT_PLUS_HOME, 'reflections');
    await fs.mkdir(dir, { recursive: true });
    const body = [
      `# Reflection — ${buildId}`,
      '',
      `Generated: ${new Date().toISOString()}`,
      '',
      '## Transcript summary',
      transcriptSummary.slice(0, 8000),
      '',
      '## Output',
      '```json',
      JSON.stringify(output, null, 2),
      '```',
      '',
    ].join('\n');
    await fs.writeFile(path.join(dir, `${buildId}.md`), body, 'utf8');
  }

  private async queueReflectionProposals(
    app: AppServices,
    output: ReflectionOutput
  ): Promise<void> {
    if (!hasReflectionProposals(output)) {
      return;
    }
    for (const proposal of reflectionToProposals(output)) {
      await app.decisions.ask({
        id: `reflect-${Date.now()}-${proposal.kind}`,
        question: `[Reflection ${proposal.kind}] ${proposal.summary.slice(0, 400)}`,
        options: ['Accept', 'Accept_With_Edit', 'Reject', 'Save_For_Later'],
        defaultOption: 'Save_For_Later',
        timeoutSec: 600,
      });
    }
  }

  private async reloadSessionMemory(): Promise<void> {
    const root = this.workspaceRoot();
    if (!root) {
      this.sessionEntries = [];
      return;
    }
    const file = await loadSessionMemory(root);
    this.sessionEntries = evictSessionMemory(file.entries);
  }

  private async persistSessionMemory(): Promise<void> {
    const root = this.workspaceRoot();
    if (!root) {
      return;
    }
    await saveSessionMemory(root, { entries: this.sessionEntries });
  }

  private workspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private isAgentsDocument(uri: vscode.Uri): boolean {
    const root = this.workspaceRoot();
    if (!root) {
      return false;
    }
    const rel = path.relative(root, uri.fsPath).replace(/\\/g, '/');
    return isAgentsFilePath(rel) || rel === path.basename(uri.fsPath) && uri.fsPath.endsWith('AGENTS.md');
  }
}

async function detectProjectConventions(workspaceRoot: string): Promise<string> {
  const lines = ['# AGENTS.md', '', '## Project conventions (auto-detected)', ''];

  const pkgPath = path.join(workspaceRoot, 'package.json');
  try {
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8')) as {
      scripts?: Record<string, string>;
      packageManager?: string;
    };
    if (pkg.packageManager) {
      lines.push(`- Package manager: ${pkg.packageManager}`);
    }
    if (pkg.scripts?.test) {
      lines.push(`- Test command: \`${pkg.scripts.test}\``);
    }
    if (pkg.scripts?.lint) {
      lines.push(`- Lint command: \`${pkg.scripts.lint}\``);
    }
    if (pkg.scripts?.build) {
      lines.push(`- Build command: \`${pkg.scripts.build}\``);
    }
  } catch {
    // ignore
  }

  for (const marker of ['pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml']) {
    try {
      await fs.access(path.join(workspaceRoot, marker));
      lines.push(`- Detected project marker: ${marker}`);
    } catch {
      // ignore
    }
  }

  lines.push('', '## Notes', '- Update this file as team conventions evolve.');
  return `${lines.join('\n')}\n`;
}

function mergeAgentsContent(existing: string, detected: string): string {
  if (!existing.trim()) {
    return detected;
  }
  return `${existing.trim()}\n\n## Copilot Plus scan additions\n${detected.split('\n').slice(4).join('\n')}`;
}

export { composeAgentsText };
