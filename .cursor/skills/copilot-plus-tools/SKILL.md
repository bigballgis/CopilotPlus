---
name: copilot-plus-tools
description: >-
  Built-in tool registry for Copilot Plus sub-agents: read/write/edit, bash, grep,
  LSP, code_search, doc_*, git, tests, deploy, question. Use when implementing
  R-TOOL or tool permission resolution R-PLAT-10.
---

# Built-in Tools

## Registry (R-TOOL-1)

Exact identifiers — no ad-hoc tools except MCP injection:

`read_file`, `write_file`, `apply_patch`, `delete_file`, `bash`, `grep`, `glob`, `list_dir`, `lsp_*`, `code_search`, `doc_read`, `doc_write`, `doc_link`, `task_create`, `task_update`, `todowrite`, `todoread`, `checkpoint_restore`, `git_*`, `run_tests`, `webfetch`, `websearch`, `question`, `deploy_apply`, `deploy_rollback`

## Permission defaults (R-TOOL-1.4)

- `allow`: read-only tools, `question`, web fetch/search
- `ask`: writes, git_commit, run_tests, checkpoint_restore
- `ask`: `bash`, deploy_*

Resolution order (R-PLAT-10): user per-tool → wildcard → default → Autonomy_Level bias.

## File writes (R-TOOL-3)

- `write_file` / `apply_patch` → **Diff Review UI** → Checkpoint on Apply.
- `apply_patch`: `oldString` ≥10 chars, unique match unless `replaceAll`.
- Refuse Sensitive_File paths.

## Bash (R-TOOL-4)

- Workspace-root scoped; deny list from R-WF-7.6.
- Not available to Primary or Design-stage agents.

## doc_* tools (R-TOOL-7)

- Validate frontmatter + size caps on `doc_write`.
- Naming collision → Decision_Notification (R-DOCS-7).

## code_search (R-TOOL-6, R-CTX-6)

Unified retrieval: fuse code + doc indexes, Layer_Walk first.

## Implementation

```
src/tools/registry.ts      — definitions + schemas
src/tools/executor.ts      — dispatch + permission gate
src/tools/implementations/ — one file per tool family
```

Return shape: `{ ok: true, ... } | { ok: false, reason: string }`.

## Reference

`.kiro/specs/copilot-plus-extension/requirements/10-tools.md`
