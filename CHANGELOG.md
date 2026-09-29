# Change Log

All notable changes to the "swatplus-vscode-dataset-selector" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added
- The schema is built from the SWAT+ Fortran source by Tamandua
  (`swatplus-layouts`), so it follows the code and branch in the workspace:
  which columns SWAT+ reads from each input file, in order, with types, units
  and descriptions from the declarations, named from the dataset's own header
  lines, with file links from the editor schema. Rebuilt before every index
  build and when the Fortran changes; falls back to Tamandua's snapshot, then to
  the copy shipped with the extension (SWAT+ 62.0.0). A picked or edited schema
  still wins; "Automatic" in the Schema dropdown returns to the built one. See
  docs/SCHEMA_FROM_SOURCE.md
- The shipped fallback (`swatplus-layouts.json`, `swatplus-generated-schema.json`)
  is built with Tamandua's layout format 2, where a count line before a
  record loop is read as the file's preamble rather than as its record
  (`cal_parms.cal`, `calibration.cal`, `ls_unit.def` had taken their title
  line for a header)
- `SWAT+: Rebuild Schema from SWAT+ Source` command, and the
  `swatplus.schemaFromSource` / `swatplus.sourceDirectory` settings
- Table viewer: column headers say which SWAT+ variable each column is read
  into and where; "Show SWAT+ names" adds a row with the Fortran names and marks
  columns SWAT+ never reads. The schema browser gains a "SWAT+ name" column
- Format checks from what SWAT+ reads: a short row is flagged with its missing
  columns and the read statement; unread columns are optional; both forms of a
  file read two ways are accepted; a data row where SWAT+ expects its header is
  flagged as a record SWAT+ will skip
- `SWAT+: Set Up This Workspace` also installs Tamandua's parser in a SWAT+
  source workspace, and upgrades a Tamandua without `swatplus-layouts`

### Changed
- Input-file column docs (hovers, tooltips, the MCP server's `lookup_docs`)
  come from Tamandua's facts only, each citing its declaration; the
  swatplus-doc-builder enrichment is no longer used for them
- The Schema dropdown no longer offers documentation-only files; picking the
  enriched schema there made index builds fail with `KeyError: 'table_name'`

### Fixed
- `management.sch` operation links read `op_data3` (a number) instead of
  `op_data1`: `read_mgtops.f90` reads op, mon, day, husc, op_char, op_plant, op3.
  On Ames, resolved links rose from 14 to 725; go-to-definition on the column
  had the same off-by-two
- `management.sch` operation links go where `read_mgtops.f90` looks each name
  up: `plnt` to `plants.plt` (not `plant.ini`), `harv`/`hvkl` from `op_data2`
  to `harv.ops`, `op_data2` of `plnt`/`fert`/`manu`/`pest` to the transplant
  and `chem_app.ops` databases, and new `pcom`, `irrp`, `manu`, `burn` and
  `swep` links. `kill` and harvest plant names are no longer links (SWAT+
  matches them at run time). On Ames, resolved links rose from 725 to 1,789;
  the rest are names SWAT+ cannot find either (fertilizer names in `op_data2`,
  and a `residue` harvest `harv.ops` does not have)
- Switching schemas dropped the metadata's table-to-file names until reload
- A schema table without `table_name` no longer fails the whole index build
- `SWAT+: Set Up This Workspace` command (and a "Set Up" sidebar button):
  installs Tamandua via pip, wires up its MCP server and this extension's own
  bundled one into both `.vscode/mcp.json` and `.mcp.json`, and hands off to
  the Fortran ifx/GNU Debug extension for a debug launch config and its MCP
  entry when that extension is installed
- Registered the dataset MCP server (`dist/mcp-server.js`) with VS Code's own
  MCP registry, so its tools (`describe_entity`, `find_references`, etc.) are
  offered automatically in this workspace's chat, no `.vscode/mcp.json`
  required. The server is spawned with the editor's own bundled Node.js
  (`process.execPath`), not a `node` on `PATH` or a version-specific
  installed-Node path, and re-spawns pointed at the newly selected dataset
  whenever it changes. VS Code's own one-time per-workspace trust prompt
  still applies (see docs/MCP_SERVER.md); external clients such as Claude
  Code or Claude Desktop, which don't read VS Code's registry, still need
  their own MCP configuration.
- Name filter on the Inputs and Outputs lists, with a clear button and Escape to clear,
  combining with the category checkboxes
- "Index out of date" banner with one-click rebuild when indexed input files change on
  disk, backed by a file watcher on the dataset
- Dataset health strip showing table count, FK count, unresolved references, and index
  age; the unresolved count opens the data quality report
- Pinning for recent datasets, and all stored entries are now listed (previously ten
  were kept but only five shown)
- Getting-started walkthrough covering dataset selection, indexing, navigation, and
  outputs
- "SWAT+ Indexer" output channel, with a "Show Details" action on build failures
- `swatplus.openTablesAfterIndex` setting (prompt/always/never) controlling whether the
  table viewers open after an index build
- `swatplus.debugLogging` setting gating console tracing, off by default
- `npm run check-webview`, which syntax-checks the JavaScript embedded in webview HTML
  template literals — neither tsc nor eslint parses it, so errors there previously
  shipped as silently broken panels
- `check_dataset` MCP tool: validates `file.cio` row arity against the Fortran source that reads it, catching a row short of values before the run. A short row is not a read error -- list-directed input spans records to fill its item list, so it silently consumes the next line and every row after is read shifted by one, surfacing much later as a subscript error in an unrelated routine. Expectations come from `src/input_file_module.f90` rather than a reference dataset, so an older branch expects an older `file.cio` and a matching dataset passes
- `select_dataset` MCP tool: point every dataset tool at a different dataset directory at runtime, instead of the dataset being fixed by the command line at server start
- `run_dataset` MCP tool: run the SWAT+ executable with the active dataset as its working directory and report how it ended, leading with the `forrtl` error and traceback. A build compiled `/traceback` and linked `/INCREMENTAL:NO` names the failing routine and source line, so the crash text alone identifies it. It runs only the server's `--exe`: the caller cannot supply an executable or arguments, so a tool call cannot start an arbitrary program
- "Select All" checkbox to quickly toggle all input category filters at once (with indeterminate state support)
- Separate navigation state for Inputs and Outputs sections - navigating in one doesn't affect the other
- Back button in Outputs section for subdirectory navigation
- Section path info displaying current directory for both Inputs and Outputs sections
- File pointer column support in pandas indexer to properly handle climate data files (pcp, tmp, slr, hmd, wnd in weather-sta.cli)
- Support for fixed child line count in hierarchical files (weather-wgn.cli with 13 fixed child lines)

### Changed
- Index building runs asynchronously instead of blocking the extension host, and the
  progress notification's Cancel button now actually stops the build
- The command palette hides SWAT+ commands that cannot run yet, via the
  `swatplus.hasDataset` / `swatplus.hasIndex` context keys; common actions moved to the
  view title bar
- Sidebar colours use theme tokens rather than fixed hexes, so they hold up in light and
  high-contrast themes
- Sidebar panes size relative to the viewport instead of fixed pixel heights, and rows no
  longer force a horizontal scrollbar
- Closing all dataset editors asks for confirmation and reports unsaved changes
- All input category checkboxes are now checked by default for better usability
- Subdirectories now appear at the top of both Inputs and Outputs sections
- Subdirectories in Inputs are now filtered based on their content (only shown if they contain files matching selected categories)
- Input file counter badge now updates dynamically based on currently filtered results
- Files not matching any specific input category are now categorized as outputs by default
- Filter behavior: when all categories are unchecked, no files are shown (instead of showing all)
- Updated weather-wgn.cli schema to correctly reflect file structure (has_header_line: false)

### Fixed
- Sidebar no longer discards collapsed sections, category filters, scroll position, and
  in-progress HRU input every time it refreshes
- Sidebar clicks are no longer dispatched twice: per-element and delegated handlers both
  fired, so "Select Folder" opened two dialogs, "Build Index" indexed twice, and clicking
  a file opened it twice
- Index build failures no longer point at an output channel that did not exist
- List rows are keyboard focusable and activatable, hover-only icon buttons become visible
  on focus, and the context menu supports arrow-key navigation and Escape
- Index building no longer assumes `python3` exists: on Windows it usually resolves to the Microsoft Store alias, which exits non-zero without running anything, so the failure looked like a broken indexer rather than a missing interpreter. `python3`, `python` and `py -3` are now tried in order
- Improved filtering logic to use `includes()` instead of `indexOf()` for better performance
- Navigation in outputs section no longer affects navigation in inputs section
- Climate file columns (pcp, tmp, slr, hmd, wnd, wnd_dir, atmo_dep) in weather-sta.cli are no longer treated as FK references

## [0.1.0] - Initial release

- Initial release