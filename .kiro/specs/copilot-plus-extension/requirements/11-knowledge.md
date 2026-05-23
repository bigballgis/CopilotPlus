# Requirements: Project Memory and Conventions

Module ID: `KNOW`

## Introduction

The Document_Tree (`05-docs.md`) describes the project's **structure**. This module defines the project's **operational memory**: the AGENTS.md convention used by OpenCode, Claude Code, and the broader agent ecosystem to capture how to work in a specific project — what package manager, what test command, what coding conventions, what files to avoid, what is currently in progress.

`AGENTS.md` is loaded automatically into every agent invocation (Primary_Agent and every Sub_Agent), so the AI never re-discovers project basics every session. The user maintains it; the AI may propose updates via Diff_Review_UI.

This module also defines per-Workspace **session memory** — facts the AI learns during a session that should persist across sessions (for example "the user prefers small focused commits", "the user wants async/await over promises").

## Glossary

- **AGENTS_File**: A markdown file at `<directory>/AGENTS.md` providing operational instructions for AI agents working on code rooted at that directory.
- **Project_Memory**: The aggregate set of AGENTS_Files visible to the active Workspace, layered from user-level through subdirectory-level.
- **Session_Memory**: A persisted set of short facts the AI has accumulated about user preferences and project context, stored at `.copilotPlus/memory/session.json`.
- **Memory_Layer**: One of `user`, `workspace`, `subdirectory`, ordered by precedence.

## Requirements

### R-KNOW-1: AGENTS.md Loading

**User Story:** As a developer, I want a single conventional file that tells the AI how to work in my project, so that every session starts fluent.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL load AGENTS_Files from the following locations, in order, with later layers appended after earlier ones in the resulting system instruction: (a) user level at `~/.copilotPlus/AGENTS.md`, (b) workspace level at `<Workspace_Root>/AGENTS.md`, (c) subdirectory level at any `<directory>/AGENTS.md` that is an ancestor of the file or directory being acted on by the active Sub_Agent.
2. WHEN the active Sub_Agent operates on a file, THE Copilot_Plus SHALL determine the relevant AGENTS_Files by walking the file's path from `Workspace_Root` to the file, including every `AGENTS.md` encountered along the way.
3. THE Copilot_Plus SHALL include every relevant AGENTS_File's content in the Sub_Agent's system instruction, capped at 50,000 characters total. IF the cap is exceeded, THEN THE Copilot_Plus SHALL drop the longest AGENTS_File first and SHALL log the drop in the Task_Panel transcript.
4. WHEN any AGENTS_File is created, modified, or deleted, THE Copilot_Plus SHALL apply the change to subsequent Sub_Agent invocations within 2 seconds and SHALL NOT require a Host_Editor restart.
5. THE Copilot_Plus SHALL NOT include AGENTS_Files in the Codebase_Index or RAG_Index, since they are loaded separately as system instructions.

### R-KNOW-2: AGENTS.md Initialization

**User Story:** As a developer adopting the extension, I want a one-shot command to generate AGENTS.md by scanning my project, so that I do not start from a blank file.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL contribute a command `copilotPlus.knowledge.init` that, when invoked, runs the Architect Sub_Agent to scan the active Workspace and generate or update `<Workspace_Root>/AGENTS.md` with detected: build tools, test commands, lint/format commands, package manager, primary languages, project layout summary, dependency frameworks, and any obvious conventions.
2. WHEN the command runs and an AGENTS_File already exists, THE Copilot_Plus SHALL produce a proposed update, route it through the Diff_Review_UI per `R-EDIT-4`, and SHALL preserve any user-authored sections under headings the agent does not understand.
3. THE Copilot_Plus SHALL surface the `copilotPlus.knowledge.init` command in the Control_Console `Status` section as an action when no `AGENTS.md` exists at `Workspace_Root`.

### R-KNOW-3: AGENTS.md Authoring Tools

**User Story:** As a developer, I want the AI to be able to propose edits to AGENTS.md, so that learned conventions get captured.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL expose AGENTS_File edits to the Primary_Agent and to the Architect Sub_Agent via the `write_file` and `apply_patch` Tools defined in `R-TOOL-3`, scoped only to AGENTS_File paths.
2. THE Copilot_Plus SHALL NOT expose AGENTS_File writing to any other Sub_Agent. IF a non-Architect Sub_Agent attempts to write an AGENTS_File, THEN THE Copilot_Plus SHALL refuse the write and SHALL return `{ ok: false, reason: 'agents_md_role_restricted' }`.
3. WHEN the Coder, Tester, Reviewer, Committer, or Deployer Sub_Agent encounters a project convention that would be useful to remember, THE Sub_Agent MAY emit a `propose_memory` action that the Primary_Agent receives. THE Primary_Agent SHALL surface the proposed memory entry to the user as a Decision_Notification with options to accept (writing to `AGENTS.md`), accept-as-session-memory (writing to `Session_Memory` per `R-KNOW-4`), or reject.

### R-KNOW-4: Session Memory

**User Story:** As a developer, I want the AI to remember small facts across sessions without me editing AGENTS.md, so that learned context persists.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL persist Session_Memory at `.copilotPlus/memory/session.json` containing a list of memory entries, each with `id`, `text` (1 to 500 characters), `created_at`, `last_used_at`, `scope` (one of `workspace`, `task`).
2. THE Copilot_Plus SHALL allow at most 200 Session_Memory entries per Workspace, evicting the least-recently-used entries first when the limit is exceeded.
3. WHEN the Primary_Agent or any Sub_Agent constructs a request, THE Copilot_Plus SHALL include all Session_Memory entries with `scope: 'workspace'` and any entries with `scope: 'task'` matching the active Task, capped at 5,000 characters total. IF the cap is exceeded, THEN THE Copilot_Plus SHALL include entries in last-used-first order until the cap is reached.
4. THE Copilot_Plus SHALL provide controls in the Control_Console under a `Memory` section to view, edit, pin, and remove Session_Memory entries.
5. WHEN a Session_Memory entry is used in a request (its text is included in the system instruction), THE Copilot_Plus SHALL update its `last_used_at` timestamp.

### R-KNOW-5: Memory Privacy

**User Story:** As a developer, I want guarantees that memory does not leak secrets, so that AGENTS.md and Session_Memory stay safe to commit and share.

#### Acceptance Criteria

1. WHEN the Primary_Agent or Architect Sub_Agent proposes an AGENTS_File edit or a Session_Memory entry, THE Copilot_Plus SHALL scan the proposed text against the Sensitive_File pattern list and a built-in secret pattern set (covering at minimum AWS keys, GitHub tokens, JWT signatures, OpenAI keys, GCP service account JSON markers, generic 32-character hex strings adjacent to `key`, `token`, `secret`).
2. IF a proposed AGENTS_File edit or Session_Memory entry matches any secret pattern, THEN THE Copilot_Plus SHALL block the proposal, SHALL display the matching pattern in the Diff_Review_UI or Decision_Notification, and SHALL NOT write the file or entry until the user redacts and approves.
3. THE Copilot_Plus SHALL NOT include `Session_Memory` content in any Telemetry_Event.

### R-KNOW-6: Self-Reflection Loop

**User Story:** As a long-running project, I want the AI to reflect after every Build_Operation and propose updates to AGENTS.md or Skills, so that the system improves over time without manual prompting.

#### Acceptance Criteria

1. WHEN a Build_Operation completes (status `Completed`, `Failed`, or `Cancelled`), THE Primary_Agent SHALL invoke a Self_Reflection_Pass that takes as input: the full transcript of every Sub_Agent invocation in the build, the final outcome, and the time-to-completion.
2. THE Self_Reflection_Pass SHALL produce a structured output with the following sections: `friction_points` (situations where Sub_Agents took multiple iterations or escalated to the user), `repeated_patterns` (similar tool sequences observed across multiple Tasks), `proposed_agents_md_additions` (new lines to add to AGENTS.md), `proposed_skill_additions` (new Skills to consider creating), `proposed_skill_deletions` (Skills that did not help in this run), `proposed_hook_additions` (Hooks that would have prevented observed failures).
3. WHEN the Self_Reflection_Pass produces non-empty proposals, THE Copilot_Plus SHALL queue each proposal in the Decision_Center per `R-INT-11` with options `Accept`, `Accept_With_Edit`, `Reject`, `Save_For_Later`. THE Copilot_Plus SHALL NOT auto-apply reflection proposals.
4. THE Self_Reflection_Pass SHALL count against the per-Build_Operation tool-call budget per `R-WF-8.1`.
5. THE Copilot_Plus SHALL expose `copilotPlus.knowledge.selfReflection.enabled` (default `true`) and `copilotPlus.knowledge.selfReflection.minBuildTasks` (default 3, range 1 to 50). THE Self_Reflection_Pass SHALL NOT run for Build_Operations with fewer Tasks than the threshold.
6. THE Copilot_Plus SHALL persist all Self_Reflection_Pass outputs at `.copilotPlus/reflections/<build-id>.md` so the user can audit reflection history independently of acceptance.
7. THE Copilot_Plus SHALL aggregate reflection findings across the most recent 10 Build_Operations and surface a `Reflection_Summary` view in the Control_Console under a `Memory` section.
