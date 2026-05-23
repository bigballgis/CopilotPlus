# Requirements: Development Workflow

Module ID: `WF`

## Introduction

Copilot_Plus enforces a fixed three-stage development workflow: **Design → Build → Deploy**. The user drives the Design stage through the Conversation_Pane; the AI executes the Build and Deploy stages through the Tab_Workspace, asking for decisions only via Decision_Notifications. The active Workflow_Stage gates which surfaces accept input and which Sub_Agents may run.

This module defines the stages, the steps within each stage, the task DAG that the Build stage operates on, and the controls that govern stage transitions and per-task execution.

## Glossary

- **Workflow_Stage**: One of `Design`, `Build`, `Deploy`. Exactly one is active at a time per Workspace.
- **Workflow_Step**: A named sub-phase within a Workflow_Stage. Each step is bound to a specific Sub_Agent role (defined in `07-agents.md`).
- **Task**: A unit of work created during the Design stage, executed during the Build stage, identified by a stable identifier, with a status, a dependency list, and an assigned Sub_Agent role.
- **Task_DAG**: The directed acyclic graph of Tasks for a single Build operation, where edges denote `depends_on` relationships.
- **Build_Operation**: A single end-to-end execution of the Build stage over a Task_DAG. Identified by a `build-id`.
- **Autonomy_Level**: A user-configurable setting governing how much AI tool execution requires explicit approval. Values: `Manual`, `Approve_Edits`, `Approve_Commands`, `Full_Auto`.

## Requirements

### R-WF-1: Workflow Stages

**User Story:** As a developer, I want a fixed three-stage workflow, so that I and the AI always agree on what is happening next.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL maintain exactly one active Workflow_Stage per Workspace, with allowed values `Design`, `Build`, `Deploy`.
2. THE Copilot_Plus SHALL persist the active Workflow_Stage under `.copilotPlus/state.json` and SHALL restore it on Workspace open.
3. WHEN Copilot_Plus is first activated in a new Workspace, THE Copilot_Plus SHALL set the initial Workflow_Stage to `Design`.
4. THE Copilot_Plus SHALL provide controls in the Control_Console `Workflow_Stage` section to transition between stages, with the following allowed transitions: `Design → Build`, `Build → Design`, `Build → Deploy`, `Deploy → Build`, `Deploy → Design`.
5. IF the user attempts a transition not listed in criterion 4, THEN THE Copilot_Plus SHALL block the transition and SHALL display a message naming the disallowed transition.
6. THE Copilot_Plus SHALL fire the `stage.entered` and `stage.exited` Hook_Events defined in `R-EXT-3` on every successful transition.

### R-WF-2: Design Stage

**User Story:** As a developer, I want the Design stage to walk me through requirement clarification, architecture, design docs, and task generation, so that I produce a complete plan before any code changes.

#### Acceptance Criteria

1. THE Design Workflow_Stage SHALL consist of exactly four Workflow_Steps, in this order: `Requirement_Clarification`, `Architecture_Generation`, `Design_Document_Generation`, `Task_List_Generation`.
2. THE Copilot_Plus SHALL bind each Design Workflow_Step to a Sub_Agent_Role as defined in `R-AG-2.1`: `Requirement_Clarification → Requirement_Clarifier`, `Architecture_Generation → Architect`, `Design_Document_Generation → Designer`, `Task_List_Generation → Task_Planner`.
3. THE Primary_Agent SHALL accept user input in the Conversation_Pane during all four Design Workflow_Steps and SHALL classify each user message into the current step.
4. WHEN the Requirement_Clarifier Sub_Agent completes its output, THE Copilot_Plus SHALL produce or update the System_Doc and Module_Docs under `.copilotPlus/docs/system/` per `R-DOCS-1` and route the writes through the Diff_Review_UI defined in `R-EDIT-4`.
5. WHEN the Architect Sub_Agent completes its output, THE Copilot_Plus SHALL produce or update the architecture artifacts (Module_Docs, Feature_Docs, lateral links) per `R-DOCS-1` and SHALL refresh the Architecture_Panel.
6. WHEN the Designer Sub_Agent completes its output, THE Copilot_Plus SHALL produce or update Feature_Docs and Component_Docs per `R-DOCS-1` and SHALL refresh the Requirement_Panel.
7. WHEN the Task_Planner Sub_Agent completes its output, THE Copilot_Plus SHALL produce a Task_DAG file at `.copilotPlus/builds/<build-id>/tasks.json` containing the Task list and dependency edges, and SHALL display the Task_DAG in the Task_Panel.
8. THE Copilot_Plus SHALL allow the user to advance from one Design Workflow_Step to the next via a `Continue` control in the Conversation_Pane header, only after the current step has produced a complete artifact set per criteria 4-7.
9. THE Copilot_Plus SHALL allow the user to revisit any earlier Design Workflow_Step at any time via a step picker in the Conversation_Pane header.

### R-WF-3: Task DAG

**User Story:** As a developer, I want every build to be governed by a dependency DAG, so that the AI runs tasks in the right order and parallelizes where safe.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL store the Task_DAG for each Build_Operation at `.copilotPlus/builds/<build-id>/tasks.json` containing a list of Task entries with fields: `id` (unique within build), `title` (string), `description` (string), `agent` (Sub_Agent_Role identifier from the Build stage roster), `inputs` (object), `depends_on` (list of Task ids), `status` (initially `Pending`), `scope_doc` (Document_Tree path that anchors Scope_Resolution per `R-DOCS-5`).
2. THE Copilot_Plus SHALL validate the Task_DAG on creation and on any modification, ensuring (a) no cycles, (b) every `depends_on` id exists, (c) every `agent` matches a Build-stage Sub_Agent_Role from `R-AG-2.1`, (d) every `scope_doc` resolves to a document under `.copilotPlus/docs/`.
3. IF Task_DAG validation fails, THEN THE Copilot_Plus SHALL surface the validation errors in the Task_Panel, SHALL block Build_Operation start, and SHALL surface the validation errors in the editor problem pane.
4. THE Copilot_Plus SHALL transition each Task to `Ready` only when every Task in its `depends_on` list has status `Done`.
5. THE Copilot_Plus SHALL execute up to 3 Tasks concurrently when their statuses are `Ready` and their `depends_on` are satisfied, configurable via `copilotPlus.workflow.maxConcurrentTasks` between 1 and 8.
6. THE Copilot_Plus SHALL fire `task.started`, `task.completed`, and `task.failed` Hook_Events at the appropriate transitions per `R-EXT-3`.

### R-WF-4: Build Stage Steps

**User Story:** As a developer, I want every build to flow through coding, testing, review, commit, and rollback steps, so that the AI's work is audited at every gate.

#### Acceptance Criteria

1. THE Build Workflow_Stage SHALL consist of exactly six Workflow_Steps, applied per Task in this order: `Coding`, `Testing`, `Review`, `Commit`. The `Rollback` step is invoked on demand by the user, not as part of the default per-Task flow.
2. THE Copilot_Plus SHALL bind each Build Workflow_Step to a Sub_Agent_Role as defined in `R-AG-2.1`: `Coding → Coder`, `Testing → Tester`, `Review → Reviewer`, `Commit → Committer`, `Rollback → Rollback_Operator`.
3. WHEN the Coder Sub_Agent produces file edits for a Task, THE Copilot_Plus SHALL route the edits through the Diff_Review_UI defined in `R-EDIT-4`, subject to the active Autonomy_Level defined in `R-WF-7`.
4. WHEN the Coder Sub_Agent finishes for a Task, THE Primary_Agent SHALL invoke the Tester Sub_Agent for the same Task, passing the test command resolved from project conventions or from `copilotPlus.workflow.testCommand` setting.
5. IF the Tester Sub_Agent reports test failures, THEN THE Primary_Agent SHALL feed the failing test output back to the Coder Sub_Agent for up to 3 iteration rounds before transitioning the Task to `Failed` and emitting a Decision_Notification to the user.
6. WHEN the Tester Sub_Agent reports all tests pass, THE Primary_Agent SHALL invoke the Reviewer Sub_Agent for the same Task, passing the diff and the Scope_Resolution result.
7. IF the Reviewer Sub_Agent identifies blocking issues, THEN THE Primary_Agent SHALL transition the Task to `Blocked` and SHALL emit a Decision_Notification to the user with options to feed the review comments back to Coder, accept anyway, or terminate.
8. WHEN the Reviewer Sub_Agent passes the Task without blocking issues, THE Primary_Agent SHALL invoke the Committer Sub_Agent for the same Task, which SHALL stage and commit the Task's changes with a generated commit message that includes the Task id and a one-line summary, subject to the deny list and Autonomy_Level.
9. IF the Committer Sub_Agent fails to commit (for example due to git hooks or merge state), THEN THE Primary_Agent SHALL transition the Task to `Failed` and SHALL emit a Decision_Notification.
10. WHEN every Task in the Task_DAG is `Done`, THE Copilot_Plus SHALL transition the Build_Operation to `Completed` and SHALL prompt the user via the Control_Console to advance to the Deploy stage.

### R-WF-5: Rollback Step

**User Story:** As a developer, I want a one-click rollback step that reverts the AI's work, so that I can recover from a bad build cleanly.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL provide a Rollback control in the Task_Panel for any Task whose status is `Done` or `Failed`, which when activated invokes the Rollback_Operator Sub_Agent for that Task.
2. WHEN the Rollback_Operator Sub_Agent runs, THE Copilot_Plus SHALL restore the Checkpoint associated with the Task per `R-EDIT-5` and SHALL revert the corresponding git commit if one was created.
3. WHEN a Rollback completes successfully, THE Copilot_Plus SHALL transition the originating Task to `RolledBack`, SHALL update the Commit_Panel entry per `R-INT-7.5`, and SHALL fire the `rollback.completed` Hook_Event.
4. THE Copilot_Plus SHALL provide a Rollback Build control in the Task_Panel header that, when activated and confirmed, rolls back every Task in the active Build_Operation in reverse Task_DAG topological order.
5. IF any Rollback step fails, THEN THE Copilot_Plus SHALL stop the rollback chain at the failed step, SHALL transition the offending Task to `Failed`, and SHALL emit a Decision_Notification asking the user to Retry, Skip, or Terminate.

### R-WF-6: Stage Transitions

**User Story:** As a developer, I want clean rules about when I can switch stages, so that I never accidentally lose in-progress work.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL allow `Design → Build` only when the active Design Workflow_Step is `Task_List_Generation` and the Task_DAG validation in `R-WF-3.2` has passed.
2. THE Copilot_Plus SHALL allow `Build → Design` at any time, but if any Task is in status `Running`, THEN THE Copilot_Plus SHALL prompt for confirmation and SHALL pause running Tasks before transitioning.
3. THE Copilot_Plus SHALL allow `Build → Deploy` only when every Task in the active Build_Operation has status `Done` or `RolledBack`.
4. THE Copilot_Plus SHALL allow `Deploy → Build` at any time, with no impact on the deployed environment.
5. THE Copilot_Plus SHALL allow `Deploy → Design` at any time.

### R-WF-7: Autonomy Levels and Approval

**User Story:** As a developer, I want to control how much the agent can do without asking, so that I can match autonomy to my comfort level.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL support the following Autonomy_Level values: `Manual`, `Approve_Edits`, `Approve_Commands`, `Full_Auto`, persisted via `copilotPlus.workflow.autonomyLevel`.
2. WHILE Autonomy_Level is `Manual`, THE Copilot_Plus SHALL emit a Decision_Notification before any Sub_Agent tool invocation in the Build or Deploy stages.
3. WHILE Autonomy_Level is `Approve_Edits`, THE Copilot_Plus SHALL emit a Decision_Notification before any `edit_file`, `create_file`, or `delete_file` tool invocation.
4. WHILE Autonomy_Level is `Approve_Commands`, THE Copilot_Plus SHALL emit a Decision_Notification before any `run_terminal_command`, `deploy_apply`, or `deploy_rollback` tool invocation.
5. WHILE Autonomy_Level is `Full_Auto`, THE Copilot_Plus SHALL execute Sub_Agent tool invocations without per-call approval, except as overridden by criterion 6.
6. THE Copilot_Plus SHALL maintain a user-configurable command deny list of glob patterns at `copilotPlus.workflow.commandDenyList`, and SHALL emit a Decision_Notification before any `run_terminal_command` invocation whose command string matches any deny-list pattern, regardless of Autonomy_Level.
7. WHEN a Decision_Notification times out per `R-INT-10.4`, THE Copilot_Plus SHALL treat the timeout as Reject for any tool invocation gated by Autonomy_Level.
8. THE Copilot_Plus SHALL display the active Autonomy_Level in the Control_Console `Workflow_Stage` section and SHALL apply user changes to the Autonomy_Level to subsequent tool invocations within 1 second of the change.

### R-WF-8: Build Operation Limits

**User Story:** As a developer, I want bounded build operations, so that runaway agents cannot consume unbounded resources.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL apply a default per-Build_Operation maximum tool-call count of 200, configurable via `copilotPlus.workflow.maxToolCalls` between 10 and 2,000.
2. THE Copilot_Plus SHALL apply a default per-Build_Operation maximum wall-clock duration of 7,200 seconds, configurable via `copilotPlus.workflow.maxBuildDuration` between 60 and 86,400 seconds.
3. WHEN either limit is reached, THE Copilot_Plus SHALL pause the Build_Operation, SHALL transition every `Running` Task to `Blocked`, and SHALL emit a Decision_Notification asking the user to Continue (raise the limit), Pause, or Terminate.
4. THE Copilot_Plus SHALL provide a Stop All control in the Task_Panel header that, when activated, cancels every in-flight Sub_Agent invocation within 2 seconds and transitions all `Running` Tasks to `Blocked`.

### R-WF-9: Build Isolation via Worktree

**User Story:** As a developer, I want long Build_Operations to run in an isolated git worktree, so that I can keep working on the main branch while the AI executes a multi-task DAG.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL expose the setting `copilotPlus.workflow.buildIsolation` with allowed values `inline` (default), `worktree`, `worktree_branch`.
2. WHEN `buildIsolation` is `worktree`, THE Copilot_Plus SHALL create a git worktree at `.copilotPlus/worktrees/<build-id>/` rooted at the current HEAD before the Build_Operation starts, and SHALL run every Sub_Agent file Tool against that worktree path.
3. WHEN `buildIsolation` is `worktree_branch`, THE Copilot_Plus SHALL create a worktree on a new branch `copilot-plus/build/<build-id>` rooted at the current HEAD before the Build_Operation starts, and SHALL run all edits on that branch.
4. WHEN a Build_Operation completes successfully and `buildIsolation` is not `inline`, THE Copilot_Plus SHALL emit a Decision_Notification with options `Merge_To_Main`, `Cherry_Pick_Selected_Tasks`, `Keep_Isolated`, `Discard`. WHEN the user selects `Merge_To_Main`, THE Copilot_Plus SHALL fast-forward or merge with `--no-ff` per the user's git configuration. WHEN the user selects `Cherry_Pick_Selected_Tasks`, THE Copilot_Plus SHALL show the per-Task commits and let the user pick which to apply to the main branch.
5. IF the worktree creation fails (for example because git is not available or because the working tree is dirty), THEN THE Copilot_Plus SHALL fall back to `inline` mode for that Build_Operation, SHALL display a notice naming the cause, and SHALL log the fallback in the Task_Panel transcript.
6. THE Copilot_Plus SHALL prune worktrees of completed Build_Operations after a user-configurable retention (default 7 days, range 1 to 90 days) via the setting `copilotPlus.workflow.worktreeRetentionDays`.
7. THE Copilot_Plus SHALL display the active Build_Operation's working path in the Task_Panel header, distinguishing `inline` from `worktree:<branch>`.
