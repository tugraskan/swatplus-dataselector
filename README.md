# SWAT+ Dataset Selector

A VS Code extension for SWAT+ development that allows you to browse and select dataset folders for debugging sessions.

## Features

- **Select Dataset Folder**: Browse and select a SWAT+ dataset folder
- **Quick Debug Launch**: Select a dataset folder and immediately start debugging
- **Seamless Integration**: Works with CMake Tools and gdb debugger configurations
- **Comprehensive Schema**: Auto-generated schema for all 213 SWAT+ input tables from swatplus-editor
- **Enhanced Indexing**: Documentation-driven indexing with FK navigation, hover info, and validation
  - Go-to-Definition for foreign keys (Ctrl+Click to navigate)
  - Hover tooltips showing file purposes and FK targets
  - Warnings for unresolved references
  - Reverse index for finding what references each row

## Documentation

- **[Enhanced Indexing Guide](docs/ENHANCED_INDEXING.md)** - Complete guide to the indexing system
- **[Extension File Schema](docs/EXTENSION_FILE_SCHEMA.md)** - Detailed schema for all SWAT+ files
- **[Dependency Analysis](docs/DEPENDENCY_ANALYSIS.md)** - Comprehensive FK and file relationships
- **[Quick Reference](docs/QUICK_REFERENCE.md)** - Quick lookup for common patterns

## Commands

This extension provides the following commands:

- `SWAT+: Select Dataset Folder` - Browse and select a dataset folder (saves selection for later use)
- `SWAT+: Select Dataset and Debug` - Browse for a dataset folder and immediately launch debug session
- `SWAT+: Debug with Selected Dataset` - Launch debug with previously selected dataset folder
- `SWAT+: Build Inputs Index` - Build an index of all SWAT+ input files in the selected dataset
- `SWAT+: Rebuild Inputs Index` - Rebuild the index for the currently selected dataset

## Usage

### Method 1: Select and Debug in One Step

1. Open Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Run `SWAT+: Select Dataset and Debug`
3. Browse to your SWAT+ dataset folder
4. Debug session will start automatically with the selected folder as working directory

### Method 2: Select First, Debug Later

1. Open Command Palette
2. Run `SWAT+: Select Dataset Folder`
3. Browse to your SWAT+ dataset folder
4. Later, run `SWAT+: Debug with Selected Dataset` to launch debug with the selected folder

### Method 3: Using the Dataset Selector View

1. Open the SWAT+ Dataset view in the activity bar (left sidebar)
2. Click "Select Folder" to choose your dataset folder
3. Use the "Debug" button to launch a debug session
4. Use the "Build Index" button to index all SWAT+ input files in the dataset

## How It Works

The extension dynamically launches a debug session with:
- **Type**: `cppdbg` (C++ debugging with gdb)
- **Working Directory**: Your selected dataset folder
- **Program**: Resolved by CMake Tools (`${command:cmake.launchTargetPath}`)
- **Environment**: Includes CMake launch target directory in PATH

This replaces the need to manually edit `launch.json` and change the `cwd` parameter each time you want to debug with a different dataset.

## SWAT+ Schema Extraction

This extension includes a powerful schema extraction system that automatically discovers all model classes from the swatplus-editor repository.

### Quick Start

```bash
# 1. Clone swatplus-editor
git clone https://github.com/swat-model/swatplus-editor.git /tmp/swatplus-editor

# 2. Run extraction
python3 scripts/extract_all_models.py

# 3. Result: resources/schema/swatplus-editor-schema-full.json
#    - 256 models discovered
#    - 213 unique tables mapped
#    - 566KB comprehensive schema
```

### What Gets Extracted

The script automatically scans all Peewee ORM models in swatplus-editor and extracts:
- **Table definitions**: All 213 input file tables
- **Column metadata**: Names, types, nullability
- **Foreign key relationships**: All FK references
- **Primary keys**: Auto-detected or explicit

### Update When SWAT Editor Changes

No code changes needed! Just re-run the extraction:

```bash
cd /tmp/swatplus-editor && git pull
python3 scripts/extract_all_models.py
```

The schema automatically picks up new tables, columns, and relationships.

### Comparison: Old vs New

| Approach | Tables | Maintainability |
|----------|--------|-----------------|
| **Old** (PR #13) | 13 hardcoded MVP tables | ❌ Manual updates required |
| **New** (This PR) | 213 auto-discovered tables | ✅ Fully automatic |

See [scripts/README.md](scripts/README.md) for complete documentation.

## Requirements

- CMake Tools extension (for `cmake.launchTargetPath` command)
- C/C++ extension (for gdb debugging)
- Properly configured CMake project
- Python 3.6+ (for schema extraction)

## Extension Settings

This extension does not add any VS Code settings.

## Known Issues

- Ensure CMake Tools is properly configured before using this extension
- The debug configuration assumes gdb is available on your system

## Release Notes

### 0.0.1

Initial release of SWAT+ Dataset Selector
- Browse and select dataset folders
- Launch debug sessions with selected datasets
- Integration with CMake Tools and gdb
