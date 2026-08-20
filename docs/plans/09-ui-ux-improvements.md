# Plan 09 — Sidebar & interaction UX

**Theme:** user value · **Effort:** M (shipped) + S–L (remaining) ·
**Priority:** medium (the high-impact defects are fixed; what is left is polish
plus one item blocked on Plan 08)

## Status

Parts A–D shipped in **PR #137** (branch `claude/ui-ux-improvements-ferhok`,
three commits). This file records what changed and — more usefully — what is
still open and why, so the remaining items can be picked up without replaying
the investigation.

---

## Part A — Sidebar state and event dispatch (DONE)

Two defects made the sidebar feel broken rather than merely rough.

**State loss.** `SwatDatasetWebviewProvider._updateWebview()` rebuilds the view
by reassigning `webview.html`, which reloads the document. Ten call sites do
this. Every reload discarded collapsed sections, all category filters, scroll
offsets, and any half-typed HRU list — so navigating into a subfolder reset the
view. Fixed by round-tripping UI state through `vscode.setState()/getState()`,
which survives those reloads.

**Double dispatch.** `BUTTON_CLICK_FIX.md` records that a delegated click
handler was added on `document` to survive those same reloads. The per-element
listeners were never removed, so both fired. Only the handlers that happened to
call `stopPropagation` were spared. In practice: **Select Folder opened two
folder dialogs, Build Index indexed twice, and clicking a file opened it
twice.** Fixed by deleting the per-element click listeners and keeping the
single delegated handler; per-element bindings remain only for events the
delegated handler does not cover (context menu, `change` on inputs).

The delegated handler is order-sensitive — `.pin-btn` and `.txt-close-btn`
branches must precede `.recent-item` / `.txt-item`, or a click on a button also
activates its row. Keep that ordering when adding branches.

## Part B — Indexing feedback (DONE — completes Plan 01 Part A)

`buildIndexWithPandas` used `spawnSync`, freezing the extension host for the
whole build, which is also why the progress notification's `report()` calls
never painted. Now async `spawn`, with the `CancellationToken` wired to
`SIGTERM` then `SIGKILL`, so Cancel actually cancels.

Build failures previously said "Check the Output panel for details" — the
indexer had no output channel at all. Added a `SWAT+ Indexer` channel and a
`Show Details` action on the failure notification.

See Plan 01 for Parts B and C, which remain open.

## Part C — Staleness, search and discoverability (DONE)

- A `FileSystemWatcher` on the active dataset's TxtInOut folder refreshes the
  listing (debounced) and flags the index stale when an **indexed input** file
  changes, surfaced as an "Index out of date" banner with one-click rebuild.
  Output files and the extension's own `index.json` are excluded — not by
  extension, but by asking whether the file is in the index
  (`shouldMarkStale` in `src/indexStalenessUtils.ts`). Without that, a finished
  run writing hundreds of outputs would leave the banner permanently lit.
- Name filters on the Inputs and Outputs lists, combining with the category
  checkboxes. A dataset carries ~200 input files; 13 category checkboxes were
  the only filter.
- `swatplus.hasDataset` / `swatplus.hasIndex` context keys gate the command
  palette, which was offering ~10 commands whose only effect was to warn that a
  dataset or index was missing. Common actions added to the view title bar.
- Dataset health strip (tables · FKs · unresolved · index age); the unresolved
  count opens the data quality report.
- Getting-started walkthrough (`resources/walkthrough/`).

## Part D — Theming, layout and accessibility (DONE)

- Hard-coded hexes (`#0A84FF`, `#16a34a`, `#7c3aed`, `#b91c1c`) replaced with
  `--vscode-charts-*` tokens, so the colour coding survives light and
  high-contrast themes.
- `.txt-item { min-width: 480px }` forced a horizontal scrollbar in any
  normally-sized sidebar; fixed `max-height` budgets clipped content. Rows now
  ellipsize and panes size in `vh`.
- List rows are focusable (`role="button"`, `tabindex`) and activate on
  Enter/Space; hover-only icon buttons become visible on focus; the context
  menu supports arrow keys, Home/End, Escape and Tab, and restores focus.
- Closing all dataset editors confirms and reports unsaved changes.

## Part E — Guard against a whole class of invisible breakage (DONE)

The webview panels build their inline JavaScript inside TypeScript template
literals. **Neither `tsc` nor `eslint` parses that JavaScript**, so a syntax
error type-checks, lints and bundles cleanly, then ships as a blank panel. A
stray backtick inside a comment silently terminated the template literal twice
during this work.

`scripts/check_webview_scripts.py` extracts each `<script>` block, substitutes
`${...}` interpolations, and runs `node --check`. Wired into `compile`,
`package`, and CI. Covers all six webview files.

---

## Open items

### 1. Windowed table rendering — BLOCKED on Plan 08

`singleTableViewerPanel.ts` materialises every row into the HTML string. A real
watershed's `hru.con` is tens of thousands of rows, producing a multi-MB
document that is slow to open and filter — and `retainContextWhenHidden: true`
on all six panels keeps every one resident.

**This cannot be fixed by windowing the DOM alone.** Client-side sort
(`src/singleTableViewerPanel.ts:3499-3518`) and filter (`:3442`) both iterate
`table.tBodies[0].rows` directly. If only a window of rows is in the DOM,
sorting orders just the loaded rows and filtering matches only those — silently
wrong results, which is worse than the current slowness.

A correct fix requires sort and filter to move to the extension host, over the
full row set, with the webview rendering a window of whatever the host returns.
That is squarely Plan 08 (typed host↔webview protocol + one shared table
component). **Do not attempt windowing before Plan 08 lands** — see the
requirement added to that plan.

### 2. Per-file indexing progress — S

The build reports three coarse increments across 200+ files. Now that the
indexer runs under async `spawn` with a live stdout stream
(`runPythonIndexer` in `src/indexer.ts`), `pandas_indexer.py` could emit
per-file progress lines that the host parses and forwards to
`progress.report()`. The plumbing to consume it already exists; only the
emitting side and a small parser are missing.

### 3. Category grouping — S

`categorizeInputFile()` classifies every input file, but the list renders flat
and the categories only toggle visibility. Rendering collapsible groups
(`⚙️ Simulation Control · 6`) would use the taxonomy that is already computed.
Lower value now that name search exists — do it only if the flat list still
proves hard to scan.

### 4. Emoji section iconography — XS

Section titles use emoji (📥 📤 🏷️ ⚙️ 🌤️) alongside a hand-built SVG icon set.
Emoji render inconsistently across platforms. Prefer codicons. Cosmetic; bundle
with Plan 08 rather than churning the template on its own.

### 5. `viewsWelcome` — NOT APPLICABLE as written

An earlier review suggested replacing the hand-rolled "No dataset selected"
empty state with `contributes.viewsWelcome`. **That contribution point only
applies to tree views.** `swatDatasetView` is `"type": "webview"`, so this
would require converting the view to a tree first. Recorded here so the
suggestion is not re-raised and re-investigated.

### 6. Dead icon definitions — XS

`svgs.debugAlt` and `svgs.cloudUpload` in `src/swatWebviewProvider.ts` are
defined and never referenced. (`svgs.star` was also dead; it is now used by
recent-dataset pinning.)
