# TODO

What this extension (0.1.0) does not do yet, and what has to happen around it.

## Option 2: an HRU picker

Typing HRU ids into an input box works but needs the ids in your head. Add a
table in a webview that lists every HRU in the dataset and feeds the same run.

- Columns: HRU id, name, land use / plant community, area, routing unit, and a
  wetland flag.
- Built from `hru-data.hru`, `hru.con`, `landuse.lum`, and `rout_unit.ele` /
  `rout_unit.def` (which routing unit each HRU belongs to: the `rout_unit.ele`
  rows with `OBJ_TYP` = `hru`). The wetland flag comes from the HRU's
  `SURF_STOR` entry in `hru-data.hru` (`null` means no wetland).
- Multi-select, filter and sort; selecting rows fills the id list that
  "Create Subset…" currently asks for. Everything after the id step (options,
  output folder, run, summary) stays as it is.
- The parsing belongs in a module with no `vscode` import, next to `ids.ts`, so
  it can be unit tested against a small fixture dataset.

## Separate this out of Dataset Selector

The HRU subset feature still lives in Dataset Selector (`src/hruProcessor.ts`,
`src/hruProcessorOptions.ts`, the `processHruSubset*` commands in
`src/extension.ts`, the sidebar panel in `src/swatWebviewProvider.ts`). This
extension is the thin first step; ownership has not moved.

- Move ownership of `scripts/hru_processor.py`, `scripts/test_hru_processor.py`
  and `scripts/SWAT_WORKAROUNDS.md` to this extension, possibly into its own
  repository. Until then the repo-root script is the source of truth and
  `npm run copy-python` copies it in (see the README).
- Remove Dataset Selector's HRU subset command and sidebar panel, or make them
  hand over to this extension.
- Update SPEC.md, README.md and CHANGELOG.md in Dataset Selector to match.
- Consider adding this extension to the SWAT+ Tools pack (`extension-pack/`).
- Add a CI job for `hru-subset/` (`npm ci`, `npm run compile`, `npm test`) when
  it gets its own place in the workflows; there is none yet.

## Dataset Selector's existing bugs

Both are in Dataset Selector and unchanged by this extension. They stay until
the feature is removed from there or fixed in place.

- **Python retry** (`src/hruProcessor.ts:127-147`): the whole script is retried
  with the next Python name (`py`, `python`, `python3`) whenever it exits
  non-zero. Where `python3` is the Windows Store stub
  (`%LOCALAPPDATA%\Microsoft\WindowsApps\python3.exe`), the script's real error
  ("HRU ID(s) not found in hru.con") is replaced by "Python was not found", and
  each retry leaves another half-made subset folder. The fix is the approach in
  `src/python.ts` here: probe each name with `--version`, skip the stub, run
  the script once with the first interpreter that passes.
- **No `--output-dir`**: Dataset Selector never passes it, so subsets are written
  inside the dataset folder (`<dataset>\multi_<timestamp>`), and one has been
  picked as the dataset by mistake. The fix is to pass `--output-dir` with a
  sibling folder, as `src/paths.ts` here does.

## Publishing

This extension is not published and has no release workflow. When it should be:

- The repository secret `VSCE_PAT` has expired. The publisher account is
  tugraskanusda@gmail.com.
- Global Personal Access Tokens end on 2026-12-01, so do not mint another one.
  Publish with Entra ID (`vsce publish --azure-credential`) or upload the VSIX
  by hand on the Marketplace publisher page.
- Add an `icon` and decide on the version policy before the first publish.

## Smaller things

- The options quick pick always opens with the CLI defaults; remember the last
  choice.
- A Python interpreter on a `WindowsApps` path is skipped, which also skips a
  real Python installed from the Microsoft Store when it is configured by full
  path (the bare names `python` / `py` are probed, so those still work).
- `--run-swat` is not used: "Run SWAT+" starts the executable in a terminal so
  the output stays visible.
