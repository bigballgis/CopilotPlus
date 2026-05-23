# Requirements: Context, Indexing, and RAG

Module ID: `CTX`

## Introduction

This module defines how Copilot_Plus assembles context for every model request. The dominant mechanism is the **Layer_Walk** defined in `R-DOCS-14`: starting from the System_Doc, the AI descends through the Five_Layer_Hierarchy to the layer relevant to the current task. RAG and Codebase_Index retrievals are **secondary refinement mechanisms**, attached only after the Layer_Walk has been included.

This priority is deliberate and reflects the Core Design Thesis stated in the top-level `requirements.md`: structure beats long context. A `Tier_S` model (under 100k token window) operating with a Layer_Walk over a million-line codebase will produce more accurate output than the same model fed the same number of tokens via flat embedding similarity.

Within that frame, this module defines: explicit `@`-mentions chosen by the user, the Codebase_Index over source files, the RAG_Index over the Document_Tree, the deterministic context budget, and the adaptive retrieval strategy that scales with the model's context window.

The retrieval architecture is **hybrid**: sparse BM25 keyword search + dense embedding similarity (when available) + Reciprocal Rank Fusion + cross-encoder reranking. This is the standard production design for code/documentation retrieval as of 2026 and is chosen for its strong recall on technical identifiers and exact tokens, which pure vector search alone misses. **All of this hybrid retrieval is layered on top of the Layer_Walk, not in place of it.**

**Embedding strategy.** Copilot_Plus operates in one of three embedding modes, selected automatically based on the runtime environment:

- **Mode A — Proposed Language Model embeddings (preferred when available).** When the active VS Code build exposes the proposed `vscode.lm.computeEmbeddings` API (proposed API id `embeddings`, tracked in [microsoft/vscode#212083](https://github.com/microsoft/vscode/issues/212083), unstable as of VS Code 1.120 in May 2026), Copilot_Plus calls `vscode.lm.computeEmbeddings(embeddingsModel, input)` to obtain dense embeddings from the same Copilot-vended pipeline used by Microsoft first-party features. **Use of this API requires that the published extension declare `enabledApiProposals: ["embeddings"]` and run on an Insiders or enterprise-signed VS Code build that has this proposal enabled. Extensions published to the public Marketplace MAY NOT use this API.** Copilot_Plus is an enterprise-internal distribution and MAY enable this proposal in the enterprise VSIX.
- **Mode B — Local embeddings (preferred when the proposed API is unavailable but on-device embeddings are acceptable).** Copilot_Plus ships an optional embedding model add-on (a quantized multilingual model, downloaded on first use to user storage, total size under 200 MB) that runs on-device via ONNX Runtime. The base extension does not include the model file and has no network dependency for embeddings other than the one-time add-on download from the configured corporate mirror. **Mode B is fully dependent on enterprise IT cooperation.** The enterprise must (1) host the embedding model add-on at an internal mirror URL, (2) configure that URL in `copilotPlus.indexing.embeddingAddon.url`, (3) provide the SHA-256 digest in `copilotPlus.indexing.embeddingAddon.sha256`. Without all three, Mode B is effectively disabled and Copilot_Plus falls back to Mode C. The product MUST work well in Mode C; Mode B is an enhancement, not a requirement.
- **Mode C — Sparse-only (fallback when neither Mode A nor Mode B is available).** Copilot_Plus uses BM25 only, with a structural retrieval booster derived from the Document_Tree links (per `R-DOCS-5`) and from symbol-graph proximity computed from LSP. This sacrifices some semantic recall but works without any embedding model. **Mode C is also a viable primary mode** because the Layer_Walk does most of the heavy lifting; embeddings only refine within the layer-resolved scope.

**No external embedding API is called.** Copilot_Plus does not transmit content to any non-Copilot endpoint to compute embeddings. All three modes keep content within the user's environment or within the Copilot service that already receives chat payloads.

## Glossary

- **Mention**: An `@`-prefixed reference inserted in a Conversation_Pane or Inline_Edit input that attaches a context item.
- **Codebase_Index**: A Workspace-scoped index of source code files, symbols, and embeddings used to retrieve code context relevant to a prompt. Stored under `.copilotPlus/index/code/`.
- **RAG_Index**: A Workspace-scoped retrieval index over the Document_Tree (`.copilotPlus/docs/`) and any user-registered documentation sources. Stored under `.copilotPlus/index/docs/`.
- **BM25_Score**: A sparse retrieval score computed from term frequency and inverse document frequency over the indexed corpus.
- **Embedding**: A dense vector representation of a text chunk produced by an embedding model.
- **Embedding_Mode**: One of `proposed_lm` (Mode A, `vscode.lm.computeEmbeddings` proposed API), `local` (Mode B, on-device ONNX Runtime), `sparse_only` (Mode C, BM25 + structural booster, no embedding), `auto` (resolve in the order `proposed_lm` → `local` → `sparse_only`, picking the first that is available and enabled).
- **Structural_Booster**: A retrieval re-weighting function that boosts candidate scores by Document_Tree proximity (Hierarchical_Link distance plus Lateral_Link presence) and by LSP symbol-graph proximity (caller / callee distance), used in `sparse_only` mode and as a tie-breaker in `local` mode.
- **RRF**: Reciprocal Rank Fusion, a method that combines rankings from multiple retrievers by summing `1/(k + rank)` where k is a fixed constant.
- **Cross_Encoder_Reranker**: A model that scores `(query, candidate)` pairs jointly to produce a final precision-oriented ranking over a small candidate set.
- **Context_Item**: A single attachment that contributes to the request payload, classified as one of: explicit Mention, active selection, current file, Codebase_Index retrieval, RAG retrieval, prior chat history.
- **Token_Budget**: The maximum input token count of the active Copilot_Model, as reported by `LanguageModelChat.maxInputTokens`.

## Requirements

### R-CTX-1: Mentions and Context Attachment

**User Story:** As a developer, I want to attach files, folders, symbols, docs, and web content to my prompt, so that the model has the context it needs.

#### Acceptance Criteria

1. WHEN the user types `@` in the Conversation_Pane or Inline_Edit input, THE Copilot_Plus SHALL display a Mention picker within 200 milliseconds, listing the kinds: `@file`, `@folder`, `@symbol`, `@selection`, `@doc`, `@web`, `@skill`.
2. WHEN the user selects `@file` and chooses a file, THE Copilot_Plus SHALL attach the full text of that file to the next request, subject to the per-attachment size limit defined in `R-CTX-4`.
3. IF the chosen `@file` exceeds the per-attachment size limit defined in `R-CTX-4`, THEN THE Copilot_Plus SHALL block the attachment, SHALL display a message identifying the file and the limit, and SHALL NOT include the file in the request.
4. WHEN the user selects `@folder` and chooses a folder, THE Copilot_Plus SHALL attach a recursive listing of up to 1,000 files in that folder and SHALL retrieve relevant snippets via the Codebase_Index.
5. WHEN the user selects `@symbol`, THE Copilot_Plus SHALL list workspace symbols via `vscode.executeWorkspaceSymbolProvider` and SHALL attach the source range of the chosen symbol.
6. WHEN the user selects `@selection`, THE Copilot_Plus SHALL attach the active editor's current selection.
7. IF the user selects `@selection` while no editor selection exists, THEN THE Copilot_Plus SHALL display a message indicating no selection is available and SHALL NOT attach an empty selection.
8. WHEN the user selects `@doc` and chooses a document from the Document_Tree, THE Copilot_Plus SHALL attach the chosen document's content and SHALL include the resolved scope of that document as defined in `R-DOCS-5`.
9. WHEN the user selects `@web` and provides a query or URL, THE Copilot_Plus SHALL fetch the result through the configured web provider within 15 seconds and SHALL attach the retrieved text.
10. IF an `@web` fetch fails or does not complete within 15 seconds, THEN THE Copilot_Plus SHALL abort the fetch, SHALL display a message indicating the failure or timeout, and SHALL NOT include the unfetched content in the request.
11. WHEN the user selects `@skill` and chooses a Skill, THE Copilot_Plus SHALL attach that Skill's constraints to the next request as defined in `R-EXT-1`.
12. THE Copilot_Plus SHALL display every active Mention as a chip above the input that identifies the Mention kind and target and that exposes a remove control.
13. IF the combined size of attachments exceeds the Token_Budget defined in `R-CTX-4`, THEN THE Copilot_Plus SHALL prompt the user to remove attachments before sending and SHALL require explicit user confirmation before sending any truncated request.

### R-CTX-2: Codebase Index

**User Story:** As a developer, I want the AI to retrieve relevant code from across my workspace, so that suggestions reflect my actual codebase.

#### Acceptance Criteria

1. WHEN a Workspace is opened, THE Copilot_Plus SHALL begin building a Codebase_Index covering source files not excluded by Sensitive_File_Patterns within 5 seconds of activation, with the index stored under `.copilotPlus/index/code/`.
2. WHERE the `copilotPlus.indexing.respectGitignore` setting is enabled, THE Copilot_Plus SHALL exclude files matching any `.gitignore` in the Workspace, including nested `.gitignore` files, from the Codebase_Index.
3. WHEN files are created, modified, deleted, or renamed in the Workspace, THE Copilot_Plus SHALL update the affected Codebase_Index entries within 5 seconds of the file system event.
4. THE Copilot_Plus SHALL chunk source files for the Codebase_Index using semantic boundaries (function, class, method) when a parser is available for the language, falling back to fixed-size sliding windows of 800 characters with 200-character overlap when no parser is available.
5. THE Copilot_Plus SHALL maintain, for each chunk, a sparse term index (BM25). WHEN Embedding_Mode is `proposed_lm` or `local`, THE Copilot_Plus SHALL additionally maintain a dense Embedding per chunk produced by the resolved embedding source. WHEN Embedding_Mode is `sparse_only`, THE Copilot_Plus SHALL NOT compute any dense Embedding.
6. WHEN the user activates the manual rebuild control in the Control_Console, THE Copilot_Plus SHALL discard the existing Codebase_Index, SHALL begin a full rebuild within 1 second, and SHALL update the Indexing status to `Rebuilding`.
7. IF Codebase_Index construction or update fails, THEN THE Copilot_Plus SHALL set the Indexing status to `Failed` with the failure reason, SHALL fall back to retrieval-free prompts, and SHALL retry the build automatically at the next manual rebuild or Workspace open.
8. THE Copilot_Plus SHALL store all Codebase_Index data within Workspace-local storage and SHALL NOT transmit raw indexed content to any endpoint other than the Copilot_Model request payload routed through Language_Model_API.

### R-CTX-3: RAG over the Document Tree

**User Story:** As a developer, I want the AI to retrieve relevant passages from my system/module/feature/component documents, so that its answers stay grounded in my project's design.

#### Acceptance Criteria

1. WHEN a Workspace is opened, THE Copilot_Plus SHALL build a RAG_Index over every markdown file in `.copilotPlus/docs/` within 10 seconds, with the index stored under `.copilotPlus/index/docs/`.
2. THE Copilot_Plus SHALL chunk Document_Tree files for the RAG_Index using markdown heading boundaries (H1 → H6), with each chunk capturing its heading path and its hierarchical and lateral links as metadata.
3. THE Copilot_Plus SHALL maintain, for each RAG chunk, a sparse term index (BM25). WHEN Embedding_Mode is `proposed_lm` or `local`, THE Copilot_Plus SHALL additionally maintain a dense Embedding per chunk.
4. WHEN any Document_Tree file is created, modified, deleted, or renamed, THE Copilot_Plus SHALL update the affected RAG_Index entries within 5 seconds of the file system event.
5. WHEN a request is constructed by the Conversation_Pane, a Sub_Agent, Inline_Edit, or Composer, THE Copilot_Plus SHALL execute hybrid retrieval. WHEN Embedding_Mode is `proposed_lm` or `local`, the pipeline SHALL be: (a) BM25 retrieval of the top 50 chunks, (b) dense Embedding retrieval of the top 50 chunks, (c) fusion of the two ranked lists by Reciprocal Rank Fusion with k=60, (d) Structural_Booster re-weighting, (e) cross-encoder reranking of the top 30 candidates, (f) selection of the top 10 reranked chunks. WHEN Embedding_Mode is `sparse_only`, the pipeline SHALL be: (a) BM25 retrieval of the top 100 chunks, (b) Structural_Booster re-weighting, (c) cross-encoder reranking of the top 30 candidates, (d) selection of the top 10 reranked chunks. In all modes, selection is subject to the Token_Budget defined in `R-CTX-4`.
6. THE Copilot_Plus SHALL include, with each retrieved RAG chunk, its document path, heading path, and a list of its hierarchical and lateral link targets, so that the model can navigate scope as defined in `R-DOCS-5`.
7. WHERE the `copilotPlus.rag.enabled` setting is `false`, THE Copilot_Plus SHALL skip RAG retrieval entirely and SHALL include only explicit Mentions and Codebase_Index retrievals in the request.
8. WHEN the Embedding_Mode changes or the embedding add-on version changes, THE Copilot_Plus SHALL invalidate all stored Embeddings and SHALL trigger a full RAG_Index rebuild within 1 second.
9. THE Copilot_Plus SHALL store all RAG_Index data within Workspace-local storage and SHALL NOT transmit raw indexed content to any endpoint other than the Copilot_Model request payload routed through Language_Model_API.

### R-CTX-4: Context Budgeting

**User Story:** As a developer, I want the extension to manage context size, so that requests do not silently overflow the model's window.

#### Acceptance Criteria

1. WHEN a Copilot_Model is selected for a Session, THE Copilot_Plus SHALL read the maximum input token count from the `LanguageModelChat` instance's reported limit and SHALL use that value as the Token_Budget for that Session.
2. WHEN constructing a request payload, THE Copilot_Plus SHALL compute the total input token count of the assembled context before dispatch and SHALL ensure the count does not exceed the Token_Budget.
3. WHEN the assembled context would exceed the Token_Budget, THE Copilot_Plus SHALL retain Context_Items in the following deterministic priority order until the remaining budget is insufficient for the next item, and SHALL drop all lower-priority items: (1) explicit Mentions, (2) Layer_Walk for the active scope per `R-DOCS-14`, (3) active selection, (4) current file, (5) RAG retrievals, (6) Codebase_Index retrievals, (7) prior chat history.
4. IF the highest-priority single Context_Item alone exceeds the Token_Budget, THEN THE Copilot_Plus SHALL block the request, SHALL preserve the unsent user input in the Conversation_Pane, and SHALL display an error message indicating that the item exceeds the model's input limit.
5. WHEN the Copilot_Plus drops one or more Context_Items to fit within the budget, THE Copilot_Plus SHALL display in the request UI a list identifying each dropped item by its category (Mentions, active selection, current file, RAG retrievals, Codebase_Index retrievals, or prior chat history) and the count of items dropped per category.
6. THE Copilot_Plus SHALL display in the Conversation_Pane header the current per-Session running input token count and the configured per-Session token cap, and SHALL update both values within 1 second after each completed request.
7. IF a new request would cause the per-Session running token count to exceed the configured per-Session token cap, THEN THE Copilot_Plus SHALL block the request, SHALL preserve the unsent user input in the Conversation_Pane, and SHALL display an error message indicating that the Session token cap has been reached.
8. THE Copilot_Plus SHALL enforce a per-attachment size limit equal to 25% of the Token_Budget for any single `@file`, `@doc`, or RAG chunk attachment.

### R-CTX-5: Embedding Mode Selection

**User Story:** As a developer or enterprise admin, I want explicit control over whether dense embeddings are used and how they are produced, so that I can match the index to my offline, storage, and API-availability constraints.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL expose the setting `copilotPlus.indexing.embeddingMode` with allowed values `proposed_lm`, `local`, `sparse_only`, `auto` (default `auto`).
2. WHEN `embeddingMode` is `auto`, THE Copilot_Plus SHALL resolve the active mode in the following order, picking the first that satisfies its preconditions: (a) `proposed_lm` when the running VS Code build exposes the `embeddings` proposed API and the extension has declared `enabledApiProposals: ["embeddings"]` and `vscode.lm.embeddingModels` returns at least one model identifier; (b) `local` when the local embedding add-on is installed, the add-on signature verifies, and the active platform is supported by ONNX Runtime; (c) `sparse_only` otherwise.
3. WHEN `embeddingMode` is `proposed_lm` and the precondition in criterion 2(a) is not met, THE Copilot_Plus SHALL fall back to `auto` resolution starting from option (b), SHALL display a non-blocking notice in the Control_Console naming the unmet precondition, and SHALL NOT block indexing.
4. THE Copilot_Plus SHALL display the resolved Embedding_Mode in the Control_Console `Indexing` section, including the embedding model identifier when `proposed_lm` is active and the add-on version when `local` is active.
5. WHEN `embeddingMode` is `local` and the add-on is not installed, THE Copilot_Plus SHALL surface in the Control_Console `Indexing` section an actionable control that downloads the add-on from the URL configured at `copilotPlus.indexing.embeddingAddon.url`. THE control SHALL be disabled when the URL is empty, and the Control_Console SHALL display a clear notice that Mode B requires enterprise IT to host the model and configure both the URL and the SHA-256 digest. The notice SHALL state that without enterprise IT cooperation, Mode B is unavailable and the system will fall back to Mode C.
6. THE Copilot_Plus SHALL verify the downloaded add-on against a SHA-256 digest configured at `copilotPlus.indexing.embeddingAddon.sha256`. IF the digest does not match, THEN THE Copilot_Plus SHALL discard the download and SHALL display an error indication.
7. THE Copilot_Plus SHALL store the downloaded add-on under user storage outside the Workspace, and SHALL NOT include the add-on file in the extension package or in any Telemetry_Event.
8. WHEN `proposed_lm` is the resolved mode and `vscode.lm.onDidChangeEmbeddingModels` fires, THE Copilot_Plus SHALL re-resolve the embedding model and, if the resolved model identifier changes, SHALL invalidate all stored Embeddings and trigger a full RAG_Index rebuild within 1 second.
9. THE Copilot_Plus SHALL ensure that for any retrieval performed in `sparse_only` mode, the Structural_Booster contributes a non-zero score component derived from Document_Tree link proximity per `R-DOCS-5` and from LSP symbol-graph proximity per `R-TOOL-5`.
10. THE Copilot_Plus SHALL declare `enabledApiProposals: ["embeddings"]` in its extension manifest only when the published distribution channel is the enterprise-internal VSIX. THE Copilot_Plus SHALL NOT declare `enabledApiProposals` when the distribution channel is the public VS Code Marketplace.

### R-CTX-6: Unified Retrieval Policy

**User Story:** As the Primary_Agent, I want a single retrieval entry point over both code and documents, so that I do not run two parallel pipelines and assemble inconsistent context.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL maintain a single retrieval surface, exposed to Sub_Agents as the `code_search` Tool defined in `R-TOOL-6`, that fuses results from the Codebase_Index and the RAG_Index.
2. THE Copilot_Plus SHALL union candidates from both indexes with a corpus identifier (`code` or `doc`) attached to each result, then apply RRF, Structural_Booster, and reranker in one pass.
3. WHEN constructing a Sub_Agent request, THE Copilot_Plus SHALL invoke the unified retrieval surface once for the resolved query and SHALL NOT issue separate Codebase_Index and RAG_Index queries that the Sub_Agent must reconcile.
4. THE Copilot_Plus SHALL apply default per-result-kind quotas of 6 code chunks and 4 doc chunks within the top 10 reranked results. IF either quota cannot be filled, THEN THE remaining slots SHALL be filled from the other kind.

### R-CTX-7: Conversation Summarization

**User Story:** As a developer running long Build_Operations or multi-turn Design_Stage sessions, I want the assistant to compress earlier turns into a summary when the context window fills, so that the conversation does not abort and the AI does not lose intent.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL trigger Conversation_Summarization for a Session when the assembled input token count for the next request would exceed 80% of the Token_Budget defined in `R-CTX-4` after applying the priority drops in `R-CTX-4.3`.
2. THE Copilot_Plus SHALL implement Conversation_Summarization by issuing one Copilot_Model request that takes the messages targeted for compression and returns a structured summary of at most 2,000 tokens, formatted as a system message containing: `goals`, `decisions_made`, `files_touched`, `open_questions`, `last_user_intent`.
3. THE Copilot_Plus SHALL retain in original form the most recent N turns where N is configurable via `copilotPlus.context.summarization.keepLastTurns` (default 6, range 2 to 20), and SHALL replace the older turns with the generated summary message.
4. THE Copilot_Plus SHALL never trigger Conversation_Summarization more than 3 times within any single rolling window of 10 model requests in the same Session. IF the limit is hit, THEN THE Copilot_Plus SHALL block further model requests until the user starts a new Session and SHALL display a notification explaining the cause.
5. THE Copilot_Plus SHALL persist every Conversation_Summarization output as part of the Session under `.copilotPlus/sessions/<session-id>/summaries/<timestamp>.md`, so the user can audit what context was compressed.
6. THE Copilot_Plus SHALL expose `copilotPlus.context.summarization.mode` with values `auto`, `manual`, `disabled` (default `auto`). WHEN `manual`, the Copilot_Plus SHALL emit a Decision_Notification before triggering. WHEN `disabled`, the Copilot_Plus SHALL never trigger summarization and SHALL block requests that would exceed the Token_Budget per `R-CTX-4.4`.
7. THE Copilot_Plus SHALL display a `Summarized` chip in the Conversation_Pane and Task_Panel transcripts at every position where summarization occurred, with a click-through to the persisted summary file from criterion 5.

### R-CTX-8: Adaptive Retrieval Strategy

**User Story:** As a developer using whatever Copilot model has the largest context window, I want the retrieval strategy to scale with the model so that we exploit large windows when available and stay efficient on small ones.

#### Acceptance Criteria

1. THE Copilot_Plus SHALL classify the active Copilot_Model into one of three context tiers based on `LanguageModelChat.maxInputTokens`: `Tier_S` (under 100,000 tokens), `Tier_M` (100,000 to 500,000 tokens), `Tier_L` (over 500,000 tokens).
2. WHEN the active tier is `Tier_S`, THE Copilot_Plus SHALL apply the retrieval strategy defined in `R-CTX-3.5` with default `top_k = 10` and the Token_Budget priority drops in `R-CTX-4.3`.
3. WHEN the active tier is `Tier_M`, THE Copilot_Plus SHALL raise default retrieval `top_k` to 50, SHALL include the full AGENTS.md chain per `R-KNOW-1` without size capping per `R-KNOW-1.3`, and SHALL include every document's frontmatter (excluding bodies) for documents at level `system` and `module` for the active Workspace.
4. WHEN the active tier is `Tier_L`, THE Copilot_Plus SHALL include the full Scope_Resolution result per `R-DOCS-5` with the per-request document cap raised from 100 to 1,000, SHALL include all `lsp_references` for every modified symbol without the 20-reference cap in `R-EDIT-7.3`, and SHALL include the full content of the active Module_Doc subtree without further pruning.
5. THE Copilot_Plus SHALL display the active tier in the Conversation_Pane header and in the Control_Console `Indexing` section, with a tooltip explaining the resolved retrieval strategy.
6. THE Copilot_Plus SHALL allow the user to override the auto-detected tier via `copilotPlus.context.tierOverride` (one of `auto`, `s`, `m`, `l`, default `auto`), for testing or for quota-conscious operation.
7. WHEN the active tier is `Tier_M` or `Tier_L`, THE Copilot_Plus SHALL relax the per-Session running token cap defined in `R-PLAT-4.2` to `min(per_session_cap, maxInputTokens × 100)`, recognizing that large-context models are designed to be filled.
