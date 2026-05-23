/** Tool permission resolution — R-PLAT-10, R-TOOL-1.4 */

import type { AutonomyLevel, ToolPermission } from '../shared/types';

export const DEFAULT_TOOL_PERMISSIONS: Readonly<Record<string, ToolPermission>> = {
  read_file: 'allow',
  grep: 'allow',
  glob: 'allow',
  list_dir: 'allow',
  code_search: 'allow',
  doc_read: 'allow',
  git_status: 'allow',
  git_diff: 'allow',
  todoread: 'allow',
  webfetch: 'allow',
  websearch: 'allow',
  question: 'allow',
  propose_memory: 'allow',
  write_file: 'ask',
  apply_patch: 'ask',
  delete_file: 'ask',
  doc_write: 'ask',
  doc_link: 'ask',
  task_create: 'ask',
  task_update: 'ask',
  todowrite: 'ask',
  git_commit: 'ask',
  run_tests: 'ask',
  lsp_rename: 'ask',
  checkpoint_restore: 'ask',
  bash: 'ask',
  deploy_apply: 'ask',
  deploy_rollback: 'ask',
};

const READ_ONLY_TOOLS = new Set([
  'read_file',
  'grep',
  'glob',
  'list_dir',
  'code_search',
  'doc_read',
  'git_status',
  'git_diff',
  'todoread',
  'webfetch',
  'websearch',
]);

const WRITE_TOOLS = new Set([
  'write_file',
  'apply_patch',
  'delete_file',
  'doc_write',
  'doc_link',
  'task_create',
  'task_update',
  'todowrite',
  'lsp_rename',
]);

const ALWAYS_ASK_TOOLS = new Set(['bash', 'deploy_apply', 'deploy_rollback']);

function matchesWildcard(toolId: string, pattern: string): boolean {
  if (pattern === toolId) {
    return true;
  }
  if (pattern.endsWith('*')) {
    return toolId.startsWith(pattern.slice(0, -1));
  }
  return false;
}

function resolveLspPermission(toolId: string): ToolPermission | undefined {
  if (toolId.startsWith('lsp_')) {
    return DEFAULT_TOOL_PERMISSIONS['lsp_rename'] === 'ask' && toolId === 'lsp_rename'
      ? 'ask'
      : 'allow';
  }
  return undefined;
}

export interface PermissionResolution {
  effective: ToolPermission;
  source: 'user' | 'wildcard' | 'default' | 'autonomy';
}

export function resolveToolPermission(
  toolId: string,
  userPermissions: Record<string, ToolPermission>,
  autonomyLevel: AutonomyLevel,
  commandMatchesDenyList: boolean
): PermissionResolution {
  if (userPermissions[toolId]) {
    return applyAutonomyBias(toolId, userPermissions[toolId], autonomyLevel, commandMatchesDenyList, 'user');
  }

  for (const [pattern, permission] of Object.entries(userPermissions)) {
    if (matchesWildcard(toolId, pattern)) {
      return applyAutonomyBias(toolId, permission, autonomyLevel, commandMatchesDenyList, 'wildcard');
    }
  }

  const lsp = resolveLspPermission(toolId);
  const base = lsp ?? DEFAULT_TOOL_PERMISSIONS[toolId] ?? 'ask';
  return applyAutonomyBias(toolId, base, autonomyLevel, commandMatchesDenyList, 'default');
}

function applyAutonomyBias(
  toolId: string,
  permission: ToolPermission,
  autonomyLevel: AutonomyLevel,
  commandMatchesDenyList: boolean,
  source: PermissionResolution['source']
): PermissionResolution {
  if (permission === 'deny') {
    return { effective: 'deny', source };
  }

  if (ALWAYS_ASK_TOOLS.has(toolId) || commandMatchesDenyList) {
    return { effective: 'ask', source };
  }

  if (permission === 'allow') {
    return { effective: 'allow', source };
  }

  let upgraded: ToolPermission = permission;

  if (autonomyLevel === 'Approve_Edits' && READ_ONLY_TOOLS.has(toolId)) {
    upgraded = 'allow';
  } else if (autonomyLevel === 'Approve_Commands' && (READ_ONLY_TOOLS.has(toolId) || WRITE_TOOLS.has(toolId))) {
    upgraded = 'allow';
  } else if (autonomyLevel === 'Full_Auto' && !ALWAYS_ASK_TOOLS.has(toolId)) {
    upgraded = 'allow';
  }

  return {
    effective: upgraded,
    source: upgraded !== permission ? 'autonomy' : source,
  };
}

export function isToolVisible(effective: ToolPermission): boolean {
  return effective !== 'deny';
}
