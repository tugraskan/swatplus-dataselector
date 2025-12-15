# SWAT+ Dataset Selector

A VS Code extension for SWAT+ development that allows you to browse and select dataset folders for debugging sessions.

## Features

- **Select Dataset Folder**: Browse and select a SWAT+ dataset folder
- **Quick Debug Launch**: Select a dataset folder and immediately start debugging
- **Seamless Integration**: Works with CMake Tools and gdb debugger configurations
- **Database Navigation**: Click on foreign key values in SWAT+ text files to navigate to linked records (e.g., click on a `hydro` value in `hru-data.hru` to jump to the definition in `hydrology.hyd`)
- **Hover Information**: Hover over foreign key references to see details about the linked record

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

### Database Navigation (NEW!)

After importing/converting a dataset to a SQLite database, you can navigate between linked records in SWAT+ text files:

1. **Select a dataset** with a `project.db` file (created via the Import/Convert DB button)
2. **Open any SWAT+ text file** (e.g., `hru-data.hru`)
3. **Click on a foreign key value** (e.g., a hydro name) or press `F12` to go to its definition
4. **Hover over values** to see preview information about the linked record

**Supported file types**: `.hru`, `.hyd`, `.fld`, `.sol`, `.lum`, `.ini`, `.wet`, `.sno`, `.plt`, `.dtl`, and more

**Example workflow**:
- Open `hru-data.hru`
- Find a row with a `hydro` column value like `hydro_001`
- Click on `hydro_001` or press F12
- VS Code navigates to the corresponding line in `hydrology.hyd`

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
- Python 3.x with `peewee` package (for database import/conversion)

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

## Development

### Git Submodules

This extension uses a git submodule to reference the upstream `swatplus-editor` repository for file I/O and database handling code.

To initialize the submodule after cloning:

```bash
git submodule update --init --recursive
```

For more information about the upstream integration and syncing updates, see `src/python-scripts/COPIED_FILES.md`.

### Python Dependencies

The Python importer requires:
- Python 3.x
- `peewee` - Database ORM

Install dependencies:
```bash
pip install peewee
```
