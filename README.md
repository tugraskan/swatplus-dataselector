# SWAT+ Dataset Selector

A VS Code extension for SWAT+ development that allows you to browse and select dataset folders for debugging sessions.

## Features

- **Select Dataset Folder**: Browse and select a SWAT+ dataset folder
- **Upload Dataset**: Import datasets into the `workdata/` folder — works in GitHub Codespaces (upload via Explorer, then select) and WSL Ubuntu (copy from `/mnt/c/...` or any path)
- **Quick Debug Launch**: Select a dataset folder and immediately start debugging
- **Seamless Integration**: Works with CMake Tools and gdb debugger configurations
- **Comprehensive Schema**: Auto-generated schema for all 213 SWAT+ input tables from swatplus-editor
- **Enhanced Indexing**: Pandas-backed indexing system with FK navigation, hover info, and validation
  - Handles hierarchical files (soils.sol, plant.ini, management.sch)
  - Decision table parsing (*.dtl files)
  - Go-to-Definition for foreign keys (Ctrl+Click to navigate)
  - Hover tooltips showing file purposes and FK targets
  - Warnings for unresolved references
  - Reverse index for finding what references each row

## Documentation

- **[Enhanced Indexing Guide](docs/ENHANCED_INDEXING.md)** - Complete guide to the indexing system
- **[Schema Enhancement](docs/SCHEMA_ENHANCEMENT.md)** - How markdown documentation enhances FK and pointer detection
- **[Extension File Schema](docs/EXTENSION_FILE_SCHEMA.md)** - Detailed schema for all SWAT+ files
- **[Dependency Analysis](docs/DEPENDENCY_ANALYSIS.md)** - Comprehensive FK and file relationships
- **[Input Schema Relationships Guide](docs/INPUT_SCHEMA_RELATIONSHIPS.md)** - Where to find FK and file pointer relationships
- **[Quick Reference](docs/QUICK_REFERENCE.md)** - Quick lookup for common patterns
- **[Troubleshooting Guide](TROUBLESHOOTING.md)** - Solutions for common issues

## Quick Start

1. **Install the extension** from the VS Code marketplace or build from source
2. **Reload VS Code** - Press `Ctrl+Shift+P` and run `Developer: Reload Window`
3. **Open a SWAT+ project** - Open a folder containing SWAT+ datasets
4. **Build the index** - Press `Ctrl+Shift+P` and run `SWAT+: Build Inputs Index`
5. **Navigate!** - Ctrl+Click on foreign keys or filenames to navigate

**Note**: After pulling updates, always reload VS Code to ensure the latest version is active.

## Commands

This extension provides the following commands:

- `SWAT+: Select Dataset Folder` - Browse and select a dataset folder (saves selection for later use)
- `SWAT+: Select Dataset and Debug` - Browse for a dataset folder and immediately launch debug session
- `SWAT+: Debug with Selected Dataset` - Launch debug with previously selected dataset folder
- `SWAT+: Upload Dataset to Workspace` - Import a dataset into the `workdata/` folder (Codespaces & WSL)
- `SWAT+: Build Inputs Index` - Build an index of all SWAT+ input files in the selected dataset
- `SWAT+: Load Cached Index` - Load a cached index from the dataset folder (index.json)
- `SWAT+: Rebuild Inputs Index` - Rebuild the index for the currently selected dataset
- `SWAT+: Show Dependency Graph` - Open an edge-list graph of table-to-table dependencies from FK references
- `SWAT+: Run Data Quality Preflight` - Generate a markdown report with unresolved references and potential orphan rows
- `SWAT+: Export AI Context Document` - Generate a single Markdown file that gives an AI assistant everything it needs to understand your dataset (see [Using with AI Assistants](#using-with-ai-assistants-github-copilot-chatgpt-etc))

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

### Method 4: Upload Dataset (GitHub Codespaces & WSL Ubuntu)

The `SWAT+: Upload Dataset to Workspace` command (or the **Upload Dataset** button in the sidebar) makes it easy to bring your own dataset into a remote environment where you cannot simply browse a local path.

#### GitHub Codespaces

1. In the VS Code Explorer sidebar, right-click the `workdata/` folder and choose **Upload…** (or drag-and-drop your dataset folder onto it).
2. Open the Command Palette (`Ctrl+Shift+P`) and run `SWAT+: Upload Dataset to Workspace`.
3. Choose **Select from workdata/ folder** and pick the folder you just uploaded.
4. The dataset is now active — build the index and start debugging.

#### WSL Ubuntu

1. Open the Command Palette (`Ctrl+Shift+P`) and run `SWAT+: Upload Dataset to Workspace`.
2. Choose **Copy dataset from another location** to copy a dataset from your Windows filesystem (e.g. `/mnt/c/Users/you/myDataset`) into the `workdata/` folder inside the WSL workspace.
3. The copied dataset is automatically selected — build the index and start debugging.

> **Note:** The `workdata/` directory is listed in `.gitignore` so uploaded datasets are never accidentally committed.

## How It Works

The extension dynamically launches a debug session with:
- **Type**: `cppdbg` (C++ debugging with gdb)
- **Working Directory**: Your selected dataset folder
- **Program**: Resolved by CMake Tools (`${command:cmake.launchTargetPath}`)
- **Environment**: Includes CMake launch target directory in PATH

This replaces the need to manually edit `launch.json` and change the `cwd` parameter each time you want to debug with a different dataset.

## Using with AI Assistants (GitHub Copilot, ChatGPT, etc.)

### The problem with "just grepping" the input files

A typical SWAT+ dataset is a folder of **200+ plain text files** — `hru-data.hru`, `topography.hyd`, `management.sch`, and so on. Each file is whitespace-delimited with no column descriptions, no types, and no relationships stated anywhere inside the file itself. For example, a line in `hru-data.hru` looks like:

```
1  hru01  1  topo01  soil01  lu01  ...
```

If you ask Copilot *"why does HRU 1 have the wrong topography?"*, Copilot would need to:

1. Open `hru-data.hru` and find the row
2. Guess that column 4 (`topo01`) is a foreign key pointing somewhere
3. Open `topography.hyd` and search for `topo01`
4. Repeat for every other column it doesn't recognise
5. Do all this across files it has never seen before

Without the schema, Copilot doesn't know `topo` is a foreign key, doesn't know it points to `topography.hyd`, and doesn't know which column in that file is the primary key. It would have to guess — or ask you — at every step.

### What `Export AI Context Document` does instead

Run **`SWAT+: Build Inputs Index`** once, then **`SWAT+: Export AI Context Document`**. The extension reads every file in your dataset using the full SWAT+ schema it already knows, and produces a single `ai-context.md` file that contains:

| What's included | Why it matters |
|---|---|
| **Dataset summary** — table count, row count, FK resolution rate | One-glance health check |
| **Per-file sections grouped by category** | Copilot sees Climate, Hydrology, Land Use files together |
| **Column schema for every file** — name, type, which column is the primary key, which columns are foreign keys and where they point | Copilot knows `topo` → `topography.hyd.name` without guessing |
| **Sample rows** (first 3) from every file | Copilot sees real values, not just column names |
| **Cross-file FK relationship map** — every `source_table.column → target_table` edge | Copilot can trace data lineage across files in one shot |
| **Data quality issues** — top unresolved FK targets and orphan rows | Flags broken links before you even ask |
| **file.cio classification summary** — which files are active | Copilot knows which groups of files are in play |

### How to use it

```
1. Ctrl+Shift+P → "SWAT+: Build Inputs Index"   (or "Rebuild" if you already have one)
2. Ctrl+Shift+P → "SWAT+: Export AI Context Document"
   → ai-context.md opens automatically
3. Paste ai-context.md (or drag it) into your Copilot / ChatGPT conversation
4. Ask questions about your dataset
```

### Side-by-side comparison

| Approach | What Copilot sees | Round trips to understand one FK |
|---|---|---|
| "Just grep the files" | Raw whitespace-delimited text, no types, no schema | 3–5+ (open file → guess column → open target → repeat) |
| `Export AI Context Document` | Full schema + sample data + relationship map in one file | 0 — it's all already there |

> **Tip:** The `ai-context.md` file is written into your dataset folder and is listed in `.gitignore` conventions so it won't accidentally be committed. You can re-generate it any time after rebuilding the index.

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
