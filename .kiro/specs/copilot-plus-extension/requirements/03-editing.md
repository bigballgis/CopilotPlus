# Requirements: Editing Surfaces

Module ID: `EDIT`

## Introduction

This module defines the in-editor editing surfaces of Copilot_Plus: Inline Edit (Cmd+K), Tab Completion ghost-text, the per-hunk Diff Review UI, and Checkpoints with rollback. These surfaces operate independently of the Workflow_Stage and are available whenever Copilot_Plus is active and Copilot_Entitlement is valid, except where the active stage explicitly disables them (see `06-workflow.md`).

## Glossary

- **Inline_Edit**: A request issued from inside the active editor that proposes a localized code change for a selected range or cursor position, surfaced as a diff overlay.
- **Tab_Completion**: An inline ghost-text completion shown ahead of the cursor that the user accepts with Tab.
- **Diff_Review_UI**: The surface that displays proposed changes as hunks with per-hunk Accept, Reject, and Modify controls before changes are written to disk.
- **Checkpoint**: A snapshot of all files modified by a single Copilot_Plus operation, recorded at the moment changes are applied, used to support rollback.
- **Hunk**: A contiguous range of changed lines within a file, treated as the smallest unit of accept/reject in the Diff_Review_UI.
- **Composer**: A multi-file edit surface that proposes coordinated changes across two or more files in a single review unit. The Composer is reachable from the Build stage Task_Panel; it is not a standalone surface.

## Requirements

### R-EDIT-1: Inline Edit (Cmd+K / Ctrl+K)

**User Story:** As a developer, I want to invoke an AI edit on the current selection or cursor with a keystroke, so that I can transform code in place.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL register the command `copilotPlus.inlineEdit` with default keybindings `Cmd+K` on macOS and `Ctrl+K` on Windows and Linux, scoped to editor focus when no modal dialog or input is open.
2. WHEN the user invokes `copilotPlus.inlineEdit` with a non-empty selection of at most 10,000 characters, THE Copilot_Plus SHALL submit the selection, up to 50 lines of context before and 50 lines of context after the selection, and the user prompt to the selected Copilot_Model.
3. IF the active selection exceeds 10,000 characters, THEN THE Copilot_Plus SHALL reject the invocation, SHALL display a message indicating the selection size limit, and SHALL leave the editor buffer unmodified.
4. WHEN the user invokes `copilotPlus.inlineEdit` with no selection, THE Copilot_Plus SHALL submit the current line and up to 50 lines of context before and 50 lines of context after the cursor to the selected Copilot_Model.
5. WHEN the Copilot_Model returns a complete response, THE Copilot_Plus SHALL render the proposed change as a Diff_Review_UI overlay anchored to the original range within 500 milliseconds of response completion.
6. THE Copilot_Plus SHALL provide Accept, Reject, and follow-up controls in the Inline_Edit overlay invokable via mouse or keyboard, and SHALL retain editor focus on the originating editor while the overlay is active.
7. WHEN the user accepts an Inline_Edit, THE Copilot_Plus SHALL apply the change as a single undoable editor edit and SHALL record a Checkpoint of the pre-edit content.
8. WHEN the user rejects an Inline_Edit, THE Copilot_Plus SHALL discard the proposed change and SHALL leave the editor buffer byte-identical to its state at the moment of invocation.
9. IF the Copilot_Model request fails or does not return a response within 60 seconds, THEN THE Copilot_Plus SHALL cancel the request, SHALL display the error or timeout message in the Inline_Edit overlay, SHALL preserve the editor buffer state, and SHALL offer a retry control.
10. WHILE an Inline_Edit response is streaming, THE Copilot_Plus SHALL update the displayed diff at least once every 500 milliseconds and SHALL expose a cancel control that aborts the request within 1 second of activation.

### R-EDIT-2: Tab Completion

**User Story:** As a developer, I want intelligent multi-line completions as I type, so that I can write code faster, without colliding with the GitHub Copilot extension that may already be installed.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL contribute the setting `copilotPlus.tabCompletion.mode` with allowed values `disabled`, `delegate_to_copilot`, `own` (default `delegate_to_copilot`).
2. WHEN `copilotPlus.tabCompletion.mode` is `delegate_to_copilot`, THE Copilot_Plus SHALL NOT register an `InlineCompletionItemProvider` and SHALL rely on the GitHub Copilot extension to provide ghost-text completions.
3. WHEN `copilotPlus.tabCompletion.mode` is `disabled`, THE Copilot_Plus SHALL NOT register an `InlineCompletionItemProvider` and SHALL provide no Tab Completion behavior.
4. WHEN `copilotPlus.tabCompletion.mode` is `own` and the GitHub Copilot extension is also installed and active, THE Copilot_Plus SHALL display a one-time notification recommending the user pick one provider via Host_Editor's `editor.inlineSuggest.suppressSuggestions` and related settings, and SHALL register its own `InlineCompletionItemProvider` for the language identifiers enabled in the `copilotPlus.tabCompletion.enabledLanguages` setting.
5. WHEN `copilotPlus.tabCompletion.mode` is `own`, THE Copilot_Plus SHALL request a Tab_Completion suggestion from the configured Copilot_Model when the user pauses typing for the configured trigger delay, where the delay is bounded between 100 and 2,000 milliseconds.
6. WHEN a Tab_Completion suggestion is received, THE Copilot_Plus SHALL display the suggestion as ghost text starting at the current cursor position, truncated to a maximum of 500 characters of displayed text.
7. IF a Tab_Completion request does not return a suggestion within 5,000 milliseconds, THEN THE Copilot_Plus SHALL cancel the request and SHALL NOT display any ghost text for that request.
8. WHEN the user presses Tab while a Tab_Completion suggestion is displayed, THE Copilot_Plus SHALL accept the displayed Tab_Completion suggestion as a single editor edit.
9. WHERE the user has enabled word-level acceptance, THE Copilot_Plus SHALL accept one word per configured partial-acceptance keystroke, where a word is defined as a sequence of characters bounded by whitespace or non-identifier punctuation.
10. WHEN the user types a character that diverges from the displayed Tab_Completion suggestion, THE Copilot_Plus SHALL dismiss the ghost text within 50 milliseconds of the divergent keystroke.
11. WHEN the cursor moves or the document changes, THE Copilot_Plus SHALL cancel any in-flight Tab_Completion request for that document.
12. WHEN the active document path matches a Sensitive_File_Pattern defined in `R-PLAT-6`, THE Copilot_Plus SHALL NOT send a Tab_Completion request and SHALL NOT display ghost text for that document.
13. WHILE the user is offline, THE Copilot_Plus SHALL suppress Tab_Completion requests, SHALL NOT delay keystroke rendering by more than 10 milliseconds attributable to the suppression, and SHALL display an offline indicator in the Control_Console.

### R-EDIT-3: Composer (Multi-File Edits)

**User Story:** As a developer, I want to propose coordinated edits across multiple files in one review unit, so that I can apply atomic refactors and feature changes.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL allow Build-stage tasks to invoke a Composer change set that accepts a natural-language goal of 1 to 8,000 characters and a set of 1 to 50 attached files, where each attached file is at most 1 MB in size.
2. IF the submitted Composer goal is empty, exceeds 8,000 characters, or the attached file set is empty or exceeds 50 files, THEN THE Copilot_Plus SHALL reject the submission, SHALL display an error message in the originating Task_Panel transcript indicating which limit was violated, and SHALL preserve the originating task input.
3. WHEN a valid Composer goal is submitted, THE Copilot_Plus SHALL request the selected Copilot_Model to produce a list of file edits, where each edit identifies a target file path and a proposed new content or patch.
4. IF the Copilot_Model fails to return a list of file edits within 120 seconds or returns an invalid response, THEN THE Copilot_Plus SHALL abort the Composer request, SHALL display an error message in the Task_Panel transcript indicating the failure cause, and SHALL preserve the originating task and Session history.
5. THE Copilot_Plus SHALL display each proposed Composer file edit as a separate entry in the Diff_Review_UI with per-file Accept, Reject, and Modify controls.
6. THE Copilot_Plus SHALL provide a single Apply All control that applies every Composer file edit currently marked Accepted as one Checkpoint.
7. WHEN the user activates Apply All, THE Copilot_Plus SHALL write each Accepted file edit to disk via the Host_Editor workspace edit API.
8. IF any file edit in an Apply All operation fails to write, THEN THE Copilot_Plus SHALL roll back every edit already written in that operation to its pre-operation content, SHALL report the file path that failed in the Task_Panel transcript, and SHALL report the failure cause.
9. WHEN a follow-up Composer instruction of 1 to 8,000 characters is issued by a Sub_Agent in the same task, THE Copilot_Plus SHALL revise the proposed change set, SHALL retain all prior messages and proposed edits in the task transcript, and SHALL update the Diff_Review_UI entries to reflect the revised set.
10. WHILE a Composer request is streaming, THE Copilot_Plus SHALL display per-file generation progress in the originating Task_Panel transcript and SHALL expose a cancel control that aborts the request within 2 seconds of activation without modifying any files on disk.

### R-EDIT-4: Diff Review UI

**User Story:** As a developer, I want to review proposed AI changes as diffs before they touch my files, so that I stay in control of my codebase.

#### Acceptance Criteria

1. WHEN the Copilot_Model proposes a file change via Inline_Edit, Composer, or any Sub_Agent edit Tool, THE Copilot_Plus SHALL render the change as a hunk-based diff within 2 seconds and SHALL NOT write the change to disk before user action, except where the active Autonomy_Level (defined in `06-workflow.md`) authorizes auto-application.
2. THE Copilot_Plus SHALL provide per-Hunk Accept and Reject controls in the Diff_Review_UI, each invokable via mouse or keyboard with a visible accepted-or-rejected status per Hunk.
3. WHEN the user activates Modify on a Hunk of at most 100,000 characters, THE Copilot_Plus SHALL allow the user to edit the Hunk's proposed content before acceptance.
4. WHEN the user accepts a Hunk, THE Copilot_Plus SHALL incorporate that Hunk into the pending change set without writing to disk.
5. WHEN the user rejects a Hunk, THE Copilot_Plus SHALL remove that Hunk from the pending change set without writing to disk.
6. WHEN the user activates Apply, THE Copilot_Plus SHALL write all accepted Hunks to disk in a single atomic workspace edit, SHALL display a confirmation that the change was applied, and SHALL record a Checkpoint of the pre-Apply content of every modified file.
7. IF writing the workspace edit to disk fails, THEN THE Copilot_Plus SHALL roll back any partial writes from the same Apply operation, SHALL display an error indication identifying the failed file, and SHALL NOT record a Checkpoint for the failed Apply.
8. WHEN the user activates Discard, THE Copilot_Plus SHALL drop the proposed change set without modifying any file on disk.
9. WHEN the Copilot_Plus performs an Apply, THE Copilot_Plus SHALL preserve any unsaved buffer changes that fall outside the line ranges modified by the accepted Hunks.

### R-EDIT-5: Checkpoints and Rollback

**User Story:** As a developer, I want to roll back AI-generated changes, so that I can recover if a suggestion was wrong.

#### Acceptance Criteria

1. WHEN the Copilot_Plus applies any edit produced by Inline_Edit, Composer, or any Sub_Agent edit Tool, THE Copilot_Plus SHALL record a Checkpoint capturing the prior content of every modified file before the edit is written to disk, persisted under `.copilotPlus/checkpoints/`.
2. IF Checkpoint recording fails for any modified file, THEN THE Copilot_Plus SHALL abort the edit, SHALL leave all target files unchanged, and SHALL display an error indication identifying the failed file.
3. WHEN the user opens the Commit_Panel or invokes the Checkpoint history view, THE Copilot_Plus SHALL display all retained Checkpoints sorted by creation timestamp in descending order, with each entry showing the timestamp, the originating operation name (Inline_Edit, Composer, or the Sub_Agent role), the originating task identifier (if any), and the count of files captured.
4. WHEN the user selects a Checkpoint and chooses Restore, THE Copilot_Plus SHALL restore each file in that Checkpoint to its pre-change content and SHALL display a restore summary listing each file and its restore outcome (`Restored`, `Recreated`, or `Failed`).
5. IF restoring any file in a Checkpoint fails, THEN THE Copilot_Plus SHALL continue restoring the remaining files, SHALL mark the failed file in the restore summary with an error indication, and SHALL leave the failed file's on-disk content unchanged.
6. THE Copilot_Plus SHALL retain at least the most recent 50 Checkpoints per Workspace, with a user-configurable retention limit between 1 and 1,000 Checkpoints, and SHALL evict the oldest Checkpoints first when the limit is exceeded.
7. IF a file recorded in a Checkpoint no longer exists at restore time, THEN THE Copilot_Plus SHALL recreate the file with its captured content and SHALL report the recreation in the restore summary.
8. WHEN the user requests deletion of an individual Checkpoint or clearing of all Checkpoints for the current Workspace, THE Copilot_Plus SHALL prompt for confirmation and SHALL remove the selected Checkpoints upon confirmation.

### R-EDIT-6: Checkpoint and Git Coordination

**User Story:** As a developer, I want a clear and consistent relationship between Checkpoints and git commits, so that rollback never leaves my repository in a confusing state.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL classify every Checkpoint as one of: `Pre_Edit` (recorded before file writes from any AI surface), `Pre_Commit` (recorded just before the Committer Sub_Agent runs `git_commit`), `Post_Commit` (a logical pointer to the commit hash recorded after a successful `git_commit`).
2. WHEN the Committer Sub_Agent successfully creates a git commit per `R-WF-4.8`, THE Copilot_Plus SHALL associate the commit hash with the Pre_Commit Checkpoint and SHALL retain that linkage for the lifetime of the Pre_Commit Checkpoint.
3. WHEN the user activates Restore on a Checkpoint whose Task already has an associated git commit, THE Copilot_Plus SHALL prompt for confirmation indicating that restoring the file content will leave the working tree out of sync with HEAD, and SHALL offer two options: (a) `Restore_Files_Only` (file restore without git changes), (b) `Restore_And_Revert` (file restore plus `git revert <commit-hash>`).
4. WHEN the user activates Restore on a Checkpoint whose Task has no associated git commit, THE Copilot_Plus SHALL restore files only, with no git operation, and SHALL NOT prompt for the choice in criterion 3.
5. WHEN the Copilot_Plus performs `Restore_And_Revert`, THE Copilot_Plus SHALL invoke the `bash` Tool to run `git revert --no-edit <commit-hash>`, subject to the deny list and Tool_Permission rules. IF `git revert` fails (for example due to subsequent commits depending on the reverted commit), THEN THE Copilot_Plus SHALL stop the rollback, SHALL surface the git error, and SHALL leave both the working tree and HEAD untouched.
6. WHEN a Pre_Edit Checkpoint exists for a file that has subsequently been included in a successful git commit, THE Copilot_Plus SHALL retain the Pre_Edit Checkpoint until the retention limit defined in `R-EDIT-5.6` evicts it. Pre_Edit Checkpoints are not automatically deleted on commit.

### R-EDIT-7: Next Edit Suggestions

**User Story:** As a developer who just made an edit, I want the AI to predict and offer the next edit I am likely to make, so that consistent multi-site changes do not require me to retype the same fix in every location.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL contribute the setting `copilotPlus.nes.mode` with allowed values `disabled`, `delegate_to_copilot` (default).
2. WHEN `copilotPlus.nes.mode` is `delegate_to_copilot`, THE Copilot_Plus SHALL NOT contribute its own Next Edit Suggestion provider and SHALL rely on the GitHub Copilot extension's NES feature for next-edit prediction. This is the only supported mode in v1 because attempting to compete with Copilot's own NES results in conflicting providers and a degraded user experience.
3. WHEN `copilotPlus.nes.mode` is `disabled`, THE Copilot_Plus SHALL NOT engage with NES behavior at all and SHALL leave next-edit prediction entirely to whichever provider the user has configured (or none).
4. THE Copilot_Plus SHALL NOT include any `own` mode for Next Edit Suggestions in v1. A future major version MAY revisit this if VS Code exposes a multi-provider NES API; until then, the GitHub Copilot extension is the authoritative NES provider for users of Copilot_Plus.
5. THE Copilot_Plus SHALL display, in the Control_Console `Status` section, an indicator showing whether the GitHub Copilot extension is detected as installed and active. WHEN it is not detected and `nes.mode` is `delegate_to_copilot`, THE Copilot_Plus SHALL display a notice explaining that NES will be unavailable until Copilot is installed.

### R-EDIT-8: Response Cache and Rebase

**User Story:** As a developer who repeats similar edit prompts, I want the assistant to reuse past responses and adjust them to current file state, so that I do not pay latency for the same intent twice.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL maintain a Response_Cache for Inline_Edit, Tab Completion, and Next_Edit_Candidate model requests, keyed by a hash of `(prompt_text, model_id, file_sha256, selection_range, mention_set, agents_md_sha256)`.
2. WHEN a request key matches a cached entry that is at most 1 hour old, THE Copilot_Plus SHALL return the cached response without issuing a model request, and SHALL display a `Cached` badge in the receiving surface.
3. WHEN the request key partially matches a cached entry (same `prompt_text`, `model_id`, and `mention_set`, but different `file_sha256`), THE Copilot_Plus SHALL attempt a Response_Rebase: re-anchor the cached edit's line ranges and Hunk content using `apply_patch`-style context matching per `R-TOOL-3.2`. IF rebase succeeds with all hunks resolving to unique locations, THEN THE Copilot_Plus SHALL return the rebased response and SHALL display a `Rebased` badge.
4. IF Response_Rebase fails, THEN THE Copilot_Plus SHALL fall back to a normal model request and SHALL NOT block on the rebase attempt for more than 200 milliseconds.
5. THE Copilot_Plus SHALL invalidate Response_Cache entries when (a) the keyed file's `lsp_references` for any modified symbol changes, (b) AGENTS.md changes, (c) the active Skill_Frontmatter `auto_attach` set changes.
6. THE Copilot_Plus SHALL store the Response_Cache under `.copilotPlus/cache/responses/`, with a per-Workspace size limit of 100 MB and LRU eviction.
7. THE Copilot_Plus SHALL expose the setting `copilotPlus.cache.enabled` (default true) to disable Response_Cache entirely.
