# Requirements: Agent System

Module ID: `AG`

## Introduction

Copilot_Plus uses a single Primary_Agent that orchestrates a fixed roster of pre-defined Sub_Agents. The user does not author or compose new agents; Copilot_Plus ships the roster and the Primary_Agent automatically delegates to the appropriate Sub_Agent based on the active Workflow_Step.

This design serves the product philosophy: **the user designs, the AI executes**. The user never has to think about who is doing what — the Primary_Agent picks the right specialist for each step.

## Glossary

- **Primary_Agent**: The single top-level agent that owns the Conversation_Pane during the Design stage and orchestrates Sub_Agent delegation during the Build and Deploy stages.
- **Sub_Agent**: A pre-defined specialist agent with a fixed role, system prompt, tool allowlist, and default Copilot_Model.
- **Sub_Agent_Role**: One of the fixed role identifiers contributed by Copilot_Plus and bound to a specific Workflow_Step.
- **Tool_Allowlist**: The fixed list of tool names a Sub_Agent is permitted to invoke. Tools outside the allowlist SHALL NOT be exposed to the agent.
- **Delegation**: The Primary_Agent's act of invoking a Sub_Agent for a Task, passing the task input and the Scope_Resolution result.

## Requirements

### R-AG-1: Primary Agent

**User Story:** As a developer, I want one top-level agent that owns the conversation and orchestrates everything else, so that I have a single point of contact.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL provide exactly one Primary_Agent per Workspace.
2. THE Primary_Agent SHALL own the Conversation_Pane during the Design stage and SHALL be the only agent that produces messages visible in the Conversation_Pane.
3. WHEN the user submits a Conversation_Pane message during the Design stage, THE Primary_Agent SHALL respond and, where appropriate, SHALL invoke Design-stage Sub_Agents (Requirement_Clarifier, Architect, Designer, Task_Planner) defined in `R-AG-3`.
4. WHEN the active Workflow_Stage is `Build`, THE Primary_Agent SHALL drive the Task_DAG defined in `R-WF-3`, delegating each Task to the Sub_Agent named by the Task's `agent` field.
5. WHEN the active Workflow_Stage is `Deploy`, THE Primary_Agent SHALL delegate to the Deployer Sub_Agent defined in `R-AG-3`.
6. THE Primary_Agent SHALL load the system prompt from `.copilotPlus/agents/primary.md` if present, falling back to the bundled default prompt when absent.
7. THE Primary_Agent SHALL NOT invoke any tool directly during the Build or Deploy stages; tool execution SHALL flow through Sub_Agents.

### R-AG-2: Sub Agent Roster

**User Story:** As a developer, I want a fixed roster of specialist agents, so that I never have to author agent topology.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL contribute the following fixed Sub_Agent_Role list, with each role bound to the listed Workflow_Step from `06-workflow.md`: `Requirement_Clarifier` (Design.Requirement_Clarification), `Architect` (Design.Architecture_Generation), `Designer` (Design.Design_Document_Generation), `Task_Planner` (Design.Task_List_Generation), `Explorer` (cross-stage helper, see criterion 8), `Coder` (Build.Coding), `Tester` (Build.Testing), `Reviewer` (Build.Review), `Committer` (Build.Commit), `Rollback_Operator` (Build.Rollback), `Deployer` (Deploy.Deployment).
2. THE Copilot_Plus SHALL bundle a default system prompt for every Sub_Agent_Role under `<extension>/resources/agents/<role>.md` and SHALL allow the user to override any prompt by placing a file at `.copilotPlus/agents/<role>.md`.
3. THE Copilot_Plus SHALL define a fixed Tool_Allowlist per Sub_Agent_Role, expressed as identifiers from `10-tools.md`, and SHALL NOT expose any tool outside the allowlist to that role. The allowlists are: `Requirement_Clarifier` = `[read_file, grep, glob, list_dir, code_search, doc_read, doc_write, doc_link, question]`; `Architect` = `[read_file, grep, glob, list_dir, code_search, lsp_diagnostics, lsp_definition, lsp_references, doc_read, doc_write, doc_link, question]`; `Designer` = `[read_file, grep, glob, list_dir, code_search, lsp_definition, lsp_references, doc_read, doc_write, doc_link, question]`; `Task_Planner` = `[read_file, grep, glob, list_dir, code_search, doc_read, doc_write, doc_link, task_create, todowrite, todoread, question]`; `Explorer` = `[read_file, grep, glob, list_dir, code_search, lsp_diagnostics, lsp_definition, lsp_references, lsp_hover, doc_read]`; `Coder` = `[read_file, write_file, apply_patch, delete_file, grep, glob, list_dir, code_search, lsp_diagnostics, lsp_definition, lsp_references, lsp_hover, lsp_rename, doc_read, todowrite, todoread, bash, question]`; `Tester` = `[read_file, grep, glob, list_dir, lsp_diagnostics, doc_read, run_tests, bash, question]`; `Reviewer` = `[read_file, grep, glob, list_dir, code_search, lsp_diagnostics, lsp_definition, lsp_references, lsp_hover, doc_read, git_diff, question]`; `Committer` = `[read_file, git_status, git_diff, git_commit, question]`; `Rollback_Operator` = `[read_file, git_status, git_diff, checkpoint_restore, question]`; `Deployer` = `[read_file, list_dir, doc_read, bash, deploy_apply, deploy_rollback, question]`.
4. THE Copilot_Plus SHALL allow MCP_Server tools to be injected into a Sub_Agent_Role's effective tool list as defined in `R-EXT-2`, subject to the per-server allowlist.
5. THE Copilot_Plus SHALL NOT allow the user to add or remove Sub_Agent_Roles from the roster, only to override prompts and view configuration in the Control_Console `Agents` section.
6. THE Copilot_Plus SHALL allow the user to assign a default Copilot_Model per Sub_Agent_Role via settings, falling back to the global Primary_Agent default when unset.

### R-AG-3: Automatic Delegation

**User Story:** As a developer, I want the Primary Agent to pick the right specialist automatically, so that I never have to call agents by name.

#### Acceptance Criteria

1. WHEN the active Workflow_Stage is `Design`, THE Primary_Agent SHALL classify each user message in the Conversation_Pane into one of the four Design Workflow_Steps and SHALL invoke the corresponding Sub_Agent_Role with the message as input.
2. WHEN the active Workflow_Stage is `Build`, THE Primary_Agent SHALL drive the Task_DAG by selecting Tasks whose status is `Ready`, by invoking the Sub_Agent_Role named in each Task's `agent` field, and by passing the Task input together with the Scope_Resolution result defined in `R-DOCS-5`.
3. WHEN a Sub_Agent completes a Task, THE Primary_Agent SHALL update the Task's status as defined in `R-WF-4` and SHALL select the next ready Task or the next Build Workflow_Step.
4. WHEN a Sub_Agent requires a user decision to proceed, THE Sub_Agent SHALL emit a Decision_Notification as defined in `R-INT-10` and SHALL await the user's response before continuing.
5. THE Primary_Agent SHALL include in every Sub_Agent invocation: (a) the active Workflow_Stage and Workflow_Step, (b) the active Skills attached to the Workspace per `R-EXT-1`, (c) the resolved Tool_Allowlist for the Sub_Agent_Role merged with any injected MCP_Server tools per `R-EXT-2`, (d) the **Layer_Walk** rooted at the System_Doc and descending to the Task's `scope_doc` per `R-DOCS-14`, (e) the Scope_Resolution result rooted at the Task's starting document for sibling and lateral context.
6. WHEN a Sub_Agent invocation fails 3 consecutive times on the same input, THE Primary_Agent SHALL transition the originating Task to `Blocked`, SHALL emit a Decision_Notification asking the user to Retry, Skip, or Terminate, and SHALL record the failures in the Task_Panel transcript.
7. THE Primary_Agent SHALL NOT invoke a Sub_Agent_Role outside the bindings defined in `R-AG-2.1`.

### R-AG-4: Agent Configuration Surfacing

**User Story:** As a developer, I want to inspect and override agent prompts from one place, so that I can adapt behavior without source edits.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL display in the Control_Console `Agents` section the Primary_Agent and every Sub_Agent_Role as a tree, with each node showing role, default Copilot_Model, system prompt path, and Tool_Allowlist.
2. WHEN the user activates an Edit Prompt control on an agent node, THE Copilot_Plus SHALL open the corresponding `.copilotPlus/agents/<role>.md` file in a Host_Editor tab, creating the file from the bundled default if it does not exist.
3. WHEN any agent prompt file under `.copilotPlus/agents/` is created, modified, or deleted, THE Copilot_Plus SHALL apply the change to subsequent agent invocations within 2 seconds and SHALL NOT require a Host_Editor restart.
4. THE Copilot_Plus SHALL NOT expose controls in the Control_Console to add or remove Sub_Agent_Roles, modify the Tool_Allowlist of a role, or change the Workflow_Step binding of a role.

### R-AG-5: Explorer Sub Agent

**User Story:** As the Primary_Agent or any other Sub_Agent, I want to delegate read-only codebase investigation to a specialist, so that exploration does not pollute the parent agent's context.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL allow the Primary_Agent and the Coder, Tester, Reviewer, Architect, and Designer Sub_Agents to invoke the Explorer Sub_Agent as a sub-task with a query and a thoroughness level (`quick`, `medium`, `thorough`).
2. WHEN the Explorer Sub_Agent is invoked, THE Copilot_Plus SHALL run the agent in a separate context that does not inherit the parent agent's prior tool transcript and SHALL return a single structured summary `{ findings: Array<{ path, range?, summary }>, recommended_files: string[] }` to the parent.
3. THE Explorer Sub_Agent SHALL be read-only. THE Copilot_Plus SHALL NOT include any write tool in the Explorer Tool_Allowlist (verifiable from `R-AG-2.3`).
4. THE Copilot_Plus SHALL apply per-thoroughness budgets: `quick` ≤ 5 tool calls and ≤ 30 seconds; `medium` ≤ 20 tool calls and ≤ 120 seconds; `thorough` ≤ 60 tool calls and ≤ 600 seconds.
5. THE Explorer Sub_Agent SHALL prefer `code_search` over manual `grep`/`glob` chains, defaulting to `code_search` with the matching thoroughness level.
6. THE Explorer Sub_Agent invocation SHALL NOT count against the parent task's tool-call budget defined in `R-WF-8.1`; Explorer's own budget is bounded by criterion 4.

### R-AG-6: Post-Edit Verification

**User Story:** As a developer, I want every Coder edit to automatically check for new diagnostics before proceeding, so that broken code never reaches the Tester step.

#### Acceptance Criteria

1. AFTER the Coder Sub_Agent applies any file edit through `write_file`, `apply_patch`, `delete_file`, or `lsp_rename` per `R-TOOL-3` and `R-TOOL-5`, THE Copilot_Plus SHALL invoke `lsp_diagnostics` on the changed files and on every file in the `lsp_references` result for any modified function, class, or method symbol.
2. WHEN the post-edit `lsp_diagnostics` return new diagnostics with severity `Error` that did not exist before the edit, THE Copilot_Plus SHALL feed the new diagnostics back to the Coder Sub_Agent as a structured `regression_diagnostics` field for the next iteration round, before transitioning the Task to the Tester step.
3. THE Copilot_Plus SHALL apply at most 3 post-edit Coder rounds per Task before transitioning to `Failed` per `R-WF-4.5`.
4. WHEN the active language has no LSP provider registered, THE Copilot_Plus SHALL skip post-edit verification and SHALL log the skip in the Task_Panel transcript without blocking the Task.

### R-AG-7: Tool Calling Loop Invariants

**User Story:** As an implementer, I want a precise definition of the agent's tool-calling loop, so that the engine behaves predictably under errors, parallel tool calls, and budget exhaustion.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL define an Agent_Loop_Iteration as one of: (a) one Copilot_Model request that returns either a final answer or one or more tool calls, (b) execution of every tool call returned, (c) appending tool results to the agent's running message list, (d) deciding whether to continue or terminate.
2. THE Copilot_Plus SHALL terminate an Agent_Loop when any of the following conditions is true: (a) the model returns a final answer with no tool calls, (b) the per-Build_Operation tool-call budget defined in `R-WF-8.1` is exhausted, (c) the per-Build_Operation wall-clock budget defined in `R-WF-8.2` is exhausted, (d) the user activates Stop in the Task_Panel, (e) Conversation_Summarization is blocked per `R-CTX-7.4`.
3. WHEN a single Agent_Loop_Iteration returns multiple tool calls, THE Copilot_Plus SHALL execute read-only tools (per `R-TOOL-1.4` `allow` defaults: `read_file`, `grep`, `glob`, `list_dir`, `lsp_*`, `code_search`, `doc_read`, `git_status`, `git_diff`, `todoread`, `webfetch`, `websearch`) in parallel up to a concurrency of 4 per iteration, and SHALL execute write tools and `bash` strictly sequentially in the order returned.
4. WHEN a tool call returns an error, THE Copilot_Plus SHALL append the structured error to the agent's running message list and SHALL allow the loop to continue. THE Copilot_Plus SHALL terminate the loop with a `Failed` task status if the same tool with the same inputs returns the same error 3 consecutive times.
5. WHEN an Agent_Loop_Iteration exceeds the configured per-iteration timeout (default 300 seconds, configurable via `copilotPlus.agent.iterationTimeout` between 30 and 1,800 seconds), THE Copilot_Plus SHALL cancel the iteration via Language_Model_API cancellation, append a timeout marker to the running message list, and continue the loop.
6. THE Copilot_Plus SHALL persist the agent's running message list at the end of every iteration to `.copilotPlus/builds/<build-id>/<task-id>/messages.jsonl`, so a Build_Operation can be inspected post-mortem and so a paused task can resume from the last persisted iteration.
7. THE Copilot_Plus SHALL never invoke a single tool with concurrent identical inputs within the same Agent_Loop. IF the model returns duplicate tool calls in one iteration, THEN THE Copilot_Plus SHALL deduplicate them by `(tool_name, inputs_canonical_json)` before execution.

### R-AG-8: Multi-Agent Verification

**User Story:** As an enterprise team, I want critical decisions to be cross-checked by multiple agent runs, so that we trade tokens for higher correctness on the steps that matter most.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL allow the following Sub_Agent_Roles to be configured for Multi_Agent_Verification: `Architect`, `Designer`, `Reviewer`, `Deployer`. THE remaining roles SHALL run as single-agent invocations.
2. WHEN Multi_Agent_Verification is enabled for a role and the active Workflow_Step invokes that role, THE Primary_Agent SHALL run N parallel invocations of the role with identical inputs but with `temperature` jittered uniformly in `[0.0, 0.4]`, where N is configured by `copilotPlus.verification.<role>.candidates` (default 3, range 1 to 5).
3. WHEN N candidate outputs return, THE Primary_Agent SHALL select the final output by one of the configured strategies in `copilotPlus.verification.<role>.strategy`: `majority_vote` (cluster outputs by structural similarity, pick the largest cluster's representative), `arbiter` (invoke a dedicated arbiter Sub_Agent that receives all N candidates and returns a chosen result with rationale), `union` (merge non-conflicting parts of all candidates, available only for `Architect` and `Designer` outputs).
4. THE Primary_Agent SHALL record every candidate output, the chosen strategy, the selected output, and the rationale in the Task_Panel transcript, so the user can audit verification.
5. IF all N candidates fail or disagree beyond a configurable threshold (`copilotPlus.verification.<role>.disagreementMax`, default 0.6 cosine distance for arbiter mode, default 0 majority for `majority_vote`), THEN THE Primary_Agent SHALL escalate to the user via Decision_Notification with the candidate outputs displayed and options `Pick_Candidate_<n>`, `Ask_For_Revision`, `Skip`.
6. THE Multi_Agent_Verification budget SHALL be governed by `R-WF-8.1` (per-Build_Operation tool-call budget) and SHALL count each candidate invocation against that budget.
7. THE Copilot_Plus SHALL expose a per-Build_Operation override `verification.disable` that turns off Multi_Agent_Verification for fast iteration on non-critical builds.

### R-AG-9: Continuous Background Agent (Foreground-Idle Only)

**User Story:** As a developer, I want the Primary_Agent to keep watching the workspace when I am idle but Host_Editor is still open, so that the AI works while I am at lunch or in a meeting.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL expose `copilotPlus.background.enabled` (default `false`) and `copilotPlus.background.tasks` (a list of enabled background task identifiers from the set defined in criterion 2).
2. THE Copilot_Plus SHALL contribute the following Background_Tasks: `doc_drift_scan` (compare Document_Tree to code and propose updates), `flaky_test_scan` (run the test suite multiple times and identify flakes), `dead_code_scan` (find unreferenced symbols and propose removal), `dependency_audit` (check for outdated or vulnerable dependencies), `agents_md_proposal` (propose AGENTS.md additions based on observed friction in the past N tasks), `lateral_link_proposal` (propose new Lateral_Links between documents based on co-edit patterns), `index_rebuild` (re-build Codebase_Index and RAG_Index when the heuristic suggests stale state).
3. THE Copilot_Plus SHALL trigger Background_Tasks **only while Host_Editor is running and the user has been idle within Host_Editor**, defined as no editor edits and no Conversation_Pane input for at least 5 minutes (configurable via `copilotPlus.background.idleThreshold`, range 60 seconds to 3,600 seconds). Background_Tasks SHALL NOT continue after Host_Editor is closed and SHALL NOT resume automatically when Host_Editor is reopened — they SHALL wait for the next idle window. For 24-hour autonomous operation, the user MUST use the CI Mode defined in `R-DEP-7`.
4. THE Copilot_Plus SHALL apply a per-Background_Task budget cap (`copilotPlus.background.<task>.maxToolCalls`, default 30, range 5 to 200) and a wall-clock cap (`copilotPlus.background.<task>.maxDuration`, default 600 seconds, range 60 to 3,600 seconds).
5. WHEN a Background_Task produces a proposal (file edit, Lateral_Link addition, AGENTS.md addition, etc.), THE Copilot_Plus SHALL queue the proposal in the Decision_Center per `R-INT-11` with options `Apply`, `Apply_With_Edit`, `Reject`, `Snooze_24h`. THE Copilot_Plus SHALL NOT auto-apply Background_Task proposals.
6. WHEN the user resumes activity (any editor edit or Conversation_Pane input), THE Copilot_Plus SHALL pause all in-flight Background_Tasks within 2 seconds, save partial progress, and resume them at the next idle window.
7. THE Copilot_Plus SHALL display Background_Task status (current task, elapsed time, last finding) in the Control_Console `Status` section.
8. THE Background_Agent SHALL never run during the Build or Deploy stages of an active Build_Operation, to avoid contention with foreground Sub_Agents.
9. THE Copilot_Plus SHALL display a clear notice on first enabling Background_Agent that explains the foreground-idle constraint, so users do not expect overnight unattended operation from the IDE alone.
