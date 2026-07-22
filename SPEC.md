# SWAT+ Dataset Selector — Specification Sheet

## Identity

| Field | Value |
|---|---|
| **Name** | `swat-dataset-selector` |
| **Display name** | SWAT+ Dataset Selector |
| **Version** | 0.1.0 |
| **Publisher** | taciugraskan |
| **Category** | VS Code Extension (Other) |
| **License** | MIT |
| **Repository** | github.com/tugraskan/swatplus-dataselector |
| **Description** | Browse and select SWAT+ dataset folders for debugging, index inputs, navigate foreign keys, and visualize model data. |

## Purpose

A VS Code extension for **SWAT+** (Soil & Water Assessment Tool) modelers. It manages
datasets, cross-indexes the model's many interlinked plain-text input files, provides
IDE-grade navigation (Go to Definition / hover / diagnostics) over foreign keys, launches
debug/run sessions, and offers data-visualization panels for inputs and outputs.

## Platform & Runtime

| Component | Requirement |
|---|---|
| **VS Code engine** | `^1.106.1` |
| **Extension host** | Node.js (bundled via esbuild → `dist/extension.js`) |
| **Extension dependency** | `ms-toolsai.jupyter` (Jupyter) — required |
| **Recommended companions** | CMake Tools, C/C++ (for `cppdbg`/gdb debugging) |
| **Python** | 3.6+ with `pandas>=2.2.0` (for indexing / schema / dataframe scripts) |
| **Activation** | `onStartupFinished`, on view open, and on each contributed command |

## Architecture

Two-layer design bridging a TypeScript UI/extension host with Python data-processing
scripts.

- **TypeScript (`src/`, ~17,100 LOC, 30 files)** — extension host, webview panels,
  language providers, sidebar.
- **Python (`scripts/`, ~4,960 LOC)** — schema extraction, pandas indexing, HRU
  processing, output→DataFrame conversion.

### Key modules

| Module | LOC | Role |
|---|---|---|
| `extension.ts` | 1,120 | Entry point, command registration, activation |
| `indexer.ts` | 1,697 | Builds cross-file input index, FK resolution, reverse index |
| `singleTableViewerPanel.ts` | 4,309 | Single-table data viewer webview |
| `swatWebviewProvider.ts` | 2,999 | Sidebar "Dataset Selector" webview |
| `tableViewerPanel.ts` | 1,765 | Multi-table viewer |
| `schemaEditorPanel.ts` | 1,041 | Schema edit/create UI |
| `fkDefinitionProvider` / `fkHoverProvider` / `fkDiagnostics` / `fkReferencesPanel` / `fkDecorations` | ~1,900 combined | FK language features |
| `hruProcessor.ts` | 221 | HRU subset generation |
| `outputDataFramePanel` / `outputNotebookGenerator` / `outputDataFrameUtils` | ~1,075 | Output exploration & notebook generation |
| `dependencyGraphPanel.ts` | 189 | Table dependency graph |
| `environmentUtils` / `pathUtils` / `fileFormatUtils` | ~690 | Support utilities |

## Features

- **Dataset management** — select a dataset folder, track recent datasets, list datasets
  from a configured parent folder, mark one active. Sidebar webview in the activity bar.
- **Debugging** — one-click `cppdbg`/gdb launch with the dataset as working directory;
  program resolved via CMake Tools (`${command:cmake.launchTargetPath}`). No manual
  `launch.json` edits.
- **Input indexing (pandas-backed)** — index all SWAT+ input tables; cache and
  reload/rebuild.
  - Go to Definition on foreign keys and referenced filenames
  - Hover tooltips (file purpose, FK targets)
  - Diagnostics for unresolved references / potential orphan rows
  - Reverse index for incoming references
  - Handles hierarchical files (`soils.sol`, `plant.ini`, `management.sch`) and decision
    tables (`*.dtl`)
- **Schema** — auto-generated schema for **213 SWAT+ input tables** extracted from
  `swatplus-editor`; in-editor schema editor.
- **HRU subsets** — build a reduced `TxtInOut` for selected HRU IDs (optional
  downstream-routing preservation); optionally run SWAT+ on the subset.
- **Data quality** — preflight report (markdown) of unresolved references / orphans;
  input-file format checker (header, column count, data types).
- **Visualization** — table viewers, table-to-table dependency graph, output files opened
  as DataFrames, and generated Jupyter output notebooks.

## Contributed Commands (21)

- **Dataset:** `selectDataset`, `selectAndDebug`, `launchDebug`, `switchDataset`,
  `useAsDataset`, `revealWorkdataFolder`
- **Index:** `buildIndex`, `rebuildIndex`, `loadIndex`, `exportIndex`
- **Navigation / View:** `showFKReferences`, `showTableViewer`, `editSchema`,
  `showDependencyGraph`
- **Quality:** `runDataQualityPreflight`, `checkInputFiles`
- **HRU:** `processHruSubset`, `processHruSubsetAndRun`
- **Output:** `generateOutputNotebooks`, `openOutputAsDataFrame`

**Context menus:** "Explore Output File" on `.csv` / `.out` / `.txt` files; "Use as SWAT+
Dataset" on folders.

## Configuration

| Setting | Type | Default | Purpose |
|---|---|---|---|
| `swatplus.datasetDirectory` | string | `workdata` | Parent folder (relative or absolute) containing dataset folders |
| `swatplus.schemaDirectories` | string[] | `[]` | Extra dirs to scan for schema JSON (supports `${workspaceFolder}`) |

## Build & Tooling

| Aspect | Detail |
|---|---|
| **Language** | TypeScript `^5.9.3` |
| **Bundler** | esbuild `^0.27.1` (`esbuild.js`) |
| **Lint** | ESLint `^9.39.1` + typescript-eslint |
| **Test** | `@vscode/test-cli` + `@vscode/test-electron`, Mocha; suites in `src/test/` (9 test files) |
| **Runtime dep** | `sharp ^0.34.5` (image processing) |
| **Scripts** | `compile`, `watch`, `package`, `test`, `check-types`, `lint` |
| **Distribution** | `swat-dataset-selector-0.1.0.vsix` (checked in) |

## Python Scripts

- **Schema:** `extract_all_models.py`, `extract_schema_static.py`, `parse_schema_md.py`,
  `merge_schema_metadata.py`, `add_con_files_to_schema.py`, `parse_gitbook_urls.py`,
  `generate_input_schema_relationships_doc.py`, `test_enhanced_schema.py`
- **Data:** `pandas_indexer.py`, `hru_processor.py`, `output_to_dataframes.py`

Output schema → `resources/schema/swatplus-editor-schema-full.json`.
