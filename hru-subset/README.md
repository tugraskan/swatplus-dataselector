# SWAT+ HRU Subset

Carve a SWAT+ dataset down to the HRUs you pick, in a new folder next to it. It
does this one job and installs separately from
[SWAT+ Dataset Selector](https://github.com/tugraskan/swatplus-dataselector),
which used to have this feature built in and no longer does.

> Version 0.2.0, built locally and not published to the Marketplace.

## Use

Click the **SWAT+ HRU Subset** icon in the activity bar (a grid of nine
squares). The panel is the whole interface. You can also right-click a folder in
the Explorer and choose **Create HRU Subset from This Folder…** (the panel opens
with that folder as the dataset), or run **SWAT+ HRU Subset: Create Subset…** from
the Command Palette (`Ctrl+Shift+P`) to show the panel.

The panel, top to bottom:

1. **Dataset.** The folder with `file.cio`, or its parent when the files are in a
   `TxtInOut` subfolder. Type or paste a path, press **Browse…**, or press **Use
   Dataset Selector's dataset** to take the dataset selected in SWAT+ Dataset
   Selector (the button shows only when that extension is installed). The last
   dataset is remembered per workspace. Under the box: `HRUs 1–4222 (4222 total)`.
   If the folder is itself a subset made by this tool (it holds
   `hru_subset_result.json`, or is named `multi_<timestamp>`, `solo_<id>` or
   `*_subset_<timestamp>`), the panel warns: its HRUs are renumbered from 1, so the
   original ids do not apply.
2. **HRU IDs.** Single ids and ranges, `1,4-6,10`, checked as you type against the
   range above. **Pick HRUs…** opens the picker (below) and **Use selection** there
   writes the ids back into this box.
3. **Options**, with the command line's own defaults:

   | Option | Default | Flag when changed |
   |---|---|---|
   | Keep routing (switch) | off | `--keep-routing` |
   | Add feeder HRUs (W1), only with keep routing | on | `--exact-hrus` when off |
   | Align wetland file (W2) | on | `--keep-wetland-file` when off |
   | SWAT+ main/dev compatibility (W3) | off | `--main-compat` |
   | Turn all outputs off (W4) | off | `--no-outputs` |

   W1–W4 work around SWAT+ bugs; [`python/SWAT_WORKAROUNDS.md`](python/SWAT_WORKAROUNDS.md)
   lists them. The options are remembered per workspace too.
4. **Preview** (keep routing only). A moment after the ids and options are valid the
   panel asks the script what these settings would keep and add, without writing
   anything: the counts (`7 HRUs, 7 routing units, 439 channels (SWAT-DEG), ...`),
   the feeder HRUs that would be added with the reason for each, the workarounds
   that would apply, and any warnings. **Refresh** asks again.
5. **Output folder.** `<dataset>_subset_<yyyymmdd_hhmmss>` next to the dataset;
   edit it or **Browse…** (the subset is created inside the folder you pick). The
   panel always passes `--output-dir` and refuses a folder inside the dataset
   (links are resolved first). A folder that already exists is never overwritten:
   the subset is created as `..._2`, `..._3`.
6. **Create Subset.** Shows progress and a **Cancel** button while the script runs,
   then the result: what was kept, each added feeder HRU with its reason, the
   workarounds applied, **Open Folder** (a new window) and **Reveal in Explorer**.

The result is also written to `hru_subset_result.json` in the output folder. That
file is the marker the dataset warning looks for.

### When it fails

The panel shows the script's own error, for example `HRU ID(s) not found in
hru.con: [4000]` (an id inside the range that has no row in `hru.con`). If the run
left a partly made output folder, **Delete Partial Output** deletes only that
folder, after you confirm; it refuses a folder that existed before the run or that
overlaps the dataset.

## The HRU picker

**Pick HRUs…** opens a table of every HRU in the dataset in an editor tab. It is
read through the script (`--hru-table`), so the parsing stays in Python; the table
is drawn with a virtual list, so 4222 rows scroll, filter and sort at once.

| Column | Where it comes from |
|---|---|
| HRU, Name | `hru.con` ID, NAME |
| Land use | `landuse.lum` name (the HRU's `LU_MGT` in `hru-data.hru`) |
| Group, Plant community, Management | `landuse.lum` CAL_GRP, PLNT_COM, MGT |
| Area (ha) | `hru.con` AREA |
| Subbasin | see below |
| Routing unit | the `rout_unit.def` unit that lists the HRU, through `rout_unit.ele` |
| Wetland | `hru-data.hru` SURF_STOR is not `null` |
| Upstream | some `*.con` file routes water to the HRU |

**Subbasin** is, first match wins: the landscape unit in `ls_unit.def` whose name
starts with `sub` and that lists the HRU in `ls_unit.ele`, shown without the
`sub_` prefix (02070009: `sub_020700090404` → `020700090404`); else the routing
unit name when it looks like `ru<n>_<code>`; else the HRU's weather station
(`hru.con` WST). `-` when none of these exists. The picker's footer says how many
HRUs got their subbasin from which source. Files a dataset does not have leave
their columns empty (a warning in the footer); only `hru.con` is required.

Type in the filter box (every word must match some column; `wetland` and `upstream`
find the flagged rows). Click a header to sort (ascending, descending, off). Click
selects a row, Ctrl+click toggles, Shift+click extends, Ctrl+A selects everything
shown, Esc clears. **Routing unit** and **Subbasin** add every HRU of the group the
last-clicked row belongs to, shown or not. The line above the table counts the
selection. **Use selection** writes it into the HRU IDs box as compact ids
(`1-3,7`).

## Python

The script is run with one interpreter, chosen before it starts:

1. setting `swatHruSubset.pythonPath`
2. environment variable `SWATPLUS_PYTHON`
3. Windows: `py`, `python`, `python3`; elsewhere `python3`, `python`

Each is probed with `--version` and skipped if it is missing, older than 3.8, or
the Microsoft Store `python3` stub (a path under `WindowsApps`, exit code 9009,
or "Python was not found"). The first one that passes runs the script, and
whatever the script prints is reported as it is: **there is no retry with
another interpreter**, so a real error is never replaced by "Python was not
found". Skipped interpreters are listed in the **SWAT+ HRU Subset** output
channel. The panel shows which interpreter it found, or why none worked.

Only the standard library is needed.

## Settings

| Setting | Meaning |
|---|---|
| `swatHruSubset.pythonPath` | Interpreter to use first. |

It is machine-scoped, so a workspace cannot set it. That is why the extension
also works in Restricted Mode: nothing it starts is chosen by the workspace.

## The Python script

[`python/hru_processor.py`](python/README.md) is the one copy of the script, with
its tests and the workaround registry beside it. It is a stdlib CLI that also
runs without VS Code: `--hru-range`, `--hru-table`, `--plan` and the subset itself
all print JSON with `--json`.

## Build

From this folder, with Node 22:

```bash
npm install
npm run compile      # type-check (host and webviews), lint, bundle to dist/
npm test             # unit tests (mocha, no VS Code needed)
npm run test:python  # the script's tests (python3 -m unittest discover -s python)
npx @vscode/vsce package   # builds swat-hru-subset-0.2.0.vsix
```

Install the VSIX by hand (`code --install-extension swat-hru-subset-0.2.0.vsix`)
when you want it; the build does not install it.

### Check against a real dataset

`scripts/real-check.js` drives the same modules the panel uses, without VS Code.
The dataset is only read; output goes under `--out-root`.

```bash
npm run check:real -- --dataset <dataset dir> --out-root <scratch dir> [--exe <swatplus.exe>]
```

It checks the range, the HRU table (the 02070009 spot checks), that `--plan`
equals the run and creates no folder, a keep-routing subset, the marker file, that
the dataset is unchanged, and that a bad HRU id shows the script's own error from a
single script run. With `--exe` it also runs SWAT+ in the output folder.

### Check in a real VS Code window

```bash
npm run smoke:vscode -- --dataset <dataset dir> --out-root <scratch dir> [--code <Code.exe>] [--hold <flag file>]
```

Starts VS Code with this folder as the extension under development (and a
throw-away user-data and extensions folder), then runs `scripts/smoke-runner.js`
inside it: the panel opens and draws, the Explorer command fills in the dataset,
the preview lists the feeder HRUs, the picker tab renders every HRU, and a subset is
created. The webviews acknowledge each thing they draw, so the checks do not rely
on timing alone.

## Layout

| File | Role |
|---|---|
| `src/extension.ts`, `src/panelProvider.ts`, `src/pickerPanel.ts` | VS Code glue; the only files that import `vscode` |
| `src/controller.ts` | what the panel does: state, checks, preview, create; talks to the outside only through `PanelEnv` |
| `src/panelState.ts`, `src/datasetSource.ts` | pure checks: ids and output folder, which buttons are live, Dataset Selector |
| `src/picker/model.ts` | the picker's filter, sort and selection logic |
| `src/browser/panel.ts`, `src/browser/picker.ts` | the two webview scripts (bundled to `dist/`) |
| `src/html.ts`, `src/protocol.ts` | the webview pages and the messages between host and webviews |
| `src/python.ts`, `src/runner.ts`, `src/processRunner.ts` | interpreter choice, running the script once, spawning processes |
| `src/ids.ts`, `src/paths.ts`, `src/dataset.ts`, `src/options.ts`, `src/summary.ts` | pure logic |
| `python/` | `hru_processor.py`, its tests and `SWAT_WORKAROUNDS.md` |

See [TODO.md](TODO.md) for what is not done.
