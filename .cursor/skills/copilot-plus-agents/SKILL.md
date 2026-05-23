---
name: copilot-plus-agents
description: >-
  Copilot Plus agent system: Primary Agent, fixed sub-agent roster, delegation,
  tool allowlists, Explorer sub-task, tool calling loop. Use when implementing
  R-AG requirements or agent orchestration in src/agents/.
---

# Agent System

## Primary Agent (R-AG-1)

- One per workspace; owns Conversation Pane in Design.
- Orchestrates Task_DAG in Build; delegates Deploy to Deployer.
- **Does not invoke tools directly** in Build/Deploy — Sub_Agents only.
- Prompt: `.copilotPlus/agents/primary.md` → fallback `resources/agents/primary.md`

## Sub-Agent roster (R-AG-2)

| Role | Workflow step |
|------|---------------|
| Requirement_Clarifier | Design.Requirement_Clarification |
| Architect | Design.Architecture_Generation |
| Designer | Design.Design_Document_Generation |
| Task_Planner | Design.Task_List_Generation |
| Explorer | cross-stage read-only helper |
| Coder | Build.Coding |
| Tester | Build.Testing |
| Reviewer | Build.Review |
| Committer | Build.Commit |
| Rollback_Operator | Build.Rollback |
| Deployer | Deploy.Deployment |

User **cannot** add/remove roles or change allowlists (read-only in Control Console).

## Every Sub_Agent invocation includes (R-AG-3.5)

1. Workflow stage + step
2. Active Skills (auto_attach + @skill)
3. Effective tool list (role allowlist + MCP injection)
4. Layer_Walk to `scope_doc`
5. Scope_Resolution from starting document

## Tool calling loop (R-AG-7)

- Parallel tool rules per TOOL module.
- Persist iterations to `.copilotPlus/builds/<id>/messages.jsonl` for Fork_From_Here (R-INT-12).

## Explorer (R-AG-5)

Separate context; returns `{ findings, recommended_files }` only.

## Bundled prompts

`resources/agents/<role>.md` — one file per role.

## Reference

`.kiro/specs/copilot-plus-extension/requirements/07-agents.md`
