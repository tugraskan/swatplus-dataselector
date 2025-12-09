# Files Copied from swatplus-editor

This document tracks the files copied from the `swatplus-editor` repository (https://github.com/swat-model/swatplus-editor) to enable the standalone SWAT+ text file import functionality.

## Source Repository
- Repository: `swatplus-editor` by swat-model
- Source Path: `/src/api/`
- Date Copied: December 9, 2024

## Files Copied

### 1. actions/ folder
- `__init__.py` (created - empty file for Python module)
- `import_text_files.py` (already existed in repository)

### 2. database/ folder
Complete database module with subdirectories:
- `database/__init__.py`
- `database/lib.py`
- `database/soils.py`
- `database/vardefs.py`
- `database/wgn.py`
- `database/project/` - All database models (31 files)
- `database/datasets/` - Dataset database models
- `database/output/` - Output database models

### 3. fileio/ folder
All fileio modules (28 Python files):
- `aquifer.py`, `basin.py`, `change.py`, `channel.py`, `climate.py`
- `config.py`, `connect.py`, `decision_table.py`, `dr.py`, `exco.py`
- `gwflow.py`, `hru.py`, `hru_parm_db.py`, `hydrology.py`, `init.py`
- `lum.py`, `ops.py`, `recall.py`, `regions.py`, `reservoir.py`
- `routing_unit.py`, `salts.py`, `simulation.py`, `soils.py`, `structural.py`
- `water_rights.py`, `base.py`, `__init__.py`

### 4. helpers/ folder
Helper modules (3 files):
- `executable_api.py` - Base class for executable APIs
- `table_mapper.py` - Database table mapping utilities
- `utils.py` - General utility functions

### 5. swatplus_api_standalone.py
- Already existed in repository
- Fixed shebang line (was missing `#`)
- Fixed description comment typo

## Purpose

These files enable the VS Code extension to:
1. Import SWAT+ text files from a TxtInOut directory into a SQLite database
2. Work independently without requiring the full swatplus-editor repository
3. Provide real-time progress updates during import operations

## Dependencies

Users need Python with these packages installed:
- `peewee` - Database ORM (required)
- `flask` - Only if using other SWAT+ features (optional for import only)

## Structure Verification

The python-scripts directory now contains:
```
python-scripts/
├── swatplus_api_standalone.py  ← Main standalone script
├── import_text_files_README.md  ← Documentation
├── actions/
│   ├── __init__.py
│   └── import_text_files.py
├── database/
│   ├── __init__.py
│   ├── datasets/
│   ├── output/
│   └── project/  ← Database models
├── fileio/  ← All fileio modules
└── helpers/  ← Helper utilities
```

This matches the structure specified in the `import_text_files_README.md` file (lines 88-104).
