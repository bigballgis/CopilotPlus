# Requirements: Built-in Tools

Module ID: `TOOL`

## Introduction

This module defines every built-in tool that Copilot_Plus exposes to Sub_Agents, including each tool's purpose, input schema, output schema, error semantics, concurrency rules, and permission classification. Sub_Agent Tool_Allowlists in `07-agents.md` reference tool identifiers defined here. MCP_Server tools defined in `08-extensibility.md` are merged into Sub_Agent effective tool lists at request time and are subject to the same permission model.

The tool set is deliberately small and focused. Following the OpenCode and Claude Code production patterns, each tool has a narrow contract so the LLM produces fewer malformed calls. **Bash is intentionally segregated from file operations** so file edits go through structured tools that yield reviewable diffs, not opaque shell output.

## Glossary

- **Tool**: A named, schema-typed capability invocable by a Sub_Agent through a single tool-call message.
- **Tool_Permission**: One of `allow`, `ask`, `deny`, governing how Copilot_Plus reacts to a Sub_Agent's request to invoke that tool. See `R-PLAT-10`.
- **Tool_Output**: The structured response delivered to the Sub_Agent after a tool invocation.
- **Patch_Block**: A unified-diff-style block that identifies a target file and one or more `oldString → newString` replacement operations with surrounding context, applied atomically.
- **Todo_Item**: A persistent task entry written by `todowrite`, used by Sub_Agents to track multi-step plans across tool calls.

## Requirements

### R-TOOL-1: Tool Inventory

**User Story:** As a developer, I want a fixed and documented inventory of built-in tools, so that I can predict and audit AI behavior.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL contribute exactly the following built-in Tools, identified by the listed identifier: `read_file`, `write_file`, `apply_patch`, `delete_file`, `bash`, `grep`, `glob`, `list_dir`, `lsp_diagnostics`, `lsp_definition`, `lsp_references`, `lsp_hover`, `lsp_rename`, `code_search`, `doc_read`, `doc_write`, `doc_link`, `task_create`, `task_update`, `todowrite`, `todoread`, `checkpoint_restore`, `git_status`, `git_diff`, `git_commit`, `run_tests`, `webfetch`, `websearch`, `question`, `deploy_apply`, `deploy_rollback`.
2. THE Copilot_Plus SHALL NOT expose any tool not listed in criterion 1, except for tools dynamically injected by registered MCP_Servers per `R-EXT-2`.
3. THE Copilot_Plus SHALL associate every Tool with a default Tool_Permission, listed in criterion 4.
4. THE default Tool_Permission map SHALL be: `read_file`, `grep`, `glob`, `list_dir`, `lsp_*`, `code_search`, `doc_read`, `git_status`, `git_diff`, `todoread`, `webfetch`, `websearch`, `question` = `allow`; `write_file`, `apply_patch`, `delete_file`, `doc_write`, `doc_link`, `task_create`, `task_update`, `todowrite`, `git_commit`, `run_tests`, `lsp_rename`, `checkpoint_restore` = `ask`; `bash`, `deploy_apply`, `deploy_rollback` = `ask`.
5. THE Copilot_Plus SHALL allow the user to override any Tool's Tool_Permission via `copilotPlus.tools.permissions` setting, accepting per-tool values of `allow`, `ask`, `deny`, and accepting wildcard keys (for example `lsp_*`, `mcp_jira_*`).

### R-TOOL-2: File-Reading Tools

**User Story:** As a Sub_Agent, I need narrow file-reading tools, so that I do not abuse `bash` for reading.

#### Acceptance Criteria

1. THE `read_file` Tool SHALL accept inputs `{ path: string, start_line?: integer, end_line?: integer }` and SHALL return `{ content: string, total_lines: integer, truncated: boolean }`.
2. THE `read_file` Tool SHALL truncate the returned `content` to a maximum of 2,000 lines or 200,000 characters, whichever is smaller, and SHALL set `truncated: true` when truncation occurs.
3. THE `grep` Tool SHALL accept inputs `{ pattern: string, path?: string, include?: string, exclude?: string, case_sensitive?: boolean, max_results?: integer }` and SHALL return `{ matches: Array<{ file: string, line: integer, text: string }>, truncated: boolean }`. THE Copilot_Plus SHALL implement `grep` using ripgrep semantics, with a default `max_results` of 100 and a hard cap of 1,000.
4. THE `glob` Tool SHALL accept inputs `{ pattern: string, base?: string, max_results?: integer }` and SHALL return `{ paths: string[], truncated: boolean }`. THE Copilot_Plus SHALL implement `glob` with `**` recursion, default `max_results` of 500, hard cap of 5,000.
5. THE `list_dir` Tool SHALL accept inputs `{ path: string, depth?: integer (1-5, default 1) }` and SHALL return a tree of `{ name, kind: file|directory, size, children? }` entries, capped at 1,000 entries per invocation.
6. THE `read_file`, `grep`, `glob`, and `list_dir` Tools SHALL exclude any path matching a Sensitive_File_Pattern per `R-PLAT-6.3`, omitting the path from results without raising an error.

### R-TOOL-3: File-Writing Tools

**User Story:** As a Sub_Agent, I need structured edit tools that produce reviewable diffs, so that the user can accept or reject my changes per hunk.

#### Acceptance Criteria

1. THE `write_file` Tool SHALL accept inputs `{ path: string, content: string }` and SHALL queue a full-file write through the Diff_Review_UI per `R-EDIT-4`. THE `write_file` Tool SHALL NOT bypass the Diff_Review_UI under any Autonomy_Level except `Full_Auto`, and SHALL always record a Checkpoint per `R-EDIT-5`.
2. THE `apply_patch` Tool SHALL accept inputs `{ path: string, edits: Array<{ oldString: string, newString: string, replaceAll?: boolean }> }` and SHALL apply each edit by locating `oldString` in the file content. IF `oldString` matches zero or more than one location and `replaceAll` is not `true`, THEN THE Tool SHALL return `{ ok: false, reason: 'ambiguous_match' | 'not_found', occurrences: integer }` without modifying the file.
3. THE `apply_patch` Tool SHALL require each `oldString` to be at least 10 characters and to include enough surrounding context to be unique within the file when `replaceAll` is not `true`.
4. THE `apply_patch` Tool SHALL apply all edits in the same invocation as a single atomic write through the Diff_Review_UI, recording one Checkpoint per `R-EDIT-5`.
5. THE `delete_file` Tool SHALL accept inputs `{ path: string }`, SHALL require user approval via Decision_Notification when Tool_Permission is `ask`, and SHALL record a Checkpoint capturing the deleted file's prior content per `R-EDIT-5`.
6. WHEN `write_file`, `apply_patch`, or `delete_file` targets a Sensitive_File, THE Copilot_Plus SHALL refuse the invocation and SHALL return `{ ok: false, reason: 'sensitive_file', pattern: string }`.

### R-TOOL-4: Bash

**User Story:** As a Sub_Agent, I need to run shell commands for tasks file tools cannot handle, with strong guardrails.

#### Acceptance Criteria

1. THE `bash` Tool SHALL accept inputs `{ command: string, cwd?: string, timeout_ms?: integer, env?: Record<string,string> }` and SHALL return `{ stdout: string, stderr: string, exit_code: integer, timed_out: boolean }`.
2. THE `bash` Tool SHALL apply a default timeout of 60,000 milliseconds, configurable via input up to 600,000 milliseconds, and SHALL terminate the command and child processes when the timeout elapses, setting `timed_out: true`.
3. THE `bash` Tool SHALL run commands in a Workspace_Root-scoped shell, using `cmd.exe` on Windows and `/bin/sh` on macOS and Linux unless overridden by the `copilotPlus.tools.bash.shell` setting.
4. THE `bash` Tool SHALL truncate `stdout` and `stderr` to 100,000 characters each and SHALL append a marker indicating truncation when truncation occurs.
5. THE `bash` Tool SHALL evaluate the requested command against the command deny list defined in `R-WF-7.6` before execution and SHALL emit a Decision_Notification when the command matches, regardless of Tool_Permission.
6. THE `bash` Tool SHALL NOT be invoked by the Primary_Agent or by Design-stage Sub_Agents (`Requirement_Clarifier`, `Architect`, `Designer`, `Task_Planner`).

### R-TOOL-5: LSP Tools

**User Story:** As a Sub_Agent, I need to use the editor's language server, so that I can navigate types, references, and diagnostics like a developer would.

#### Acceptance Criteria

1. THE `lsp_diagnostics` Tool SHALL accept inputs `{ paths?: string[] }` and SHALL return the current Host_Editor diagnostics for the requested paths or for the active workspace if `paths` is omitted, in the form `Array<{ file, range, severity, message, source, code }>`. THE Tool SHALL cap returned entries at 500.
2. THE `lsp_definition` Tool SHALL accept inputs `{ path: string, line: integer, character: integer }` and SHALL invoke `vscode.executeDefinitionProvider`, returning the resolved `Array<{ file, range }>`.
3. THE `lsp_references` Tool SHALL accept inputs `{ path: string, line: integer, character: integer }` and SHALL invoke `vscode.executeReferenceProvider`, returning the resolved `Array<{ file, range }>`, capped at 500.
4. THE `lsp_hover` Tool SHALL accept inputs `{ path: string, line: integer, character: integer }` and SHALL invoke `vscode.executeHoverProvider`, returning the resolved hover text concatenated as a single string, truncated to 5,000 characters.
5. THE `lsp_rename` Tool SHALL accept inputs `{ path: string, line: integer, character: integer, newName: string }` and SHALL invoke `vscode.executeDocumentRenameProvider`, routing the resulting workspace edit through the Diff_Review_UI per `R-EDIT-4` and recording a Checkpoint per `R-EDIT-5`.
6. WHEN any LSP Tool is invoked while the relevant language server is not running or no provider is registered for the file, THE Tool SHALL return `{ ok: false, reason: 'no_provider' }` without raising an exception.
7. AFTER any file write through `write_file`, `apply_patch`, `delete_file`, or `lsp_rename`, THE Copilot_Plus SHALL automatically attach the resulting `lsp_diagnostics` for the changed files to the next Sub_Agent input as a structured `post_edit_diagnostics` field.

### R-TOOL-6: Code Search

**User Story:** As a Sub_Agent, I need a single tool that does hybrid retrieval over the codebase, so that I do not have to chain `grep` plus manual ranking.

#### Acceptance Criteria

1. THE `code_search` Tool SHALL accept inputs `{ query: string, scope?: 'workspace' | 'doc:<doc-id>' | 'path:<glob>', thoroughness?: 'quick' | 'medium' | 'thorough' (default 'medium'), top_k?: integer (1-50, default 10) }` and SHALL return `Array<{ path, line, snippet, score, kind: 'code' | 'doc' }>`.
2. THE `code_search` Tool SHALL execute against both the Codebase_Index and the RAG_Index defined in `04-context.md`, fusing results via the hybrid retrieval pipeline defined in `R-CTX-3.5`.
3. WHEN `thoroughness` is `quick`, THE Tool SHALL retrieve the top 30 BM25 candidates only, skipping dense and reranking, with a target latency of under 500 milliseconds. WHEN `thoroughness` is `medium`, THE Tool SHALL run the full BM25 + dense + RRF + reranker pipeline. WHEN `thoroughness` is `thorough`, THE Tool SHALL additionally expand results by following Hierarchical_Links and Lateral_Links from the top-ranked documents per `R-DOCS-5`.
4. WHEN `scope` begins with `doc:`, THE Tool SHALL restrict retrieval to the Document_Tree subtree rooted at the named document. WHEN `scope` begins with `path:`, THE Tool SHALL restrict retrieval to files matching the glob.
5. WHEN `top_k` exceeds the number of available candidates, THE Tool SHALL return all available candidates and SHALL set a `truncated: false` flag in the response.

### R-TOOL-7: Document Tools

**User Story:** As a Sub_Agent, I need typed tools for the Document_Tree, so that I do not corrupt frontmatter or links.

#### Acceptance Criteria

1. THE `doc_read` Tool SHALL accept inputs `{ doc_id: string }` and SHALL return `{ path, frontmatter, content, hierarchical_links: { ancestors, children }, lateral_links }`. IF the doc_id resolves to a document with invalid frontmatter per `R-DOCS-2`, THEN THE Tool SHALL return `{ ok: false, reason: 'invalid_frontmatter', diagnostics: string[] }`.
2. THE `doc_write` Tool SHALL accept inputs `{ doc_id: string, frontmatter: object, body: string }` and SHALL validate the frontmatter against the schema in `R-DOCS-2.1` before writing. IF validation fails, THEN THE Tool SHALL return `{ ok: false, reason: 'frontmatter_invalid', errors: string[] }` without modifying the file.
3. THE `doc_write` Tool SHALL route the resulting file write through the Diff_Review_UI per `R-EDIT-4` and SHALL update parent/child consistency per `R-DOCS-2.5` within 1 second of write.
4. THE `doc_link` Tool SHALL accept inputs `{ source_doc_id: string, target_doc_id: string, link_type: 'references' | 'depends_on' | 'extends' | 'conflicts_with' }` and SHALL add or replace the lateral link in the source document's frontmatter, subject to the depth and count rules defined in `R-DOCS-4`.

### R-TOOL-8: Task Tools

**User Story:** As the Primary_Agent or Task_Planner, I need typed tools to create and update tasks in the DAG.

#### Acceptance Criteria

1. THE `task_create` Tool SHALL accept inputs matching the Task schema in `R-WF-3.1` and SHALL append the new Task to the active Build_Operation's `tasks.json`, validating against `R-WF-3.2` before write. IF validation fails, THEN THE Tool SHALL return `{ ok: false, errors: string[] }` without modifying the file.
2. THE `task_update` Tool SHALL accept inputs `{ task_id: string, status?: TaskStatus, notes?: string }` and SHALL update the named Task. THE Tool SHALL reject any transition not allowed by `R-WF-3` and `R-WF-4`.

### R-TOOL-9: Todo Tools

**User Story:** As a Sub_Agent on a long task, I need a scratchpad to track my own multi-step plan, so that I do not lose state across tool calls.

#### Acceptance Criteria

1. THE `todowrite` Tool SHALL accept inputs `{ items: Array<{ id: string, title: string, status: 'pending' | 'in_progress' | 'done' | 'cancelled' }> }` and SHALL persist the list at `.copilotPlus/builds/<build-id>/<task-id>/todos.json`, replacing any prior list.
2. THE `todoread` Tool SHALL accept inputs `{}` and SHALL return the most recent persisted todo list for the active task, or `{ items: [] }` if none exists.
3. THE Copilot_Plus SHALL display the current todo list for the focused Task in the Task_Panel as a checklist, updating within 1 second of any `todowrite` invocation.
4. THE Copilot_Plus SHALL include the current todo list as a structured `todos` field in every subsequent Sub_Agent input within the same Task.

### R-TOOL-10: Git Tools

**User Story:** As a Sub_Agent, I need narrow git tools, so that the Committer flow is auditable.

#### Acceptance Criteria

1. THE `git_status` Tool SHALL accept inputs `{}` and SHALL return `{ branch: string, ahead: integer, behind: integer, staged: string[], unstaged: string[], untracked: string[], conflicted: string[] }`.
2. THE `git_diff` Tool SHALL accept inputs `{ paths?: string[], staged?: boolean }` and SHALL return the unified diff text, truncated to 200,000 characters.
3. THE `git_commit` Tool SHALL accept inputs `{ message: string, paths?: string[] }` and SHALL stage the named paths (or all currently staged changes if `paths` is omitted) and commit with the provided message. THE Tool SHALL require user approval via Decision_Notification when Tool_Permission is `ask`.
4. WHEN `git_commit` succeeds, THE Copilot_Plus SHALL associate the resulting commit hash with the active Task in the Commit_Panel per `R-INT-7` and SHALL associate it with the most recent Checkpoint that captured the same files.
5. THE Copilot_Plus SHALL NOT contribute any tool that performs `git push`, `git reset --hard`, `git clean -f`, `git rebase`, or branch deletion. Sub_Agents that need such operations SHALL invoke `bash`, subject to the deny list and Tool_Permission rules.

### R-TOOL-11: Test Runner

**User Story:** As the Tester Sub_Agent, I need a test tool that exposes structured failure output, so that the Coder can be fed precise repair signals.

#### Acceptance Criteria

1. THE `run_tests` Tool SHALL accept inputs `{ command?: string, paths?: string[], timeout_ms?: integer }` and SHALL return `{ exit_code, stdout, stderr, parsed?: { passed: integer, failed: integer, failures: Array<{ test, file, line?, message, stack? }> } }`.
2. WHEN the `command` input is omitted, THE Tool SHALL resolve the command from the `copilotPlus.workflow.testCommand` setting, then from the project conventions detected via the AGENTS.md memory defined in `11-knowledge.md`, then from a built-in heuristic (`npm test`, `pnpm test`, `yarn test`, `pytest`, `cargo test`, `go test ./...`).
3. THE Tool SHALL apply a default timeout of 600,000 milliseconds, configurable up to 3,600,000 milliseconds.
4. THE Tool SHALL parse failure output for the most common test runners (Jest, Vitest, Mocha, pytest, Go test, Cargo test) into the `parsed.failures` array. WHEN parsing is not possible, THE `parsed` field SHALL be omitted and the raw output SHALL still be returned.

### R-TOOL-12: Web Tools

**User Story:** As a Sub_Agent, I need bounded web fetch and search, so that I can pull external context with traceable sources.

#### Acceptance Criteria

1. THE `webfetch` Tool SHALL accept inputs `{ url: string, mode?: 'truncated' | 'full', max_chars?: integer }` and SHALL return `{ url, status_code, content, truncated, content_type }`.
2. THE `webfetch` Tool SHALL apply a 15-second timeout and SHALL allow only `https://` URLs. IF the URL scheme is not `https`, THEN THE Tool SHALL return `{ ok: false, reason: 'scheme_not_allowed' }`.
3. THE `webfetch` Tool SHALL truncate `content` to 30,000 characters by default, configurable via `max_chars` up to 200,000.
4. THE `websearch` Tool SHALL accept inputs `{ query: string, max_results?: integer (1-20, default 10) }` and SHALL return `Array<{ title, url, snippet, published?: string }>`. THE Tool SHALL be disabled by default and SHALL be enabled only when the user provides a search-provider configuration in settings.

### R-TOOL-13: Question Tool

**User Story:** As a Sub_Agent, I need a structured way to ask the user a question without breaking my own tool-call schema.

#### Acceptance Criteria

1. THE `question` Tool SHALL accept inputs `{ prompt: string, options: string[] (2 to 5 entries), default?: string, timeout_seconds?: integer }` and SHALL emit a Decision_Notification per `R-INT-10` with the supplied prompt and options.
2. THE Tool SHALL return `{ choice: string, timed_out: boolean }`. IF the user response times out, THEN `choice` SHALL equal `default` if `default` is one of the supplied `options`, otherwise the first option.
3. THE Tool SHALL be the only mechanism by which a Sub_Agent asks the user a question. Sub_Agents SHALL NOT emit Decision_Notifications by any other means.

### R-TOOL-14: Checkpoint Restore Tool

**User Story:** As the Rollback_Operator Sub_Agent, I need a tool to restore checkpoints, so that I can revert AI-generated changes deterministically.

#### Acceptance Criteria

1. THE `checkpoint_restore` Tool SHALL accept inputs `{ checkpoint_id: string }` and SHALL invoke the restore behavior defined in `R-EDIT-5.4`, returning `{ summary: Array<{ file, outcome: 'restored' | 'recreated' | 'failed' }> }`.
2. THE Tool SHALL require user approval via Decision_Notification when Tool_Permission is `ask`.

### R-TOOL-15: Deploy Tools

**User Story:** As the Deployer Sub_Agent, I need narrow tools for applying and rolling back deployments, so that deploy actions are not arbitrary bash.

#### Acceptance Criteria

1. THE `deploy_apply` Tool SHALL accept inputs `{}` and SHALL execute the Auto-mode apply behavior defined in `R-DEP-4.2`. THE Tool SHALL be invocable only when `copilotPlus.deploy.mode` is `Auto`.
2. THE `deploy_rollback` Tool SHALL accept inputs `{ run_id: string }` and SHALL execute the rollback behavior defined in `R-DEP-6` for the named Deploy_Run.
3. Both Tools SHALL return `{ run_id, status, log_path }`.

### R-TOOL-16: Tool System Prompts

**User Story:** As an implementer, I want every Tool to ship a usage prompt, so that the LLM consistently uses the right tool for the right job and does not fall back to `bash` for tasks better-served by structured tools.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL bundle a Tool System Prompt for every built-in Tool listed in `R-TOOL-1.1` at `<extension>/resources/tools/<tool>.md`, containing the following sections: `Purpose`, `When to use`, `When NOT to use`, `Inputs`, `Outputs`, `Errors`, `Examples`.
2. THE Copilot_Plus SHALL include every relevant Tool System Prompt in a Sub_Agent's system instruction at request time, where "relevant" means the Tool is in the Sub_Agent's effective tool list per `R-AG-2.3` and `R-EXT-2.3`.
3. THE Copilot_Plus SHALL allow the user to override any Tool System Prompt by placing a file at `.copilotPlus/tools/<tool>.md`. WHEN such an override exists, THE Copilot_Plus SHALL use the override in place of the bundled prompt.
4. THE Copilot_Plus SHALL cap the combined size of Tool System Prompts included in any single Sub_Agent request at 30,000 characters. IF the cap is exceeded, THEN THE Copilot_Plus SHALL include the prompts for tools that have been used in the current Task first, then the prompts for read-only tools, then the prompts for write tools.
5. WHEN any Tool System Prompt file is created, modified, or deleted, THE Copilot_Plus SHALL apply the change to subsequent Sub_Agent invocations within 2 seconds.
6. THE Copilot_Plus SHALL ensure every Tool System Prompt explicitly states which tasks should fall back to `bash` and which must NOT (for example, `read_file.md` SHALL state that reading files SHALL never use `bash cat`; `grep.md` SHALL state that searching SHALL never use `bash grep` or `bash find`).
