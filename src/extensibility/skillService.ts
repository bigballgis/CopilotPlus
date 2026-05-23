/** Project Skills loader — R-EXT-1 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { COPILOT_PLUS_HOME } from '../shared/constants';
import {
  composeSkillFile,
  parseSkillFile,
  skillMatchesScope,
  type SkillFrontmatter,
} from './skillFrontmatter';

export interface SkillEntry {
  id: string;
  title: string;
  scope: string;
  auto_attach: boolean;
  relativePath: string;
  body: string;
  valid: boolean;
  errors: string[];
  enabled: boolean;
}

const DISABLED_KEY = 'copilotPlus.skills.disabled';

export class SkillService {
  private skills: SkillEntry[] = [];
  private disabled = new Set<string>();
  private watcher: vscode.FileSystemWatcher | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async initialize(): Promise<void> {
    this.disabled = new Set(this.context.workspaceState.get<string[]>(DISABLED_KEY) ?? []);
    await this.reload();
    const root = vscode.workspace.workspaceFolders?.[0];
    if (!root) {
      return;
    }
    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(path.join(root.uri.fsPath, COPILOT_PLUS_HOME, 'skills')),
      '**/skill.md'
    );
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const refresh = () => void this.reload();
    this.watcher.onDidCreate(refresh);
    this.watcher.onDidChange(refresh);
    this.watcher.onDidDelete(refresh);
    this.context.subscriptions.push(this.watcher);
  }

  getSkills(): SkillEntry[] {
    return [...this.skills];
  }

  getById(id: string): SkillEntry | undefined {
    return this.skills.find((s) => s.id === id && s.valid && s.enabled);
  }

  getAutoAttached(scopeDocPath?: string, docId?: string): SkillEntry[] {
    return this.skills.filter((s) => {
      if (!s.valid || !s.enabled || !s.auto_attach) {
        return false;
      }
      return skillMatchesScope(s.scope, scopeDocPath, docId);
    });
  }

  resolveAttached(skillIds: string[]): SkillEntry[] {
    const out: SkillEntry[] = [];
    for (const id of skillIds) {
      const skill = this.getById(id);
      if (skill) {
        out.push(skill);
      }
    }
    return out;
  }

  formatInstructions(skills: SkillEntry[]): string {
    if (!skills.length) {
      return '';
    }
    return skills
      .map((s) => `## Skill: ${s.title} (${s.id})\n${s.body.trim()}`)
      .join('\n\n');
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    if (enabled) {
      this.disabled.delete(id);
    } else {
      this.disabled.add(id);
    }
    await this.context.workspaceState.update(DISABLED_KEY, [...this.disabled]);
    await this.reload();
  }

  async createSkill(id: string, title: string, scope: string): Promise<string> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      throw new Error('No workspace folder.');
    }
    const fm: SkillFrontmatter = {
      id,
      title,
      scope,
      auto_attach: false,
      triggers: [],
      tool_allowlist: [],
    };
    const body = `\n# ${title}\n\nDescribe constraints and instructions for the AI.\n`;
    const content = composeSkillFile(fm, body);
    const rel = path.posix.join(COPILOT_PLUS_HOME, 'skills', id, 'skill.md');
    const abs = path.join(root, rel.replace(/\//g, path.sep));
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf8');
    await this.reload();
    return rel;
  }

  async reload(): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      this.skills = [];
      return;
    }
    const skillsRoot = path.join(root, COPILOT_PLUS_HOME, 'skills');
    const entries: SkillEntry[] = [];
    await this.walkSkills(skillsRoot, async (abs, id) => {
      const content = await fs.readFile(abs, 'utf8');
      const parsed = parseSkillFile(content);
      const fm = parsed.frontmatter;
      entries.push({
        id: fm?.id ?? id,
        title: fm?.title ?? id,
        scope: fm?.scope ?? 'workspace',
        auto_attach: fm?.auto_attach ?? false,
        relativePath: path.posix.join(COPILOT_PLUS_HOME, 'skills', id, 'skill.md'),
        body: parsed.body,
        valid: parsed.errors.length === 0 && !!fm,
        errors: parsed.errors,
        enabled: !this.disabled.has(fm?.id ?? id),
      });
    });
    this.skills = entries.slice(0, 200);
  }

  private async walkSkills(dir: string, fn: (abs: string, id: string) => Promise<void>): Promise<void> {
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const abs = path.join(dir, name);
      const stat = await fs.stat(abs);
      if (!stat.isDirectory()) {
        continue;
      }
      const skillFile = path.join(abs, 'skill.md');
      try {
        await fs.access(skillFile);
        await fn(skillFile, name);
      } catch {
        /* skip */
      }
    }
  }
}
