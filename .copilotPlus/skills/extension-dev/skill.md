---
id: extension-dev
title: Copilot Plus Extension Development
scope: workspace
auto_attach: true
triggers: []
---

# Extension development constraints

When modifying this repository (the Copilot Plus extension itself):

- All LLM integration must use `vscode.lm` with vendor `copilot` only.
- Map every feature to Kiro requirement IDs in `.kiro/specs/`.
- User-visible strings via `vscode.l10n`.
- File writes from agents go through Diff Review + Checkpoint pipeline.
- Do not commit `.copilotPlus/index/`, `cache/`, `checkpoints/`, or `sessions/`.
