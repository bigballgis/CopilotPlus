# Copilot Plus — Extension Development

## Project

Copilot Plus is a VS Code extension (engine `^1.109.0`) that delivers a Cursor-style agent workflow for **enterprise teams whose only LLM is GitHub Copilot**. All model access goes through `vscode.lm.selectChatModels({ vendor: 'copilot' })`. No alternate providers.

Product thesis: **The user designs. The AI executes.** Five-layer hierarchy (System → Module → Feature → Component → Code) under `.copilotPlus/docs/` is the primary retrieval mechanism; RAG is secondary.

## Requirements source of truth

- Master index: `.kiro/specs/copilot-plus-extension/requirements.md`
- Module specs: `.kiro/specs/copilot-plus-extension/requirements/01-platform.md` … `11-knowledge.md`
- Requirement IDs: `R-<MODULE>-<N>` (e.g. `R-PLAT-2`, `R-DOCS-14`)

## Design & progress (read before coding)

| Doc | Purpose |
|-----|---------|
| `docs/DESIGN.md` | Architecture — HOW to build |
| `docs/IMPLEMENTATION_PLAN.md` | Phased tasks — WHAT order |
| `docs/STATUS.md` | Done vs not done — track progress |

Workflow: **设计** (Kiro R-* + DESIGN) → **开发** → **测试** → **审查** → **提交** (+ update STATUS). See `docs/IMPLEMENTATION_PLAN.md`.

Before implementing a feature, read the relevant module file and cite requirement IDs in PR descriptions.

## Build & run

```bash
npm install
npm run compile
# F5 in VS Code — launch "Extension Development Host"
npm run watch   # during development
npm run package # produces .vsix
```

## Repository layout

```
src/                    Extension host (TypeScript)
  platform/             Activation, settings, telemetry (PLAT)
  interaction/          Webviews, Control Console (INT)
  editing/              Inline edit, diff review, checkpoints (EDIT)
  context/              Mentions, indexes, RAG, budget (CTX)
  docs/                 Document tree, layer walk, drift (DOCS)
  workflow/             Design / Build / Deploy (WF)
  agents/               Primary + sub-agents (AG)
  extensibility/        Skills, MCP, hooks (EXT)
  deployment/           Deploy targets (DEP)
  tools/                Built-in tool registry (TOOL)
  knowledge/            AGENTS.md, session memory (KNOW)
resources/agents/       Bundled default agent prompts
webview-ui/             React/Vite webviews (Conversation + Tab Workspace)
.copilotPlus/           Runtime workspace artifacts (gitignored subsets)
```

## Coding conventions

- TypeScript strict mode; no `any` unless interfacing with untyped VS Code proposals.
- User-facing strings via `vscode.l10n.t()` — no hard-coded UI copy in host or webview.
- Async: prefer `async/await`; dispose subscriptions in `ExtensionContext`.
- Webviews: use `postMessage` protocol with typed message unions in `src/shared/protocol.ts`.
- Tools: structured I/O per `10-tools.md`; never bypass Diff Review except `Full_Auto` autonomy.
- Tests: `@vscode/test-cli` for integration; unit tests colocated as `*.test.ts`.

## Implementation order (recommended)

1. **M0 Platform** — activation, settings, Copilot auth, version gate (`R-PLAT-1`, `R-PLAT-2`)
2. **M1 Shell UI** — Control Console + workspace split webviews (`R-INT-1` … `R-INT-9`)
3. **M2 Docs tree** — frontmatter schema, CRUD, layer walk (`R-DOCS-1` … `R-DOCS-14`)
4. **M3 Tools + agents** — tool registry, Primary Agent loop (`R-TOOL-*`, `R-AG-*`)
5. **M4 Workflow** — Design/Build/Deploy stages, task DAG (`R-WF-*`)
6. **M5 Context** — codebase index, RAG, mentions (`R-CTX-*`)
7. **M6 Editing** — inline edit, diff review, checkpoints (`R-EDIT-*`)
8. **M7 Extensibility** — skills, MCP, hooks (`R-EXT-*`)
9. **M8 Deploy + polish** — deployment, telemetry, a11y, i18n (`R-DEP-*`, `R-PLAT-7` … `R-PLAT-9`)

## Cursor skills for this repo

Load project skills from `.cursor/skills/` when working on a module:

| Skill | Use when |
|-------|----------|
| `copilot-plus-overview` | Starting any task; orientation |
| `implement-from-kiro-spec` | Mapping requirements → code |
| `vscode-lm-api` | Model calls, embeddings |
| `copilot-plus-webview` | Conversation Pane, Tab Workspace |
| `copilot-plus-document-tree` | `.copilotPlus/docs/` hierarchy |
| `copilot-plus-agents` | Agent roster, delegation |
| `copilot-plus-tools` | Built-in tool implementations |
| `copilot-plus-context-rag` | Indexing, retrieval, budget |
| `copilot-plus-workflow` | Stages, task DAG |
| `copilot-plus-extensibility` | Skills/MCP/hooks runtime |
| `copilot-plus-testing` | Extension tests |

## Do not

- Add OpenAI/Anthropic/Ollama API keys or non-Copilot model pickers.
- Send sensitive files (`.env`, keys) to models — honor `R-PLAT-6`.
- Skip Diff Review for file writes unless autonomy is `Full_Auto`.
- Duplicate Document_Tree content inside AGENTS.md (KNOW vs DOCS separation).
