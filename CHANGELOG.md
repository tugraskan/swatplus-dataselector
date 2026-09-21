# Change Log

All notable changes to the "swatplus-vscode-dataset-selector" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added
- `check_dataset` MCP tool: validates `file.cio` row arity against the Fortran source that reads it, catching a row short of values before the run. A short row is not a read error -- list-directed input spans records to fill its item list, so it silently consumes the next line and every row after is read shifted by one, surfacing much later as a subscript error in an unrelated routine. Expectations come from `src/input_file_module.f90` rather than a reference dataset, so an older branch expects an older `file.cio` and a matching dataset passes
- `select_dataset` MCP tool: point every dataset tool at a different dataset directory at runtime, instead of the dataset being fixed by the command line at server start
- `run_dataset` MCP tool: run the SWAT+ executable with the active dataset as its working directory and report how it ended, leading with the `forrtl` error and traceback. A build compiled `/traceback` and linked `/INCREMENTAL:NO` names the failing routine and source line, so the crash text alone identifies it
- "Select All" checkbox to quickly toggle all input category filters at once (with indeterminate state support)
- Separate navigation state for Inputs and Outputs sections - navigating in one doesn't affect the other
- Back button in Outputs section for subdirectory navigation
- Section path info displaying current directory for both Inputs and Outputs sections
- File pointer column support in pandas indexer to properly handle climate data files (pcp, tmp, slr, hmd, wnd in weather-sta.cli)
- Support for fixed child line count in hierarchical files (weather-wgn.cli with 13 fixed child lines)

### Changed
- All input category checkboxes are now checked by default for better usability
- Subdirectories now appear at the top of both Inputs and Outputs sections
- Subdirectories in Inputs are now filtered based on their content (only shown if they contain files matching selected categories)
- Input file counter badge now updates dynamically based on currently filtered results
- Files not matching any specific input category are now categorized as outputs by default
- Filter behavior: when all categories are unchecked, no files are shown (instead of showing all)
- Updated weather-wgn.cli schema to correctly reflect file structure (has_header_line: false)

### Fixed
- Index building no longer assumes `python3` exists: on Windows it usually resolves to the Microsoft Store alias, which exits non-zero without running anything, so the failure looked like a broken indexer rather than a missing interpreter. `python3`, `python` and `py -3` are now tried in order
- Improved filtering logic to use `includes()` instead of `indexOf()` for better performance
- Navigation in outputs section no longer affects navigation in inputs section
- Climate file columns (pcp, tmp, slr, hmd, wnd, wnd_dir, atmo_dep) in weather-sta.cli are no longer treated as FK references

## [0.1.0] - Initial release

- Initial release