---
name: copilot-plus-webview
description: >-
  Builds Copilot Plus webviews: Conversation Pane, Tab Workspace (Task/Architecture/
  Requirement/Commit/Deploy), Control Console, Decision Center UI. Use when
  implementing interaction layer R-INT or webview-ui/ React components.
---

# Copilot Plus Webview UI

## Architecture

- **Host** (`src/interaction/`): `WebviewPanel` / `WebviewView`, CSP, message bridge.
- **UI** (`webview-ui/`): Vite + React; build output to `dist/webview/`.

## Layout (R-INT-1)

- Command `copilotPlus.openWorkspace`: left Conversation Pane, right Tab Workspace, 50/50 default.
- Persist split ratio per workspace.

## Conversation Pane (R-INT-2)

- Input enabled **only** in Design stage; read-only + banner otherwise.
- Header: model id, workflow stage, session token count.
- `@` mention picker within 200ms.
- Sessions persisted under `.copilotPlus/sessions/`.

## Tab Workspace (R-INT-3)

Fixed tabs in order:
1. Task_Panel — DAG + task controls
2. Architecture_Panel — doc tree diagram
3. Requirement_Panel — doc preview tree
4. Commit_Panel — AI commits + rollback
5. Deploy_Panel — deploy config + runs

Keybindings: `Ctrl+Alt+1` … `Ctrl+Alt+5`.

## Control Console (R-INT-9)

Activity bar webview sections: Status, Workflow_Stage, Models, Skills, Agents, MCP, Hooks, Indexing, Settings.

## Message protocol

Define in `src/shared/protocol.ts`:

```typescript
type HostToWebview = { type: 'stageChanged'; stage: WorkflowStage } | ...;
type WebviewToHost = { type: 'submitMessage'; text: string } | ...;
```

## A11y (R-PLAT-9)

Tab order, focus visible, aria-live for stream end/cancel.

## Reference

`.kiro/specs/copilot-plus-extension/requirements/02-interaction.md`
