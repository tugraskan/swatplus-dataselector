# SWAT+ Dataset Selector

A VS Code extension for SWAT+ development that allows you to browse and select dataset folders for debugging sessions, and provides advanced navigation and validation for SWAT+ input files.

## Features

- **Select Dataset Folder**: Browse and select a SWAT+ dataset folder
- **Quick Debug Launch**: Select a dataset folder and immediately start debugging
- **Seamless Integration**: Works with CMake Tools and gdb debugger configurations
- **Input File Indexing**: Build an index of SWAT+ input files for fast navigation
- **Foreign Key Navigation**: Jump to referenced rows in other input files (Go-to-Definition)
- **FK Validation**: Automatically detect and flag unresolved foreign key references
- **Visual FK Indicators**: See FK columns highlighted with underlines

## Commands

This extension provides the following commands:

- `SWAT+: Select Dataset Folder` - Browse and select a dataset folder (saves selection for later use)
- `SWAT+: Select Dataset and Debug` - Browse for a dataset folder and immediately launch debug session
- `SWAT+: Debug with Selected Dataset` - Launch debug with previously selected dataset folder
- `SWAT+: Build Inputs Index` - Build an index of input files in the selected dataset's TxtInOut folder
- `SWAT+: Rebuild Inputs Index` - Rebuild the index after modifying input files

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

### Working with Input File Indexing and FK Navigation

#### Build/Rebuild Index

Before you can use FK navigation features, you must build an index:

1. Select a SWAT+ dataset folder (see above)
2. Open Command Palette
3. Run `SWAT+: Build Inputs Index`
4. Wait for the indexing to complete (progress shown in notification)

**Note:** The index is dataset-scoped. Each dataset has its own independent index. If you modify input files, run `SWAT+: Rebuild Inputs Index` to refresh.

#### Navigate Foreign Keys

Once the index is built:

1. Open any SWAT+ input file in the dataset's `TxtInOut` folder (e.g., `hru-data.hru`)
2. Foreign key columns will be underlined
   - **Blue underline**: Resolved FK (target row exists)
   - **Red wavy underline**: Unresolved FK (target row not found)
3. To navigate to the referenced row:
   - Right-click on a FK value → **Go to Definition** (or press `F12`)
   - Or: **Peek Definition** (`Alt+F12`) to see the target row inline
4. Hover over a FK value to see target information or validation errors

#### Missing FK Diagnostics

- Unresolved foreign keys appear in the **Problems** panel with warnings
- Each warning shows:
  - The FK column and value
  - The expected target table
  - File and line number

#### Gating

Until you build the index:
- FK decorations are **OFF**
- Go-to/Peek navigation is **unavailable**
- Missing-FK diagnostics are **disabled**

If you try to use these features without an index, you'll be prompted to build it first.

## How It Works

### Debugging

The extension dynamically launches a debug session with:
- **Type**: `cppdbg` (C++ debugging with gdb)
- **Working Directory**: Your selected dataset folder
- **Program**: Resolved by CMake Tools (`${command:cmake.launchTargetPath}`)
- **Environment**: Includes CMake launch target directory in PATH

This replaces the need to manually edit `launch.json` and change the `cwd` parameter each time you want to debug with a different dataset.

### FK Indexing

The indexing system:

1. **Loads the schema** from `swat-model/swatplus-editor` Peewee ORM models
2. **Parses TxtInOut files** based on the schema (handles metadata, headers, and data rows)
3. **Builds an in-memory index** mapping primary keys to rows
4. **Identifies FK relationships** from the schema
5. **Resolves FK references** by looking up target rows
6. **Stores index state** in workspace storage (keyed by dataset path)

**Supported Files (MVP):**
- `hru-data.hru`, `hru-lte.hru`
- `topography.hyd`, `hydrology.hyd`, `field.fld`
- `soils.sol`, `soils-lte.sol`
- `landuse.lum`, `management.sch`
- `soil-plant.ini`
- `snow.sno`, `plants.plt`
- `d_table.dtl`

See [Schema Source Documentation](./docs/schema-source.md) for details on how the schema was derived.

## Requirements

- CMake Tools extension (for `cmake.launchTargetPath` command)
- C/C++ extension (for gdb debugging)
- Properly configured CMake project
- SWAT+ dataset with TxtInOut folder containing input files

## Extension Settings

This extension does not add any VS Code settings.

## Known Issues

- Ensure CMake Tools is properly configured before using this extension
- The debug configuration assumes gdb is available on your system
- Index is dataset-scoped; changing datasets requires building a new index
- FK navigation only works for files in the `TxtInOut` folder of the selected dataset

## Release Notes

### 0.1.0

Added SWAT+ input file indexing and FK navigation:
- Build/Rebuild index commands
- Foreign key Go-to-Definition and Peek-Definition
- Visual FK decorations (underlines)
- Missing FK diagnostics in Problems panel
- Dataset-scoped indexing with gating

### 0.0.1

Initial release of SWAT+ Dataset Selector
- Browse and select dataset folders
- Launch debug sessions with selected datasets
- Integration with CMake Tools and gdb
