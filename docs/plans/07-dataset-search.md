# Plan 07 — Structured dataset search

**Theme:** user value · **Effort:** M · **Priority:** medium

## Why

Modelers constantly ask locational questions: *"which HRUs use soil X?"*, *"list
all channels routing to reservoir 3"*, *"find rows where `cn_a` > 90"*, *"what's
orphaned?"*. The index already supports most of this — the reverse index +
`scanIncomingReferences` (`src/datasetEngineCore.ts`) answer the relationship
queries, and row values are in memory (`getIndexData`). Today there's no unified
way to ask.

## Goal

A structured search over the indexed dataset, available as a command, an engine
method, and (for free) an agent/chat tool.

## Query types

1. **By reference** — "which rows in table T reference value V" (already:
   `findReferences`). Generalize to "which rows reference any/other entities".
2. **By field predicate** — rows in a table where `column <op> value`
   (`=`, `!=`, `<`, `<=`, `>`, `>=`, `contains`, `in`). The output-explorer webview
   already implements a client-side predicate evaluator
   (`src/outputDataFramePanel.ts`) — lift that operator model into a small
   vscode-free evaluator so inputs and outputs share it.
3. **Orphans / dangling** — rows never referenced by anything (candidate dead data),
   and references whose target is missing (already partly in preflight).

## Design

1. Add engine methods to `src/datasetEngineCore.ts` (vscode-free, testable):
   - `queryRows(model, table, predicate): EngineRow[]`
   - `findOrphans(model, table): EngineRow[]` (rows with zero incoming references)
   Render helpers return compact text/tables like the other engine functions.
2. Surface as:
   - A **command** `SWAT+: Search Dataset` with a quick-pick / input flow (table →
     column → operator → value), results shown in a rendered markdown doc or a
     results webview (reuse the table viewer).
   - An **engine tool** `query_rows` / `find_orphans` added to the shared tool module
     (Plan 03), so MCP + chat get it automatically.
3. Keep result sets bounded (paginate / cap) so agent responses stay compact.

## Deliverables

- Vscode-free predicate evaluator + `queryRows` / `findOrphans` with unit tests.
- `SWAT+: Search Dataset` command + `package.json` contribution.
- Tool wrappers in the shared engine-tools module.

## Acceptance

- "HRUs using soil_01-h1" returns the same rows as `find_references` for that soil.
- A numeric predicate (`cn_a > 90`) returns the matching rows across the table.
- `find_orphans` on a table lists rows nothing references; verified on Ames_sub1.
- Predicate evaluator unit tests cover each operator and type coercion.

## Notes

- Reuse the operator semantics already proven in the output explorer rather than
  inventing a new query language.
