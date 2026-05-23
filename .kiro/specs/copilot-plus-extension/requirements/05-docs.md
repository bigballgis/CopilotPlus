# Requirements: Document Tree and the Five-Layer Hierarchy

Module ID: `DOCS`

## Introduction

This module defines the central artifact of Copilot_Plus: the Five_Layer_Hierarchy through which every project is represented. The hierarchy is **System → Module → Feature → Component → Code**, where the first four layers are markdown documents under `.copilotPlus/docs/` and the fifth is the source tree in the workspace.

**The Five_Layer_Hierarchy is the substrate that makes structured AI reasoning possible.** It is the central design choice of Copilot_Plus, motivated by the thesis stated in the top-level `requirements.md`: AI works best when it operates at the layer appropriate to the task, not on a flat sea of code. The hierarchy is what allows a `Tier_S` Copilot model (under 100k tokens) to reason about a project of millions of lines: the AI walks down the layers, narrowing scope by structure, only expanding to code at the leaf.

The user does not write any of the upper four layers. The AI authors and maintains them. The user reviews diffs.

Documents at any of the upper four layers link to their parent and children (Hierarchical_Links), and may also link to siblings or peers in other branches (Lateral_Links) up to a bounded depth. Code files (layer 5) are associated with their owning Component_Doc through a `code_paths` frontmatter field. This design lets the AI quickly identify the relevant scope of any task by traversing links and layers, rather than by brute-force re-indexing the workspace.

All artifacts live under `.copilotPlus/docs/` (layers 1-4) and the working tree (layer 5), and are versioned with the user's repository.

## Glossary

- **Document_Tree**: The four-level hierarchical document structure under `.copilotPlus/docs/`, comprising layers 1-4 of the Five_Layer_Hierarchy.
- **Five_Layer_Hierarchy**: The full layered representation of the project: `system`, `module`, `feature`, `component`, `code`. Layers 1-4 are markdown documents; layer 5 is the source tree.
- **System_Doc**: A level-1 document describing the overall system. Exactly one System_Doc per Workspace by default, with monorepo allowance per `R-DOCS-1.2`.
- **Module_Doc**: A level-2 document describing a major subsystem. Children of the System_Doc.
- **Feature_Doc**: A level-3 document describing a discrete capability. Children of a Module_Doc.
- **Component_Doc**: A level-4 document describing an implementation strategy. Children of a Feature_Doc. **Owns** zero or more Code_Files via the `code_paths` frontmatter field.
- **Code_File**: A source file in the workspace at layer 5 of the Five_Layer_Hierarchy. Each Code_File is associated with at most one Component_Doc (its owner) at any given time.
- **Hierarchical_Link**: A link from a document to its parent or to one of its children. Forms the tree spine.
- **Lateral_Link**: A link from a document to another document at the same level or to any document in a different branch, used for cross-cutting references.
- **Lateral_Depth**: The number of branch crossings traversed by a Lateral_Link, where 1 means a sibling (same parent), 2 means a cousin (shared grandparent), 3 means a second cousin, and 4 means a third cousin.
- **Scope_Resolution**: The process by which the AI resolves the set of documents and code relevant to a task by traversing Hierarchical_Links and Lateral_Links from a starting document, then descending to the Code_Files owned by the resolved Component_Docs.
- **Doc_Frontmatter**: A YAML block at the top of every Document_Tree file containing structured metadata, including the document's level, identifier, parent, children, links, and (for Component_Docs) `code_paths`.
- **Layer_Consistency**: The property that every Component_Doc accurately describes its owned Code_Files and that every Module_Doc accurately summarizes its child Feature_Docs and Component_Docs.
- **Drift**: A divergence between any two adjacent layers (Component_Doc vs Code_File, Feature_Doc vs Component_Doc, etc.). Detected by the AI per `R-DOCS-13`.
- **Layer_Walk**: A retrieval operation that descends through the layers from a chosen starting layer to a target layer, gathering each intermediate document, used in place of flat-context retrieval. The dominant retrieval mechanism in Copilot_Plus per the Core Design Thesis.

## Requirements

### R-DOCS-1: Document Tree Structure

**User Story:** As a developer, I want my project documentation to follow a fixed four-level hierarchy, so that both I and the AI always know where everything lives.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL store the Document_Tree under `.copilotPlus/docs/` at Workspace_Root with the following directory layout: `system/<system-id>.md`, `system/<system-id>/<module-id>.md`, `system/<system-id>/<module-id>/<feature-id>.md`, `system/<system-id>/<module-id>/<feature-id>/<component-id>.md`.
2. THE Copilot_Plus SHALL allow at least one System_Doc per Workspace and SHALL allow multiple System_Docs in the same Workspace when the Workspace is a monorepo, where each System_Doc occupies its own subdirectory `<workspace_root>/.copilotPlus/docs/system/<system-id>/...`. WHEN multiple System_Docs exist, THE Copilot_Plus SHALL treat them as independent roots that share the same `.copilotPlus/` configuration but have independent Document_Trees, RAG sub-indexes, and Build_Operations.
3. THE Copilot_Plus SHALL allow each Module_Doc, Feature_Doc, and Component_Doc to declare exactly one `parent` of the immediate higher level, and SHALL allow each non-System document to declare 0 to 5 additional parents at the same level via a `secondary_parents` field in the Doc_Frontmatter. Hierarchical_Link traversal in `R-DOCS-3` SHALL follow only the primary `parent`; secondary parents SHALL be treated as `references` Lateral_Links subject to `R-DOCS-4`.
4. IF a document is created at a path that violates the layout in criterion 1, THEN THE Copilot_Plus SHALL reject the creation, SHALL display a message identifying the violation, and SHALL NOT write any file.
5. THE Copilot_Plus SHALL assign every document a unique identifier of 3 to 64 characters matching the pattern `[a-z][a-z0-9-]*`, derived from the file basename without extension.
6. THE Copilot_Plus SHALL maintain referential integrity such that every Module_Doc, Feature_Doc, and Component_Doc has exactly one existing parent. IF a parent document is deleted while children exist, THEN THE Copilot_Plus SHALL block the deletion, SHALL display the list of orphaned children, and SHALL require the user to delete or reassign the children first.

### R-DOCS-2: Document Frontmatter

**User Story:** As a developer, I want every document to carry structured metadata, so that the AI can navigate the tree reliably.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL require every Document_Tree file to begin with a Doc_Frontmatter block delimited by `---` lines containing at minimum: `id` (string), `level` (one of `system`, `module`, `feature`, `component`), `title` (string, 1-120 characters), `parent` (string identifier or empty for the System_Doc), `secondary_parents` (list of string identifiers, 0 to 5 entries, optional), `children` (list of string identifiers, 0 to 200 entries), `lateral` (list of `{target, type}` objects, 0 to 50 entries, where `type` is one of `references`, `depends_on`, `extends`, `conflicts_with`). Component_Doc frontmatter SHALL additionally contain `code_paths` (a list of glob strings, 0 to 50 entries, identifying the Code_Files owned by this component) and `code_owner_authority` (one of `exclusive`, `shared`, default `exclusive`, indicating whether matched files may also be owned by other Component_Docs).
2. WHEN a document is created or modified, THE Copilot_Plus SHALL validate the Doc_Frontmatter against the schema in criterion 1 within 1 second of save.
3. IF Doc_Frontmatter validation fails, THEN THE Copilot_Plus SHALL surface the validation error in the Architecture_Panel and the editor as a problem-pane diagnostic, SHALL NOT include the document in the RAG_Index, and SHALL NOT include the document in Scope_Resolution until the error is resolved.
4. WHEN the Copilot_Plus generates a document during the Design stage, THE Copilot_Plus SHALL produce a complete, valid Doc_Frontmatter block including all hierarchical and lateral links inferred from the design conversation.
5. THE Copilot_Plus SHALL keep the `parent` and `children` fields of related documents mutually consistent. WHEN a document's `parent` field is changed, THE Copilot_Plus SHALL update the previous parent's `children` list and the new parent's `children` list within 1 second.

### R-DOCS-3: Hierarchical Links (Full-Path Tree Index)

**User Story:** As a developer, I want hierarchical links to span the full tree, so that the AI can always locate any document from the System_Doc downward.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL maintain, for every document, a complete chain of Hierarchical_Links from that document up to the System_Doc and down to every descendant Component_Doc, with no depth limit on the upward chain or downward subtree.
2. WHEN a document is rendered in the Requirement_Panel, the Architecture_Panel, or any preview surface, THE Copilot_Plus SHALL display a breadcrumb of Hierarchical_Links from the System_Doc down to the document.
3. WHEN a document is rendered, THE Copilot_Plus SHALL display a child list of all immediate children with clickable links.
4. THE Copilot_Plus SHALL recompute the full Hierarchical_Link graph within 5 seconds of any Document_Tree file system event.
5. IF a Hierarchical_Link points to a non-existent document, THEN THE Copilot_Plus SHALL surface the dangling link as a diagnostic in the Architecture_Panel and SHALL NOT use that link during Scope_Resolution.

### R-DOCS-4: Lateral Links (Bounded to Depth 4)

**User Story:** As a developer, I want lateral links between documents to be bounded, so that the link graph stays comprehensible and traversal stays cheap.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL allow a Lateral_Link only between documents whose Lateral_Depth is at most 4, where Lateral_Depth is computed as the number of branch crossings between the two endpoints in the Hierarchical_Link tree. The default limit is 4 because cross-cutting references that span more than 4 branches typically indicate a missing parent abstraction; the user MAY raise the limit up to 8 via the `copilotPlus.docs.maxLateralDepth` setting when their domain genuinely requires deeper cross-references.
2. IF a user or Sub_Agent attempts to create a Lateral_Link with Lateral_Depth greater than the configured maximum (default 4, configurable up to 8 per criterion 1), THEN THE Copilot_Plus SHALL reject the link, SHALL display a message identifying the excess depth, and SHALL NOT write the link to the Doc_Frontmatter.
3. THE Copilot_Plus SHALL allow at most 50 Lateral_Links per document.
4. WHEN a document is rendered, THE Copilot_Plus SHALL display Lateral_Links grouped by `type` (`references`, `depends_on`, `extends`, `conflicts_with`) with clickable navigation.
5. THE Copilot_Plus SHALL render Lateral_Links in the Architecture_Panel diagram as edges visually distinct from Hierarchical_Link edges.
6. IF a Lateral_Link target is deleted, THEN THE Copilot_Plus SHALL surface the dangling link as a diagnostic in the Architecture_Panel and the editor problem pane within 5 seconds and SHALL NOT use that link during Scope_Resolution.

### R-DOCS-5: Scope Resolution for AI

**User Story:** As a developer, I want the AI to identify the relevant scope of a task by walking links, so that it stays focused without re-reading the whole codebase.

#### Acceptance Criteria

1. WHEN the Primary_Agent or any Sub_Agent receives a task input that names or implies a starting document, THE Copilot_Plus SHALL compute a Scope_Resolution rooted at that document by traversing (a) all Hierarchical_Links upward to the System_Doc, (b) all Hierarchical_Links downward to every descendant Component_Doc, (c) every Lateral_Link of any `type` whose Lateral_Depth is at most the configured maximum (per `R-DOCS-4.1`), and (d) every secondary-parent reference declared in the document's `secondary_parents` field, treated as `references` Lateral_Links.
2. THE Copilot_Plus SHALL include, in the request payload for any Sub_Agent task, the Scope_Resolution result as a structured list of `(document_path, heading_path, level, link_type)` entries, deduplicated and sorted by hierarchical proximity to the starting document.
3. THE Copilot_Plus SHALL bound the Scope_Resolution result by the active context tier defined in `R-CTX-8`: `Tier_S` caps at 100 documents, `Tier_M` caps at 300 documents, `Tier_L` caps at 1,000 documents. IF the resolution exceeds the active cap, THEN THE Copilot_Plus SHALL truncate by dropping the documents with the greatest hierarchical distance first and SHALL record the truncation in the Task_Panel transcript.
4. THE Copilot_Plus SHALL retrieve and attach the actual content of the highest-ranked documents from the Scope_Resolution result via the RAG retrieval pipeline defined in `R-CTX-3`, where the number of attached documents follows the active context tier defined in `R-CTX-8` (`Tier_S` attaches top 20, `Tier_M` attaches top 50, `Tier_L` attaches the entire Scope_Resolution result), subject to the Token_Budget defined in `R-CTX-4`.
5. WHEN no starting document can be identified for a task, THE Copilot_Plus SHALL fall back to RAG retrieval over the entire Document_Tree as defined in `R-CTX-3`.

### R-DOCS-6: Document Tree Operations

**User Story:** As a developer, I want create, rename, move, and delete operations on the document tree to keep all links consistent, so that the structure never breaks silently.

#### Acceptance Criteria

1. WHEN the user or a Sub_Agent creates a document at a valid Document_Tree path, THE Copilot_Plus SHALL automatically update the parent document's `children` field within 1 second.
2. WHEN the user renames a document file or directory, THE Copilot_Plus SHALL update every Hierarchical_Link and Lateral_Link that targets the renamed document across the entire Document_Tree within 5 seconds.
3. WHEN the user moves a document to a new parent, THE Copilot_Plus SHALL update the old parent's `children` field, the new parent's `children` field, and the document's `parent` field within 5 seconds, and SHALL re-validate every Lateral_Link of the moved document under the depth-4 rule, automatically dropping links whose new Lateral_Depth exceeds 4.
4. IF moving a document would change its level (for example moving a Module_Doc under a Feature_Doc), THEN THE Copilot_Plus SHALL block the move, SHALL display a message identifying the level violation, and SHALL NOT write any file.
5. WHEN the user deletes a document with no children, THE Copilot_Plus SHALL remove the document file, remove its entry from the parent's `children` field, and remove every Lateral_Link that targets it across the Document_Tree within 5 seconds.
6. THE Copilot_Plus SHALL provide all Document_Tree operations (create, rename, move, delete, link, unlink) via commands invocable from the Architecture_Panel, the Requirement_Panel, and the Command Palette.

### R-DOCS-7: Document Naming Consistency

**User Story:** As an AI-driven project where the assistant generates and maintains the Document_Tree, I want naming-collision detection so that the same concept does not get split across two near-duplicate documents.

#### Acceptance Criteria

1. WHEN any Sub_Agent invokes `doc_write` per `R-TOOL-7` to create a new document, THE Copilot_Plus SHALL compute a Levenshtein distance between the proposed `id` and every existing `id` at the same `level` and same `parent`, and SHALL emit a Decision_Notification when the distance is at most 2 OR when the proposed `title` token-overlap with any existing `title` at the same level exceeds 60%.
2. THE Decision_Notification raised in criterion 1 SHALL offer the options `Reuse_Existing` (write to the existing document instead, abandoning the proposed id), `Force_Create` (proceed with the proposed id), `Cancel`. THE default response on timeout SHALL be `Reuse_Existing`.
3. WHEN any `doc_write` modifies a document's `title` or `parent`, THE Copilot_Plus SHALL re-validate naming consistency against criterion 1.
4. THE Copilot_Plus SHALL maintain a `naming_aliases.json` file at `.copilotPlus/docs/naming_aliases.json` mapping each retired or merged id to its current id. WHEN any Hierarchical_Link or Lateral_Link references a retired id, THE Copilot_Plus SHALL transparently rewrite the link to the current id and SHALL log the rewrite in the Architecture_Panel diagnostics view.
5. THE Copilot_Plus SHALL include the `naming_aliases.json` in the Sub_Agent system instruction (in compressed form: `id1, id2 → canonical_id`) so the AI does not regenerate the retired ids.

### R-DOCS-8: Document Size Constraints

**User Story:** As an enterprise team using a finite Copilot quota, I want bounded document sizes so that an AI-generated tree does not consume the monthly token budget.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL enforce per-document size caps via `doc_write` validation: `description` field in frontmatter SHALL be at most 500 characters; total markdown body SHALL be at most 4,000 characters for `system` and `module` levels, 2,000 characters for `feature` level, 1,000 characters for `component` level.
2. IF a `doc_write` proposes content exceeding the per-level cap, THEN THE Copilot_Plus SHALL refuse the write, SHALL return `{ ok: false, reason: 'document_too_large', cap, actual }`, and SHALL surface the violation in the Diff_Review_UI so the user can shrink or split before accepting.
3. THE Copilot_Plus SHALL chunk RAG retrievals for the Document_Tree such that any single chunk attached to a model request includes only the document's frontmatter (always) plus the section bodies that match the query, rather than the full document body. THE Copilot_Plus SHALL apply the same Token_Budget priority order from `R-CTX-4.3` to drop low-relevance sections first.
4. THE Copilot_Plus SHALL display, in the Control_Console `Indexing` section, the total Document_Tree size in characters and tokens, the per-level breakdown, and a warning when the total exceeds 500,000 tokens (a soft limit suggesting consolidation).
5. THE Copilot_Plus SHALL emit a Telemetry_Event reporting Document_Tree size monthly when telemetry is enabled, excluding any document content per `R-PLAT-7.3`.

### R-DOCS-9: Document Lifecycle and Compaction

**User Story:** As a project that runs for years, I want the Document_Tree to shrink as old features are deprecated, so that the index does not bloat indefinitely.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL maintain a `last_referenced_at` timestamp in every document's frontmatter, updated whenever the document is included in a Scope_Resolution result per `R-DOCS-5` or attached to any Sub_Agent invocation.
2. THE Copilot_Plus SHALL contribute a command `copilotPlus.docs.compact` that, when invoked, runs the Architect Sub_Agent to identify documents whose `last_referenced_at` is older than the configurable threshold `copilotPlus.docs.staleThresholdDays` (default 90, range 30 to 365).
3. WHEN `copilotPlus.docs.compact` runs, THE Architect Sub_Agent SHALL produce a proposed compaction plan grouped by category: `archive` (move to `.copilotPlus/docs/archive/<original-path>.md`), `merge_into_parent` (fold the document content into its parent, then archive), `delete` (only when no inbound links exist), `keep` (the AI judges still relevant). THE plan SHALL be routed through the Diff_Review_UI for user approval.
4. WHEN the user approves a compaction plan, THE Copilot_Plus SHALL execute it within a single workspace edit, recording one Checkpoint per `R-EDIT-5`.
5. THE Copilot_Plus SHALL exclude archived documents from the RAG_Index and from Scope_Resolution by default. THE Copilot_Plus SHALL allow an explicit `@archive` mention scope to retrieve from archived documents when the user needs historical context.
6. THE Copilot_Plus SHALL surface, in the Architecture_Panel, a `Stale` badge on every document whose `last_referenced_at` exceeds the threshold, with a one-click action to trigger `copilotPlus.docs.compact` scoped to that subtree.

### R-DOCS-10: Human Review Markers

**User Story:** As a developer, I want clear indicators of which AI-generated documents have been reviewed by a human, so that I do not blindly trust an AI-only authoring chain.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL maintain in every document's frontmatter the fields `human_reviewed_at` (timestamp or null), `human_reviewed_by` (user identifier or null), and `ai_generated` (boolean, default true when the document was created by a Sub_Agent).
2. WHEN the user accepts an AI-generated `doc_write` through the Diff_Review_UI, THE Copilot_Plus SHALL update `human_reviewed_at` to the acceptance timestamp and `human_reviewed_by` to the active GitHub identity, only for documents at level `system` and `module`. THE Copilot_Plus SHALL NOT auto-update review markers for `feature` and `component` levels, since those churn frequently and a UI accept on the diff is not strong evidence of review.
3. THE Copilot_Plus SHALL provide a command `copilotPlus.docs.markReviewed` that updates `human_reviewed_at` and `human_reviewed_by` on the active document.
4. THE Copilot_Plus SHALL display, in the Architecture_Panel and the Requirement_Panel, a colored badge per document: green when `human_reviewed_at` is within 30 days, yellow when between 30 and 90 days, red when older than 90 days or null at level `system` or `module`.
5. WHEN any `system` or `module` document has a red review badge, THE Copilot_Plus SHALL include a notice in every Sub_Agent system instruction that scope-resolves through that document, naming the document and instructing the agent to flag any divergence between the document and the actual codebase to the user.
6. THE Copilot_Plus SHALL emit a `doc.drift.suspected` Hook_Event when the Reviewer Sub_Agent or any Sub_Agent invocation detects a substantive contradiction between an unreviewed document and the code being read or modified, so that the user can be alerted via the configured Hook actions.

### R-DOCS-11: Code-to-Component Ownership

**User Story:** As a developer, I want every source file to be owned by exactly one Component_Doc by default, so that the AI can always resolve which design decision governs any line of code.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL maintain a `code_ownership_index` mapping every Code_File path in the Workspace to the set of Component_Docs whose `code_paths` glob matches the file. THE index SHALL be updated within 5 seconds of any file system event or any `code_paths` frontmatter change.
2. WHEN a Code_File matches the `code_paths` of exactly one Component_Doc, THE Copilot_Plus SHALL treat that Component_Doc as the file's owner.
3. WHEN a Code_File matches the `code_paths` of multiple Component_Docs and at least one of them has `code_owner_authority` of `exclusive`, THE Copilot_Plus SHALL flag this as an Ownership_Conflict diagnostic in the Architecture_Panel and SHALL surface it in the editor problem pane.
4. WHEN a Code_File matches the `code_paths` of multiple Component_Docs and all of them have `code_owner_authority` of `shared`, THE Copilot_Plus SHALL treat all matching Component_Docs as co-owners and SHALL include all of them in any Layer_Walk for that file.
5. WHEN a Code_File matches no Component_Doc, THE Copilot_Plus SHALL flag this as an Orphan_Code diagnostic in the Architecture_Panel, SHALL surface it in the editor problem pane, and SHALL emit the `code.orphan.detected` Hook_Event defined in `R-EXT-3`.
6. THE Copilot_Plus SHALL display, in the Architecture_Panel and the editor's status bar when a Code_File is focused, the owning Component_Doc, the parent Feature_Doc, the parent Module_Doc, and the System_Doc, forming the Layer_Walk path for that file.
7. THE Copilot_Plus SHALL provide a command `copilotPlus.docs.assignOrphan` that, when invoked on an Orphan_Code file, runs the Architect Sub_Agent to propose a Component_Doc assignment, routed through the Diff_Review_UI per `R-EDIT-4`.

### R-DOCS-12: Layer Consistency Enforcement

**User Story:** As a developer, I want the AI to keep all five layers mutually consistent, so that documentation never silently goes stale.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL define Layer_Consistency as the conjunction of these properties: (a) every Component_Doc accurately describes the responsibility, contract, and implementation strategy of its owned Code_Files, (b) every Feature_Doc accurately summarizes its child Component_Docs, (c) every Module_Doc accurately summarizes its child Feature_Docs, (d) the System_Doc accurately summarizes its child Module_Docs, (e) Hierarchical_Links and Lateral_Links resolve to existing documents, (f) `code_paths` globs match at least one Code_File when the Component_Doc is not explicitly marked `placeholder: true` in frontmatter.
2. WHEN any Code_File owned by a Component_Doc is modified, THE Copilot_Plus SHALL append the change to a Pending_Consistency_Queue scoped to the owning Component_Doc, but SHALL NOT immediately invoke the Reviewer Sub_Agent. Real-time per-edit consistency checks are explicitly out of scope because they would consume LLM tokens on every keystroke event and add unacceptable latency.
3. THE Copilot_Plus SHALL flush the Pending_Consistency_Queue and run consistency checks under any of the following triggers, whichever comes first: (a) the user activates the `Run_Consistency_Check` command from the Control_Console, (b) the Committer Sub_Agent runs as part of a Build_Operation per `R-WF-4.8` (consistency check runs over all changed files immediately before commit), (c) a Background_Task per `R-AG-9` runs `doc_drift_scan`, (d) the queue accumulates more than 20 changed files for a single Component_Doc.
4. WHEN a consistency check runs, THE Copilot_Plus SHALL invoke the Reviewer Sub_Agent with the cumulative diff since the last check, the current Component_Doc, and the Layer_Walk context. THE Reviewer Sub_Agent SHALL return one of: `Consistent` (no action), `Doc_Update_Recommended` (with proposed Component_Doc edits), `Code_Mismatch_Suspected` (with rationale), `Cannot_Determine` (with reason).
5. WHEN the Reviewer Sub_Agent returns `Doc_Update_Recommended`, THE Copilot_Plus SHALL queue the proposed Component_Doc edit in the Decision_Center per `R-INT-11` with options `Apply`, `Edit_And_Apply`, `Reject`, `Snooze_Until_Build_End`. THE proposed edit SHALL NOT be auto-applied, but it SHALL be batched with the originating code change so the user can review them together.
6. WHEN the Reviewer Sub_Agent returns `Code_Mismatch_Suspected`, THE Copilot_Plus SHALL emit the `doc.drift.suspected` Hook_Event per `R-DOCS-10.6`, SHALL display the mismatch in the editor problem pane, and SHALL include a link to the Component_Doc and the diff that triggered the suspicion.
7. WHEN any document at level `feature`, `module`, or `system` is modified, THE Copilot_Plus SHALL trigger an upward consistency check by invoking the Architect Sub_Agent with the changed document and its parent at the next consistency-check trigger from criterion 3, not immediately. THE Architect Sub_Agent SHALL return whether the parent's summary remains accurate or whether an update is recommended. Recommended updates SHALL be queued in the Decision_Center.
8. THE Copilot_Plus SHALL apply a per-Build_Operation cap on consistency-check Sub_Agent invocations of 50 by default, configurable via `copilotPlus.docs.consistencyCheckBudget` between 10 and 500. WHEN the cap is reached, THE Copilot_Plus SHALL queue further checks for the next Background_Agent run per `R-AG-9`.
9. THE Copilot_Plus SHALL display a Layer_Consistency status in the Control_Console under a `Hierarchy` section, showing per-layer counts of `Consistent`, `Update_Pending`, `Drift_Suspected`, `Orphan_Code`, `Ownership_Conflict`, plus the count of changes currently in the Pending_Consistency_Queue. THE counts SHALL update within 5 seconds of any consistency event.

### R-DOCS-13: Drift Detection and Resolution

**User Story:** As a developer, I want clear surfaces for resolving inconsistencies between layers, so that drift gets actively fixed rather than accumulating.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL display all open Drift items in a dedicated Drift_View accessible from the Control_Console `Hierarchy` section and from a status-bar item showing the count.
2. THE Drift_View SHALL list each Drift item with: type (`Doc_Update_Recommended`, `Code_Mismatch_Suspected`, `Orphan_Code`, `Ownership_Conflict`, `Dangling_Link`, `Stale_Summary`), affected layer, affected document or file, originating event timestamp, and a `Resolve` action.
3. WHEN the user activates `Resolve` on a Drift item, THE Copilot_Plus SHALL invoke the appropriate Sub_Agent (Architect for system/module/feature drift, Reviewer for component/code drift) to propose a resolution, routed through the Diff_Review_UI per `R-EDIT-4`.
4. WHEN the user resolves a Drift item by accepting a proposed change, THE Copilot_Plus SHALL clear the corresponding diagnostic and SHALL emit a `drift.resolved` Hook_Event.
5. WHEN the user explicitly dismisses a Drift item without changes (because the AI's detection was a false positive), THE Copilot_Plus SHALL record the dismissal with a user-supplied rationale in `.copilotPlus/drift_history.json` and SHALL include recent dismissals as context to the Reviewer Sub_Agent on subsequent checks of the same document, so the same false positive is not raised repeatedly.
6. THE Copilot_Plus SHALL provide a `Resolve_All` action in the Drift_View that runs all Drift items through their respective Sub_Agents in sequence, presenting one Diff_Review_UI per item.
7. THE Copilot_Plus SHALL retain Drift items across Host_Editor restarts in `.copilotPlus/drift_state.json`. THE Copilot_Plus SHALL re-run the underlying check when the originating document or code is modified, automatically clearing items whose underlying condition no longer exists.

### R-DOCS-14: Layer-First Retrieval

**User Story:** As a Sub_Agent, I want to walk the layers from top to bottom rather than search a flat token soup, so that my reasoning is grounded in the structure of the project rather than in superficial text matches.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL define Layer_Walk as a retrieval operation that, given a starting layer and a target layer, returns: the document at the starting layer, the chain of Hierarchical_Links from the starting layer to the target layer, every document along that chain in compact form (frontmatter + section headings + summary), and the target-layer artifact in full.
2. WHEN any Sub_Agent constructs a request for a task whose `scope_doc` resolves to a document at layer L, THE Copilot_Plus SHALL prepend a Layer_Walk from `system` down to L to the request payload, before any RAG retrievals or other context items.
3. WHEN any Sub_Agent acts on a Code_File, THE Copilot_Plus SHALL prepend a Layer_Walk from `system` down to the Code_File's owning Component_Doc, including the Component_Doc's `code_paths` and a list of sibling Code_Files within the same Component_Doc.
4. THE Layer_Walk SHALL take precedence over RAG retrievals in the Token_Budget priority order defined in `R-CTX-4.3`. THE updated priority order SHALL be: (1) explicit Mentions, (2) Layer_Walk for the active scope, (3) active selection, (4) current file, (5) RAG retrievals, (6) Codebase_Index retrievals, (7) prior chat history.
5. WHEN the active context tier is `Tier_S` per `R-CTX-8`, THE Copilot_Plus SHALL include in the Layer_Walk only the frontmatter and the `Summary` section of each ancestor document, not the full body, to fit within the budget. WHEN the tier is `Tier_M` or `Tier_L`, THE Copilot_Plus SHALL include the full body of each ancestor.
6. THE Copilot_Plus SHALL require every Module_Doc, Feature_Doc, and Component_Doc to contain a `## Summary` section of 100 to 800 characters as the first section after frontmatter. IF a document lacks a `## Summary` section, THEN THE Copilot_Plus SHALL flag a `Missing_Summary` diagnostic and SHALL ask the originating Sub_Agent (Architect or Designer) to author one before proceeding with downstream tasks.
7. THE Copilot_Plus SHALL prefer Layer_Walk-derived context over RAG-derived context when both surface the same document. RAG retrievals SHALL be deduplicated against the Layer_Walk content before being attached to the request.
