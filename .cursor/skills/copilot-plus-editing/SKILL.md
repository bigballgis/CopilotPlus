---
name: copilot-plus-editing
description: >-
  Copilot Plus editing surfaces: Inline Edit Cmd+K, Tab Completion, Composer multi-file,
  Diff Review UI, Checkpoints, NES, response cache. Use when implementing R-EDIT in
  src/editing/.
---

# Editing Surfaces

## Inline Edit (R-EDIT-1)

- Command `copilotPlus.inlineEdit` — Ctrl/Cmd+K
- Selection ≤10k chars; ±50 lines context
- Stream → Diff Review overlay → Checkpoint on accept

## Tab Completion (R-EDIT-2)

Setting `copilotPlus.tabCompletion.mode`: default `delegate_to_copilot`.
Mode `own` registers `InlineCompletionItemProvider`.

## Composer (R-EDIT-3)

Build-stage only; 1–50 files, goal ≤8k chars; per-file Diff Review + Apply All atomic Checkpoint.

## Diff Review (R-EDIT-4)

Per-hunk Accept/Reject/Modify; Apply = atomic workspace edit + Checkpoint.
Honor Autonomy_Level for auto-apply.

## Checkpoints (R-EDIT-5)

Path: `.copilotPlus/checkpoints/`
Retention default 50 (config 1–1000).

Types: Pre_Edit, Pre_Commit, Post_Commit (R-EDIT-6).

## NES (R-EDIT-7)

After accepted edit; chain up to 10; speculative per R-PLAT-11.

## Response cache (R-EDIT-8)

`.copilotPlus/cache/responses/` — 100MB LRU.

## Reference

`.kiro/specs/copilot-plus-extension/requirements/03-editing.md`
