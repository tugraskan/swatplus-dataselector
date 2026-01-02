# Change Log

All notable changes to the "swatplus-vscode-dataset-selector" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Changed
- All input category checkboxes are now checked by default for better usability
- Subdirectories now appear at the top of both Inputs and Outputs sections
- Subdirectories in Inputs are now filtered based on their content (only shown if they contain files matching selected categories)
- Input file counter badge now updates dynamically based on currently filtered results
- Files not matching any specific input category are now categorized as outputs by default

### Fixed
- Improved filtering logic to use `includes()` instead of `indexOf()` for better performance

## [0.1.0] - Initial release

- Initial release