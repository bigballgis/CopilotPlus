---
name: implement-from-kiro-spec
description: >-
  Implements Copilot Plus features from Kiro EARS requirements: read module spec,
  map to src/ paths, verify acceptance criteria, trace R-* IDs. Use when
  implementing any requirement from .kiro/specs/ or when user references R-PLAT,
  R-INT, R-DOCS, etc.
---

# Implement From Kiro Spec

## Workflow

1. **Locate requirement**
   - User mentions `R-DOCS-14` → open `requirements/05-docs.md`, find `### R-DOCS-14`.
   - Unsure of module → check table in `requirements.md`.

2. **Read dependencies**
   - Check Cross-Reference Index in `requirements.md` for linked concepts.
   - Read glossary terms in the module file.

3. **Plan code touchpoints**
   - Map to `src/<module>/` per `copilot-plus-overview`.
   - Identify UI surfaces (webview vs host vs command).

4. **Implement**
   - Satisfy every EARS criterion (THE/WHEN/IF/THEN).
   - Add integration test when criterion is user-visible behavior.

5. **Verify**
   - Manual checklist from acceptance criteria.
   - No regressions on Sensitive_File, Copilot-only model path.

## EARS checklist template

```
Requirement: R-___-_
- [ ] Criterion 1: ...
- [ ] Criterion 2: ...
```

## Common cross-module hooks

| Need | Also read |
|------|-----------|
| File write | EDIT (Diff Review), TOOL (apply_patch) |
| Agent invoke | AG, WF step binding |
| Context attach | CTX-4 priority, DOCS-14 Layer_Walk |
| User prompt | INT-10 Decision_Notification |
| Settings | PLAT-4 Configuration_Namespace |

## Output

PR/commit message format: `feat(docs): layer walk retrieval (R-DOCS-14)`
