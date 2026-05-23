/** CI build-config parsing — R-DEP-7 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { parseDecisionResolverConfig, type DecisionResolverConfig } from './decisionResolver';

export const CI_ALLOWED_AGENTS = new Set(['Coder', 'Tester', 'Committer', 'Deployer']);
export const CI_PIPELINE = ['Coder', 'Tester', 'Committer'] as const;

export interface BuildConfig {
  buildId: string;
  decisions: DecisionResolverConfig;
  maxBuildDurationSec: number;
  maxToolCalls: number;
  configPath: string;
}

export interface BuildConfigError {
  reason: string;
}

export async function loadBuildConfig(configPath: string): Promise<{ ok: true; config: BuildConfig } | { ok: false; error: BuildConfigError }> {
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(configPath, 'utf8'));
  } catch (err) {
    return {
      ok: false,
      error: { reason: err instanceof Error ? err.message : 'invalid_config_file' },
    };
  }

  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: { reason: 'config_must_be_object' } };
  }

  const obj = raw as Record<string, unknown>;
  const buildId = typeof obj.buildId === 'string' ? obj.buildId.trim() : '';
  if (!buildId) {
    return { ok: false, error: { reason: 'missing_buildId' } };
  }

  const decisions = parseDecisionResolverConfig(obj.decisions);
  const maxBuildDurationSec =
    typeof obj.maxBuildDurationSec === 'number' && obj.maxBuildDurationSec > 0
      ? Math.min(86_400, Math.trunc(obj.maxBuildDurationSec))
      : 3600;
  const maxToolCalls =
    typeof obj.maxToolCalls === 'number' && obj.maxToolCalls > 0
      ? Math.min(500, Math.trunc(obj.maxToolCalls))
      : 80;

  return {
    ok: true,
    config: {
      buildId,
      decisions,
      maxBuildDurationSec,
      maxToolCalls,
      configPath: path.resolve(configPath),
    },
  };
}

export function validateTaskAgents(agents: string[]): string | undefined {
  for (const agent of agents) {
    if (!CI_ALLOWED_AGENTS.has(agent)) {
      return `Task agent "${agent}" is not supported in CI mode. Allowed: Coder, Tester, Committer, Deployer.`;
    }
  }
  return undefined;
}
