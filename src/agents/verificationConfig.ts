/** Multi-Agent Verification config — R-AG-8 */

import * as vscode from 'vscode';

export const VERIFIABLE_ROLES = ['Architect', 'Designer', 'Reviewer', 'Deployer'] as const;
export type VerifiableRole = (typeof VERIFIABLE_ROLES)[number];

export type VerificationStrategy = 'majority_vote' | 'arbiter' | 'union';

export interface RoleVerificationConfig {
  enabled: boolean;
  candidates: number;
  strategy: VerificationStrategy;
  disagreementMax: number;
}

const ROLE_DEFAULTS: Record<VerifiableRole, RoleVerificationConfig> = {
  Architect: {
    enabled: false,
    candidates: 3,
    strategy: 'majority_vote',
    disagreementMax: 0,
  },
  Designer: {
    enabled: false,
    candidates: 3,
    strategy: 'majority_vote',
    disagreementMax: 0,
  },
  Reviewer: {
    enabled: false,
    candidates: 3,
    strategy: 'majority_vote',
    disagreementMax: 0,
  },
  Deployer: {
    enabled: false,
    candidates: 3,
    strategy: 'majority_vote',
    disagreementMax: 0.6,
  },
};

export function isVerifiableRole(role: string): role is VerifiableRole {
  return (VERIFIABLE_ROLES as readonly string[]).includes(role);
}

export function readRoleVerificationConfig(role: string): RoleVerificationConfig | undefined {
  if (!isVerifiableRole(role)) {
    return undefined;
  }
  const cfg = vscode.workspace.getConfiguration('copilotPlus');
  const block = cfg.get<Partial<RoleVerificationConfig>>(`verification.${role}`, {});
  const defaults = ROLE_DEFAULTS[role];
  return {
    enabled: block.enabled ?? defaults.enabled,
    candidates: clampInt(block.candidates, 1, 5, defaults.candidates),
    strategy: parseStrategy(block.strategy, role, defaults.strategy),
    disagreementMax: clampFloat(block.disagreementMax, 0, 1, defaults.disagreementMax),
  };
}

export function verificationActive(config: RoleVerificationConfig): boolean {
  return config.enabled && config.candidates > 1;
}

function parseStrategy(
  value: unknown,
  role: VerifiableRole,
  fallback: VerificationStrategy
): VerificationStrategy {
  if (value === 'majority_vote' || value === 'arbiter') {
    return value;
  }
  if (value === 'union') {
    return role === 'Architect' || role === 'Designer' ? 'union' : 'majority_vote';
  }
  return fallback;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : fallback;
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function clampFloat(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : fallback;
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}
