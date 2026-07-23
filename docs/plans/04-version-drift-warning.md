# Plan 04 — SWAT+ version-drift warning

**Theme:** correctness · **Effort:** S · **Priority:** medium

## Why

The enriched documentation is pinned to **SWAT+ 62.0.0**
(`enrichment.swatplus_version` in `swatplus-schema-enriched.json`, surfaced by
`EnrichedSchemaProvider.getSwatplusVersion` and the status-bar item added in
Phase 2). But a user's dataset may have been produced by a different SWAT+ /
editor version, in which case some column meanings, defaults, or even layouts can
be subtly wrong. The extension already parses the dataset's own version from the
`file.cio` header (`FileCioHeaderInfo` with `editorVersion` / `swatRevision`,
`src/indexer.ts:112`, `getFileCioHeaderInfo` at `:486`). We can compare the two and
warn.

## Goal

When the active dataset's SWAT+/editor version differs from the version the shipped
docs/schema were generated against, warn once — clearly and non-intrusively — so
users know docs may not perfectly match their dataset.

## Design

1. After a successful index build/load, read `getFileCioHeaderInfo()` and the
   enriched `getSwatplusVersion()`.
2. Compare `swatRevision` (and/or `editorVersion`) against the docs version
   (`62.0.0`). Normalize loosely (major.minor) — an exact match isn't required;
   only warn on a meaningful mismatch.
3. Surface the result:
   - Update the existing status-bar item tooltip to show both versions
     (docs vs dataset) and colour it as a warning (`StatusBarItem.backgroundColor =
     new ThemeColor('statusBarItem.warningBackground')`) when they differ.
   - Show a **one-time** (per dataset) information message on mismatch, with a
     "Don't show again" memento, explaining that column docs target SWAT+ 62.0.0.
4. Add the version comparison to the data-quality preflight report header, so it's
   captured in the generated report too.

## Deliverables

- A small helper (vscode-free, testable) `compareSwatVersions(datasetVersion,
  docsVersion): 'match' | 'minor-drift' | 'major-drift' | 'unknown'` in the core.
- Wiring in `src/extension.ts` (where `showDocsVersion()` already runs after build/
  load) to compute and surface drift.
- One-time-per-dataset suppression via `context.workspaceState`.

## Acceptance

- Loading a 62.x dataset: no warning; status bar shows a match.
- Loading a non-62 dataset (or one whose `file.cio` reports a different revision):
  status bar shows a warning state and a single dismissable info message appears.
- `compareSwatVersions` has unit tests for match / minor / major / missing-version.

## Notes

- Keep it low-noise: warn once, never per-file or per-hover. The goal is awareness,
  not nagging.
