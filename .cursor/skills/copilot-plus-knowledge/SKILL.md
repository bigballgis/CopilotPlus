---
name: copilot-plus-knowledge
description: >-
  Copilot Plus project memory: AGENTS.md layered loading, session memory, secret
  scanning, self-reflection loop, copilotPlus.knowledge.init command. Use when
  implementing R-KNOW in src/knowledge/.
---

# Knowledge & Memory

## AGENTS.md layers (R-KNOW-1)

Load order (append):
1. `~/.copilotPlus/AGENTS.md`
2. `<Workspace>/AGENTS.md`
3. Ancestor `<dir>/AGENTS.md` for active file path

Cap 50k chars total; drop longest first if exceeded.
**Not** indexed in Codebase/RAG indexes.

## Init command (R-KNOW-2)

`copilotPlus.knowledge.init` — Architect scans project → proposes AGENTS.md via Diff Review.

## Who can write AGENTS.md (R-KNOW-3)

Primary Agent + Architect only via write tools.
Other agents use `propose_memory` → Decision_Notification.

## Session memory (R-KNOW-4)

`.copilotPlus/memory/session.json` — max 200 entries, 5k chars in requests.

## Secret patterns (R-KNOW-5)

Block proposals matching AWS keys, GitHub tokens, JWT, etc.

## Self-reflection (R-KNOW-6)

Post Build_Operation — propose AGENTS.md / Skill updates via Decision Center.

## Reference

`.kiro/specs/copilot-plus-extension/requirements/11-knowledge.md`
