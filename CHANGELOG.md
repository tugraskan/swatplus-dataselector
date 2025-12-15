# Change Log

All notable changes to the "swatplus-vscode-dataset-selector" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added
- **Enhanced Database Navigation**: Comprehensive relational navigation for SWAT+ text files
  - **Go to Definition (F12)**: Click on foreign key values to navigate to linked records
  - **Peek Definition (Alt+F12)**: View referenced records inline without leaving current file
  - **Enhanced Hover Preview**: Rich tooltips showing up to 8 key fields with formatted values
    - Organized display with friendly names (Hydrology, Topography, etc.)
    - Formatted numbers for easier reading
    - Helpful action hints (F12, Alt+F12, right-click)
  - **CodeLens Hints**: Inline indicators above rows showing referenced foreign keys
    - Example: `🔗 Referenced: Hydrology: hydro_001 | Topography: topo_002`
  - Works with imported project databases via SQLite integration
  - Fallback to file-based name matching when database is unavailable
- **Smart Database File Handling**: 
  - Detects `.db`, `.sqlite`, and `.sqlite3` files
  - Attempts to open with SQLite viewer extensions
  - Offers to install extension or copy path if no viewer available
- Added better-sqlite3 dependency for database queries
- Example dataset in `examples/sample-dataset/` to demonstrate navigation features

### Changed
- Updated documentation with comprehensive navigation usage examples
- Increased hover preview from 5 to 8 fields for better record visibility
- Added Python dependency requirement (peewee) to README
- Enhanced user experience to mimic SWAT+ Editor's relational browsing

## [0.0.1] - Initial Release

- Dataset folder selection for debugging
- Quick debug launch functionality
- Integration with CMake Tools and gdb
- Database import/conversion support