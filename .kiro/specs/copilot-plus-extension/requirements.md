# Requirements Document

## Introduction

Copilot Plus is a Visual Studio Code extension that delivers a Cursor-style, agent-driven AI coding experience for **enterprise teams whose only available LLM access is the GitHub Copilot subscription**. The extension targets VS Code 1.109.5 and consumes GitHub Copilot models exclusively through the official VS Code Language Model API (`vscode.lm`). No alternative model provider is supported.

The product philosophy is:

> **The user designs. The AI executes. Maximum AI autonomy within bounded, observable, reversible control.**

To realize that philosophy, the extension provides:

- A three-stage opinionated development workflow (**Design → Build → Deploy**) anchored in a four-level hierarchical document tree (**System → Module → Feature → Component**) stored under `.copilotPlus/`.
- A unified workspace UI: a left **Conversation Pane** used only during the Design stage, a right **Tab Workspace** with Task / Architecture / Requirement / Commit / Deploy panels, a left **Activity Bar Control Console**, and Notification-driven decisions during execution.
- A primary agent that orchestrates a roster of pre-defined sub-agents bound to workflow stages and steps. The user does not author agent topology.
- Inline Edit (Cmd+K), persistent Chat, Composer multi-file edits, multi-line Tab Completion, per-hunk Diff Review, and Checkpoint-based rollback.
- Hybrid retrieval over the four-level document tree and the codebase (BM25 + dense embedding + cross-encoder reranker + Reciprocal Rank Fusion).
- Extensibility through **Skills** (project-scoped constraints, slash-invoked), **MCP servers** (dynamic tool injection), and **Hooks** (lifecycle event handlers).
- Privacy-first defaults, telemetry that excludes content, and accessibility/i18n via `vscode.l10n`.

## Core Design Thesis: Hierarchical Software, Not Flat Codebase

This product takes a deliberate stance against the dominant industry approach of "longer context windows make AI smarter." That approach treats the codebase as a flat sea of tokens that the model must dredge through. Copilot_Plus rejects that view.

**The thesis: software has five intrinsic layers, and AI works best when it operates on the layer appropriate to the task, not on the flat code.**

The five layers, from most abstract to most concrete:

1. **System** — the business as a whole, its boundaries, external actors, top-level goals.
2. **Module** — bounded subsystems with clear responsibilities and contracts.
3. **Feature** — discrete user-facing or system-facing capabilities offered by modules.
4. **Component** — implementation strategies that realize features (services, classes, pipelines, data flows).
5. **Code** — the source files that materialize components.

Layers 1-4 are markdown documents under `.copilotPlus/docs/`. Layer 5 is the working source tree. **All five layers are first-class artifacts. None is a comment on another.** The four upper layers are not "documentation about code" — they are the same software entity expressed at different levels of abstraction. Code is one of five expressions, not the privileged one.

### Operating principles that follow from the thesis

- **Bug-fixing is design**. Even a one-line bug fix begins by resolving which Component is involved, why its current code diverged from the Component's stated responsibility, and whether the fix should change the Component's stated responsibility (a documented design choice) or just its code (a localized correction). The user does not have to perform this resolution; the AI does, and surfaces it.
- **AI walks down, not across**. When the AI reasons about a task, it traverses System → Module → Feature → Component → Code, narrowing scope by structure rather than by raw context similarity. This is the dominant retrieval mechanism in this product. RAG and embedding similarity are secondary refinements, not primary mechanisms.
- **AI maintains the layers, not the user**. The user converses with the AI in the Conversation_Pane during the Design stage. The AI authors and maintains every layer above code. The user reviews diffs in the Diff_Review_UI. The user is never asked to write a Module_Doc or Component_Doc by hand.
- **Layer consistency is enforced by the AI, not by convention**. When code changes diverge from the Component_Doc that owns it, the AI detects the drift, prompts the user, and proposes either a code amendment to match the doc or a doc amendment to match the code. Inconsistency is treated as a defect at the same severity as a compile error.
- **Long context is a fallback, not the strategy**. The product targets `Tier_S` Copilot models (under 100,000 token context) as the primary scenario. Larger context tiers (`Tier_M`, `Tier_L`) are exploited when available per `R-CTX-8`, but the product MUST work well at `Tier_S`. The five-layer structure is what makes that possible.
- **Structure compounds**. As a project grows, the codebase gets more chaotic but the layered structure stays readable, because the layers are kept compact (per `R-DOCS-8`) and pruned (per `R-DOCS-9`). Over time, the upper layers become the most valuable artifact in the repository — they are the navigable mental model of the system.

### Why this thesis matters now

For thirty years, "the code is the truth, documentation is decoration that goes stale" has been a load-bearing belief in software engineering. That belief is rational when the only reader is a human who pays the cost of writing and updating docs.

In an AI-augmented era, that belief is wrong. The AI is now the dominant reader of code. The AI does not pay the human cost of authoring docs because it authors them itself. What the AI gains in return is the ability to operate at the right level of abstraction for the task — which translates directly into fewer hallucinations, smaller prompts, more accurate edits, and lower token cost per useful action.

This thesis is the deliberate design choice of Copilot_Plus and informs every requirement that follows.

## Glossary

These terms are used across multiple module files. Module-specific terms are defined in their respective files.

- **Copilot_Plus**: The VS Code extension defined by this specification.
- **Host_Editor**: The Visual Studio Code instance (1.109.5 or later) in which Copilot_Plus runs.
- **Language_Model_API**: The `vscode.lm` API surface exposed by Host_Editor, including `vscode.lm.selectChatModels` and `LanguageModelChat.sendRequest`.
- **Copilot_Model**: A chat-capable model returned by `vscode.lm.selectChatModels({ vendor: 'copilot' })`.
- **Copilot_Entitlement**: The active GitHub Copilot subscription state of the signed-in GitHub account in Host_Editor.
- **Workspace**: The set of folders opened in Host_Editor as reported by `vscode.workspace.workspaceFolders`.
- **Workspace_Root**: The first folder reported by `vscode.workspace.workspaceFolders`. The `.copilotPlus/` directory is anchored at Workspace_Root.
- **Copilot_Plus_Home**: The `.copilotPlus/` directory at Workspace_Root, the canonical location for all Copilot_Plus-managed artifacts (documents, configuration, indexes, checkpoints, transcripts).
- **Conversation_Pane**: The left-side conversation surface in the main editor area, used during the Design stage only (see `02-interaction.md`).
- **Tab_Workspace**: The right-side multi-tab area hosting Task, Architecture, Requirement, Commit, and Deploy panels (see `02-interaction.md`).
- **Control_Console**: The left activity bar view that hosts configuration for Skills, Agents, MCP servers, Hooks, and other settings (see `02-interaction.md`).
- **Document_Tree**: The four-level hierarchical document structure (System → Module → Feature → Component) stored under `.copilotPlus/docs/`, layers 1-4 of the Five_Layer_Hierarchy (see `05-docs.md`).
- **Five_Layer_Hierarchy**: The full layered representation of the software, comprising System, Module, Feature, Component (markdown documents under `.copilotPlus/docs/`), and Code (source files in the workspace). All five layers are first-class artifacts and mutually consistent (see `05-docs.md`, the Core Design Thesis above).
- **Layer**: One of the five layers in the Five_Layer_Hierarchy: `system`, `module`, `feature`, `component`, `code`.
- **Code_Layer**: The fifth and lowest layer of the Five_Layer_Hierarchy, comprising the actual source files in the workspace. Tracked by association from Component_Docs via `code_paths` frontmatter (see `R-DOCS-11`).
- **Layer_Consistency**: The property that every Component_Doc accurately describes the responsibility, contract, and implementation strategy of the source files associated with it, and that every Module_Doc accurately summarizes its child Feature_Docs and Component_Docs. Enforced by the AI per `R-DOCS-12`.
- **Drift**: A divergence between layers, where code no longer matches its Component_Doc, or a Component_Doc no longer matches its parent Feature_Doc, or any other inter-layer inconsistency. Detected by the AI and surfaced for resolution per `R-DOCS-13`.
- **Primary_Agent**: The single top-level agent that orchestrates user goals and delegates to sub-agents (see `07-agents.md`).
- **Sub_Agent**: A pre-defined specialist agent bound to a specific workflow step (see `07-agents.md`).
- **Workflow_Stage**: One of `Design`, `Build`, `Deploy` (see `06-workflow.md`).
- **Task_Panel**: The Tab_Workspace panel that drives all Build-stage operations (see `02-interaction.md`, `06-workflow.md`).
- **Skill**: A project-scoped constraint or instruction bundle invocable via `/skill-name` (see `08-extensibility.md`).
- **MCP_Server**: A Model Context Protocol server registered with Copilot_Plus that contributes tools to agents (see `08-extensibility.md`).
- **Hook**: A user-configured handler that runs on a defined lifecycle event (see `08-extensibility.md`).
- **Checkpoint**: A snapshot of all files modified by a single Copilot_Plus operation (see `03-editing.md`).
- **Sensitive_File**: A file whose path matches a built-in or user-configured pattern, excluded from all model requests (see `01-platform.md`).
- **Telemetry_Event**: A structured record describing a user-visible Copilot_Plus action (see `01-platform.md`).

## Requirements

This requirements specification is split across the per-module files listed below for maintainability. Each module file contains its own `Introduction`, `Glossary`, and `Requirements` sections with detailed EARS-format acceptance criteria. Requirement identifiers are globally unique across files (format `R-<MODULE_ID>-<N>`) and may be cross-referenced between modules.

The detailed requirements live in the following files under `.kiro/specs/copilot-plus-extension/requirements/`:

| File | Module ID | Scope |
|---|---|---|
| `requirements/01-platform.md` | `PLAT` | Activation, Copilot authentication, model selection, configuration, performance, privacy, telemetry, error handling, accessibility, i18n |
| `requirements/02-interaction.md` | `INT` | UI layout, Conversation Pane, Tab Workspace, Control Console (activity bar), Notification-driven decisions during execution |
| `requirements/03-editing.md` | `EDIT` | Inline Edit (Cmd+K), Tab Completion, Diff Review UI, Checkpoints and rollback |
| `requirements/04-context.md` | `CTX` | Mentions, Codebase Index, RAG (hybrid retrieval + reranker), Context Budgeting |
| `requirements/05-docs.md` | `DOCS` | Five-Layer Hierarchy (System / Module / Feature / Component / Code), document tree, hierarchical and lateral links, code-to-component ownership, layer consistency enforcement, drift detection, layer-first retrieval (Layer_Walk) |
| `requirements/06-workflow.md` | `WF` | Design / Build / Deploy stages, task panel, task DAG, coding/testing/review/commit/rollback steps |
| `requirements/07-agents.md` | `AG` | Primary agent, pre-defined sub-agent roster, automatic delegation bound to workflow stages |
| `requirements/08-extensibility.md` | `EXT` | Skills (project-scoped constraints), MCP server integration, Hooks |
| `requirements/09-deployment.md` | `DEP` | Deployment configuration (Local / Docker / Kubernetes), auto-deploy toggle, autopilot deployment behavior |
| `requirements/10-tools.md` | `TOOL` | Built-in tool inventory and contracts (read/write/edit, bash, grep/glob, LSP, code_search, todo, git, tests, web, deploy, question) |
| `requirements/11-knowledge.md` | `KNOW` | AGENTS.md project memory (user/workspace/subdirectory layers), session memory, secret-pattern protection |

Refer to each module file for the full requirement text, user stories, and acceptance criteria that apply to that module's scope.

## Cross-Reference Index

| Concept | Defined in | Referenced from |
|---|---|---|
| Copilot authentication | `01-platform.md` (PLAT) | All modules |
| Tool inventory and contracts | `10-tools.md` (TOOL) | AG (Tool_Allowlist), EXT (MCP injection), EDIT (apply_patch, lsp_rename), WF (build steps), DEP (deploy tools) |
| Tool System Prompts | `10-tools.md` (TOOL) | AG (loaded into every Sub_Agent invocation) |
| Tool_Permission three-state | `01-platform.md` (PLAT) | TOOL, AG, WF, EXT |
| Speculative Requests | `01-platform.md` (PLAT) | EDIT (NES, Tab Completion), CTX (Scope_Resolution preheat) |
| AGENTS.md project memory | `11-knowledge.md` (KNOW) | AG (loaded into every agent), EXT (Skills coexistence), EDIT (NES context) |
| Self-Reflection Loop | `11-knowledge.md` (KNOW) | AG (post-build invocation), INT (Decision_Center proposals) |
| Embedding mode (proposed_lm / local / sparse_only / auto) | `04-context.md` (CTX) | DOCS (Structural_Booster), TOOL (code_search) |
| Conversation Summarization | `04-context.md` (CTX) | AG (loop termination), INT (Conversation_Pane chip) |
| Adaptive Retrieval Strategy (Tier_S/M/L) | `04-context.md` (CTX) | DOCS (Scope_Resolution cap), KNOW (AGENTS.md size) |
| Context Budget | `04-context.md` (CTX) | EDIT, INT, WF, AG |
| Diff Review UI | `03-editing.md` (EDIT) | WF (build step), AG, INT, TOOL |
| Next Edit Suggestions (NES) | `03-editing.md` (EDIT) | PLAT (speculative), CTX (token budget), KNOW (AGENTS.md) |
| Response Cache and Rebase | `03-editing.md` (EDIT) | KNOW (cache invalidation), TOOL (apply_patch rebase) |
| Checkpoint and git coordination | `03-editing.md` (EDIT) | WF (rollback step), AG, TOOL |
| Five_Layer_Hierarchy and Layer_Walk | `05-docs.md` (DOCS) | CTX (priority over RAG), AG (every invocation), KNOW (AGENTS.md does not duplicate Layer_Walk), TOOL (code_search uses Layer_Walk first) |
| Layer Consistency / Drift Detection | `05-docs.md` (DOCS) | EDIT (post-edit consistency check), AG (Reviewer triggered), INT (Drift_View) |
| Code-to-Component Ownership | `05-docs.md` (DOCS) | TOOL (file ownership lookups), EDIT (post-edit hooks), INT (status bar) |
| Document_Tree (incl. consistency, size, lifecycle, review markers) | `05-docs.md` (DOCS) | CTX (RAG sources), WF (Design stage outputs), AG (scope resolution), KNOW (excluded from Project_Memory loader) |
| Build Isolation (worktree) | `06-workflow.md` (WF) | EDIT (Checkpoint paths), DEP (deploy from worktree) |
| Tool Calling Loop Invariants | `07-agents.md` (AG) | WF (build budgets), CTX (summarization gating), TOOL (parallel rules) |
| Multi-Agent Verification | `07-agents.md` (AG) | WF (verification budgets), INT (Decision_Center escalation) |
| Continuous Background Agent | `07-agents.md` (AG) | INT (Decision_Center proposals), KNOW (AGENTS.md proposals), DOCS (drift scan, lateral link proposals) |
| Sub_Agent roster (incl. Explorer) | `07-agents.md` (AG) | WF (each workflow step names its sub-agent), TOOL (per-role allowlists) |
| Skills | `08-extensibility.md` (EXT) | AG (constraints applied per request), INT (Control_Console) |
| MCP servers | `08-extensibility.md` (EXT) | AG (tool injection), TOOL (permission resolution), INT (Control_Console) |
| Hooks | `08-extensibility.md` (EXT) | WF (stage transitions), EDIT (apply events), DEP (deploy events) |
| Decision_Center | `02-interaction.md` (INT) | TOOL (question, ask permission), WF (autonomy gating), DEP (auto-deploy approvals), AG (background and verification escalations), KNOW (reflection proposals) |
| Agent Replay and Forking | `02-interaction.md` (INT) | AG (iteration persistence), WF (Task_DAG fork edges) |
| CLI Mode | `09-deployment.md` (DEP) | WF (Decision_Resolver), AG (CLI behavior parity), KNOW (AGENTS.md unchanged) |

## Requirement Identifier Convention

- Format: `R-<MODULE_ID>-<N>` where `<MODULE_ID>` matches the table above and `<N>` is the requirement number within that module.
- Acceptance criteria are numbered within each requirement and referenced as `R-<MODULE_ID>-<N>.<AC>` when needed.
- All acceptance criteria use EARS format (`THE`, `WHEN`, `WHILE`, `WHERE`, `IF/THEN`).
