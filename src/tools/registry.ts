/** Built-in tool registry — R-TOOL-1 */

import type { ToolPermission } from '../shared/types';
import { DEFAULT_TOOL_PERMISSIONS } from '../platform/toolPermissions';

export interface ToolDefinition {
  id: string;
  description: string;
  defaultPermission: ToolPermission;
}

export const BUILTIN_TOOLS: ToolDefinition[] = [
  { id: 'read_file', description: 'Read file contents', defaultPermission: 'allow' },
  { id: 'write_file', description: 'Queue full file write via Diff Review', defaultPermission: 'ask' },
  { id: 'apply_patch', description: 'Apply contextual patch hunks', defaultPermission: 'ask' },
  { id: 'delete_file', description: 'Delete a file with review', defaultPermission: 'ask' },
  { id: 'bash', description: 'Run shell command in workspace root', defaultPermission: 'ask' },
  { id: 'grep', description: 'Ripgrep-style search', defaultPermission: 'allow' },
  { id: 'glob', description: 'Glob file paths', defaultPermission: 'allow' },
  { id: 'list_dir', description: 'List directory tree', defaultPermission: 'allow' },
  { id: 'lsp_diagnostics', description: 'Workspace diagnostics', defaultPermission: 'allow' },
  { id: 'lsp_definition', description: 'Go to definition', defaultPermission: 'allow' },
  { id: 'lsp_references', description: 'Find references', defaultPermission: 'allow' },
  { id: 'lsp_hover', description: 'Hover info', defaultPermission: 'allow' },
  { id: 'lsp_rename', description: 'Rename symbol', defaultPermission: 'ask' },
  { id: 'code_search', description: 'Unified code+doc retrieval', defaultPermission: 'allow' },
  { id: 'doc_read', description: 'Read document tree file', defaultPermission: 'allow' },
  { id: 'doc_write', description: 'Write document tree file', defaultPermission: 'ask' },
  { id: 'doc_link', description: 'Manage document links', defaultPermission: 'ask' },
  { id: 'task_create', description: 'Create build task', defaultPermission: 'ask' },
  { id: 'task_update', description: 'Update build task', defaultPermission: 'ask' },
  { id: 'todowrite', description: 'Write agent todo list', defaultPermission: 'ask' },
  { id: 'todoread', description: 'Read agent todo list', defaultPermission: 'allow' },
  { id: 'checkpoint_restore', description: 'Restore checkpoint', defaultPermission: 'ask' },
  { id: 'git_status', description: 'Git status', defaultPermission: 'allow' },
  { id: 'git_diff', description: 'Git diff', defaultPermission: 'allow' },
  { id: 'git_commit', description: 'Create git commit', defaultPermission: 'ask' },
  { id: 'run_tests', description: 'Run test command', defaultPermission: 'ask' },
  { id: 'webfetch', description: 'Fetch URL content', defaultPermission: 'allow' },
  { id: 'websearch', description: 'Web search', defaultPermission: 'allow' },
  { id: 'question', description: 'Ask user a question', defaultPermission: 'allow' },
  { id: 'propose_memory', description: 'Propose a project convention for AGENTS.md or session memory', defaultPermission: 'allow' },
  { id: 'deploy_apply', description: 'Apply deployment', defaultPermission: 'ask' },
  { id: 'deploy_rollback', description: 'Rollback deployment', defaultPermission: 'ask' },
];

export function getToolIds(): string[] {
  return BUILTIN_TOOLS.map((t) => t.id);
}

export function getDefaultPermission(toolId: string): ToolPermission {
  if (toolId.startsWith('lsp_') && toolId !== 'lsp_rename') {
    return 'allow';
  }
  return DEFAULT_TOOL_PERMISSIONS[toolId] ?? 'ask';
}

export const SUB_AGENT_ALLOWLISTS: Record<string, readonly string[]> = {
  Requirement_Clarifier: ['read_file', 'grep', 'glob', 'list_dir', 'code_search', 'doc_read', 'doc_write', 'doc_link', 'question'],
  Architect: ['read_file', 'write_file', 'apply_patch', 'grep', 'glob', 'list_dir', 'code_search', 'lsp_diagnostics', 'lsp_definition', 'lsp_references', 'doc_read', 'doc_write', 'doc_link', 'question'],
  Designer: ['read_file', 'grep', 'glob', 'list_dir', 'code_search', 'lsp_definition', 'lsp_references', 'doc_read', 'doc_write', 'doc_link', 'question'],
  Task_Planner: ['read_file', 'grep', 'glob', 'list_dir', 'code_search', 'doc_read', 'doc_write', 'doc_link', 'task_create', 'todowrite', 'todoread', 'question'],
  Explorer: ['read_file', 'grep', 'glob', 'list_dir', 'code_search', 'lsp_diagnostics', 'lsp_definition', 'lsp_references', 'lsp_hover', 'doc_read'],
  Background: ['read_file', 'grep', 'glob', 'list_dir', 'code_search', 'lsp_diagnostics', 'lsp_definition', 'lsp_references', 'lsp_hover', 'doc_read', 'git_status', 'git_diff'],
  Coder: ['read_file', 'write_file', 'apply_patch', 'delete_file', 'grep', 'glob', 'list_dir', 'code_search', 'lsp_diagnostics', 'lsp_definition', 'lsp_references', 'lsp_hover', 'lsp_rename', 'doc_read', 'todowrite', 'todoread', 'bash', 'question', 'propose_memory'],
  Tester: ['read_file', 'grep', 'glob', 'list_dir', 'lsp_diagnostics', 'doc_read', 'run_tests', 'bash', 'question', 'propose_memory'],
  Reviewer: ['read_file', 'grep', 'glob', 'list_dir', 'code_search', 'lsp_diagnostics', 'lsp_definition', 'lsp_references', 'lsp_hover', 'doc_read', 'git_diff', 'question', 'propose_memory'],
  Committer: ['read_file', 'git_status', 'git_diff', 'git_commit', 'question', 'propose_memory'],
  Rollback_Operator: ['read_file', 'git_status', 'git_diff', 'checkpoint_restore', 'question'],
  Deployer: ['read_file', 'write_file', 'grep', 'list_dir', 'doc_read', 'bash', 'deploy_apply', 'deploy_rollback', 'question', 'propose_memory'],
};
