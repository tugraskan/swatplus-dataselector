# SWAT+ Dataset Selector

A VS Code extension for **SWAT+** (Soil & Water Assessment Tool) development. It lets you
select dataset folders, cross-index the model's many interlinked input files, navigate
foreign keys with IDE-grade Go to Definition / hover / diagnostics, launch debug and run
sessions against the active dataset, and explore inputs and outputs as tables, graphs, and
notebooks.

> Looking for a compact technical overview? See **[SPEC.md](SPEC.md)** for the full
> specification sheet (platform, architecture, modules, commands, and tooling).

## What This Repo Contains

This repository is the VS Code extension itself plus the tooling that generates its SWAT+
schema. It is a two-layer project:

- **TypeScript extension (`src/`)** — the VS Code extension host, webview panels (dataset
  selector sidebar, table viewers, dependency graph, output DataFrame explorer), and the
  language features (foreign-key definition/hover/diagnostics providers) that power
  navigation across SWAT+ input files.
- **Python scripts (`scripts/`)** — schema extraction from the
  [`swatplus-editor`](https://github.com/swat-model/swatplus-editor) project, pandas-based
  indexing, HRU-subset processing, and output→DataFrame conversion. These are invoked by
  the extension and can also be run standalone.
- **Generated schema (`resources/schema/`)** — the machine-readable schema for all 213
  SWAT+ input tables that the extension indexes and validates against.
- **Documentation (`docs/`)** — deep-dive guides on indexing, schema, and file/FK
  relationships.

## Features

- **Select Dataset Folder**: Browse to any SWAT+ dataset folder and make it active.
- **Recent Datasets**: Reopen recently used datasets from the sidebar.
- **Dataset Folder Listing**: Show datasets from a configured parent folder such as `workdata/`.
- **Quick Debug Launch**: Start debugging with the selected dataset as the working directory.
- **HRU Subsets**: Create a reduced TxtInOut folder for selected HRU IDs, with optional downstream routing preservation.
- **Output Exploration**: Open `.csv` / `.out` / `.txt` output files as DataFrames and generate Jupyter notebooks from them.
- **Data Quality**: Run a preflight report of unresolved references and orphan rows, plus an input-file format checker (headers, column counts, data types).
- **Seamless Integration**: Works with CMake Tools and gdb debugger configurations.
- **Describe Entity / MCP Server**: Ask "describe HRU 81" in the editor, or expose the dataset to an AI agent (Claude Code/Desktop) via a bundled [MCP server](docs/MCP_SERVER.md).
- **Comprehensive Schema**: Auto-generated schema for all 213 SWAT+ input tables from swatplus-editor.
- **Enhanced Indexing**: Pandas-backed indexing system with FK navigation, hover info, and validation.
  - Handles hierarchical files (`soils.sol`, `plant.ini`, `management.sch`)
  - Parses decision tables (`*.dtl`)
  - Supports Go to Definition for foreign keys
  - Shows hover tooltips with file purpose and FK targets
  - Shows source-backed column documentation on hover — meaning, units, type, default, and the SWAT+ source line — merged from swatplus-doc-builder (SWAT+ 62.0.0)
  - Warns on unresolved references
  - Builds a reverse index for incoming references

## Documentation

- **[Enhanced Indexing Guide](docs/ENHANCED_INDEXING.md)** - Complete guide to the indexing system
- **[Schema Enhancement](docs/SCHEMA_ENHANCEMENT.md)** - How markdown documentation enhances FK and pointer detection
- **[Extension File Schema](docs/EXTENSION_FILE_SCHEMA.md)** - Detailed schema for SWAT+ files
- **[Dependency Analysis](docs/DEPENDENCY_ANALYSIS.md)** - Comprehensive FK and file relationships
- **[Input Schema Relationships Guide](docs/INPUT_SCHEMA_RELATIONSHIPS.md)** - Where to find FK and file pointer relationships
- **[Quick Reference](docs/QUICK_REFERENCE.md)** - Quick lookup for common patterns
- **[Troubleshooting Guide](TROUBLESHOOTING.md)** - Solutions for common issues

## Quick Start

1. Install the extension from the marketplace or build it from source.
2. Reload VS Code with `Developer: Reload Window`.
3. Open a SWAT+ project.
4. Select a dataset from the SWAT+ Dataset sidebar or run `SWAT+: Select Dataset Folder`.
5. Run `SWAT+: Build Inputs Index`.
6. Ctrl+Click foreign keys or filenames to navigate.

After pulling updates, reload VS Code so the latest extension bundle is active.

## Commands

**Dataset**

- `SWAT+: Select Dataset Folder` - Browse and select a dataset folder.
- `SWAT+: Select Dataset and Debug` - Browse for a dataset folder and launch debug immediately.
- `SWAT+: Debug with Selected Dataset` - Launch debug with the current dataset.
- `SWAT+: Switch Dataset` - Open a quick pick with recent datasets and dataset-folder entries.
- `SWAT+: Reveal Dataset Folder in Explorer` - Open the configured dataset folder in Explorer.
- `Use as SWAT+ Dataset` - Set the selected Explorer folder as the active dataset.

**Index**

- `SWAT+: Build Inputs Index` - Build an index of all SWAT+ input files in the selected dataset.
- `SWAT+: Rebuild Inputs Index` - Rebuild the current dataset index.
- `SWAT+: Load Cached Index` - Load a cached index from the dataset folder.
- `SWAT+: Export Index to JSON` - Export the current index to a JSON file.

**Navigation & views**

- `SWAT+: Show FK References` - List incoming references to the current row.
- `SWAT+: View Tables` - Open the multi-table viewer.
- `SWAT+: Edit / Create Schema` - Open the schema editor.
- `SWAT+: Show Dependency Graph` - Open a graph of table-to-table dependencies.

**Data quality**

- `SWAT+: Run Data Quality Preflight` - Generate a markdown report with unresolved references and potential orphan rows.
- `SWAT+: Check Input Files` - Validate input file headers, column counts, and data types.

**HRU subsets**

- `SWAT+: Create HRU Subset` - Create a reduced TxtInOut folder for selected HRU IDs.
- `SWAT+: Create HRU Subset and Run` - Create a reduced HRU subset and run SWAT+ with the selected executable.

**Outputs**

- `SWAT+: Generate Output Notebooks` - Generate Jupyter notebooks for output files.
- `SWAT+: Explore Output File` - Open an output file (`.csv` / `.out` / `.txt`) as a DataFrame.

## Usage

### Method 1: Select and Debug

1. Open the Command Palette.
2. Run `SWAT+: Select Dataset and Debug`.
3. Choose your dataset folder.
4. The debug session starts with that folder as the working directory.

### Method 2: Select First, Debug Later

1. Open the Command Palette.
2. Run `SWAT+: Select Dataset Folder`.
3. Choose your dataset folder.
4. Later, run `SWAT+: Debug with Selected Dataset`.

### Method 3: Use the Dataset Selector View

1. Open the SWAT+ Dataset view in the activity bar.
2. Select a dataset from **Recent Datasets** or **Dataset Folder**.
3. Use **Debug** to launch a debug session.
4. Use **Build Index** to index the selected dataset.

### Method 4: Configure the Dataset Folder

1. Open the SWAT+ Dataset view.
2. In the **Dataset Folder** section, click the folder button.
3. Choose the parent directory that contains your dataset folders.
4. Select a dataset from that list.

## Repository Layout

```
src/                 TypeScript extension source (~30 files)
  extension.ts         Entry point: activation and command registration
  indexer.ts           Cross-file input index, FK resolution, reverse index
  swatWebviewProvider  Dataset Selector sidebar webview
  *TableViewerPanel    Table / single-table data viewers
  fk*Provider          Foreign-key definition, hover, and diagnostics providers
  hruProcessor.ts      HRU subset generation
  output*              Output DataFrame explorer and notebook generation
  test/                Mocha test suites
scripts/             Python tooling (schema extraction, pandas indexing, HRU, outputs)
resources/schema/    Generated SWAT+ schema JSON (213 input tables)
docs/                Deep-dive guides on indexing, schema, and FK relationships
esbuild.js           Bundler config (produces dist/extension.js)
```

## How It Works

The extension launches a debug session with:

- **Type**: `cppdbg`
- **Working Directory**: The selected dataset folder
- **Program**: Resolved by CMake Tools via `${command:cmake.launchTargetPath}`
- **Environment**: Includes the CMake launch target directory in `PATH`

This avoids manually editing `launch.json` whenever you want to debug against a different dataset.

## SWAT+ Schema Extraction

This extension includes a schema extraction workflow that discovers model classes from the swatplus-editor repository.

### Quick Start

```bash
git clone https://github.com/swat-model/swatplus-editor.git /tmp/swatplus-editor
python3 scripts/extract_all_models.py
```

The generated schema is written to `resources/schema/swatplus-editor-schema-full.json`.

### What Gets Extracted

- Table definitions
- Column metadata
- Foreign key relationships
- Primary keys

### Update When SWAT Editor Changes

```bash
cd /tmp/swatplus-editor
git pull
python3 scripts/extract_all_models.py
```

## Requirements

- VS Code `^1.106.1`
- Jupyter extension (`ms-toolsai.jupyter`) — a required extension dependency
- CMake Tools extension for `${command:cmake.launchTargetPath}`
- C/C++ extension for gdb debugging
- Properly configured CMake project
- Python 3.6+ with `pandas>=2.2.0` for schema extraction and indexing

## Extension Settings

- `swatplus.datasetDirectory`: Parent directory that contains SWAT+ dataset folders. Defaults to `workdata`.
- `swatplus.schemaDirectories`: Additional directories to scan for SWAT+ schema JSON files.

## Development

Built with TypeScript, bundled with esbuild, and linted with ESLint.

```bash
npm install            # install dependencies
npm run compile        # type-check, lint, and bundle
npm run watch          # rebuild on change
npm run test           # run the VS Code test suite
npm run package        # production build (used for packaging the .vsix)
```

Press `F5` in VS Code to launch an Extension Development Host with the extension loaded.
See [vsc-extension-quickstart.md](vsc-extension-quickstart.md) for more.

## Known Issues

- Ensure CMake Tools is configured before using debug commands.
- The debug configuration assumes gdb is available on your system.

## Release Notes

### 0.0.1

Initial release of SWAT+ Dataset Selector

- Browse and select dataset folders
- Launch debug sessions with selected datasets
- Integration with CMake Tools and gdb
