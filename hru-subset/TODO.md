# TODO

What this extension (0.2.0) does not do yet, and what has to happen around it.

## Done in 0.2.0

- **Separated from Dataset Selector.** The HRU subset panel, commands, settings and
  walkthrough text are gone from Dataset Selector; this extension is the only place.
  `hru_processor.py`, its tests and `SWAT_WORKAROUNDS.md` moved to `python/` here and
  are the one copy (no build-time copy). The old Dataset Selector bugs (the Python
  retry that hid the script's error, no `--output-dir`) went with the feature.
- **Option 2, the HRU picker.** `Pick HRUs…` opens a table of every HRU built from
  `--hru-table` (land use, plant community, management, area, subbasin, routing unit,
  wetland, upstream water); filter, sort, multi-select, select by routing unit or
  subbasin, `Use selection` writes compact ids into the panel.
- The panel in the sidebar with the same interface Dataset Selector had, a preview
  of the feeder HRUs (`--plan`), and the last choices remembered per workspace.
- **Run SWAT+** removed.

## Still open

- Consider adding this extension to the SWAT+ Tools pack (`extension-pack/`).
- The picker's subbasin rule (`python/README.md`) is written for datasets like
  02070009, where `ls_unit.def` has `sub_<code>` units. Other layouts fall back to the
  routing unit name or the weather station; check it on a dataset made another way
  (QSWAT+ with landscape units, a gridded-weather model) before relying on the column.
- The picker does not follow typing in the HRU IDs box while the text is not yet valid
  (it keeps the last valid selection), and has no "invert selection" or "select HRUs of
  one land use" button; the filter plus **Select all shown** covers the second.
- Not checked in a themed VS Code window by eye: the pages were drawn in a browser with
  the dark theme's variables and run in a real VS Code 1.113 window by
  `npm run smoke:vscode`, which checks that the webviews run and draw, not how they look
  in every theme.
- The Python probe skips an interpreter on a `WindowsApps` path, which also skips a real
  Python installed from the Microsoft Store when it is configured by full path (the bare
  names `python` / `py` are probed, so those still work).

## Publishing

This extension is not published and has no release workflow (CI builds the VSIX and
keeps it as an artifact). When it should be:

- The repository secret `VSCE_PAT` has expired. The publisher account is
  tugraskanusda@gmail.com.
- Global Personal Access Tokens end on 2026-12-01, so do not mint another one.
  Publish with Entra ID (`vsce publish --azure-credential`) or upload the VSIX
  by hand on the Marketplace publisher page.
- Add an `icon` and decide on the version policy before the first publish.
