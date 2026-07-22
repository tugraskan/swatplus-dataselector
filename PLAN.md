# Implementation Plan: Schema Enrichment & LLM-Ready Dataset Knowledge Base

This document is a standalone work order. It assumes no prior conversation context.
It describes how to merge source-backed documentation from `swatplus-doc-builder`
into this extension's schema, wire the enriched schema into existing features, and
prepare the ground for a future LLM/agent layer. Work is split into independent
phases — each phase is shippable on its own.

---

## Implementation status

- **Phase 1 — DONE.** `scripts/merge_overlays.py` →
  `resources/schema/swatplus-schema-enriched.json` (+ `merge-report.md`).
  107 tables enriched directly, 19 by parent inheritance, 84 overlay-only.
  Python tests in `scripts/test_merge_overlays.py`.
  **Deviation from the original design below:** the plan called for a
  position-based column fallback (exact name → normalized → position with an
  id-offset). That proved unsound — the editor schema's column order does **not**
  match the file's physical read order, so position matching produced silently
  wrong docs past the point the two orders diverge. It was replaced by
  **name-identity matching only**: file header, then the Fortran field name in the
  overlay `target` (e.g. `bsn_cc%gampt` → `gampt`). Every emitted doc is correct by
  construction; a column that matches neither name is left unenriched rather than
  mislabeled. The Phase 1 section below still describes the original position
  approach — treat this note as the correction of record.
- **Phase 2 — DONE.** Read-only enriched-schema layer
  (`src/enrichedSchemaCore.ts` vscode-free + `src/enrichedSchema.ts` wrapper,
  shared singleton) wired into: FK/regular hovers, single-table viewer header
  tooltips, multi-table viewer Notes, unresolved-FK and missing-file-pointer
  diagnostics, and a status-bar version indicator. Tests in
  `src/test/enrichedSchemaCore.test.ts`.
- **Phase 2b — DONE.** `scripts/merge_output_families.py` →
  `resources/schema/swatplus-output-schema.json` (72 families, 286 output files);
  `OutputSchemaIndex` in the core; output explorer shows per-column tooltips and a
  file summary. Python tests in `scripts/test_merge_output_families.py`.
- **Phase 3 — IN PROGRESS.** Headless dataset engine + agent tools. See the
  Phase 3 section for the current design; the vscode-free
  `enrichedSchemaCore` / `OutputSchemaIndex` are the seam it extends.

---

## Background

### The two repositories

| Repo | Path (this environment) | What it provides |
|---|---|---|
| `tugraskan/swatplus-dataselector` (this repo) | `/home/user/swatplus-dataselector` | VS Code extension for SWAT+ datasets: dataset switching, input indexing, FK navigation (Go to Definition / hover / diagnostics), table viewers, HRU subsets, output exploration |
| `tugraskan/swatplus-doc-builder` | `/workspace/swatplus-doc-builder` | Documentation generator that scans SWAT+ Fortran source (release 62.0.0) and produces reviewed, structured JSON "overlays" describing input files, procedures, modules, and output families |

### The two knowledge sources to merge

**1. Extension schema** — `resources/schema/swatplus-editor-schema-full.json`

Extracted from the `swatplus-editor` project (a database-oriented view). Structure:

```jsonc
{
  "schema_version": "...",
  "source": { "repo": "swat-model/swatplus-editor", "commit": "...", ... },
  "statistics": { ... },
  "tables": {
    "initial.aqu": {                    // keyed by file name
      "file_name": "initial.aqu",
      "table_name": "initial_aqu",
      "model_class": "project.aquifer.Initial_aqu",
      "has_metadata_line": true,
      "has_header_line": true,
      "data_starts_after": 2,
      "columns": [
        { "name": "id", "db_column": "id", "type": "AutoField",
          "nullable": false, "is_primary_key": true, "is_foreign_key": false },
        { "name": "org_min", "type": "ForeignKeyField", "is_foreign_key": true,
          "fk_target": { "table": "om_water_ini", "column": "id" } }
        // ...
      ]
    }
    // ~230 tables total
  }
}
```

Strength: relational structure (tables, columns, FKs, primary keys).
Weakness: no semantics — no units, no descriptions, no defaults, no model context.

**2. Doc-builder overlays** — `/workspace/swatplus-doc-builder/overlays/`

Source-backed JSON generated from the SWAT+ Fortran source and refined through an
LLM batch-review workflow. Four families:

- `overlays/io/` — **192 files**, one per SWAT+ input file (e.g. `aquifer.aqu.json`)
- `overlays/procedures/` — 740 files, one per Fortran procedure
- `overlays/modules/` — 66 files
- `overlays/output_families/` — 103 files (describe SWAT+ output files)

An `overlays/io/*.json` file looks like:

```jsonc
{
  "kind": "input file",
  "links": { "source": "aqu_read.f90" },           // the Fortran reader
  "primary_target": "`aqudb(:)` (array of `type aquifer_database`)",
  "bottom_line": [ "plain-English summary paragraphs ..." ],
  "module_usage": { "input_file_module": "...", "aquifer_module": "..." },
  "file_variables_intro": "prose describing the file layout ...",
  "file_variables": [
    {
      "file_line": "",
      "column": "1",                                // 1-based column position
      "header": "id",                               // column header as written
      "source_line": "aqu_read.f90:55",             // Fortran source citation
      "target": "k",                                // Fortran variable it fills
      "type": "integer",
      "units": "none",
      "default": "-",
      "source_meaning": "aquifer id read from the record; ...",
      "manual_description": "Aquifer id (row index into the aquifer database)."
    }
    // ... one entry per column
  ]
}
```

Strength: per-column meaning, units, types, defaults, reader behavior, and Fortran
source citations. Weakness: no FK graph.

### Known facts and pitfalls (verified)

- **Naming mismatch**: the schema uses hyphens in some file names
  (`cal-parms.cal`), overlays use underscores (`cal_parms.cal`). After
  normalizing `-` → `_` and lowercasing, **106 file names match exactly**; 86
  overlays have no schema entry (mostly `*.gw` gwflow files the editor doesn't
  model); 124 schema entries have no overlay (largely child/sub-tables of files
  that DO have an overlay, e.g. `calibration_cal.cond` is a child of
  `calibration.cal`, plus output variants like `basin_crop_yld.aa`).
- **Column matching**: overlay `header` values usually match schema column
  `name`/`db_column`, but not always — the overlays explicitly note the editor
  writes headers that differ from Fortran field names (e.g. schema `gw_flo` vs
  overlay header `flo`). Match by (in order): exact name → normalized name
  (lowercase, strip `_`) → column position (overlay `column` is 1-based; account
  for the schema's `id` AutoField, which often does not appear in the physical
  file). Record the match method used.
- **Version pinning**: overlays describe SWAT+ **62.0.0**. Carry this into the
  merged output so consumers can warn on version drift.
- The overlays repo also has `docs_manifest.json` and a `swatplus-doc-builder.toml`
  at its root with version/source metadata — read version info from there rather
  than hardcoding.

---

## Phase 1 — Overlay merge script (the priority)

**Goal:** one enriched schema JSON combining structure (editor schema) with
semantics (io overlays). Everything later reads from this file.

### Deliverables

1. `scripts/merge_overlays.py` — standalone Python 3 script, stdlib only
   (no pandas needed):

   ```
   python3 scripts/merge_overlays.py \
       --schema resources/schema/swatplus-editor-schema-full.json \
       --overlays /path/to/swatplus-doc-builder/overlays \
       --out resources/schema/swatplus-schema-enriched.json \
       --report resources/schema/merge-report.md
   ```

2. `resources/schema/swatplus-schema-enriched.json` — the merged output,
   committed to the repo (it is an artifact, but the extension ships it; same
   policy as the existing schema JSON).

3. `resources/schema/merge-report.md` — generated coverage report: files
   matched/unmatched on both sides, columns matched per file and by which
   method, columns that failed to match. This is the review surface for a human.

### Output format

Preserve the existing schema shape (do not break current consumers — the
extension reads `tables.<file>.columns[]`); add fields alongside:

```jsonc
{
  "schema_version": "...",
  "source": { ...existing... },
  "enrichment": {
    "overlays_repo": "tugraskan/swatplus-doc-builder",
    "swatplus_version": "62.0.0",          // read from doc-builder toml
    "generated_on": "<iso timestamp>",
    "files_enriched": 106                   // actual count
  },
  "tables": {
    "aquifer.aqu": {
      ...all existing fields unchanged...,
      "doc": {                              // NEW: file-level enrichment
        "reader_source": "aqu_read.f90",
        "primary_target": "...",
        "summary": ["bottom_line paragraphs..."],
        "layout_notes": "file_variables_intro text",
        "module_usage": { ... }
      },
      "columns": [
        {
          ...all existing fields unchanged...,
          "doc": {                          // NEW: column-level enrichment
            "description": "manual_description, falling back to source_meaning",
            "source_meaning": "...",
            "units": "m",                   // omit if empty/"none"/"-"
            "fortran_type": "integer",
            "fortran_target": "aqudb%...",
            "default": "...",               // omit if "-"
            "source_ref": "aqu_read.f90:55",
            "match": "exact|normalized|position"
          }
        }
      ]
    }
  }
}
```

Rules:

- Never modify or remove existing fields. Enrichment is purely additive under
  `doc` keys. A table/column with no overlay match simply has no `doc` key.
- Overlays with no schema entry (e.g. `cells.gw`): add them as new entries under
  `tables` with a marker `"origin": "overlay-only"` and columns synthesized from
  `file_variables` (no FK data). This makes gwflow files hoverable too.
- Child tables (`calibration_cal.cond` etc.): attempt to inherit the parent
  file's overlay (match the parent by stripping the child suffix); if ambiguous,
  skip and list in the report — do not guess silently.
- The script must be idempotent and deterministic (stable key order) so diffs
  are reviewable.

### Acceptance criteria

- Running the script twice produces byte-identical output.
- ≥100 tables gain file-level `doc`; report lists every non-match with a reason.
- Existing extension compiles and all existing tests pass with the new file
  present (nothing reads it yet — that's Phase 2).
- New unit tests for: name normalization, the three column-match strategies,
  position matching with the `id` offset, and overlay-only table synthesis.
  (Repo tests run via `npm test` for TS; put Python tests in
  `scripts/test_merge_overlays.py` runnable with plain `python3 -m unittest`.)

---

## Phase 2 — Wire enriched schema into existing features

**Goal:** existing UI gets smarter with no new UI.

Entry points in this repo (TypeScript, `src/`):

| Feature | File | Change |
|---|---|---|
| Hover tooltips | `src/fkHoverProvider.ts` | Show `doc.description`, `units`, `default`, and file-level summary; keep existing FK-target info |
| Go to Definition / decorations | `src/fkDefinitionProvider.ts`, `src/fkDecorations.ts` | No behavior change; may read enriched file instead of base schema |
| Format checker | `src/fileFormatUtils.ts`, `src/fileFormatDiagnostics.ts` | Use `doc.fortran_type` / `units` to improve type validation messages |
| Diagnostics | `src/fkDiagnostics.ts` | Include column meaning in unresolved-reference warnings |
| Table viewers | `src/tableViewerPanel.ts`, `src/singleTableViewerPanel.ts` | Column-header tooltips from `doc.description` + `units` |
| Output explorer | `src/outputDataFramePanel.ts` | Phase 2b (optional): merge `overlays/output_families/` similarly and label output columns |

Implementation notes:

- Add one loader module (e.g. `src/enrichedSchema.ts`) that loads
  `swatplus-schema-enriched.json`, falls back to the base schema file if the
  enriched one is absent, and exposes typed accessors
  (`getFileDoc(fileName)`, `getColumnDoc(fileName, columnName)`). All features
  consume the loader — no feature parses the JSON directly.
- Respect the existing schema-directory setting (`swatplus.schemaDirectories`)
  when resolving the file.
- If the enriched schema's `enrichment.swatplus_version` is present, surface it
  once (status bar or index-build output), not per-hover.

**Acceptance:** hovering a documented column in a real dataset shows its meaning
and units; all existing tests pass; new tests cover the loader fallback.

---

## Phase 3 — Headless dataset engine + agent tools (future, design only)

Do not build this yet unless explicitly asked. Direction, so Phases 1–2 make
compatible choices:

- Extract parsing/indexing/FK logic from `src/indexer.ts` into a pure,
  `vscode`-free module ("dataset engine") with a query API:
  - `describeEntity(kind, id)` — e.g. HRU 81: joined view across
    `hru-data.hru`, soils, plants, management, connectivity
  - `findReferences(table, row)` — reverse index (exists today inside indexer)
  - `validate(scope)` — structured issues (today: preflight markdown report)
  - `lookupDocs(file, column?)` — keyed lookup into the enriched schema
- Expose the engine as an MCP server so any LLM client (Claude Code, etc.) can
  answer questions like "tell me about hru81" by calling these tools. Tools
  return **compact rendered text** (a few lines), selected from the JSON — never
  raw JSON dumps and never whole files.
- Storage stays JSON (single source of truth); text is always generated from it
  at serve time.

---

## Non-goals (all phases)

- Do not scrape GitBook or embed/RAG anything — the overlays already contain the
  semantics in structured form.
- Do not modify the `swatplus-doc-builder` repo; treat `overlays/` as read-only
  input.
- Do not restructure the existing schema fields, rename files consumed by
  current code, or refactor unrelated code.
- No new runtime dependencies for Phase 1 (stdlib Python) or Phase 2 (no new npm
  packages).

## Repo conventions

- TypeScript: `npm run compile` must pass (tsc + eslint + esbuild). Tests:
  `npm test` (vscode-test/Mocha, suites in `src/test/`).
- Python scripts live in `scripts/` alongside the existing extraction tooling
  (`extract_all_models.py`, `merge_schema_metadata.py` — read these for house
  style; note `merge_schema_metadata.py` is a *different, older* enrichment path
  from markdown and must not be deleted or reused as the base).
- Keep commits scoped per phase.
