# Requirements: Deployment

Module ID: `DEP`

## Introduction

Copilot_Plus supports three deployment targets: **Local**, **Docker**, and **Kubernetes**. The user controls deployment behavior via a single setting `copilotPlus.deploy.mode`, which is `Manual` by default. In `Manual` mode, Copilot_Plus only generates and maintains deployment artifacts under `.copilotPlus/deploy/`; the user runs them. In `Auto` mode, the Primary_Agent (via the Deployer Sub_Agent) executes the deployment using the configured target, subject to the active Autonomy_Level and command deny list defined in `06-workflow.md`.

Rollback applies to the deployment artifact set and, where the target supports it, to the running deployment.

## Glossary

- **Deploy_Target**: One of `Local`, `Docker`, `Kubernetes`. The selected target determines which artifact set is generated and which Tools the Deployer Sub_Agent invokes.
- **Deploy_Mode**: One of `Manual`, `Auto`. Governs whether Copilot_Plus executes the deployment or only maintains artifacts.
- **Deploy_Manifest**: The set of files under `.copilotPlus/deploy/<target>/` that fully describe the deployment for the chosen Deploy_Target.
- **Deploy_Run**: A single end-to-end execution of a deployment, identified by a `run-id`, with a status, target, mode, and log file.
- **Deploy_Rollback**: The act of reverting a Deploy_Run by re-applying the prior Deploy_Manifest snapshot or, for targets that support it, by invoking the target's native rollback mechanism.

## Requirements

### R-DEP-1: Deploy Configuration

**User Story:** As a developer, I want a single configuration that controls deployment, so that I do not lose track of mode and target.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL persist deployment configuration in `.copilotPlus/deploy/config.json` containing at minimum: `target` (one of `Local`, `Docker`, `Kubernetes`), `mode` (one of `Manual`, `Auto`, default `Manual`), `manifest_path` (string, default `.copilotPlus/deploy/<target>/`), `pre_deploy_commands` (list of strings, 0 to 20 entries, optional), `post_deploy_commands` (list of strings, 0 to 20 entries, optional), `rollback_strategy` (one of `manifest_revert`, `native`, default `manifest_revert`).
2. THE Copilot_Plus SHALL display the active deployment configuration in the Deploy_Panel as defined in `R-INT-8`.
3. WHEN the user changes any field in `.copilotPlus/deploy/config.json`, THE Copilot_Plus SHALL apply the change to subsequent Deploy_Runs within 2 seconds and SHALL NOT require a Host_Editor restart.
4. IF `.copilotPlus/deploy/config.json` is invalid or missing required fields, THEN THE Copilot_Plus SHALL display a diagnostic in the Deploy_Panel, SHALL block all Deploy_Runs, and SHALL surface the validation error in the editor problem pane.

### R-DEP-2: Manifest Generation

**User Story:** As a developer, I want the Designer agent to generate deployment artifacts, so that I never start from scratch.

#### Acceptance Criteria

1. WHEN the Workflow_Stage transitions from `Build` to `Deploy` for the first time in a Workspace, THE Primary_Agent SHALL invoke the Deployer Sub_Agent to generate a Deploy_Manifest under `.copilotPlus/deploy/<target>/` for the configured target.
2. THE Copilot_Plus SHALL generate the following artifact set per target: `Local` = a shell run script and an environment file; `Docker` = a Dockerfile, a docker-compose.yml, and an environment file; `Kubernetes` = Deployment, Service, ConfigMap, and Secret manifests, plus a kustomization.yaml.
3. WHEN any input that informs deployment changes (System_Doc, Module_Docs, build artifacts under the project root), THE Deployer Sub_Agent MAY regenerate or update the Deploy_Manifest if the user invokes the Regenerate Manifest control in the Deploy_Panel.
4. THE Copilot_Plus SHALL route every Deploy_Manifest write through the Diff_Review_UI defined in `R-EDIT-4` so that the user reviews and accepts changes before they hit disk.
5. THE Copilot_Plus SHALL store every accepted Deploy_Manifest version snapshot under `.copilotPlus/deploy/snapshots/<timestamp>/` for use by Deploy_Rollback.

### R-DEP-3: Manual Deploy Mode

**User Story:** As a developer with Manual mode set, I want Copilot Plus to maintain deployment artifacts but never run them, so that I keep full control of release timing.

#### Acceptance Criteria

1. WHILE `copilotPlus.deploy.mode` is `Manual`, THE Copilot_Plus SHALL NOT execute any deployment command, container build, or cluster apply automatically.
2. WHILE `copilotPlus.deploy.mode` is `Manual`, THE Copilot_Plus SHALL display the Deploy control in the Deploy_Panel as `Generate Manifest` and SHALL NOT display an Apply control.
3. WHEN the user activates `Generate Manifest` in `Manual` mode, THE Copilot_Plus SHALL invoke the Deployer Sub_Agent to refresh the Deploy_Manifest only, without running any pre-deploy or post-deploy command.
4. THE Copilot_Plus SHALL surface, in the Deploy_Panel, the recommended commands the user can run manually for the configured target (for example `docker compose up -d`, `kubectl apply -k .copilotPlus/deploy/kubernetes/`).

### R-DEP-4: Auto Deploy Mode

**User Story:** As a developer with Auto mode set, I want the agent to run the deployment for me, subject to autonomy controls and the deny list.

#### Acceptance Criteria

1. WHILE `copilotPlus.deploy.mode` is `Auto`, THE Copilot_Plus SHALL display the Deploy control in the Deploy_Panel as `Apply Manifest`.
2. WHEN the user activates `Apply Manifest` in `Auto` mode, THE Primary_Agent SHALL invoke the Deployer Sub_Agent to (a) run every command in `pre_deploy_commands` in the listed order, (b) apply the Deploy_Manifest to the configured target, (c) run every command in `post_deploy_commands` in the listed order, while emitting `deploy.started`, `deploy.completed`, and `deploy.failed` Hook_Events at the appropriate transitions.
3. THE Copilot_Plus SHALL apply the active Autonomy_Level defined in `R-WF-7` to every Deployer Sub_Agent tool invocation, including `run_terminal_command`, `deploy_apply`, and `deploy_rollback`.
4. THE Copilot_Plus SHALL match every command issued during Auto deployment against the command deny list defined in `R-WF-7`, and SHALL require explicit user approval via Decision_Notification for any matching command, regardless of Autonomy_Level.
5. IF any step in `pre_deploy_commands`, manifest application, or `post_deploy_commands` exits non-zero or times out, THEN THE Copilot_Plus SHALL transition the Deploy_Run to `Failed`, SHALL stop subsequent steps, SHALL fire the `deploy.failed` Hook_Event, and SHALL prompt the user via Decision_Notification with options to Retry, Rollback, or Terminate.
6. THE Copilot_Plus SHALL apply a default per-step timeout of 600 seconds, configurable per command via the manifest, with an upper bound of 3,600 seconds per step.
7. THE Copilot_Plus SHALL stream all command output to the Deploy_Run log file under `.copilotPlus/deploy/runs/<run-id>.log` and SHALL display the live tail in the Deploy_Panel.

### R-DEP-5: Deploy Targets

**User Story:** As a developer, I want consistent deploy semantics across local, Docker, and Kubernetes, so that I can switch targets without relearning the workflow.

#### Acceptance Criteria

1. WHEN `target` is `Local`, THE Deployer Sub_Agent SHALL apply the Deploy_Manifest by executing the shell run script under `.copilotPlus/deploy/local/` in a Workspace_Root-scoped shell.
2. WHEN `target` is `Docker`, THE Deployer Sub_Agent SHALL apply the Deploy_Manifest by invoking `docker compose -f .copilotPlus/deploy/docker/docker-compose.yml up -d --build`, after first verifying that the `docker` CLI is available; if `docker` is not available, THE Copilot_Plus SHALL fail the run with an actionable error.
3. WHEN `target` is `Kubernetes`, THE Deployer Sub_Agent SHALL apply the Deploy_Manifest by invoking `kubectl apply -k .copilotPlus/deploy/kubernetes/`, after first verifying that the `kubectl` CLI is available and that a current context is set; if either check fails, THE Copilot_Plus SHALL fail the run with an actionable error.
4. THE Copilot_Plus SHALL allow the user to override the default apply command per target via `apply_command` and `rollback_command` fields in `.copilotPlus/deploy/config.json`, subject to the deny list defined in `R-WF-7`.

### R-DEP-6: Deploy Rollback

**User Story:** As a developer, I want one-click rollback after a bad deployment, so that I can recover fast.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL display a Rollback control on every completed Deploy_Run in the Deploy_Panel as defined in `R-INT-8.4`.
2. WHEN the user activates Rollback on a Deploy_Run with `rollback_strategy` = `manifest_revert`, THE Deployer Sub_Agent SHALL re-apply the Deploy_Manifest snapshot recorded immediately before that Deploy_Run, using the same target-specific apply command from `R-DEP-5`.
3. WHEN the user activates Rollback on a Deploy_Run with `rollback_strategy` = `native`, THE Deployer Sub_Agent SHALL invoke the target's native rollback (for `Kubernetes` use `kubectl rollout undo deployment/<name>`; for `Docker` re-apply the previous compose snapshot; for `Local` re-run the previous run script).
4. WHEN a Rollback completes successfully, THE Copilot_Plus SHALL transition the originating Deploy_Run to `RolledBack`, SHALL display the rollback timestamp in the Deploy_Panel entry, and SHALL fire the `rollback.completed` Hook_Event.
5. IF Rollback fails, THEN THE Copilot_Plus SHALL surface the failure in the Deploy_Panel, SHALL preserve the current state of the deployed system unchanged, and SHALL emit a Decision_Notification asking the user to Retry, Run Custom Command, or Terminate.
6. THE Copilot_Plus SHALL retain the most recent 50 Deploy_Run entries and their associated logs and manifest snapshots per Workspace, evicting the oldest first when the limit is exceeded.

### R-DEP-7: CI Mode (Headless Automation Subset)

**User Story:** As an enterprise team, I want a narrow CLI entry point that runs the AI build pipeline in CI when no UI is available, so that nightly autonomous tasks and PR-bot workflows are possible without a human in the IDE.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL ship a CLI entry point `copilot-plus` that accepts the subcommands `build run <build-config>`, `build status <build-id>`, `build cancel <build-id>`, and `deploy run <target>`. THE CLI SHALL only support a strict subset of the IDE feature set, defined in criteria 2 through 7.
2. THE CLI SHALL support these Sub_Agents only: `Coder`, `Tester`, `Committer`, `Deployer`. The CLI SHALL NOT invoke `Architect`, `Designer`, `Task_Planner`, `Requirement_Clarifier`, `Reviewer`, `Rollback_Operator`, or `Explorer`, since these depend on UI-driven workflows or human-in-the-loop steps that do not exist in CI.
3. THE CLI SHALL run pre-existing artifacts only: a Task_DAG generated previously in the IDE, AGENTS.md, the Document_Tree as it currently exists in the repository. THE CLI SHALL NOT generate new design documents, new Module_Docs, or new tasks.
4. THE CLI SHALL bypass the Diff_Review_UI by treating every file write as auto-applied with a Checkpoint recorded. THE CLI SHALL emit a JSONL transcript that includes every diff for post-hoc review when the user opens the artifact in the IDE.
5. THE CLI SHALL replace Decision_Notifications with a Decision_Resolver mechanism configured by the Build_Config file, where each potential Decision_Notification is resolved by a deterministic rule (always-approve, always-reject, match-by-prompt-pattern, fail-on-decision). IF a Decision_Notification arises that has no matching rule, THEN THE CLI SHALL fail the run with the prompt text and exit non-zero.
6. THE CLI SHALL require a Copilot_Entitlement reachable through the same `vscode.lm` API. IF authentication is not present, THEN THE CLI SHALL exit non-zero with a clear error indicating that the runner must have a signed-in GitHub session.
7. THE CLI SHALL be packaged with the enterprise VSIX such that `enabledApiProposals` per `R-CTX-5.10` is honored on CI runners that have the matching enterprise-signed VS Code build. THE CLI SHALL be invokable via `code --install-extension copilot-plus.vsix && code --headless run-extension copilotPlus.cli ...` (exact invocation pattern to be confirmed in design phase).
8. THE CLI SHALL stream every Task_Panel transcript line to stdout as JSONL and SHALL persist the run artifacts under `.copilotPlus/ci-runs/<run-id>/`, so the IDE extension can later open and inspect the run.
9. THE CLI SHALL apply the same `copilotPlus.workflow.maxToolCalls`, `maxBuildDuration`, and `commandDenyList` settings as the IDE extension, sourced from the project-level configuration.
10. THE CLI SHALL display a clear startup notice listing the disabled feature set (no Diff Review UI, no Decision Center, no design-stage agents) so users do not expect IDE behavior in CI.
