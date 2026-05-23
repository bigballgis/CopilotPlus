---
name: copilot-plus-overview
description: >-
  Orientation for the Copilot Plus VS Code extension repo: product thesis,
  module map, implementation milestones, and which skill to load next. Use when
  starting work on Copilot Plus, onboarding to the codebase, or planning features.
---

# Copilot Plus Overview

## What this is

Enterprise VS Code extension: Cursor-style agent workflow using **GitHub Copilot only** (`vscode.lm`).

Philosophy: **The user designs. The AI executes.**

## Spec location

- Index: `.kiro/specs/copilot-plus-extension/requirements.md`
- Modules: `requirements/01-platform.md` … `11-knowledge.md`

## Source layout → spec modules

| Directory | Module | Key concepts |
|-----------|--------|--------------|
| `src/platform/` | PLAT | Activation, settings, telemetry, tool permissions |
| `src/interaction/` | INT | Conversation Pane, Tab Workspace, Decision Center |
| `src/editing/` | EDIT | Inline edit, diff review, checkpoints, NES |
| `src/context/` | CTX | Mentions, indexes, RAG, token budget |
| `src/docs/` | DOCS | Five-layer doc tree, layer walk, drift |
| `src/workflow/` | WF | Design → Build → Deploy, task DAG |
| `src/agents/` | AG | Primary + sub-agent roster |
| `src/extensibility/` | EXT | Skills, MCP, hooks |
| `src/deployment/` | DEP | Local/Docker/K8s |
| `src/tools/` | TOOL | Built-in tool registry |
| `src/knowledge/` | KNOW | AGENTS.md, session memory |

## Which skill next?

- Implementing a requirement → `implement-from-kiro-spec`
- Model calls → `vscode-lm-api`
- Webviews → `copilot-plus-webview`
- Document tree → `copilot-plus-document-tree`
- Agents → `copilot-plus-agents`
- Tools → `copilot-plus-tools`
- RAG/index → `copilot-plus-context-rag`
- Workflow → `copilot-plus-workflow`
- Skills/MCP/hooks → `copilot-plus-extensibility`
- Tests → `copilot-plus-testing`

## Milestones

See `AGENTS.md` section "Implementation order". Complete M0 (platform) before UI shell.
