# Plan 08 — Webview refactor

**Theme:** maintainability · **Effort:** L · **Priority:** lower (do when the UI
churns)

## Problem

The webview panels are large files that build HTML/CSS/JS as inline template
strings inside TypeScript:

- `src/singleTableViewerPanel.ts` — ~4,300 lines
- `src/swatWebviewProvider.ts` — ~3,000 lines
- `src/tableViewerPanel.ts` — ~1,800 lines
- `src/outputDataFramePanel.ts`, `src/schemaEditorPanel.ts`, `src/dependencyGraphPanel.ts`

Consequences: hard to read/modify, easy to introduce escaping/XSS bugs (every
interpolated value must be manually escaped), no type-safety across the
host↔webview boundary, and the three table-style viewers duplicate a lot of layout
and logic.

## Goals

- Move webview UI out of TS string templates into real, buildable frontend files.
- Type the host↔webview message protocol.
- Collapse the overlapping table viewers onto one component.

## Design

1. **`webview-ui/` folder** with its own esbuild entry (add to `esbuild.js`, which
   already emits two bundles). Author webview code as normal TS + a tiny library
   (Preact or lit) instead of string concatenation. Bundle to `dist/webview/*.js`
   and load via `Webview.asWebviewUri`.
2. **Strict CSP** on every panel (nonce-based; `outputDataFramePanel` already sets a
   CSP — make it the standard for all).
3. **Typed messages:** a shared `src/webview/protocol.ts` describing every
   `postMessage` payload both directions; host and webview import it. No more
   stringly-typed `message.command` switches without a contract.
4. **One table component:** factor `tableViewerPanel`, `singleTableViewerPanel`, and
   the output DataFrame grid onto a single schema-driven table view parameterized by
   columns + enriched docs (they already share column-tooltip needs after Phase 2).
5. Migrate panels incrementally — start with the smallest (`dependencyGraphPanel`)
   to establish the pattern, then the table viewers.

## Hard requirement — host-side sort and filter

Discovered while attempting windowed rendering for large tables (Plan 09, open
item 1), and binding on the design above:

The table viewers currently sort and filter **in the webview, by reading the
DOM**. `src/singleTableViewerPanel.ts:3499-3518` does
`Array.from(table.tBodies[0].rows)`, sorts that array, and re-appends;
`:3442` hides rows the same way. Both assume **every row is present in the
DOM**.

That assumption is why large tables are slow: a real watershed's `hru.con` runs
to tens of thousands of rows, each materialised into the HTML string, and
`retainContextWhenHidden: true` keeps every panel resident.

It also means the obvious fix is unsafe. Rendering only a window of rows while
leaving sort and filter in the webview makes sorting order *only the loaded
rows* and filtering match *only those* — silently wrong results, which is worse
than being slow. Users would have no signal that a filter missed matches.

So the shared table component (design item 4) must own sort and filter on the
**host** side, over the full row set, and hand the webview a window of the
result via the typed protocol (design item 3). Windowing is then safe, and the
performance problem goes away with it.

Anyone tempted to do a quick virtualisation pass on the existing viewers should
read this first: it is not separable from the refactor.

## Deliverables

- `webview-ui/` sources + esbuild wiring; `dist/webview/` bundles.
- `src/webview/protocol.ts` typed message contracts.
- One shared table component; the three viewers reduced to thin hosts over it,
  with sort/filter host-side and windowed rendering in the webview.
- CSP applied uniformly.

## Acceptance

- Each migrated panel renders identically to before, with a nonce-based CSP.
- All interpolated data flows through the typed protocol / framework escaping (no
  raw string interpolation of user/dataset values into HTML).
- Net TypeScript LOC in the panel hosts drops substantially; the table viewers share
  one implementation.
- A table with tens of thousands of rows opens without a multi-megabyte document,
  and sorting or filtering it returns results computed over **all** rows, not just
  the rendered window.

## Notes

- This is a refactor, not a feature — do it when the UI is changing often enough that
  the maintenance cost bites. Sequence it after the higher-value plans (01–03).
