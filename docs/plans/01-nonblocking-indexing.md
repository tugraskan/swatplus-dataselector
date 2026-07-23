# Plan 01 — Non-blocking indexing & prerequisite UX

**Theme:** reliability · **Effort:** M (async fix) + L (optional pure-TS parser) ·
**Priority:** highest

## Problem

Indexing is the extension's core operation and it currently has two reliability
risks:

1. **It blocks the UI thread.** `SwatIndexer.buildIndex` (`src/indexer.ts:764`) is
   `async`, but it calls `buildIndexWithPandas` (`src/indexer.ts:626`) which runs
   the Python indexer with **`spawnSync`** (`src/indexer.ts:662`, `maxBuffer: 50 MB`).
   `spawnSync` blocks the Node event loop, so on a large `TxtInOut` the whole
   extension host — and the VS Code window — freezes until Python returns. There is
   no progress or cancellation.
2. **The Python + pandas requirement is the #1 install friction.** Indexing needs
   `python3` + `pandas` on PATH (`requiredPythonModules = ['pandas']`,
   `src/indexer.ts:217`). `getIndexingPrerequisiteStatus` (`src/indexer.ts:543`)
   detects this, but the failure UX for a first-time user is weak.

## Goals

- Indexing never freezes the UI; it shows progress and can be cancelled.
- Missing prerequisites produce clear, actionable guidance, not a failed command.
- (Stretch) Remove the hard Python dependency for indexing.

## Part A — Make indexing async (required)

1. Replace `spawnSync` in `buildIndexWithPandas` with async `child_process.spawn`.
   - Collect stdout/stderr via streams; write the JSON payload to the temp file as
     today (`--output`) and read it back, so buffer limits stop mattering.
   - Return a `Promise`. Thread it through `buildIndex` / `rebuildIndex`.
2. Wrap the call in `vscode.window.withProgress({ location: Notification, cancellable: true })`.
   - On cancel, kill the child process (`child.kill()`), clean up the temp file, and
     leave any prior index intact.
3. Keep the multi-candidate Python-executable loop (`getPythonCandidates`) but make
   it async; try candidates in sequence until one starts.

**Acceptance:** indexing a large dataset keeps the UI responsive, shows a progress
notification, and Cancel actually stops it. Existing index-consuming features
(hovers, viewers, diagnostics) behave identically once the index is built.

## Part B — Prerequisite UX (required)

1. Before indexing, call `getIndexingPrerequisiteStatus`. If Python or pandas is
   missing, show a modal with concrete next steps:
   - which executable was tried, what was missing (`python3` vs `pandas`);
   - buttons: "Open install docs", "Choose Python interpreter" (reuse the Python
     extension's selector if present), "Retry".
2. Add a `swatplus.pythonPath` setting so users can point at a specific interpreter
   (feed it as the first candidate).

**Acceptance:** on a machine without pandas, running Build Index yields an
actionable dialog, not a silent failure or a raw traceback.

## Part C — Pure-TS parser (stretch, high strategic value)

SWAT+ input files are small whitespace/fixed-width tables. A TypeScript parser
would remove the Python dependency for indexing entirely and eliminate the
"two parsers can drift" problem (`src/indexer.ts` already parses some files; the
authoritative parse is in `scripts/pandas_indexer.py`).

1. Port the table + hierarchical-file parsing from `pandas_indexer.py` to a
   vscode-free TS module (`src/datasetParser.ts`), producing the same in-memory
   shape the index cache uses (`{ tables, fkReferences, fileTableMap }`, see
   `src/indexFileModel.ts` for the contract).
2. Keep FK resolution in TS (the extension already has `resolveFKTarget`,
   reverse index, and now `scanIncomingReferences`).
3. Retain Python only for the genuinely heavy dataframe/notebook work
   (`output_to_dataframes.py`, notebook generation).
4. Reuse the existing fixture-based tests; add a golden test that the TS parser and
   `pandas_indexer.py` produce identical indexes for the Ames_sub1 dataset.

**Acceptance:** indexing works with no Python installed; TS and Python indexes match
byte-for-byte on a reference dataset.

## Sequencing

Ship Part A + B first (removes the freeze and the worst UX cliff). Part C is a
larger, separate effort — do it when you want to cut the Python dependency for
good.
