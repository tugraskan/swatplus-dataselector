# Changelog

## 0.2.0

The HRU subset feature now lives only here. SWAT+ Dataset Selector's own panel and
commands are gone (see its changelog), and this extension has the same panel plus an
HRU picker.

### Added
- A sidebar panel replaces the welcome button and the quick-pick steps. It has the
  layout and checks of Dataset Selector's "HRU Subset" panel: a dataset box with
  **Browse…**, `HRUs 1–4222 (4222 total)`, an HRU IDs box validated against that range
  as you type, a **Keep routing** switch with the W1–W4 checkboxes and a line of help
  under each, an output folder box, **Create Subset** with progress and **Cancel**.
- **Use Dataset Selector's dataset** takes the dataset selected in SWAT+ Dataset
  Selector (command `swat-dataset-selector.getDatasetFolder`); the button shows only
  when that extension is installed.
- **Pick HRUs…** opens the HRU picker: an editor tab with a table of every HRU (id,
  name, land use, plant community, management, area, subbasin, routing unit, wetland,
  upstream water), filter, sort on any column, multi-select with click / Ctrl / Shift,
  "select all in this routing unit / subbasin", a selected-count line and **Use
  selection**, which writes compact ids (`1-3,7`) into the HRU IDs box. It stays
  responsive with 4222 HRUs (02070009). New script mode `--hru-table --json`; the
  subbasin rule is documented in `python/README.md`.
- **Preview** (keep routing only): what the run will keep, the feeder HRUs it will add
  with the reason for each, the workarounds that apply, and warnings, without writing
  anything. New script mode `--plan --json`, which never creates the output folder.
- The result area shows kept counts, added HRUs and workarounds, with **Open Folder**
  and **Reveal in Explorer**. A failed run shows the script's own error and offers to
  delete only the partly made output folder.
- The last dataset, HRU ids and options are remembered per workspace.
- The script's result now carries `warnings` (channels left with only channel inflows
  when feeder HRUs are off, routing units left out).
- CI job for this extension: type-check, lint, build, unit tests, the Python tests and
  a VSIX artifact.

### Changed
- `hru_processor.py`, `test_hru_processor.py` and `SWAT_WORKAROUNDS.md` moved from
  the repository's `scripts/` to `hru-subset/python/` and are the single copy; the
  build-time copy step is gone.
- Command Palette: **SWAT+ HRU Subset: Create Subset…** shows the panel. The Explorer
  item opens the panel with that folder as the dataset.

### Removed
- **Run SWAT+**: the button, the terminal code and the `swatHruSubset.swatExecutable`
  setting. (`--run-swat` of the script is still there for command-line use.)
- The quick-pick flow (ids, options, output folder).

## 0.1.1

- The command had no visible entry point, only the Command Palette. Added an
  activity bar icon with a **Create Subset…** button, and a **Create HRU Subset
  from This Folder…** item in the Explorer folder menu (that folder is the
  dataset).
- Works in Restricted Mode (untrusted workspaces): the Python path and SWAT+
  executable are machine-scoped settings, so the workspace cannot choose what is
  started.

## 0.1.0

First version, built locally; not published.

- **SWAT+ HRU Subset: Create Subset…** picks a dataset, asks for HRU ids
  (`1,4-6,10`) and the subset options, creates the subset next to the dataset
  and offers to open it or run SWAT+ on it.
- Runs the repo-root `hru_processor.py` (copied in at build time) with one
  Python interpreter, probed first; the Microsoft Store `python3` stub is
  skipped and the script is never retried with another interpreter.
- Always passes `--output-dir` and refuses an output folder inside the dataset.
- Writes `hru_subset_result.json` into each subset and warns when a subset is
  picked as the dataset.
- Offers to delete the partly made output folder after a failed run.
