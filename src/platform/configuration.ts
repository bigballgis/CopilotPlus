/** Configuration reader with validation — R-PLAT-4 */

import * as vscode from 'vscode';
import type { AutonomyLevel, EmbeddingMode } from '../shared/types';

export interface CopilotPlusSettings {
  telemetryEnabled: boolean;
  tabCompletionMode: 'disabled' | 'delegate_to_copilot' | 'own';
  tabCompletionLanguages: string[];
  tabCompletionDelayMs: number;
  tabCompletionTimeoutMs: number;
  nesMode: 'disabled' | 'delegate_to_copilot';
  nesMaxChain: number;
  ragEnabled: boolean;
  embeddingMode: EmbeddingMode;
  respectGitignore: boolean;
  deployMode: 'Manual' | 'Auto';
  cacheEnabled: boolean;
  speculativeEnabled: boolean;
  speculativeMaxConcurrent: number;
  autonomyLevel: AutonomyLevel;
  commandDenyList: string[];
  sensitiveFilePatterns: string[];
  checkpointRetention: number;
  sessionTokenCap: number;
  toolPermissions: Record<string, 'allow' | 'ask' | 'deny'>;
  decisionTimeoutSec: number;
  maxConcurrentTasks: number;
  maxToolCalls: number;
  maxBuildDurationSec: number;
  buildIsolation: 'inline' | 'worktree' | 'worktree_branch';
  worktreeRetentionDays: number;
  defaultModels: Record<string, string>;
  summarizationMode: 'auto' | 'manual' | 'disabled';
  summarizationKeepLastTurns: number;
  staleThresholdDays: number;
  maxLateralDepth: number;
  consistencyCheckBudget: number;
  webSearchEndpoint: string;
  webSearchApiKey: string;
  embeddingAddonUrl: string;
  embeddingAddonSha256: string;
  tierOverride: 'auto' | 's' | 'm' | 'l';
  selfReflectionEnabled: boolean;
  selfReflectionMinBuildTasks: number;
}

const DEFAULTS: CopilotPlusSettings = {
  telemetryEnabled: false,
  tabCompletionMode: 'delegate_to_copilot',
  tabCompletionLanguages: [],
  tabCompletionDelayMs: 75,
  tabCompletionTimeoutMs: 1_500,
  nesMode: 'delegate_to_copilot',
  nesMaxChain: 10,
  ragEnabled: true,
  embeddingMode: 'auto',
  respectGitignore: true,
  deployMode: 'Manual',
  cacheEnabled: true,
  speculativeEnabled: true,
  speculativeMaxConcurrent: 2,
  autonomyLevel: 'Manual',
  commandDenyList: [],
  sensitiveFilePatterns: [],
  checkpointRetention: 50,
  sessionTokenCap: 100_000,
  toolPermissions: {},
  decisionTimeoutSec: 300,
  maxConcurrentTasks: 3,
  maxToolCalls: 200,
  maxBuildDurationSec: 7200,
  buildIsolation: 'inline',
  worktreeRetentionDays: 7,
  defaultModels: {},
  summarizationMode: 'auto',
  summarizationKeepLastTurns: 6,
  staleThresholdDays: 90,
  maxLateralDepth: 4,
  consistencyCheckBudget: 50,
  webSearchEndpoint: '',
  webSearchApiKey: '',
  embeddingAddonUrl: '',
  embeddingAddonSha256: '',
  tierOverride: 'auto',
  selfReflectionEnabled: true,
  selfReflectionMinBuildTasks: 3,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : fallback;
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function asStringArray(value: unknown, maxLen: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((v): v is string => typeof v === 'string').slice(0, maxLen);
}

export class ConfigurationService {
  private readonly invalidKeys = new Set<string>();

  constructor(private readonly invalidSettingHandler?: (key: string, reason: string) => void) {}

  read(): CopilotPlusSettings {
    const cfg = vscode.workspace.getConfiguration('copilotPlus');
    return {
      telemetryEnabled: cfg.get<boolean>('telemetry.enabled', DEFAULTS.telemetryEnabled),
      tabCompletionMode: this.enumValue(
        cfg.get('tabCompletion.mode'),
        ['disabled', 'delegate_to_copilot', 'own'] as const,
        DEFAULTS.tabCompletionMode,
        'tabCompletion.mode'
      ),
      tabCompletionLanguages: asStringArray(cfg.get('tabCompletion.enabledLanguages'), 200),
      tabCompletionDelayMs: clampInt(cfg.get('tabCompletion.triggerDelayMs'), 0, 2000, 75),
      tabCompletionTimeoutMs: clampInt(
        cfg.get('tabCompletion.timeoutMs'),
        500,
        10_000,
        DEFAULTS.tabCompletionTimeoutMs
      ),
      nesMode: this.enumValue(
        cfg.get('nes.mode'),
        ['disabled', 'delegate_to_copilot'] as const,
        DEFAULTS.nesMode,
        'nes.mode'
      ),
      nesMaxChain: clampInt(cfg.get('nes.maxChain'), 1, 50, 10),
      ragEnabled: cfg.get<boolean>('rag.enabled', DEFAULTS.ragEnabled),
      embeddingMode: this.enumValue(
        cfg.get('indexing.embeddingMode'),
        ['proposed_lm', 'local', 'sparse_only', 'auto'] as const,
        DEFAULTS.embeddingMode,
        'indexing.embeddingMode'
      ),
      respectGitignore: cfg.get<boolean>('indexing.respectGitignore', DEFAULTS.respectGitignore),
      deployMode: this.enumValue(
        cfg.get('deploy.mode'),
        ['Manual', 'Auto'] as const,
        DEFAULTS.deployMode,
        'deploy.mode'
      ),
      cacheEnabled: cfg.get<boolean>('cache.enabled', DEFAULTS.cacheEnabled),
      speculativeEnabled: cfg.get<boolean>('speculative.enabled', DEFAULTS.speculativeEnabled),
      speculativeMaxConcurrent: clampInt(cfg.get('speculative.maxConcurrent'), 0, 4, 2),
      autonomyLevel: this.enumValue(
        cfg.get('workflow.autonomyLevel'),
        ['Manual', 'Approve_Edits', 'Approve_Commands', 'Full_Auto'] as const,
        DEFAULTS.autonomyLevel,
        'workflow.autonomyLevel'
      ),
      commandDenyList: asStringArray(cfg.get('workflow.commandDenyList'), 500),
      sensitiveFilePatterns: asStringArray(cfg.get('sensitiveFilePatterns'), 500),
      checkpointRetention: clampInt(cfg.get('checkpoints.retentionCount'), 1, 1000, 50),
      sessionTokenCap: clampInt(cfg.get('session.tokenCap'), 1000, 1_000_000, 100_000),
      toolPermissions: (cfg.get<Record<string, 'allow' | 'ask' | 'deny'>>('tools.permissions') ?? {}),
      decisionTimeoutSec: clampInt(cfg.get('decisions.timeoutSec'), 30, 1800, 300),
      maxConcurrentTasks: clampInt(cfg.get('workflow.maxConcurrentTasks'), 1, 8, 3),
      maxToolCalls: clampInt(cfg.get('workflow.maxToolCalls'), 10, 2000, DEFAULTS.maxToolCalls),
      maxBuildDurationSec: clampInt(
        cfg.get('workflow.maxBuildDuration'),
        60,
        86_400,
        DEFAULTS.maxBuildDurationSec
      ),
      buildIsolation: this.enumValue(
        cfg.get('workflow.buildIsolation'),
        ['inline', 'worktree', 'worktree_branch'] as const,
        DEFAULTS.buildIsolation,
        'workflow.buildIsolation'
      ),
      worktreeRetentionDays: clampInt(
        cfg.get('workflow.worktreeRetentionDays'),
        1,
        90,
        DEFAULTS.worktreeRetentionDays
      ),
      defaultModels: cfg.get<Record<string, string>>('models.defaults') ?? {},
      summarizationMode: this.enumValue(
        cfg.get('context.summarization.mode'),
        ['auto', 'manual', 'disabled'] as const,
        DEFAULTS.summarizationMode,
        'context.summarization.mode'
      ),
      summarizationKeepLastTurns: clampInt(cfg.get('context.summarization.keepLastTurns'), 2, 20, 6),
      staleThresholdDays: clampInt(cfg.get('docs.staleThresholdDays'), 30, 365, 90),
      maxLateralDepth: clampInt(cfg.get('docs.maxLateralDepth'), 4, 8, 4),
      consistencyCheckBudget: clampInt(cfg.get('docs.consistencyCheckBudget'), 10, 500, 50),
      webSearchEndpoint: cfg.get<string>('tools.webSearch.endpoint', '') ?? '',
      webSearchApiKey: cfg.get<string>('tools.webSearch.apiKey', '') ?? '',
      embeddingAddonUrl: cfg.get<string>('indexing.embeddingAddon.url', '') ?? '',
      embeddingAddonSha256: cfg.get<string>('indexing.embeddingAddon.sha256', '') ?? '',
      tierOverride: this.enumValue(
        cfg.get('context.tierOverride'),
        ['auto', 's', 'm', 'l'] as const,
        DEFAULTS.tierOverride,
        'context.tierOverride'
      ),
      selfReflectionEnabled: cfg.get<boolean>(
        'knowledge.selfReflection.enabled',
        DEFAULTS.selfReflectionEnabled
      ),
      selfReflectionMinBuildTasks: clampInt(
        cfg.get('knowledge.selfReflection.minBuildTasks'),
        1,
        50,
        DEFAULTS.selfReflectionMinBuildTasks
      ),
    };
  }

  onDidChange(callback: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('copilotPlus')) {
        callback();
      }
    });
  }

  private enumValue<T extends string>(
    value: unknown,
    allowed: readonly T[],
    fallback: T,
    key: string
  ): T {
    if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
      return value as T;
    }
    if (value !== undefined && !this.invalidKeys.has(key)) {
      this.invalidKeys.add(key);
      this.invalidSettingHandler?.(key, `invalid value ${String(value)}`);
    }
    return fallback;
  }
}

export function matchesCommandDenyList(command: string, patterns: string[]): boolean {
  const lower = command.toLowerCase();
  return patterns.some((pattern) => {
    try {
      const re = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
      return re.test(lower);
    } catch {
      return lower.includes(pattern.toLowerCase());
    }
  });
}
