# Change Log

All notable changes to the "swatplus-vscode-dataset-selector" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added
- **Database Navigation**: Go to Definition (F12) support for SWAT+ text files
  - Click on foreign key values (e.g., `hydro` in `hru-data.hru`) to navigate to linked records
  - Works with imported project databases via SQLite integration
  - Fallback to file-based name matching when database is unavailable
- **Hover Information**: Hover over foreign key references to see details about linked records
  - Displays key fields from the linked record
  - Shows table and relationship information
- Added better-sqlite3 dependency for database queries
- Example dataset in `examples/sample-dataset/` to demonstrate navigation features

### Changed
- Updated documentation with database navigation usage examples
- Added Python dependency requirement (peewee) to README

## [0.0.1] - Initial Release

- Dataset folder selection for debugging
- Quick debug launch functionality
- Integration with CMake Tools and gdb
- Database import/conversion support