---
name: copilot-plus-document-tree
description: >-
  Five-layer document hierarchy for Copilot Plus: System/Module/Feature/Component
  markdown under .copilotPlus/docs/, frontmatter schema, layer walk, scope resolution,
  drift detection. Use when implementing DOCS requirements or doc_* tools.
---

# Document Tree (Five-Layer Hierarchy)

## Paths (R-DOCS-1)

```
.copilotPlus/docs/system/<system-id>.md
.copilotPlus/docs/system/<system-id>/<module-id>.md
.../<feature-id>.md
.../<component-id>.md
```

Layer 5 (Code) = workspace source files linked via Component `code_paths` globs.

## Frontmatter (R-DOCS-2)

Required: `id`, `level`, `title`, `parent`, `children`, `lateral`.
Component adds: `code_paths`, `code_owner_authority`.

Every doc needs `## Summary` section (100–800 chars) for Layer_Walk (R-DOCS-14.6).

## Size caps (R-DOCS-8)

| Level | Body max |
|-------|----------|
| system, module | 4000 chars |
| feature | 2000 |
| component | 1000 |

## Layer_Walk (R-DOCS-14)

Dominant retrieval: System → … → target layer.
Prepend to every Sub_Agent request before RAG.
Token priority #2 after explicit @mentions (R-CTX-4.3).

## Scope_Resolution (R-DOCS-5)

Traverse hierarchical + lateral links from starting doc; attach content via RAG pipeline.
Caps: Tier_S 100 docs, Tier_M 300, Tier_L 1000.

## Consistency & drift (R-DOCS-12, R-DOCS-13)

- Post code edit → Reviewer checks Component_Doc alignment.
- Drift_View in Control Console Hierarchy section.
- State: `.copilotPlus/drift_state.json`

## Implementation files

- `src/docs/schema.ts` — frontmatter validation
- `src/docs/treeOps.ts` — create/rename/move/delete
- `src/docs/layerWalk.ts` — retrieval
- `src/docs/ownershipIndex.ts` — code_paths → owner

## Reference

`.kiro/specs/copilot-plus-extension/requirements/05-docs.md`
