# Change Log

All notable changes to the "swatplus-vscode-dataset-selector" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added
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
- Improved filtering logic to use `includes()` instead of `indexOf()` for better performance
- Navigation in outputs section no longer affects navigation in inputs section
- Climate file columns (pcp, tmp, slr, hmd, wnd, wnd_dir, atmo_dep) in weather-sta.cli are no longer treated as FK references

## [0.1.0] - Initial release

- Initial release