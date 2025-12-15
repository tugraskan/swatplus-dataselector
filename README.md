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

### Database Navigation

After importing/converting a dataset to a SQLite database, you can navigate between linked records in SWAT+ text files with enhanced browsing features:

#### Features

1. **Go to Definition (F12)**
   - Click on any foreign key value (e.g., `hydro_001` in `hru-data.hru`)
   - Press F12 to navigate to the referenced record in the target file (e.g., `hydrology.hyd`)
   - Or right-click and select "Go to Definition"

2. **Peek Definition (Alt+F12)**
   - View the referenced record inline without leaving the current file
   - See all details in a popup window

3. **Enhanced Hover Preview**
   - Hover over any foreign key value to see detailed information
   - Shows up to 8 key fields from the referenced record
   - Organized display with friendly names (Topography, Hydrology, etc.)
   - Formatted numbers for easier reading
   - Helpful action hints (F12, Alt+F12, right-click)

4. **CodeLens Hints**
   - Inline indicators above rows showing which foreign keys are referenced
   - Example: `🔗 Referenced: Hydrology: hydro_001 | Topography: topo_002`
   - Helps you quickly identify which records have linkages

#### Getting Started

1. **Select a dataset** with a `project.db` file (created via the Import/Convert DB button)
2. **Open any SWAT+ text file** (e.g., `hru-data.hru`)
3. **Look for CodeLens hints** above rows that reference other tables
4. **Click on a foreign key value** or press F12 to navigate
5. **Hover over values** to see detailed preview information

**Supported file types**: `.hru`, `.hyd`, `.fld`, `.sol`, `.lum`, `.ini`, `.wet`, `.sno`, `.plt`, `.dtl`, and 20+ more

#### Example Workflow

**Browsing HRU relationships:**
- Open `hru-data.hru`
- See inline CodeLens hints like `🔗 Referenced: Hydrology: hydro_001 | Topography: topo_002`
- Hover over `hydro_001` to see a preview with all hydrology parameters
- Press F12 on `hydro_001` to jump to `hydrology.hyd` and see the full record
- Use Alt+F12 to peek at the topography details without leaving the HRU file
- Navigate back with Alt+← or use breadcrumbs

This mimics SWAT+ Editor's relational navigation workflow directly in VS Code!

### Database Table Browser (NEW!)

For a more SWAT+ Editor-like experience, use the built-in database table browser:

#### Features
- **Browse database tables** - View HRU data and other tables in a grid view
- **Clickable foreign keys** - Click on any foreign key value (🔗) to navigate to the referenced record
- **Filtered views** - Automatically filters to show only the referenced record
- **Read-only** - Safe browsing without risk of accidental edits

#### Usage

**Option 1: From text files (Code Actions)**
1. Open `hru-data.hru` in VS Code
2. Click on a foreign key value (e.g., `hydro_001`)
3. Click the lightbulb 💡 or press `Ctrl+.` (Cmd+. on Mac)
4. Select `🔍 Open "hydro_001" in Database Browser`
5. The database browser opens showing the `hydrology_hyd` table filtered to that record

**Option 2: From Command Palette**
1. Press `Ctrl+Shift+P` (Cmd+Shift+P on Mac)
2. Type "SWAT+: Browse HRU Data"
3. Browse the full HRU table with clickable foreign keys

**Navigation workflow:**
- Click any 🔗 link in the table to navigate to referenced records
- Each click opens the target table filtered to that specific record
- Perfect for following the data relationships like SWAT+ Editor

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
- **better-sqlite3** npm package (automatically included) for database browsing

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
