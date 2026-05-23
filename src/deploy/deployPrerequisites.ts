/** Deploy target prerequisite checks — R-DEP-5 */

import type { DeployTarget } from './deployService';

export function prerequisiteError(target: DeployTarget, check: 'docker' | 'kubectl' | 'context'): string {
  switch (check) {
    case 'docker':
      return 'Docker CLI is not available. Install Docker and ensure it is on PATH.';
    case 'kubectl':
      return 'kubectl CLI is not available. Install kubectl and ensure it is on PATH.';
    case 'context':
      return 'kubectl current-context is not set. Run kubectl config use-context <name>.';
    default:
      return `Deploy prerequisite failed for ${target}`;
  }
}

export function requiresCli(target: DeployTarget): 'none' | 'docker' | 'kubectl' {
  switch (target) {
    case 'Local':
      return 'none';
    case 'Docker':
      return 'docker';
    case 'Kubernetes':
      return 'kubectl';
  }
}

export interface PrerequisiteResult {
  ok: boolean;
  reason?: string;
}

export function evaluatePrerequisiteExit(
  target: DeployTarget,
  dockerExit: number,
  kubectlExit: number,
  contextExit: number
): PrerequisiteResult {
  const need = requiresCli(target);
  if (need === 'none') {
    return { ok: true };
  }
  if (need === 'docker') {
    return dockerExit === 0
      ? { ok: true }
      : { ok: false, reason: prerequisiteError(target, 'docker') };
  }
  if (kubectlExit !== 0) {
    return { ok: false, reason: prerequisiteError(target, 'kubectl') };
  }
  if (contextExit !== 0) {
    return { ok: false, reason: prerequisiteError(target, 'context') };
  }
  return { ok: true };
}
