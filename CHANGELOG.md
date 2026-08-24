# Change Log

All notable changes to the "swatplus-vscode-dataset-selector" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [0.2.0] - 2026-08-24

### Added
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
- Improved filtering logic to use `includes()` instead of `indexOf()` for better performance
- Navigation in outputs section no longer affects navigation in inputs section
- Climate file columns (pcp, tmp, slr, hmd, wnd, wnd_dir, atmo_dep) in weather-sta.cli are no longer treated as FK references

## [0.1.0] - Initial release

- Initial release