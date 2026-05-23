# Requirements: Platform Foundation

Module ID: `PLAT`

## Introduction

This module covers the foundational platform behavior of Copilot_Plus: how it activates in Host_Editor, how it authenticates against the user's existing GitHub Copilot subscription via `vscode.lm`, how it selects models, how settings are exposed and applied, how performance budgets are enforced, how sensitive files and telemetry are handled, how errors and offline states are surfaced, and how accessibility and internationalization are honored.

Copilot_Plus is built for enterprise users whose only available LLM is GitHub Copilot. **No alternative model providers (OpenAI, Anthropic, Gemini, Ollama, OpenAI-compatible endpoints) are supported.** Every model request flows through `vscode.lm.selectChatModels({ vendor: 'copilot' })`.

## Glossary

- **Activation**: The lifecycle event during which Host_Editor invokes Copilot_Plus's `activate()` and Copilot_Plus registers contributions.
- **Configuration_Namespace**: The `copilotPlus` settings tree contributed to the Host_Editor settings registry.
- **Sensitive_File_Pattern**: A glob string used to exclude matching files from any model request.
- **Telemetry_Event**: A structured record describing a user-visible Copilot_Plus action, emitted only when telemetry is enabled.

## Requirements

### R-PLAT-1: Activation and VS Code Compatibility

**User Story:** As a developer using VS Code, I want Copilot Plus to install and activate cleanly on my supported VS Code version, so that I can use its features without compatibility errors.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL declare an `engines.vscode` constraint of `^1.109.0` in its extension manifest.
2. WHEN Host_Editor version is 1.109.5 or later, THE Copilot_Plus SHALL complete activation within 5,000 milliseconds without surfacing user-visible compatibility errors.
3. IF Host_Editor version is below 1.109.0, THEN THE Copilot_Plus SHALL refuse to activate, SHALL leave no contributed commands, views, or keybindings registered, and SHALL display a notification identifying the minimum supported version 1.109.0.
4. WHEN Copilot_Plus activates, THE Copilot_Plus SHALL register every command, view, and keybinding declared in its manifest before reporting activation complete.
5. IF registration of any contributed command, view, or keybinding fails during activation, THEN THE Copilot_Plus SHALL abort activation, SHALL roll back any partial registrations, and SHALL display a notification identifying the failed contribution.
6. WHEN activation completes successfully, THE Copilot_Plus SHALL emit a Telemetry_Event reporting activation duration in milliseconds within 2,000 milliseconds of activation completion, only if telemetry is enabled.

### R-PLAT-2: Authentication via GitHub Copilot Entitlement

**User Story:** As a GitHub Copilot subscriber, I want Copilot Plus to use my existing Copilot subscription, so that I don't need to manage a separate API key.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL obtain Copilot_Model instances exclusively through `vscode.lm.selectChatModels` with a vendor filter of `copilot`.
2. WHEN no Copilot_Model is returned by Language_Model_API, THE Copilot_Plus SHALL display, within 1 second of the empty result, a message indicating that an active Copilot_Entitlement is required and SHALL include an actionable control that invokes the GitHub Copilot sign-in command in Host_Editor.
3. IF the user has not granted Language_Model_API consent for Copilot_Plus, THEN THE Copilot_Plus SHALL trigger the Host_Editor consent flow on the first model request and SHALL not call the model until consent is granted.
4. IF the user denies or dismisses the Language_Model_API consent flow, THEN THE Copilot_Plus SHALL abort the originating request, SHALL display a message indicating consent is required, and SHALL not retry the request until the user initiates a new request.
5. THE Copilot_Plus SHALL not store, transmit, log, or request any separate API key, OAuth token, or alternative credential for accessing any LLM, and SHALL not expose any setting that accepts a model API key. Use of `vscode.lm.computeEmbeddings` (the `embeddings` proposed API per `R-CTX-5`) does not constitute use of a separate credential because it routes through Host_Editor's existing Copilot session.
6. THE Copilot_Plus SHALL not contribute any setting, command, or UI that selects a non-Copilot model provider.
7. WHEN Copilot_Entitlement becomes unavailable during a Session, THE Copilot_Plus SHALL cancel in-flight model requests within 2 seconds, SHALL retain unsent user input in the originating surface, and SHALL display a re-authentication prompt with an actionable sign-in control.

### R-PLAT-3: Model Selection

**User Story:** As a developer, I want to choose which Copilot model handles my requests, so that I can match cost, speed, and capability to the task.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL display a model picker in the Conversation_Pane and Tab_Workspace headers that lists every Copilot_Model returned by `vscode.lm.selectChatModels({ vendor: 'copilot' })`, sorted alphabetically by model display name, with a maximum of 50 models shown and a scrollable list if more are returned.
2. WHEN the user selects a Copilot_Model from the picker, THE Copilot_Plus SHALL apply that model to all subsequent requests in the active Session within 500 milliseconds of selection and SHALL retain the selection until the user changes it or the Session ends.
3. WHEN the user selects a Copilot_Model from the picker, THE Copilot_Plus SHALL persist the selected Copilot_Model identifier as the most recently used model for the active Workspace.
4. WHEN a new Session starts in a Workspace, THE Copilot_Plus SHALL load the model selection using the following precedence: (a) user-configured default model from settings if available in the list returned by Language_Model_API, (b) most recently persisted model for the Workspace if available, (c) the first Copilot_Model returned by Language_Model_API ordered alphabetically by model display name.
5. IF the previously selected Copilot_Model is not returned by Language_Model_API on Session start or model picker refresh, THEN THE Copilot_Plus SHALL select the first available Copilot_Model ordered alphabetically by model display name and SHALL display a non-blocking notice naming the unavailable model and the substitute model, with the notice remaining visible until dismissed.
6. IF Language_Model_API returns zero Copilot_Models, THEN THE Copilot_Plus SHALL disable the model picker, SHALL block submission of new requests, and SHALL display an error notice indicating that no models are available.
7. THE Copilot_Plus SHALL allow the user to assign a default Copilot_Model independently for each of the following surfaces: Inline Edit, Tab Completion, Conversation_Pane, Composer, Primary_Agent, and each pre-defined Sub_Agent role, persisted per Workspace.

### R-PLAT-4: Configuration and Settings

**User Story:** As a developer, I want to configure Copilot Plus behavior, so that I can tailor it to my workflow.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL contribute a `copilotPlus` Configuration_Namespace to the Host_Editor settings registry.
2. THE Copilot_Plus SHALL expose at minimum the following settings with the specified value domains: default Copilot_Model per surface (selected from available Copilot_Model identifiers), Tab Completion enabled languages (list of language identifiers, 0 to 200 entries), Tab Completion trigger delay (integer 0 to 2,000 milliseconds, default 75), Autonomy_Level enumeration (defined in `06-workflow.md`), command deny list (list of strings, 0 to 500 entries), Sensitive_File_Pattern list (list of glob strings, 0 to 500 entries), telemetry opt-in (boolean), Checkpoint retention count (integer 1 to 1,000, default 50), per-Session token cap (integer 1,000 to 1,000,000, default 100,000), deploy mode enumeration (`Manual`, `Auto`, default `Manual`), RAG enabled (boolean, default true).
3. WHEN a `copilotPlus.*` setting changes, THE Copilot_Plus SHALL apply the new value to subsequent operations within 2 seconds and SHALL NOT require a Host_Editor restart.
4. THE Copilot_Plus SHALL respect Workspace-level settings overrides for every `copilotPlus.*` setting, with Workspace values taking precedence over user-level values.
5. WHEN the user opens the Copilot_Plus settings page from the Control_Console, THE Copilot_Plus SHALL navigate Host_Editor to the `copilotPlus` Configuration_Namespace.
6. IF a setting value is outside its documented value domain or fails type validation, THEN THE Copilot_Plus SHALL revert that setting to its documented default value, SHALL continue operating using the default, and SHALL display a dismissible notification naming the invalid setting and the reason it was rejected.

### R-PLAT-5: Performance and Responsiveness

**User Story:** As a developer, I want the extension to feel responsive, so that it doesn't slow down my editor.

#### Acceptance Criteria

1. WHEN Host_Editor activates Copilot_Plus on a Workspace of 5,000 files or fewer, THE Copilot_Plus SHALL complete activation, defined as all registered commands and providers being ready to accept invocations, within 2,000 milliseconds.
2. IF Copilot_Plus activation does not complete within 2,000 milliseconds, THEN THE Copilot_Plus SHALL surface an activation indicator in the Control_Console and SHALL continue activation in the background without blocking Host_Editor startup.
3. WHEN the user invokes Inline Edit, THE Copilot_Plus SHALL display the Diff Review overlay within 250 milliseconds of receiving the first streamed token from Copilot_Model.
4. IF the first streamed token from Copilot_Model is not received within 5,000 milliseconds of an Inline Edit invocation, THEN THE Copilot_Plus SHALL cancel the request and SHALL display an error indication that the model did not respond.
5. WHEN the user types in the editor, THE Copilot_Plus SHALL not delay keystroke rendering by more than 16 milliseconds attributable to its inline completion provider, measured as time spent on the Host_Editor UI thread per keystroke.
6. THE Copilot_Plus SHALL cancel any in-flight Tab Completion request whose first token has not arrived within the configured timeout, with a default of 1,500 milliseconds and a permitted configuration range of 500 to 10,000 milliseconds.
7. WHILE a long-running background operation (Codebase Index rebuild, RAG embedding, document tree scan) is running, THE Copilot_Plus SHALL not occupy the Host_Editor UI thread for more than 50 milliseconds in any single operation and SHALL update progress in the Control_Console at intervals no greater than 1,000 milliseconds.
8. WHEN a Session is closed, THE Copilot_Plus SHALL release resources held by that Session, including cancelling pending requests, closing open file handles, and disposing event listeners, within 1,000 milliseconds.

### R-PLAT-6: Privacy and Sensitive Files

**User Story:** As a developer, I want Copilot Plus to keep secrets and ignored files out of model requests, so that I don't leak credentials.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL maintain a default Sensitive_File_Pattern list, matched case-insensitively against Workspace-relative paths, that includes at minimum: `**/.env`, `**/.env.*`, `**/*.pem`, `**/*.key`, `**/*.p12`, `**/*.pfx`, `**/id_rsa`, `**/id_dsa`.
2. THE Copilot_Plus SHALL allow the user to extend the Sensitive_File_Pattern list via settings, accepting between 0 and 500 valid glob patterns.
3. WHEN constructing any Copilot_Model request, THE Copilot_Plus SHALL exclude content, paths, and metadata of files matching any Sensitive_File_Pattern from every context source, including direct attachments, current file context, Codebase Index retrievals, RAG retrievals, Document_Tree retrievals, and Tab Completion context.
4. WHERE the user enables the `copilotPlus.indexing.respectGitignore` setting, THE Copilot_Plus SHALL treat files matched by any `.gitignore` in the Workspace, including nested `.gitignore` files, as Sensitive_File for the purposes of context construction and indexing, and SHALL apply changes to `.gitignore` files within 5 seconds of the file system event.
5. WHEN a Mention or attachment targets a Sensitive_File, THE Copilot_Plus SHALL block the attachment, SHALL display the matching pattern in the originating surface, and SHALL preserve the user's input in the Conversation_Pane.
6. IF the Copilot_Plus cannot determine whether a file matches a Sensitive_File_Pattern due to a pattern evaluation error, THEN THE Copilot_Plus SHALL treat the file as Sensitive_File and SHALL exclude it from the request.
7. THE Copilot_Plus SHALL not transmit Workspace content to any network endpoint other than the Copilot_Model request payload routed through Language_Model_API, the configured `@web` and `@docs` providers (defined in `04-context.md`), and registered MCP_Servers (defined in `08-extensibility.md`).

### R-PLAT-7: Telemetry

**User Story:** As a developer, I want clear control over telemetry, so that my privacy preferences are honored.

#### Acceptance Criteria

1. WHILE the Host_Editor global telemetry setting is enabled and the `copilotPlus.telemetry.enabled` setting is `true`, THE Copilot_Plus SHALL emit Telemetry_Events drawn from the documented Telemetry_Event allowlist defined in criterion 4.
2. IF either the Host_Editor global telemetry setting is disabled or the `copilotPlus.telemetry.enabled` setting is `false`, THEN THE Copilot_Plus SHALL suppress all Telemetry_Event emission within 1 second and SHALL discard any pending Telemetry_Events from its emission queue.
3. THE Copilot_Plus SHALL exclude file contents, file paths outside the Workspace_Root, prompts, model responses, and selection text from every field of every Telemetry_Event.
4. THE Copilot_Plus SHALL document, on a telemetry documentation page accessible from the Control_Console, every Telemetry_Event by name, every field of each event by name and description, and one example value per field.
5. WHEN the user toggles `copilotPlus.telemetry.enabled`, THE Copilot_Plus SHALL apply the change to subsequent emission decisions within 2 seconds and SHALL NOT require a Host_Editor restart.
6. IF a Telemetry_Event fails field validation against the documented schema, THEN THE Copilot_Plus SHALL drop the event and SHALL NOT emit it.

### R-PLAT-8: Error Handling and Offline Behavior

**User Story:** As a developer, I want clear feedback when AI requests fail or I'm offline, so that I can recover quickly.

#### Acceptance Criteria

1. IF a Copilot_Model request returns an error, THEN THE Copilot_Plus SHALL display the error message in the originating surface and SHALL provide a retry control that allows up to 3 user-initiated retries before requiring a new request.
2. IF the Copilot_Model request is rate-limited, THEN THE Copilot_Plus SHALL display the rate-limit message, SHALL retry no sooner than the interval indicated by the response, and SHALL fall back to a default wait of 30 seconds when the response provides no interval.
3. IF Host_Editor reports no network connectivity, THEN THE Copilot_Plus SHALL display an offline indicator in the Conversation_Pane header and the Control_Console within 2 seconds and SHALL block model requests with an offline message that names the affected surface.
4. WHEN Host_Editor reports network connectivity is restored, THE Copilot_Plus SHALL remove the offline indicator within 2 seconds and SHALL re-enable model requests.
5. WHEN the user cancels an in-flight request, THE Copilot_Plus SHALL abort the request via Language_Model_API cancellation within 2 seconds and SHALL display a cancellation acknowledgment in the originating surface.
6. IF a Tool invocation in the Build stage throws an unexpected exception, THEN THE Copilot_Plus SHALL capture the exception in the Task_Panel transcript, SHALL pause the affected task pending user input via Notification, and SHALL provide Resume, Retry, and Terminate controls.

### R-PLAT-9: Accessibility and Internationalization

**User Story:** As a developer who relies on accessibility tools, I want Copilot Plus surfaces to be accessible, so that I can use them with a screen reader and keyboard.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL ensure every interactive control in the Conversation_Pane, Tab_Workspace tabs, Control_Console, Inline Edit overlay, and Diff Review UI is reachable in a sequential order via Tab and Shift+Tab, with a visible focus indication on the focused control.
2. THE Copilot_Plus SHALL provide a non-empty accessible name and role for every interactive control via the Host_Editor webview accessibility APIs, such that a screen reader announces the control's purpose when focus is placed on it.
3. WHEN a streaming Copilot_Model response renders its final token in the Conversation_Pane, THE Copilot_Plus SHALL announce response completion to screen readers within 1 second via an ARIA live region.
4. IF a streaming Copilot_Model response is cancelled or fails, THEN THE Copilot_Plus SHALL announce the cancellation or failure to screen readers within 1 second via an ARIA live region.
5. THE Copilot_Plus SHALL externalize all user-facing strings using `vscode.l10n` such that translations can be added by providing a locale bundle without code changes, and SHALL NOT contain hard-coded user-facing strings outside locale bundles.
6. WHEN Copilot_Plus activates, THE Copilot_Plus SHALL read the Host_Editor configured locale and SHALL load the matching locale bundle for all user-facing surfaces.
7. IF no locale bundle matches the Host_Editor configured locale, THEN THE Copilot_Plus SHALL fall back to the English locale bundle and SHALL log the missing-locale fallback as a Telemetry_Event when telemetry is enabled.

### R-PLAT-10: Tool Permission Model

**User Story:** As a developer, I want fine-grained per-tool permissions as well as the broader Autonomy_Level, so that I can grant `read_file` and `grep` automatically while still gating `bash` and `git_commit`.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL support three Tool_Permission values per Tool: `allow` (the Tool runs without user prompt), `ask` (the Tool emits a Decision_Notification before execution), `deny` (the Tool is hidden from the Sub_Agent's effective tool list and any invocation is refused).
2. THE Copilot_Plus SHALL resolve the effective Tool_Permission for any Tool invocation by applying, in order: (a) the user-configured per-tool permission in `copilotPlus.tools.permissions`, (b) the user-configured wildcard permission matching the tool identifier, (c) the default Tool_Permission defined in `R-TOOL-1.4`.
3. WHEN the resolved Tool_Permission is `ask`, THE Copilot_Plus SHALL emit a Decision_Notification per `R-INT-10` with options `Approve`, `Approve_For_Session`, `Reject`. The `Approve_For_Session` choice SHALL upgrade the Tool_Permission to `allow` for the active Session only, reverting on Session close.
4. WHEN the resolved Tool_Permission is `deny`, THE Copilot_Plus SHALL omit the Tool from the Sub_Agent's effective tool list, and IF the Sub_Agent attempts the invocation by name anyway, THEN THE Copilot_Plus SHALL return `{ ok: false, reason: 'tool_denied' }`.
5. THE Autonomy_Level defined in `R-WF-7` SHALL bias the Tool_Permission resolution by upgrading any `ask` to `allow` for the categories permitted at that level: `Manual` upgrades nothing; `Approve_Edits` upgrades read-only Tools (`read_file`, `grep`, `glob`, `list_dir`, `lsp_*`, `code_search`, `doc_read`, `git_status`, `git_diff`, `todoread`, `webfetch`, `websearch`); `Approve_Commands` additionally upgrades write Tools (`write_file`, `apply_patch`, `delete_file`, `doc_write`, `doc_link`, `task_create`, `task_update`, `todowrite`, `lsp_rename`); `Full_Auto` upgrades every Tool except `bash`, `deploy_apply`, `deploy_rollback`, and any Tool whose command matches the deny list defined in `R-WF-7.6`.
6. THE Copilot_Plus SHALL display the resolved Tool_Permission for every Tool in the Control_Console under a `Tools` sub-section, including which layer in the resolution chain set the value.

### R-PLAT-11: Speculative Requests

**User Story:** As a developer, I want predictable surfaces (Tab Completion, NES, Scope_Resolution preheat) to feel instantaneous, so that the AI keeps up with my typing.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL allow Speculative_Requests for the following surfaces only: Tab Completion (per `R-EDIT-2`), Next Edit Suggestions (per `R-EDIT-7`), Scope_Resolution preheat (issuing the RAG retrieval defined in `R-DOCS-5` while the user is still typing the input).
2. WHEN a Speculative_Request is issued, THE Copilot_Plus SHALL associate it with a `confirmation_signal` (the subsequent user action that would consume the speculative result) and SHALL hold the response in memory for at most 30 seconds.
3. WHEN the `confirmation_signal` arrives within 30 seconds and matches the speculative key, THE Copilot_Plus SHALL deliver the held response within 50 milliseconds and SHALL NOT issue a new model request.
4. WHEN the `confirmation_signal` deviates from the speculative key (the user typed differently, moved focus, etc.), THE Copilot_Plus SHALL discard the held response within 100 milliseconds and SHALL cancel any still-in-flight speculative request.
5. THE Copilot_Plus SHALL count Speculative_Requests against the per-Session token cap defined in `R-PLAT-4.2` and SHALL apply a token discount of 50% to speculative tokens to reflect that some are wasted, when displaying the running token count per `R-CTX-4.6`.
6. THE Copilot_Plus SHALL never issue a Speculative_Request for any surface other than the three named in criterion 1.
7. THE Copilot_Plus SHALL expose the setting `copilotPlus.speculative.enabled` (default true) and `copilotPlus.speculative.maxConcurrent` (default 2, range 0 to 4) to control speculative budget.
