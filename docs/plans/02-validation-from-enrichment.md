# Plan 02 — Validation from the enriched schema

**Theme:** user value · **Effort:** S–M · **Priority:** high (best ROI right now)

> **Status: partially implemented.** The required-value check
> (`missing_required_value`) and enriched-doc context on all format-issue messages
> are done (`src/indexer.ts` validation loop, `formatColumnContext` /
> `isMissingRequiredValue` in `src/fileFormatUtils.ts`, wired through
> `src/fileFormatDiagnostics.ts`). Type conformance already existed. **Still open:**
> range/plausibility hints (§3 below) and the `swatplus.validation.rangeHints`
> setting.

## Why

The schema-enrichment work added per-column **units, Fortran types, and defaults**
(`resources/schema/swatplus-schema-enriched.json`, read via
`src/enrichedSchemaCore.ts`). Today the data-quality preflight
(`swat-dataset-selector.runDataQualityPreflight`, `src/extension.ts:475`) only
reports unresolved foreign keys and orphan rows, and the format checker
(`src/fileFormatUtils.ts`) validates header/column/type at a basic level. The
enrichment lets us add genuinely useful correctness checks with mostly wiring —
this is where the enrichment pays off for modelers, not just hovers.

## Goals

Extend validation with checks that use the enriched metadata, surfaced both as
editor diagnostics and in the preflight report.

## Checks to add

1. **Type conformance.** For a column whose enriched `fortran_type` is numeric
   (`real`/`integer`) or whose schema `type` is `DoubleField`/`IntegerField`, flag
   non-numeric cell values. (`src/fileFormatUtils.ts` already has `DoubleField`
   handling at line ~209 — extend it to consult the enriched type as a fallback and
   improve the message with the documented meaning.)
2. **Required-FK / required-value.** A non-nullable column
   (`SchemaColumn.nullable === false`) left empty or `null` → warning. FK columns
   already partly covered by `fkDiagnostics`; extend to non-FK required columns.
3. **Range / plausibility (opt-in).** Where the enriched doc carries a `default` and
   the column is numeric, flag values that are implausibly far from the default
   (e.g. orders of magnitude), as an *information*-level hint, not an error. Keep the
   heuristic conservative to avoid noise; make it toggleable via a setting
   (`swatplus.validation.rangeHints`, default off).
4. **Units annotation on issues.** Every validation message should include the
   column's documented meaning + units (already available via
   `EnrichedSchemaProvider.getColumnDoc`), so a warning reads
   "`gw_flo` (flow from aquifer, mm) expects a number, found 'abc'".

## Deliverables

- Extend `src/fileFormatUtils.ts` validators to accept optional enriched-doc input
  and produce richer `FileFormatIssue`s. Keep the functions pure and unit-tested
  (there is already `src/test/fileFormatUtils.test.ts`).
- Wire the enriched provider into `src/fileFormatDiagnostics.ts` (mirror how
  `src/fkDiagnostics.ts` now reads `getSharedEnrichedSchema()`).
- Expand the preflight report (`runDataQualityPreflight`) with new sections:
  Type issues, Required-value issues, and (if enabled) Range hints — each grouped
  by file with counts, matching the existing report style.
- New setting `swatplus.validation.rangeHints` in `package.json` contributes.

## Acceptance

- A dataset with a text value in a numeric column produces a diagnostic naming the
  column's meaning and expected type.
- A missing required value is flagged.
- Range hints are off by default and, when on, never fire on values at/near the
  documented default.
- New pure-function unit tests cover each check; existing tests still pass.

## Notes

- Keep validation **advisory and precise** — a wrong warning erodes trust more than
  a missing one, the same principle used in the enrichment matching. Only assert a
  type violation when the enriched/schema type is unambiguous.
