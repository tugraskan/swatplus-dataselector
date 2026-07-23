# Plan 05 — Activation scoping

**Theme:** polish / performance · **Effort:** XS · **Priority:** medium

> **Status: implemented.** `activationEvents` is now
> `["workspaceContains:**/file.cio", "onView:swatDatasetView"]` — the extension no
> longer activates in non-SWAT windows. The explicit `onCommand:*` entries were
> dropped (VS Code infers command activation from `contributes.commands`), and
> `--allow-star-activation` was removed from the packaging scripts (confirmed
> `vsce package` no longer needs it). `activate()` has no startup-time auto-load,
> so nothing depended on `onStartupFinished`.

## Problem

`package.json` `activationEvents` starts with `onStartupFinished`, so the extension
activates in **every** VS Code window — including projects that have nothing to do
with SWAT+. That runs the indexer/provider construction, status-bar setup, etc.,
everywhere, and it's why `vsce package` flags the extension as star-activation
(the packaging scripts pass `--allow-star-activation`).

## Goal

Activate only when a workspace actually contains a SWAT+ dataset, while keeping all
commands available on demand.

## Design

1. Replace `onStartupFinished` with a workspace-content trigger:
   ```json
   "activationEvents": [
     "workspaceContains:**/file.cio",
     "onView:swatDatasetView"
   ]
   ```
   `file.cio` is the definitive marker of a SWAT+ TxtInOut dataset.
2. Modern VS Code infers command activation from `contributes.commands`, so the
   explicit `onCommand:*` entries can be dropped (verify each command still
   activates the extension when invoked from the palette).
3. Keep `onView:swatDatasetView` so opening the sidebar activates the extension even
   when the marker file isn't at a scanned path.
4. Once `onStartupFinished` is gone, drop `--allow-star-activation` from the
   `package:vsix` / `publish:pre-release` scripts.

## Risks / checks

- Ensure nothing in `activate()` assumes it runs at startup (e.g. background
  auto-load of a recent dataset). If auto-load-on-startup is desired, gate it behind
  the workspace marker or a setting rather than `onStartupFinished`.
- Confirm the sidebar view still appears in a SWAT+ workspace (the view container is
  always contributed; only activation timing changes).

## Acceptance

- Opening a non-SWAT project does **not** activate the extension (check the
  Extensions view "Activation" / `Developer: Show Running Extensions`).
- Opening a folder containing a `file.cio` activates it and the sidebar works.
- Every contributed command still works from the Command Palette.
- `vsce package` no longer needs `--allow-star-activation`.
