/** Multi-Agent Verification orchestration — R-AG-8 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { AppServices } from '../app/appServices';
import { loadAgentPrompt } from './promptLoader';
import { streamChat } from '../platform/chatClient';
import {
  jitterTemperature,
  selectVerificationOutput,
  type VerificationCandidate,
} from './multiAgentVerification';
import {
  isVerifiableRole,
  readRoleVerificationConfig,
  verificationActive,
  type VerificationStrategy,
} from './verificationConfig';
import type { SubAgentRunResult } from './subAgentRunner';
import { TaskDagStore } from '../workflow/taskDagStore';
import { t } from '../platform/l10n';

export type CandidateRunner = (
  temperature: number,
  candidateIndex: number
) => Promise<SubAgentRunResult>;

export interface VerificationAuditRecord {
  role: string;
  buildId: string;
  taskId: string;
  strategy: VerificationStrategy;
  candidates: VerificationCandidate[];
  selectedIndex: number;
  rationale: string;
  selectedText: string;
  escalated: boolean;
  ts: string;
}

export class MultiAgentVerificationService {
  private readonly store = new TaskDagStore();

  constructor(
    private readonly app: AppServices,
    private readonly extensionUri: vscode.Uri
  ) {}

  async runIfEnabled(
    role: string,
    buildId: string,
    taskId: string,
    token: vscode.CancellationToken,
    onStatus: ((message: string) => void) | undefined,
    runCandidate: CandidateRunner
  ): Promise<SubAgentRunResult> {
    const config = readRoleVerificationConfig(role);
    if (!config || !verificationActive(config)) {
      return runCandidate(0, 0);
    }
    if (await this.isDisabledForBuild(buildId)) {
      return runCandidate(0, 0);
    }

    onStatus?.(t('verification.running', role, config.candidates));
    const candidates: VerificationCandidate[] = [];

    await Promise.all(
      Array.from({ length: config.candidates }, (_, index) =>
        (async () => {
          const temperature = jitterTemperature();
          const result = await runCandidate(temperature, index);
          candidates[index] = {
            index,
            text: result.finalAnswer,
            ok: result.ok,
            reason: result.reason,
          };
        })()
      )
    );

    let selection = selectVerificationOutput(candidates, config.strategy, config.disagreementMax);

    if (
      !selection.escalate &&
      selection.rationale.includes('Arbiter selection deferred') &&
      config.strategy === 'arbiter'
    ) {
      const arbiter = await this.runArbiter(role, candidates, token);
      if (arbiter) {
        selection = {
          ...selection,
          selectedIndex: arbiter.index,
          selectedText: arbiter.text,
          rationale: arbiter.rationale,
        };
      } else {
        selection = {
          ...selection,
          escalate: true,
          escalationReason: 'arbiter_failed',
        };
      }
    }

    if (selection.escalate) {
      const picked = await this.escalateToUser(role, candidates, selection.escalationReason ?? 'disagreement');
      if (picked === 'Skip') {
        await this.persistAudit(role, buildId, taskId, config.strategy, candidates, selection, true);
        return { ok: true, finalAnswer: t('verification.skipped', role), failed: false };
      }
      if (picked === 'Ask_For_Revision') {
        await this.persistAudit(role, buildId, taskId, config.strategy, candidates, selection, true);
        return {
          ok: false,
          finalAnswer: '',
          failed: true,
          reason: 'verification_revision_requested',
        };
      }
      const match = /^Pick_Candidate_(\d+)$/.exec(picked);
      if (match) {
        const idx = Number(match[1]) - 1;
        const candidate = candidates.find((c) => c.index === idx && c.ok);
        if (candidate) {
          selection = {
            selectedIndex: candidate.index,
            selectedText: candidate.text,
            strategy: config.strategy,
            rationale: `User selected candidate ${idx + 1}.`,
            escalate: false,
          };
        }
      }
    }

    await this.persistAudit(role, buildId, taskId, config.strategy, candidates, selection, selection.escalate);
    onStatus?.(t('verification.complete', role, selection.rationale));

    if (!selection.selectedText.trim()) {
      return { ok: false, finalAnswer: '', failed: true, reason: 'verification_unresolved' };
    }

    return {
      ok: true,
      finalAnswer: selection.selectedText,
      failed: false,
    };
  }

  private async isDisabledForBuild(buildId: string): Promise<boolean> {
    if (buildId === 'design-session' || buildId.startsWith('deploy-')) {
      return false;
    }
    const manifest = await this.store.loadManifest(buildId);
    return manifest?.verificationDisable === true;
  }

  private async runArbiter(
    role: string,
    candidates: VerificationCandidate[],
    token: vscode.CancellationToken
  ): Promise<{ index: number; text: string; rationale: string } | undefined> {
    const successful = candidates.filter((c) => c.ok && c.text.trim());
    if (successful.length === 0) {
      return undefined;
    }

    const model = await this.app.platform.models.resolveSelectionForSurface('subAgent');
    if (!model) {
      return undefined;
    }

    const system = await loadAgentPrompt(this.extensionUri, 'arbiter');
    const body = successful
      .map((c, i) => `### Candidate ${i}\n${c.text}`)
      .join('\n\n');
    const user = `Role: ${role}\n\n${body}\n\nReturn JSON with selectedIndex and rationale.`;
    const messages = [
      vscode.LanguageModelChatMessage.System(system),
      vscode.LanguageModelChatMessage.User(user),
    ];

    try {
      const result = await streamChat(model, messages, token);
      const parsed = parseArbiterJson(result.text);
      if (!parsed) {
        return undefined;
      }
      const chosen = successful[parsed.selectedIndex] ?? successful[0];
      return {
        index: chosen.index,
        text: chosen.text,
        rationale: parsed.rationale,
      };
    } catch {
      return undefined;
    }
  }

  private async escalateToUser(
    role: string,
    candidates: VerificationCandidate[],
    reason: string
  ): Promise<string> {
    const preview = candidates
      .map((c, i) => `[${i + 1}] ${c.ok ? c.text.slice(0, 400) : `(failed: ${c.reason ?? 'error'})`}`)
      .join('\n\n');
    const options = candidates.map((_, i) => `Pick_Candidate_${i + 1}`);
    options.push('Ask_For_Revision', 'Skip');
    const response = await this.app.decisions.ask({
      id: `verify-${role}-${Date.now()}`,
      question: t('verification.escalation', role, reason, preview.slice(0, 1200)),
      options,
      defaultOption: 'Ask_For_Revision',
      timeoutSec: this.app.platform.getSettings().decisionTimeoutSec,
    });
    return response.selected;
  }

  private async persistAudit(
    role: string,
    buildId: string,
    taskId: string,
    strategy: VerificationStrategy,
    candidates: VerificationCandidate[],
    selection: ReturnType<typeof selectVerificationOutput>,
    escalated: boolean
  ): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      return;
    }
    const record: VerificationAuditRecord = {
      role,
      buildId,
      taskId,
      strategy,
      candidates,
      selectedIndex: selection.selectedIndex,
      rationale: selection.rationale,
      selectedText: selection.selectedText,
      escalated,
      ts: new Date().toISOString(),
    };
    const dir = path.join(root, '.copilotPlus', 'builds', buildId, 'verification');
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${taskId}.jsonl`);
    await fs.appendFile(file, JSON.stringify(record) + '\n', 'utf8');
  }
}

function parseArbiterJson(text: string): { selectedIndex: number; rationale: string } | undefined {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  try {
    const data = JSON.parse(raw.trim()) as { selectedIndex?: number; rationale?: string };
    if (typeof data.selectedIndex !== 'number') {
      return undefined;
    }
    return {
      selectedIndex: Math.max(0, Math.trunc(data.selectedIndex)),
      rationale: data.rationale ?? 'Arbiter selection',
    };
  } catch {
    return undefined;
  }
}
