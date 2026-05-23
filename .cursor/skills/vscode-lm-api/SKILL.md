---
name: vscode-lm-api
description: >-
  GitHub Copilot Language Model API for Copilot Plus: selectChatModels vendor
  copilot, sendRequest streaming, consent, embeddings proposed API, model tiers.
  Use when implementing model calls, chat, tab completion, or embedding index.
---

# VS Code LM API (Copilot Only)

## Model selection (R-PLAT-2, R-PLAT-3)

```typescript
const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
// Zero models → notification + GitHub Copilot sign-in command
// Persist selection per workspace; fallback alphabetically
```

- Never store API keys or call non-Copilot endpoints.
- Handle consent: first request triggers LM consent flow; abort if denied.
- On entitlement loss: cancel in-flight requests within 2s (R-PLAT-2.7).

## Sending requests

```typescript
const response = await model.sendRequest(
  [vscode.LanguageModelChatMessage.User(prompt)],
  { tools }, // tool definitions for sub-agents
  token
);
for await (const chunk of response.text) { /* stream */ }
```

- Respect `model.maxInputTokens` as Token_Budget (R-CTX-4).
- Classify tier: S (<100k), M (100k–500k), L (>500k) per R-CTX-8.

## Embeddings (R-CTX-5)

Modes: `proposed_lm` | `local` | `sparse_only` | `auto`.

- Proposed API: `enabledApiProposals: ["embeddings"]` — enterprise VSIX only.
- `vscode.lm.computeEmbeddings(model, input)` when available.
- Marketplace build: do NOT declare proposals; fall back to local or sparse.

## Speculative requests (R-PLAT-11)

Only for: Tab Completion, NES, Scope_Resolution preheat.
Hold ≤30s; 50% token discount in session counter display.

## Reference

- Module: `.kiro/specs/copilot-plus-extension/requirements/01-platform.md`
- Context tiers: `04-context.md` R-CTX-8
