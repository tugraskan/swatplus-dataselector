# SWAT+ Dataset Selector

A VS Code extension for SWAT+ development that allows you to browse and select dataset folders for debugging sessions with enhanced database navigation features.

## Features

- **Select Dataset Folder**: Browse and select a SWAT+ dataset folder
- **Quick Debug Launch**: Select a dataset folder and immediately start debugging
- **Seamless Integration**: Works with CMake Tools and gdb debugger configurations
- **Enhanced Database Navigation**: Comprehensive relational navigation for SWAT+ text files
  - **Go to Definition (F12)**: Click on foreign key values to navigate to linked records
  - **Peek Definition (Alt+F12)**: View referenced records inline without leaving current file
  - **Enhanced Hover Preview**: Rich tooltips showing up to 8 key fields with formatted values
    - Organized display with friendly names (Hydrology, Topography, etc.)
    - Formatted numbers for easier reading
    - Helpful action hints (F12, Alt+F12, right-click)
  - **CodeLens Hints**: Inline indicators above rows showing referenced foreign keys
    - Example: `🔗 Referenced: Hydrology: hydro_001 | Topography: topo_002`

## Commands

This extension provides the following commands:

- `SWAT+: Select Dataset Folder` - Browse and select a dataset folder (saves selection for later use)
- `SWAT+: Select Dataset and Debug` - Browse for a dataset folder and immediately launch debug session
- `SWAT+: Debug with Selected Dataset` - Launch debug with previously selected dataset folder
- `SWAT+: Refresh Foreign Key Relationships` - Manually refresh the discovered foreign key relationships (auto-refreshes on file changes)

## Usage

### Dataset Selection and Debugging

#### Method 1: Select and Debug in One Step

1. Open Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Run `SWAT+: Select Dataset and Debug`
3. Browse to your SWAT+ dataset folder
4. Debug session will start automatically with the selected folder as working directory

#### Method 2: Select First, Debug Later

1. Open Command Palette
2. Run `SWAT+: Select Dataset Folder`
3. Browse to your SWAT+ dataset folder
4. Later, run `SWAT+: Debug with Selected Dataset` to launch debug with the selected folder

### Database Navigation Features

When working with SWAT+ text files (`.hru`, `.hyd`, `.sol`, `.cli`, etc.), the extension provides intelligent navigation:

#### Go to Definition (F12)
- Click on any foreign key value (e.g., `hydro_001` in the `hru.hru` file)
- Press **F12** or right-click and select "Go to Definition"
- Jump directly to the referenced record in the target file (e.g., `hydrology.hru`)

#### Peek Definition (Alt+F12)
- Hover over a foreign key value
- Press **Alt+F12** or right-click and select "Peek Definition"
- View the referenced record inline without leaving your current file

#### Enhanced Hover Preview
- Hover over any foreign key value
- See a rich tooltip with:
  - Up to 8 key fields from the referenced record
  - Formatted numeric values (with thousand separators)
  - Friendly field names (Hydrology, Topography, Field, etc.)
  - Quick action hints for navigation

#### CodeLens Indicators
- See inline hints above data rows showing all foreign key references
- Example: `🔗 Referenced: Hydrology: hydro_001 | Topography: topo_002`
- Provides at-a-glance view of relationships without hovering

### How Foreign Key Discovery Works

The extension discovers foreign key relationships using a **two-tier approach**:

#### Primary Method: SWAT+ Editor Schema
The extension uses the official **SWAT+ Editor database schema** (from https://github.com/swat-model/swatplus-editor) to identify known foreign key relationships. This includes:
- HRU → Hydrology, Topography, Soil, Field, etc.
- Channel → Hydrology
- Reservoir → Hydrology, Sediment, Initial
- Land Use → Plant Community, Management, CN Table, etc.
- And 50+ other official relationships

#### Fallback Method: Automatic Discovery
For custom files or relationships not in the schema, the extension automatically:
1. **Reads column headers** from all SWAT+ files in your dataset
2. **Matches column names** to other file names in the same directory
3. **Creates relationships** when a column name matches a file's base name

**Example:**
If `hru.hru` has columns: `name`, `hydrology`, `topography`, `field`
- `hydrology` → Found in schema, uses official definition ✅
- `topography` → Found in schema, uses official definition ✅
- `custom_field` → Not in schema, auto-discovers if `custom_field.hru` exists ✅

**Key Features:**
- ✅ **Schema-based**: Uses official SWAT+ Editor relationships (primary)
- ✅ **Automatic fallback**: Discovers custom relationships not in schema
- ✅ **Robust**: Works with any SWAT+ dataset structure
- ✅ **Auto-refresh**: Updates when files are added/removed/changed
- ✅ **Manual refresh**: Use `SWAT+: Refresh Foreign Key Relationships` command if needed

This dual approach ensures the extension works with both standard and custom SWAT+ datasets.

## How It Works

### Debugging

The extension dynamically launches a debug session with:
- **Type**: `cppdbg` (C++ debugging with gdb)
- **Working Directory**: Your selected dataset folder
- **Program**: Resolved by CMake Tools (`${command:cmake.launchTargetPath}`)
- **Environment**: Includes CMake launch target directory in PATH

This replaces the need to manually edit `launch.json` and change the `cwd` parameter each time you want to debug with a different dataset.

## Requirements

- CMake Tools extension (for `cmake.launchTargetPath` command)
- C/C++ extension (for gdb debugging)
- Properly configured CMake project

## Extension Settings

This extension does not add any VS Code settings.

## Known Issues

- Ensure CMake Tools is properly configured before using this extension
- The debug configuration assumes gdb is available on your system

## Release Notes

### 0.0.2

Enhanced Database Navigation
- Added Go to Definition (F12) for SWAT+ text file foreign keys
- Added Peek Definition (Alt+F12) for inline record viewing
- Added enhanced hover previews with up to 8 formatted fields
- Added CodeLens indicators showing referenced foreign keys
- Support for common SWAT+ file relationships (HRU, Hydrology, Topography, Field, etc.)

### 0.0.1

Initial release of SWAT+ Dataset Selector
- Browse and select dataset folders
- Launch debug sessions with selected datasets
- Integration with CMake Tools and gdb
