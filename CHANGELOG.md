# Change Log

All notable changes to the "swatplus-vscode-dataset-selector" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.2] - 2025-12-29

### Added
- Enhanced Database Navigation for SWAT+ text files
  - Go to Definition (F12): Navigate to linked records via foreign key values
  - Peek Definition (Alt+F12): View referenced records inline without leaving current file
  - Enhanced Hover Preview: Rich tooltips showing up to 8 key fields with formatted values
  - CodeLens Hints: Inline indicators above rows showing referenced foreign keys
- Support for common SWAT+ file relationships:
  - HRU → Hydrology, Topography, Field
  - HRU-LTE → Hydrology, Topography
  - Routing Unit → Topography
  - Aquifer → Initial
  - Channel → Hydrology

## [Unreleased]

- Initial release