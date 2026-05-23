---
name: copilot-plus-extensibility
description: >-
  Copilot Plus extensibility runtime: project Skills under .copilotPlus/skills/,
  MCP servers mcp.json, lifecycle Hooks hooks.json. Use when implementing R-EXT
  or Control Console configuration sections.
---

# Extensibility (Skills, MCP, Hooks)

## Skills (R-EXT-1)

Path: `.copilotPlus/skills/<skill-id>/skill.md`

Frontmatter: `id`, `title`, `scope`, `auto_attach`, `triggers`, `tool_allowlist`.

- Attached when `auto_attach` + scope matches, or `@skill`, or `/skill-id` slash prefix.
- Max 200 skills per workspace.

**Note:** Cursor dev skills live in `.cursor/skills/` (this repo). Runtime product skills live in `.copilotPlus/skills/` (user project).

## MCP (R-EXT-2)

Config: `.copilotPlus/mcp.json`

Inject tools into Sub_Agents only (not Primary), filtered by server `tool_allowlist` + `agent_allowlist`.

Max 50 enabled servers; reconnect with exponential backoff.

## Hooks (R-EXT-3)

Config: `.copilotPlus/hooks.json`

Events include: `stage.entered`, `task.completed`, `edit.applied`, `commit.created`, `deploy.*`, `file.*`, `code.orphan.detected`, `doc.drift.suspected`, etc.

Actions: `runCommand` (JSON stdin) | `askAgent`.

No recursive hook invocation.

## Control Console UI

Skills / MCP / Hooks sections per R-INT-9.5–9.8.

## Reference

`.kiro/specs/copilot-plus-extension/requirements/08-extensibility.md`
