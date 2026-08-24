# Improvement Plans

Standalone work orders for improving the SWAT+ Dataset Selector extension. Each
file is self-contained and assumes no prior conversation context. Ordered roughly
by impact-to-effort.

| # | Plan | Theme | Effort | Priority |
|---|---|---|---|---|
| 01 | [Non-blocking indexing & prerequisite UX](01-nonblocking-indexing.md) | Reliability | M–L | Part A done; B–C open |
| 02 | [Validation from the enriched schema](02-validation-from-enrichment.md) | User value | S–M | High (best ROI now) |
| 03 | [`@swat` chat participant](03-chat-participant.md) | User value | M | High |
| 04 | [SWAT+ version-drift warning](04-version-drift-warning.md) | Correctness | S | Medium |
| 05 | [Activation scoping](05-activation-scoping.md) | Polish | XS | Medium |
| 06 | [CI for the headless suites](06-ci.md) | Maintainability | S | Medium |
| 07 | [Structured dataset search](07-dataset-search.md) | User value | M | Medium |
| 08 | [Webview refactor](08-webview-refactor.md) | Maintainability | L | Lower |
| 09 | [Sidebar & interaction UX](09-ui-ux-improvements.md) | User value | M (done) + S–L | Medium |

Effort: XS < S < M < L. These are independent; 02 and 04 build naturally on the
schema-enrichment work already merged (`swatplus-schema-enriched.json`,
`src/enrichedSchemaCore.ts`, `src/datasetEngineCore.ts`).

Plan 09 records the sidebar/interaction work shipped in PR #137 and the items it
left open. One of those — windowed rendering for large tables — is **blocked on
Plan 08**: client-side sort and filter read the DOM directly, so windowing without
moving them host-side would silently produce wrong results. See Plan 08's
"Hard requirement" section.
