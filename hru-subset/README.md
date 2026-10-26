# SWAT+ HRU Subset

Carve a SWAT+ dataset down to the HRUs you pick, in a new folder next to it, and
run SWAT+ on the result. It does this one job and installs separately from
[SWAT+ Dataset Selector](https://github.com/tugraskan/swatplus-dataselector).

> Version 0.1.1, built locally and not published to the Marketplace.

## Use

Three ways to start it:

- Click the **SWAT+ HRU Subset** icon in the activity bar (a grid of nine
  squares) and press **Create Subset…**.
- Right-click a folder in the Explorer and choose **Create HRU Subset from This
  Folder…**; that folder is the dataset.
- Run **SWAT+ HRU Subset: Create Subset…** from the Command Palette
  (`Ctrl+Shift+P`).

1. **Dataset folder.** Pick the folder with `file.cio`, or its parent when the
   files are in a `TxtInOut` subfolder (skipped when you started from the
   Explorer). If the folder is itself a subset made by this tool you are warned
   (see below).
2. **HRU range.** The script reports `N HRUs (min–max)`, shown in the next box.
3. **HRU IDs.** Single ids and ranges: `1,4-6,10`. They are checked for format
   and against the range.
4. **Options**, with the command line's own defaults:

   | Option | Default | Flag when changed |
   |---|---|---|
   | Keep downstream routing (connected) | off | `--keep-routing` |
   | Add feeder HRUs (W1, needs keep routing) | on | `--exact-hrus` when unticked |
   | Align wetland file (W2) | on | `--keep-wetland-file` when unticked |
   | SWAT+ main/dev compatibility (W3) | off | `--main-compat` |
   | Turn all outputs off (W4) | off | `--no-outputs` |

   W1–W4 work around SWAT+ bugs; `scripts/SWAT_WORKAROUNDS.md` in the repo lists
   them.
5. **Output folder.** `<dataset>_subset_<yyyymmdd_hhmmss>` next to the dataset,
   or a new folder inside one you choose. The extension always passes
   `--output-dir` and refuses any output inside the dataset folder (links are
   resolved first).
6. **Run.** A progress notification (cancellable) while the script works, then a
   summary: what was kept, each added feeder HRU with its reason, and the
   workarounds applied. **Open Folder** opens the subset in a new window.
   **Run SWAT+** runs your SWAT+ executable in a terminal with the subset as the
   working directory; the first time it asks for the executable and saves it in
   `swatHruSubset.swatExecutable`.

The result is also written to `hru_subset_result.json` in the output folder.
That file is the marker: when you later pick a folder that holds it, the
extension warns that it is a subset (its HRUs are renumbered from 1, so the
original ids do not apply). Folders named like `multi_<timestamp>`, `solo_<id>`
or `*_subset_<timestamp>` are flagged too, for subsets made before the marker.

### When it fails

You get the script's own error, for example `HRU ID(s) not found in hru.con:
[99999]`. If the run left a partly made output folder, the dialog offers **Delete
Partial Output**. That deletes only the folder this run created, and refuses a
folder that existed before the run or that overlaps the dataset.

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
channel.

Only the standard library is needed.

## Settings

| Setting | Meaning |
|---|---|
| `swatHruSubset.pythonPath` | Interpreter to use first. |
| `swatHruSubset.swatExecutable` | SWAT+ executable for **Run SWAT+**. |

Both are machine-scoped, so a workspace cannot set them. That is why the
extension also works in Restricted Mode: nothing it starts is chosen by the
workspace.

## The Python script

`python/hru_processor.py` is **not** maintained here. The source of truth is
[`scripts/hru_processor.py`](../scripts/hru_processor.py) at the repo root, the
same file Dataset Selector uses. `npm run copy-python` (run by `compile`,
`package` and so by `vsce package`) copies it into `python/`, which is
gitignored. Change the script at the root, not the copy.

## Build

From this folder, with Node 22:

```bash
npm install
npm run compile      # copy the script, type-check, lint, bundle to dist/
npm test             # unit tests (mocha, no VS Code needed)
npx @vscode/vsce package   # builds swat-hru-subset-0.1.1.vsix
```

Install the VSIX by hand (`code --install-extension swat-hru-subset-0.1.1.vsix`)
when you want it; the build does not install it.

### Check against a real dataset

`scripts/real-check.js` drives the same modules the command uses, without VS
Code. The dataset is only read; output goes under `--out-root`.

```bash
npm run check:real -- --dataset <dataset dir> --out-root <scratch dir> [--exe <swatplus.exe>]
```

It checks the range, a keep-routing subset, the marker file, that the dataset is
unchanged, and that a bad HRU id shows the script's own error from a single
script run. With `--exe` it also runs SWAT+ in the output folder.

## Layout

| File | Role |
|---|---|
| `src/command.ts`, `src/extension.ts` | VS Code UI; the only files that import `vscode` |
| `src/python.ts` | interpreter candidates, probe, Store-stub skipping |
| `src/runner.ts` | runs the script once, builds the marker, deletes a partial output |
| `src/processRunner.ts` | the one place that spawns processes |
| `src/ids.ts`, `src/paths.ts`, `src/dataset.ts`, `src/options.ts`, `src/summary.ts`, `src/terminal.ts` | pure logic with unit tests |

See [TODO.md](TODO.md) for what is not done.
