---
name: copilot-plus-testing
description: >-
  Testing strategy for Copilot Plus VS Code extension: @vscode/test-cli integration
  tests, mock vscode.lm, requirement-ID test naming, webview smoke tests. Use when
  writing tests or verifying R-* acceptance criteria.
---

# Copilot Plus Testing

## Stack

- `@vscode/test-cli` + `@vscode/test-electron`
- Unit tests: colocated `*.test.ts` with optional mocks in `src/test/mocks/`

## Integration test layout

```
src/test/suite/
  platform.test.ts      # R-PLAT-*
  interaction.test.ts   # R-INT-*
  ...
src/test/runTest.ts
```

## Mocking vscode.lm

```typescript
// Stub selectChatModels to return fake LanguageModelChat
// Stub sendRequest with async iterable text chunks
```

Never call real Copilot in CI.

## Naming

`test('R-PLAT-2.2: empty models shows sign-in prompt', async () => { ... })`

## What to test per milestone

| Milestone | Focus |
|-----------|-------|
| M0 | Version gate, settings apply, no activation on old VS Code |
| M1 | Commands registered, webview message round-trip |
| M2 | Frontmatter validation, layer walk output shape |
| M3 | Tool permission deny/ask/allow, allowlist enforcement |
| M4 | DAG validation, stage transition rules |
| M5 | Token budget drops, sensitive file exclusion |
| M6 | Checkpoint create/restore |

## Run

```bash
npm test
```

## Reference

Requirement acceptance criteria in `.kiro/specs/copilot-plus-extension/requirements/`
