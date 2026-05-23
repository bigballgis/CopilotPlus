---
name: copilot-plus-workflow
description: >-
  Copilot Plus workflow stages Design Build Deploy, task DAG, autonomy levels,
  build isolation worktree, stage transitions and hooks. Use when implementing
  R-WF requirements in src/workflow/.
---

# Workflow (Design → Build → Deploy)

## Stages (R-WF-1)

One active stage per workspace in `.copilotPlus/state.json`.

Allowed transitions:
- Design ↔ Build
- Build ↔ Deploy
- Deploy ↔ Design

Fire `stage.entered` / `stage.exited` hooks (R-EXT-3).

## Design steps (R-WF-2)

1. Requirement_Clarification → Requirement_Clarifier
2. Architecture_Generation → Architect
3. Design_Document_Generation → Designer
4. Task_List_Generation → Task_Planner

Outputs → Document_Tree + `.copilotPlus/builds/<build-id>/tasks.json`.

## Task DAG (R-WF-3)

Fields: `id`, `title`, `description`, `agent`, `inputs`, `depends_on`, `status`, `scope_doc`.

- Validate: no cycles, valid agents, valid scope_doc paths.
- Max 3 concurrent tasks (configurable 1–8).
- Persist under `.copilotPlus/builds/<build-id>/`.

## Build steps per task (R-WF-4)

Coding → Testing → Review → Commit (Rollback on demand).

Tester retry loop: up to 3 rounds before Failed + Decision_Notification.

## Autonomy levels (R-WF-7)

`Manual` | `Approve_Edits` | `Approve_Commands` | `Full_Auto`

Biases Tool_Permission `ask` → `allow` per R-PLAT-10.5.

## Build isolation (R-WF-5)

Optional git worktree for Build stage — checkpoints and deploy paths respect worktree root.

## Reference

`.kiro/specs/copilot-plus-extension/requirements/06-workflow.md`
