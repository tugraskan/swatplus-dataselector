# SWAT+ Dataset Selector

A VS Code extension for SWAT+ development that allows you to browse and select dataset folders for debugging sessions.

## Features

- **Select Dataset Folder**: Browse and select a SWAT+ dataset folder
- **Quick Debug Launch**: Select a dataset folder and immediately start debugging
- **Seamless Integration**: Works with CMake Tools and gdb debugger configurations

## Commands

This extension provides the following commands:

- `SWAT+: Select Dataset Folder` - Browse and select a dataset folder (saves selection for later use)
- `SWAT+: Select Dataset and Debug` - Browse for a dataset folder and immediately launch debug session
- `SWAT+: Debug with Selected Dataset` - Launch debug with previously selected dataset folder

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

## How It Works

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

## Compatibility with SWAT+ Editor

This extension works with dataset folders created by [SWAT+ Editor](https://github.com/swat-model/swatplus-editor). While the extension itself is version-agnostic and works at the file-system level, it's important to understand how schema and script changes in SWAT+ Editor may affect your workflow.

**📖 Documentation:**
- [Detailed explanation](./SCHEMA_AND_SCRIPTS.md) - What happens when SWAT+ Editor schemas and scripts change
- [Quick reference guide](./docs/QUICK_REFERENCE.md) - Quick lookup for common scenarios and compatibility issues

### Quick Compatibility Notes

- ✅ **File viewing/editing:** Works with datasets from any SWAT+ Editor version
- ⚠️ **Debugging:** Your compiled SWAT+ model version must match the dataset version
- 💡 **Best practice:** Keep SWAT+ Editor, model version, and datasets synchronized
- 🔄 **Upgrading datasets:** Use SWAT+ Editor to migrate datasets when schema changes occur

## Extension Settings

This extension does not add any VS Code settings.

## Known Issues

- Ensure CMake Tools is properly configured before using this extension
- The debug configuration assumes gdb is available on your system
- Dataset file formats must match your compiled SWAT+ model version (see [compatibility guide](./SCHEMA_AND_SCRIPTS.md))

## Release Notes

### 0.0.1

Initial release of SWAT+ Dataset Selector
- Browse and select dataset folders
- Launch debug sessions with selected datasets
- Integration with CMake Tools and gdb
