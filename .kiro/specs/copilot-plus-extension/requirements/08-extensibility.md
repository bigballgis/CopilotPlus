# Requirements: Extensibility

Module ID: `EXT`

## Introduction

Copilot_Plus is extensible along three axes:

- **Skills** are project-scoped constraint or instruction bundles that the user attaches to a project to shape AI behavior. Skills travel with the repository (under `.copilotPlus/skills/`) so that every developer working on the project gets the same constraints.
- **MCP_Servers** are Model Context Protocol servers whose tools are dynamically injected into Sub_Agents according to per-server tool allowlists. This is how new capabilities (databases, internal APIs, build systems) are added to the AI's reach without changing the extension itself.
- **Hooks** are user-configured handlers that run at defined lifecycle events (workflow stage transitions, task statuses, file events) and may run a shell command or send a prompt to the Primary_Agent.

All three are configured from the Control_Console and stored as plain files under `.copilotPlus/` so they version with the repository.

## Glossary

- **Skill**: A markdown bundle describing a project-scoped constraint or instruction. Stored as `.copilotPlus/skills/<skill-id>/skill.md` plus optional resource files. Invocable via `@skill` mention or via automatic attachment rules.
- **Skill_Frontmatter**: A YAML block at the top of `skill.md` defining `id`, `title`, `scope`, `auto_attach`, `triggers`, and `tool_allowlist`.
- **MCP_Server**: A Model Context Protocol server registered via JSON configuration in `.copilotPlus/mcp.json`. Exposes tools and resources to Sub_Agents.
- **Tool_Injection**: The process of merging MCP_Server tools into a Sub_Agent's effective tool list at request time, gated by per-server allowlist.
- **Hook**: A handler defined in `.copilotPlus/hooks.json` that fires on a specified lifecycle event.
- **Hook_Event**: One of the fixed event identifiers defined in `R-EXT-3`.
- **Hook_Action**: One of `runCommand` (shell command execution) or `askAgent` (prompt sent to the Primary_Agent).

## Requirements

### R-EXT-1: Skills

**User Story:** As a developer, I want project-scoped constraint bundles that the AI always respects, so that everyone on the team gets consistent AI behavior.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL store every Skill at `.copilotPlus/skills/<skill-id>/skill.md` plus optional resource files in the same directory, where `<skill-id>` matches the pattern `[a-z][a-z0-9-]{2,63}`.
2. THE Copilot_Plus SHALL require every `skill.md` to begin with a Skill_Frontmatter block delimited by `---` lines containing at minimum: `id` (string), `title` (string, 1-120 characters), `scope` (one of `workspace`, `module:<module-id>`, `feature:<feature-id>`, `component:<component-id>`), `auto_attach` (boolean, default false), `triggers` (list of strings, 0 to 50 entries, optional), `tool_allowlist` (list of strings, 0 to 50 entries, optional, intersected with the active Sub_Agent's Tool_Allowlist).
3. WHEN a request is constructed for the Primary_Agent or a Sub_Agent, THE Copilot_Plus SHALL include the Skill content as a system instruction for every Skill where (a) `auto_attach` is true and `scope` matches the resolved scope of the request, or (b) the user attached the Skill via `@skill` mention.
4. WHEN the user types `/<skill-id>` at the start of a Conversation_Pane message, THE Copilot_Plus SHALL attach that Skill to the request as if the user had selected it via `@skill`.
5. THE Copilot_Plus SHALL provide controls in the Control_Console `Skills` section to view, enable, disable, edit, create, and remove a Skill.
6. WHEN the user activates Create Skill, THE Copilot_Plus SHALL prompt for `id`, `title`, and `scope`, SHALL create `.copilotPlus/skills/<id>/skill.md` with a valid Skill_Frontmatter, and SHALL open the new file in a Host_Editor tab.
7. IF a Skill_Frontmatter validation fails, THEN THE Copilot_Plus SHALL surface the validation error in the Control_Console `Skills` section, SHALL NOT load the Skill, and SHALL display the error in the editor problem pane.
8. WHEN any file under `.copilotPlus/skills/` is created, modified, or deleted, THE Copilot_Plus SHALL reload the affected Skill within 2 seconds and SHALL NOT require a Host_Editor restart.
9. THE Copilot_Plus SHALL allow at most 200 Skills per Workspace.

### R-EXT-2: MCP Server Integration

**User Story:** As a developer, I want to add MCP servers to extend the AI's tools without changing the extension, so that I can integrate company-internal capabilities.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL read MCP_Server configuration from `.copilotPlus/mcp.json` at Workspace_Root, with each entry containing `id` (unique), `command` or `url` (one of stdio command or HTTP/SSE URL), `args` (list of strings, optional), `env` (string-to-string map, optional), `enabled` (boolean, default true), `tool_allowlist` (list of strings, optional, default `["*"]`), `agent_allowlist` (list of Sub_Agent_Role identifiers, optional, default `["*"]`).
2. THE Copilot_Plus SHALL connect to every enabled MCP_Server within 5 seconds of activation or configuration change, SHALL handshake per the MCP specification, and SHALL discover the server's tool list.
3. WHEN a Sub_Agent invocation is constructed, THE Copilot_Plus SHALL inject into the Sub_Agent's effective tool list every MCP_Server tool where (a) the server is enabled, (b) the tool name matches the server's `tool_allowlist`, and (c) the Sub_Agent_Role matches the server's `agent_allowlist`.
4. THE Copilot_Plus SHALL surface MCP_Server status in the Control_Console `MCP_Servers` section, including connection state, last error, count of discovered tools, and the resolved tool injection list per Sub_Agent_Role.
5. THE Copilot_Plus SHALL provide controls in the Control_Console `MCP_Servers` section to add, edit, enable, disable, remove, and reconnect a server.
6. IF an MCP_Server connection fails or drops, THEN THE Copilot_Plus SHALL retry connection up to 3 times with exponential backoff (initial 5 seconds, maximum 60 seconds), SHALL surface the failure in the Control_Console, and SHALL exclude the server's tools from agent invocations until reconnection succeeds.
7. WHEN an MCP_Server tool is invoked by a Sub_Agent, THE Copilot_Plus SHALL display the tool name, server id, inputs, and outputs in the originating Task_Panel transcript within 1 second of completion.
8. WHEN a tool invocation crosses the active Autonomy_Level threshold defined in `R-WF-7`, THE Copilot_Plus SHALL emit a Decision_Notification before invoking the tool, regardless of whether the tool comes from a built-in Sub_Agent allowlist or from an injected MCP_Server tool.
9. THE Copilot_Plus SHALL NOT inject MCP_Server tools into the Primary_Agent; injection applies only to Sub_Agents.
10. THE Copilot_Plus SHALL allow at most 50 enabled MCP_Servers per Workspace.

### R-EXT-3: Hooks

**User Story:** As a developer, I want lifecycle hooks that fire on workflow and file events, so that I can automate guardrails and reactions.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL read Hook configuration from `.copilotPlus/hooks.json` at Workspace_Root, with each entry containing `id` (unique), `event` (one of the Hook_Events listed in criterion 2), `filter` (event-specific selector object, optional), `action` (one of `runCommand` or `askAgent`), `command` (required when `action` is `runCommand`), `prompt` (required when `action` is `askAgent`), `target_agent` (one of `primary` or a Sub_Agent_Role identifier, required when `action` is `askAgent`), `enabled` (boolean, default true), `timeout` (integer 1 to 600 seconds, default 60).
2. THE Copilot_Plus SHALL contribute exactly the following Hook_Events: `stage.entered`, `stage.exited`, `task.started`, `task.completed`, `task.failed`, `edit.applied`, `edit.rejected`, `commit.created`, `commit.failed`, `deploy.started`, `deploy.completed`, `deploy.failed`, `rollback.completed`, `file.changed`, `file.created`, `file.deleted`, `mcp.tool.called`, `model.request.failed`.
3. WHEN a Hook_Event fires, THE Copilot_Plus SHALL evaluate every enabled Hook whose `event` matches and whose `filter` (if any) matches the event payload, and SHALL invoke each matching Hook's action.
4. WHEN a Hook's `action` is `runCommand`, THE Copilot_Plus SHALL execute the command in a shell scoped to Workspace_Root, SHALL inject the event payload as JSON on stdin, SHALL apply the configured timeout, and SHALL record the command output in the Control_Console `Hooks` section. THE Copilot_Plus SHALL evaluate the command against the deny list defined in `R-WF-7.6` before execution and SHALL emit a Decision_Notification when the command matches, regardless of Tool_Permission. THE Copilot_Plus SHALL apply the same Sensitive_File and command-injection guardrails to Hook commands as to the `bash` Tool defined in `R-TOOL-4`.
5. WHEN a Hook's `action` is `askAgent`, THE Copilot_Plus SHALL send the prompt to the configured `target_agent`, SHALL include the event payload as a structured attachment, and SHALL record the agent response in the Control_Console `Hooks` section.
6. IF a Hook's command exits non-zero or times out, THEN THE Copilot_Plus SHALL log the failure in the Control_Console `Hooks` section, SHALL NOT abort the originating event flow, and SHALL emit a Telemetry_Event when telemetry is enabled.
7. THE Copilot_Plus SHALL provide controls in the Control_Console `Hooks` section to view, add, edit, enable, disable, and remove a Hook.
8. THE Copilot_Plus SHALL never invoke a Hook recursively from within its own action; if a Hook's action would trigger an event that matches the same Hook, THE Copilot_Plus SHALL skip the recursive invocation and SHALL log the skip.
9. THE Copilot_Plus SHALL allow at most 100 enabled Hooks per Workspace.
10. WHEN any file under `.copilotPlus/hooks.json` is modified, THE Copilot_Plus SHALL reload Hook configuration within 2 seconds and SHALL NOT require a Host_Editor restart.
