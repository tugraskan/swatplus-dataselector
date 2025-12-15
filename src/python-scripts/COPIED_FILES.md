# Files Copied from swatplus-editor

This document tracks the files copied from the `swatplus-editor` repository to enable the standalone SWAT+ text file import functionality.

## Update - December 2025: Git Submodule Approach

To address the growing need for more file types and readers from the upstream repository, we've adopted a better approach than manually copying individual Python files:

### Git Submodule Integration

The upstream `swatplus-editor` repository is now included as a **git submodule** at:
```
src/python-scripts/vendor/swatplus-editor/
```

This provides several benefits:
1. **Easy updates**: Pull latest upstream changes with `git submodule update --remote`
2. **Version tracking**: Know exactly which upstream commit we're using
3. **Reference codebase**: Have full upstream code available for comparison
4. **Reduced duplication**: Clear separation between upstream and local code

### Current File Organization

**Vendor Submodule** (`src/python-scripts/vendor/swatplus-editor/src/api/`):
- Contains the full upstream swatplus-editor API code
- Read-only reference to upstream repository
- Updated via git submodule commands

**Copied Files** (`src/python-scripts/`):
- `fileio/` - File I/O handlers (copied from vendor with local modifications)
- `database/` - Database models and utilities (copied from vendor with local modifications)
- `helpers/` - Helper utilities (copied from vendor with local modifications)
- `actions/` - **Local custom code** (not in upstream)
  - `import_text_files.py` - Custom import action for this extension

### Local Modifications

Some files have been modified locally to fix bugs or add features needed for this extension:

| File | Modification |
|------|--------------|
| `fileio/routing_unit.py` | Added backwards-compatible alias `Rout_unit_rtu` |
| `fileio/hru_parm_db.py` | Added tolerance for malformed septic.sep lines |
| `fileio/base.py` | Modified `read_default_table()` for better field handling |
| `database/lib.py` | Added `on_conflict('REPLACE')` for handling UNIQUE constraints |
| `helpers/utils.py` | Bug fix in `get_num_format()` function |

### Syncing Updates from Upstream

Use the provided sync tool to update files from the vendor submodule:

```bash
# Preview what would be updated (dry run)
python src/python-scripts/tools/sync_from_upstream.py --dry-run

# Sync updates (preserves local modifications)
python src/python-scripts/tools/sync_from_upstream.py

# Force overwrite everything (use with caution!)
python src/python-scripts/tools/sync_from_upstream.py --force
```

The sync tool:
- ✅ Copies new/updated files from vendor submodule
- ✅ Preserves files with documented local modifications (by default)
- ✅ Shows clear summary of what was updated
- ✅ Supports dry-run mode to preview changes

### Initializing the Submodule

When cloning this repository, initialize the submodule:

```bash
git submodule update --init --recursive
```

### Updating to Latest Upstream

To pull the latest changes from the upstream swatplus-editor repository:

```bash
# Update submodule to latest
cd src/python-scripts/vendor/swatplus-editor
git pull origin main
cd ../../../..

# Sync files to local copy
python src/python-scripts/tools/sync_from_upstream.py
```

---

## Original Information (December 9, 2024)

### Source Repository
- Repository: `swatplus-editor` by swat-model  
- Now: `tugraskan/swatplus-editor` (forked)
- Source Path: `/src/api/`
- Date Initially Copied: December 9, 2024
- Integration Method: Git submodule (added December 15, 2025)

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
