# Change Log

All notable changes to the "swatplus-vscode-dataset-selector" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.4] - 2025-12-29

### Changed
- **Schema-based Foreign Key Discovery (PRIMARY)**: Now uses official SWAT+ Editor database schema
  - Integrated schema from https://github.com/swat-model/swatplus-editor
  - 50+ officially defined relationships from SWAT+ Editor
  - More accurate and reliable than header-based discovery
  - Includes friendly field names from official documentation
- **Automatic Discovery (FALLBACK)**: Maintains automatic discovery for custom relationships
  - Works when schema doesn't define a relationship
  - Discovers custom files and non-standard relationships
  - Two-tier approach: schema first, auto-discovery second

### Added
- New file: `swatPlusSchema.ts` with SWAT+ Editor schema definitions
- Enhanced logging showing source of each relationship (schema vs discovered)

### Technical Details
- Primary: Reads SWAT+ Editor schema for official relationships
- Fallback: Auto-discovers by matching column headers to file names
- Better file matching with multiple naming patterns
- Improved compatibility with various SWAT+ dataset structures

## [0.0.3] - 2025-12-29

### Changed
- **Automatic Foreign Key Discovery**: Foreign key relationships are now discovered automatically by reading file headers
  - No longer requires hardcoded relationships
  - Adapts to any SWAT+ dataset structure
  - Works with custom files and relationships
  - Auto-refreshes when files change
- New command: `SWAT+: Refresh Foreign Key Relationships` for manual refresh

### Technical Details
- Extension reads column headers from all SWAT+ files
- Matches column names to file names in the dataset
- Creates foreign key relationships dynamically
- Caches relationships for performance
- File watcher automatically refreshes on changes

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