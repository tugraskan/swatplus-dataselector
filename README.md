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

### Selected Database

After you select a dataset folder the extension will reference the dataset's `project.db` when running the importer/conversion. The current database location for the selected dataset will be:

- `project.db` in the root of the selected dataset folder (for example: `C:\Users\taci.ugraskan\source\repos\SWATPlus\swatplus_ug-1\data\Osu_1hru\project.db`).

You can open that file directly with `qwtel.sqlite-viewer`, DB Browser for SQLite, or a VS Code SQLite extension to inspect tables and run queries.

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

## Database

After running the importer/conversion, the project SQLite database for a dataset is written to the dataset folder as `project.db`.

- Typical path example:

	`C:\Users\taci.ugraskan\source\repos\SWATPlus\swatplus_ug-1\data\Osu_1hru\project.db`

- To open with qwtel.sqlite-viewer:

	1. Install and launch qwtel.sqlite-viewer.
	2. Open the database file above (`File → Open Database`) or paste the path.
	3. Browse tables (e.g. `plants_plt`, `fertilizer_frt`, `codes_bsn`) and run SQL queries.

You can also view the DB using DB Browser for SQLite or the VS Code SQLite extensions if you prefer an integrated editor experience.
