# Requirements: Interaction Layer

Module ID: `INT`

## Introduction

This module defines the unified workspace UI of Copilot_Plus and the interaction model that supports the product philosophy: **the user designs in the Conversation_Pane; the AI executes through panels and reports decisions via Notifications.**

The layout has three primary regions:

- **Activity Bar (Control_Console)** on the far left — configures Skills, Agents, MCP servers, Hooks, models, and other settings.
- **Main Editor Area split horizontally**:
  - **Conversation_Pane** on the left — used **only during the Design stage**. Always reflects Design-stage conversations with the Primary_Agent.
  - **Tab_Workspace** on the right — five fixed tabs: `Task_Panel`, `Architecture_Panel`, `Requirement_Panel`, `Commit_Panel`, `Deploy_Panel`.
- **Notification surface** — Host_Editor's native notifications, used during Build and Deploy stages to ask the user for decisions without interrupting flow.

## Glossary

- **Conversation_Pane**: The left-side webview that hosts the Design-stage conversation with the Primary_Agent. Disabled or read-only outside the Design stage.
- **Tab_Workspace**: The right-side webview container hosting five fixed tabs.
- **Task_Panel**: The Tab_Workspace tab that drives Build-stage operations (task list, DAG, statuses, controls).
- **Architecture_Panel**: The Tab_Workspace tab that displays generated architecture diagrams and allows navigation into the Document_Tree.
- **Requirement_Panel**: The Tab_Workspace tab that displays the current requirement document tree and allows preview/edit.
- **Commit_Panel**: The Tab_Workspace tab that displays Build-stage commit history, diffs, and Checkpoint controls.
- **Deploy_Panel**: The Tab_Workspace tab that displays deployment configuration and live deploy status.
- **Control_Console**: The activity bar view containing tree sections for Skills, Agents, MCP, Hooks, Models, Settings, and Status.
- **Decision_Notification**: A Host_Editor notification raised during Build or Deploy that requires the user to choose among a fixed set of options to unblock an executing task.

## Requirements

### R-INT-1: Workspace Layout

**User Story:** As a developer, I want a single, predictable workspace layout for Copilot Plus, so that I always know where to look for each feature.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL contribute a single "Copilot Plus" view container to the Host_Editor activity bar, named the Control_Console.
2. THE Copilot_Plus SHALL contribute a single command `copilotPlus.openWorkspace` that, when invoked, opens the Conversation_Pane on the left half of the editor area and the Tab_Workspace on the right half, occupying equal width by default.
3. WHEN the user resizes the Conversation_Pane or Tab_Workspace, THE Copilot_Plus SHALL persist the new split ratio per Workspace and SHALL restore it on subsequent `copilotPlus.openWorkspace` invocations.
4. THE Copilot_Plus SHALL not provide any other user-visible top-level UI surface beyond the Control_Console, Conversation_Pane, Tab_Workspace, Inline Edit overlay (defined in `03-editing.md`), and Decision_Notifications.
5. WHEN the user closes the Conversation_Pane or any Tab_Workspace tab, THE Copilot_Plus SHALL allow re-opening it via the Control_Console without losing in-memory state from the Session.

### R-INT-2: Conversation_Pane

**User Story:** As a developer, I want the conversation pane to be the place I drive design decisions, so that I have one clear surface for AI dialogue.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL accept user input in the Conversation_Pane only while the active Workflow_Stage is `Design`.
2. WHILE the active Workflow_Stage is `Build` or `Deploy`, THE Copilot_Plus SHALL render the Conversation_Pane in read-only mode, SHALL disable the input box, and SHALL display a banner indicating that direct input is unavailable in the current stage.
3. THE Copilot_Plus SHALL stream Primary_Agent responses into the Conversation_Pane with the first visible token rendered within 2 seconds of the request being accepted by Copilot_Model.
4. THE Copilot_Plus SHALL persist the full Conversation_Pane history per Workspace under `.copilotPlus/sessions/`, including user and model messages and timestamps, and SHALL restore the most recent session on Workspace open.
5. THE Copilot_Plus SHALL allow the user to start a new Conversation_Pane Session, switch between Sessions, rename a Session, and delete a Session via controls in the Conversation_Pane header.
6. IF the user requests deletion of a Session, THEN THE Copilot_Plus SHALL prompt for confirmation and SHALL permanently remove the Session and its persisted messages only after the user confirms.
7. THE Copilot_Plus SHALL display, in the Conversation_Pane header, the active Copilot_Model identifier, the active Workflow_Stage, and the cumulative input token count of the active Session, and SHALL update the token count after each completed request and response.
8. WHEN the user types `@` in the Conversation_Pane input, THE Copilot_Plus SHALL display the Mention picker defined in `04-context.md` within 200 milliseconds.

### R-INT-3: Tab_Workspace

**User Story:** As a developer, I want a fixed set of right-side tabs that show me everything the AI is doing, so that I can monitor and control execution.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL contribute exactly the following five tabs to the Tab_Workspace, in this order: `Task_Panel`, `Architecture_Panel`, `Requirement_Panel`, `Commit_Panel`, `Deploy_Panel`.
2. THE Copilot_Plus SHALL allow the user to switch between Tab_Workspace tabs using mouse click and using a keybinding sequence `Ctrl+Alt+1` through `Ctrl+Alt+5` mapped to tabs 1 through 5 respectively.
3. WHEN the active Workflow_Stage transitions to `Design`, THE Copilot_Plus SHALL automatically focus the `Requirement_Panel` tab.
4. WHEN the active Workflow_Stage transitions to `Build`, THE Copilot_Plus SHALL automatically focus the `Task_Panel` tab.
5. WHEN the active Workflow_Stage transitions to `Deploy`, THE Copilot_Plus SHALL automatically focus the `Deploy_Panel` tab.
6. THE Copilot_Plus SHALL persist the last user-selected tab per Workspace and SHALL restore it on subsequent Workspace opens, except when an automatic stage-transition focus rule (criteria 3-5) applies.

### R-INT-4: Task_Panel

**User Story:** As a developer, I want a task panel that shows every action the AI is performing, so that I can supervise the Build stage in detail.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL display in the Task_Panel a hierarchical view of all tasks generated for the active Build operation, with each task showing identifier, title, status (one of `Pending`, `Ready`, `Running`, `Blocked`, `Done`, `Failed`, `Skipped`), assigned Sub_Agent role, and elapsed time.
2. THE Copilot_Plus SHALL display, alongside the task list, a directed acyclic graph (DAG) view showing dependencies between tasks, with edges drawn from each task to its dependents.
3. WHEN a task transitions between statuses, THE Copilot_Plus SHALL update both the list view and the DAG view within 1 second of the transition.
4. THE Copilot_Plus SHALL provide per-task controls in the Task_Panel for Pause, Resume, Skip, Retry, and View Logs, each invokable via mouse or keyboard.
5. WHEN the user activates Pause on a task, THE Copilot_Plus SHALL stop new sub-actions of that task within 2 seconds, SHALL allow the currently in-flight sub-action to complete, and SHALL transition the task to `Blocked`.
6. WHEN the user activates View Logs on a task, THE Copilot_Plus SHALL display the full transcript of Primary_Agent and Sub_Agent activity for that task in a scrollable region, including tool calls, tool inputs, tool outputs, and any Decision_Notification responses.
7. THE Copilot_Plus SHALL persist the Task_Panel state per Build operation under `.copilotPlus/builds/<build-id>/`, SHALL retain the most recent 20 Build operations, and SHALL evict older ones first when the limit is exceeded.

### R-INT-5: Architecture_Panel

**User Story:** As a developer, I want an architecture panel that shows the generated system structure, so that I can understand and validate the AI's design.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL display in the Architecture_Panel a rendered diagram of the four-level Document_Tree (System → Module → Feature → Component) for the active Workspace.
2. WHEN the user clicks a node in the Architecture_Panel diagram, THE Copilot_Plus SHALL open the corresponding document file (defined in `05-docs.md`) in a new editor tab within 1 second.
3. WHEN any document in the Document_Tree is created, modified, deleted, or renamed, THE Copilot_Plus SHALL refresh the Architecture_Panel diagram within 5 seconds.
4. THE Copilot_Plus SHALL provide controls in the Architecture_Panel for zoom, fit-to-view, and export-as-image (PNG and SVG).
5. THE Copilot_Plus SHALL display lateral links (defined in `05-docs.md`) between document nodes as visually distinct edges from hierarchical links.

### R-INT-6: Requirement_Panel

**User Story:** As a developer, I want a requirement panel that previews the requirement documents, so that I can quickly read what the AI proposed.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL display in the Requirement_Panel a tree view rooted at `.copilotPlus/docs/system/` showing all requirement documents and their hierarchical structure.
2. WHEN the user selects a node in the Requirement_Panel tree, THE Copilot_Plus SHALL render the corresponding markdown document in a preview pane next to the tree within 500 milliseconds.
3. THE Copilot_Plus SHALL render hierarchical links and lateral links in the preview pane as clickable elements that, when activated, navigate the tree selection to the linked document within 200 milliseconds.
4. WHEN the user activates an Edit control in the Requirement_Panel header, THE Copilot_Plus SHALL open the currently previewed document in a Host_Editor tab for editing.

### R-INT-7: Commit_Panel

**User Story:** As a developer, I want a commit panel that shows what the AI committed and lets me roll back, so that I retain control over my history.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL display in the Commit_Panel a chronological list of all Copilot_Plus-generated commits in the active Workspace, ordered by commit timestamp in descending order, with each entry showing the commit hash, the originating Workflow_Stage, the originating task identifier (if any), the commit message, and the count of files changed.
2. WHEN the user selects a commit in the Commit_Panel, THE Copilot_Plus SHALL display the unified diff of that commit in a preview region within 1 second.
3. THE Copilot_Plus SHALL provide a Rollback control on each Commit_Panel entry that, when activated and confirmed, restores the Checkpoint associated with that commit (defined in `03-editing.md`).
4. THE Copilot_Plus SHALL provide a filter input that filters Commit_Panel entries by message text, Workflow_Stage, or task identifier.
5. THE Copilot_Plus SHALL display, for any commit that has been rolled back, a `Rolled_Back` badge with the timestamp of the rollback.

### R-INT-8: Deploy_Panel

**User Story:** As a developer, I want a deploy panel that shows my deployment configuration and current status, so that I can manage releases from one place.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL display in the Deploy_Panel the active deployment configuration for the Workspace, including target environment (`Local`, `Docker`, `Kubernetes`), deploy mode (`Manual`, `Auto`), and the path of the deployment manifest under `.copilotPlus/deploy/`.
2. THE Copilot_Plus SHALL display in the Deploy_Panel the most recent 50 deployment runs, each showing timestamp, target environment, status (`Pending`, `Running`, `Succeeded`, `Failed`, `RolledBack`), and a link to the run logs.
3. WHEN the user activates the Deploy control in the Deploy_Panel, THE Copilot_Plus SHALL trigger the deployment behavior defined in `09-deployment.md`.
4. THE Copilot_Plus SHALL provide a Rollback control on each completed deployment run that triggers the rollback behavior defined in `09-deployment.md`.

### R-INT-9: Control_Console

**User Story:** As a developer, I want a single console view to configure Copilot Plus, so that I can manage Skills, Agents, MCP servers, Hooks, and models without leaving the editor.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL contribute a Control_Console view to the Host_Editor activity bar containing the following sections in this order: `Status`, `Workflow_Stage`, `Models`, `Skills`, `Agents`, `MCP_Servers`, `Hooks`, `Indexing`, `Settings`.
2. THE `Status` section SHALL display Copilot_Entitlement status, network connectivity status, active Session identifier, and the active Build operation identifier (if any).
3. THE `Workflow_Stage` section SHALL display the active Workflow_Stage and SHALL provide controls to transition between `Design`, `Build`, and `Deploy` subject to the rules defined in `06-workflow.md`.
4. THE `Models` section SHALL display the list of available Copilot_Model identifiers and SHALL provide a default-model picker for each surface listed in `R-PLAT-3.7`.
5. THE `Skills` section SHALL display the list of installed Skills and SHALL provide controls to view, enable, disable, edit, create, and remove a Skill, as defined in `08-extensibility.md`.
6. THE `Agents` section SHALL display the Primary_Agent and the pre-defined Sub_Agent roster, each as a tree node, and SHALL provide read-only inspection of each agent's role, system prompt path, and tool allowlist, as defined in `07-agents.md`. The user SHALL NOT author new agent topology from this section.
7. THE `MCP_Servers` section SHALL display the list of registered MCP_Servers and SHALL provide controls to add, edit, enable, disable, and remove a server, as defined in `08-extensibility.md`.
8. THE `Hooks` section SHALL display the list of configured Hooks and SHALL provide controls to add, edit, enable, disable, and remove a Hook, as defined in `08-extensibility.md`.
9. THE `Indexing` section SHALL display the status of the Codebase Index and the RAG index defined in `04-context.md`, including total indexed files, last update timestamp, and current state, and SHALL provide a manual rebuild control.
10. THE `Settings` section SHALL provide a control that opens the Host_Editor settings UI scoped to the `copilotPlus` Configuration_Namespace.

### R-INT-10: Decision_Notifications

**User Story:** As a developer, I want the AI to ask me questions during execution without taking over my screen, so that I can answer at my own pace.

#### Acceptance Criteria

1. WHEN a Sub_Agent during the Build or Deploy stage requires a user decision to proceed, THE Copilot_Plus SHALL emit a Decision_Notification via the Host_Editor notification API and SHALL NOT block any executing task.
2. THE Copilot_Plus SHALL render each Decision_Notification with the originating task identifier, a question text of at most 500 characters, and a fixed set of 2 to 5 response options.
3. WHEN the user selects a response option in a Decision_Notification, THE Copilot_Plus SHALL deliver the selection to the originating Sub_Agent within 1 second and SHALL record the question, options, and selected response in the Task_Panel transcript for that task.
4. THE Copilot_Plus SHALL apply a per-Decision_Notification timeout of 300 seconds by default, configurable in settings between 30 and 1,800 seconds. IF the user does not respond before the timeout elapses, THEN THE Copilot_Plus SHALL treat the timeout as the configured default response option for that question and SHALL record the timeout in the transcript.
5. THE Copilot_Plus SHALL provide an option in each Decision_Notification labeled "Pause Task" that, when selected, transitions the originating task to `Blocked` and waits for the user to resume from the Task_Panel.
6. THE Copilot_Plus SHALL never use Decision_Notifications for purely informational messages; informational messages SHALL be written to the Task_Panel transcript only.

### R-INT-11: Decision Center

**User Story:** As a developer running multiple concurrent tasks, I want a single place that aggregates every pending AI decision request, so that I never miss a question.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL maintain a Decision_Center, accessible from the Control_Console `Status` section and from a status-bar item, that lists every pending Decision_Notification with its originating task identifier, prompt text, options, time remaining until timeout, and an inline response control.
2. WHEN any Decision_Notification is created per `R-INT-10`, THE Copilot_Plus SHALL add it to the Decision_Center within 100 milliseconds. WHEN the user responds via the native notification or the Decision_Center, THE Copilot_Plus SHALL remove the entry from both surfaces within 100 milliseconds and SHALL deliver the response to the originating Sub_Agent per `R-INT-10.3`.
3. THE Copilot_Plus SHALL display the count of pending Decision_Notifications in the status bar item using the format `Copilot Plus: <n>`, with `<n>` updated within 100 milliseconds of any change.
4. WHEN the count of pending Decision_Notifications would exceed 5, THE Copilot_Plus SHALL suppress further native Host_Editor notifications and SHALL surface only the status-bar count and Decision_Center entries, to avoid notification flooding. THE user SHALL still receive every entry in the Decision_Center.
5. THE Copilot_Plus SHALL persist Decision_Center entries across Host_Editor restarts under `.copilotPlus/state/decisions.json`, with each entry's pending state restored on reopen. THE pending timeout per `R-INT-10.4` SHALL be paused while Host_Editor is closed and SHALL resume on reopen.
6. WHEN the user activates a Bulk_Approve control in the Decision_Center, THE Copilot_Plus SHALL apply the same response to every selected pending entry within 1 second.

### R-INT-12: Agent Replay and Forking

**User Story:** As a developer reviewing what an agent did, I want to fork from any past iteration with a new instruction, so that I can explore alternative paths without re-running the entire build from scratch.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL surface, in the Task_Panel transcript, a `Fork_From_Here` control on every Agent_Loop_Iteration entry persisted per `R-AG-7.6`.
2. WHEN the user activates `Fork_From_Here` on an iteration, THE Copilot_Plus SHALL prompt the user for an optional new instruction, then create a new Task in the active Build_Operation whose initial state is the persisted `messages.jsonl` truncated up to and including the chosen iteration, with the user's new instruction appended as a system or user message.
3. THE forked Task SHALL inherit the originating Task's `agent`, `scope_doc`, and `inputs`, and SHALL have its `parent_task_id` set to the originating Task.
4. THE Copilot_Plus SHALL display forked Tasks in the Task_Panel as siblings under their parent in the DAG view, with a visually distinct edge style indicating the fork relationship.
5. THE Copilot_Plus SHALL retain the original Task unchanged when a fork is created. WHEN the original Task was in `Done` or `Failed` state, the fork SHALL NOT modify its committed Checkpoint or commit history.
6. THE forked Task SHALL respect the same Autonomy_Level, Tool_Permission, Skills, and Hook configuration as the originating Task.
7. THE Copilot_Plus SHALL allow forks to themselves be forked, with no fixed depth limit, but SHALL warn the user via the Task_Panel header when the active Build_Operation has more than 20 forked Tasks.
8. THE Copilot_Plus SHALL persist fork relationships in `.copilotPlus/builds/<build-id>/forks.json` such that re-opening the Workspace restores the full fork DAG.
