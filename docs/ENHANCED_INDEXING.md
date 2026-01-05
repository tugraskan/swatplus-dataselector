# Enhanced SWAT+ Indexing System

## Overview

The SWAT+ Dataset Selector extension includes an enhanced indexing system that leverages detailed documentation about SWAT+ input files to provide better navigation, validation, and understanding of the file relationships.

## Key Improvements

### 1. file.cio Master File Indexing

The indexer now parses `file.cio` first before indexing other files. This is critical because:

- **Handles Custom File Names**: If users rename input files, file.cio contains the actual filenames being used
- **Provides File Discovery**: The master file lists all input files that should be indexed
- **Prioritized Indexing**: file.cio is always processed first to establish the file reference map
- **Go-to-Definition Support**: Clicking on filenames in file.cio opens the referenced file

**How it works**:
1. When building the index, `file.cio` is parsed first
2. All file references are extracted and stored
3. file.cio is then indexed as a regular table
4. Other tables are indexed in their normal order
5. Special navigation support added for file.cio (works without header line)

**Navigation in file.cio**:
- **Ctrl+Click** on any filename in file.cio to open that file (works on any line after line 1)
- **Hover** over a filename to see the file's purpose
- Handles file.cio's unique format (no header line, just file references)
- Automatically detects filenames by looking for values with file extensions

**file.cio Format**:
```
Title: Master SWAT+ Input Files
climate/weather-sta.cli
hru-data.hru
soils.sol
...
```

**API**:
```typescript
// Get all file references from file.cio
const fileRefs = indexer.getFileCioReferences();

// Check if a specific file is referenced
const isReferenced = indexer.isFileReferencedInCio('hru-data.hru');
```

### 2. Documentation-Driven Metadata

The indexer now uses comprehensive metadata extracted from the documentation in the `docs/` folder:

- **File Purposes**: Each file's role and what it contains (e.g., "Defines HRUs and links to property files")
- **File Categories**: Logical grouping of files (master_config, climate, hru, soils, etc.)
- **Null Sentinel Values**: Values that should be treated as "no reference" (null, 0, blank)
- **File Pointer Patterns**: Common patterns for FK relationships (init, hyd, sed, nut patterns)
- **Table-to-File Mapping**: Enhanced mapping between database table names and TxtInOut file names

### 3. Correct FK Resolution for TxtInOut Files

**Key Fix**: In SWAT+ TxtInOut text files, foreign key references use the `name` column (not `id`) for lookups.

**Before**: The indexer tried to match FK values against database `id` columns
**After**: The indexer correctly matches FK values against the `name` column in target files

Example:
```
hru-data.hru:
  name    topo         hydro        soil
  hru_1   topo_default hydro_clay   clay_loam

topography.hyd:
  name          slp    len
  topo_default  0.05   100
```

The `topo` FK in hru-data.hru correctly resolves to the row where `name = "topo_default"` in topography.hyd.

### 4. Reverse Index for Bidirectional Navigation

The indexer now maintains a reverse index that allows you to find all rows that reference a particular row.

**Use Cases**:
- Find all HRUs that use a specific soil type
- Find all channels that reference a particular initialization file
- Identify which objects will be affected if you modify a shared parameter file

**API**:
```typescript
// Find what references a specific row
const refs = indexer.getReferencesToRow('soils_sol', 'clay_loam');
// Returns array of FKReferences pointing to this soil
```

### 5. Enhanced Hover Information

Hovering over a foreign key value now shows:
- Column name and type
- Target file name
- Target file purpose (from documentation)
- Whether the reference is resolved
- Helpful navigation hints

Example hover text:
```
Foreign Key: topo

Points to: topography.hyd

Topography parameters for HRUs

✓ Reference found: topo_default

Click to navigate to topography.hyd
```

### 6. Better Diagnostic Messages

Diagnostic warnings for unresolved FK references now include file purposes for better context:

**Before**: `Unresolved foreign key: topo = "missing_topo" (expected in topography.hyd)`

**After**: `Unresolved foreign key: topo = "missing_topo" (expected in topography.hyd - Topography parameters for HRUs)`

### 7. Index Statistics and Query Methods

New methods provide insights into the index:

```typescript
// Get statistics
const stats = indexer.getIndexStats();
// Returns: {
//   tableCount: 218,
//   rowCount: 5432,
//   fkCount: 1234,
//   resolvedFkCount: 1200,
//   unresolvedFkCount: 34
// }

// Get file purpose
const purpose = indexer.getFilePurpose('hru-data.hru');
// Returns: "Defines HRUs and links to property files"

// Get file category
const category = indexer.getFileCategory('hru-data.hru');
// Returns: "hru"

// Get all FK references from a file
const fileRefs = indexer.getFKReferencesFromFile(filePath);
```

## Architecture

### Data Flow

```
Documentation (docs/*.md)
    ↓
txtinout-metadata.json (extracted metadata)
    ↓
SwatIndexer (loads metadata + schema)
    ↓
Index Building:
  1. Parse each TxtInOut file
  2. Extract rows with PK values (using 'name' column)
  3. Record FK references (pointing to 'name' in target)
  4. Resolve FK references
  5. Build reverse index
    ↓
Features:
  - FK Navigation (Go-to-Definition)
  - Hover Information
  - Diagnostics (Warnings)
  - Decorations (Visual hints)
```

### File Structure

```
resources/schema/
├── swatplus-editor-schema.json     # Auto-generated from swatplus-editor
└── txtinout-metadata.json          # Documentation-based metadata

src/
├── indexer.ts                      # Core indexing engine
├── fkDefinitionProvider.ts         # Go-to-Definition for FK navigation
├── fkHoverProvider.ts              # Hover information for FKs
├── fkDiagnostics.ts                # Warnings for unresolved FKs
└── fkDecorations.ts                # Visual decorations for FKs

docs/
├── EXTENSION_FILE_SCHEMA.md        # Detailed schema for each file
├── DEPENDENCY_ANALYSIS.md          # Comprehensive dependency analysis
├── FILE_RELATIONSHIPS.md           # Summary tables
├── COMPLETE_DEPENDENCY_MAP.md      # Complete dependency map
└── QUICK_REFERENCE.md              # Quick reference diagram
```

## Usage

### Building the Index

1. Open a SWAT+ dataset folder in VS Code
2. Open the SWAT+ view in the sidebar
3. Click "Select Folder" and choose your dataset
4. Click "Build Index"

Or use the command palette:
- `SWAT+: Build Inputs Index`
- `SWAT+: Rebuild Inputs Index`

### Navigating with FKs

1. **Go to Definition**: Ctrl+Click (or Cmd+Click) on any FK value to jump to the target file
2. **Hover**: Hover over any FK value to see target information
3. **Peek Definition**: Alt+F12 to peek at the target without switching files

### Finding References

Currently supported via API:
```typescript
// In your extension code
const indexer = getIndexer(); // Get the indexer instance
const references = indexer.getReferencesToRow('soils_sol', 'clay_loam');
// Returns all FKReferences that point to this soil
```

Future: Will be integrated into "Find All References" command.

## Metadata Schema

### txtinout-metadata.json Structure

```json
{
  "metadata_version": "1.0.0",
  "null_sentinel_values": {
    "global": ["null", "0", ""],
    "description": "Values treated as 'no reference'"
  },
  "table_name_to_file_name": {
    "hru_data_hru": "hru-data.hru",
    // ... more mappings
  },
  "txtinout_fk_behavior": {
    "default_target_column": "name",
    "description": "In TxtInOut files, FKs point to 'name' not 'id'"
  },
  "file_purposes": {
    "hru-data.hru": "Defines HRUs and links to property files",
    // ... more purposes
  },
  "file_categories": {
    "hru": ["hru-data.hru", "topography.hyd", ...],
    // ... more categories
  },
  "common_pointer_patterns": {
    "init_pattern": { /* init field patterns */ },
    // ... more patterns
  }
}
```

## Benefits

1. **Faster Development**: Navigate between related files instantly
2. **Better Understanding**: See what each file does through hover tooltips
3. **Error Prevention**: Get warnings about broken references before running the model
4. **Dataset Validation**: Quickly identify missing or misconfigured files
5. **Learning Tool**: Understand SWAT+ file structure through contextual help

## Future Enhancements

- [ ] Visual dependency graph showing file relationships
- [ ] "Find All References" command integration
- [ ] Bulk validation of entire dataset
- [ ] Smart auto-completion for FK values
- [ ] Reference counting (show how many rows reference each parameter)
- [ ] Cross-file refactoring (rename and update all references)

## Hierarchical File Support

### Overview

The indexer now supports hierarchical (multi-line) file formats where a single logical record spans multiple physical lines. This is critical for files like:

- **soils.sol**: Soil properties with layer data
- **plant.ini**: Plant communities with plant details
- **Decision tables (*.dtl)**: Condition-action pairs

### How It Works

1. **Detection**: The indexer checks `txtinout-metadata.json` to identify hierarchical files
2. **Main Record Identification**: Uses file-specific heuristics to detect main vs child lines
3. **Indexing Strategy**: Only main records are indexed; child lines are skipped

### File-Specific Strategies

#### soils.sol

**Structure**:
```
Soil Properties
name         hyd_grp   dp_tot    anion_excl perc_crk  texture   description
clay_loam    C         1500.0    0.5        0.5       CL        Clay loam soil
150.0        1.35      0.18      10.5       35.0      45.0      20.0    <- layer 1
300.0        1.40      0.16      8.5        40.0      40.0      20.0    <- layer 2
sandy_loam   B         1200.0    0.3        0.3       SL        Sandy loam soil
200.0        1.50      0.12      15.0       15.0      25.0      60.0    <- layer 1
```

**Detection Logic**:
- Main records have a non-numeric `name` field (e.g., "clay_loam")
- Child records (layers) have numeric values in the `name` position (e.g., "150.0")
- Heuristic: Check if `name` matches `/^\d+(\.\d+)?$/` (purely numeric)

#### plant.ini

**Structure**:
```
Plant Community Initialization
name         plnt_cnt  rot_yr_ini description
comm_crop    2         1          Crop community
corn         ...       ...        ...    <- plant 1
soybean      ...       ...        ...    <- plant 2
comm_forest  1         1          Forest community
oak          ...       ...        ...    <- plant 1
```

**Detection Logic**:
- Main records have `plnt_cnt` field present
- Child records (plant details) follow main record
- Count field `plnt_cnt` specifies number of child lines

#### management.sch

**Structure**:
```
Management Schedule
name                      numb_ops  numb_auto  ...
agrl_rot                  0         2          ...   <- main record (2 auto ops)
    pl_hv_agro                                      <- auto op 1 (dtl reference)
    fert_stress                                     <- auto op 2 (dtl reference)
hay_cmz_60__dry_101531    3         1          ...   <- main record (1 auto + 3 explicit)
    hay_fesc                                        <- auto op 1 (dtl reference)
    fert          0  0  0.2  mhp  broadcast  31.87  <- explicit op 1
    fert          0  0  0.2  mhn  broadcast  74.88  <- explicit op 2
    skip          0  0  0    null null       0      <- explicit op 3
```

**Detection Logic**:
- Main records have `numb_ops` and `numb_auto` fields
- Child records follow in order: first `numb_auto` lines (decision table references to lum.dtl), then `numb_ops` lines (explicit operations)
- Total skip count = `numb_auto + numb_ops`
- Decision table references (auto ops) are FK references to `lum.dtl`

**FK Tracking for Operations**:
- Auto operations (first `numb_auto` lines): Each line contains a decision table name → FK to `lum.dtl`
- Explicit operations (next `numb_ops` lines): Operation type determines target file
  - `fert`, `frta`, `frtc` → `fertilizer.frt` (op_data1 field)
  - `till` → `tillage.til` (op_data1 field)
  - `pest`, `pstc` → `pesticide.pes` (op_data1 field)
  - `irrm`, `irra` → `irr.ops` (op_data1 field)
  - `plnt`, `hvkl`, `kill` → `plant.ini` (op_data1 field)
  - `harv` → `harv.ops` (op_data1 field)
  - `graz` → `graze.ops` (op_data1 field)

#### Decision Tables (*.dtl)

**Structure**:
```
Decision Table File
Title line
39                              <- Number of decision tables
DTBL_NAME     CONDS  ALTS  ACTS
hay_fesc      2      1     1    <- Header (indexed as hay_fesc)
COND_VAR ...                    <- Condition line 1
biomass hru 0 null - 2000 >
phu_plant hru 0 null - 0.5 >=   <- Condition line 2
ACT_TYP OBJ OBJ_NUM ACT_NAME ACT_OPTION CONST CONST2 FILE_POINTER OUT1
harvest hru 0 hay_harv fesc 0 3 hay_cut_low y  <- Action line (fp field tracked)
```

**Detection Logic**:
- Custom parser for complex multi-section structure
- Parses decision table count from line 2
- For each decision table:
  - Reads header (DTBL_NAME, CONDS, ALTS, ACTS)
  - Indexes by DTBL_NAME
  - Skips CONDS condition lines
  - Parses ACTS action lines to extract fp (file pointer) field

**FK Tracking for File Pointers**:
- Action lines have fp field at index 7
- Maps action type to target file:
  - `harvest` → `harv.ops` (name column)
  - `harvest_kill` → `harv.ops` (name column)
  - `pest_apply` → `chem_app.ops` (name column)
  - `fertilize` → `chem_app.ops` (name column)

### Configuration

Hierarchical files are configured in `resources/schema/txtinout-metadata.json`:

```json
{
  "hierarchical_files": {
    "soils.sol": {
      "description": "Soil properties with layer data",
      "structure": {
        "main_record_format": "Main line contains soil name and properties",
        "child_line_format": "Following lines contain layer-specific data",
        "main_record_identifier": "First data field is the soil name",
        "indexing_strategy": "Index only the main record line; skip child layer lines"
      }
    },
    "plant.ini": {
      "description": "Plant community initialization",
      "structure": {
        "main_record_format": "Main line with community name and plant count",
        "child_line_format": "Individual plant details",
        "child_line_count_field": "plnt_cnt",
        "indexing_strategy": "Index only the main record line; skip plant detail lines"
      }
    }
  }
}
```

### API Methods

```typescript
// Check if a file is hierarchical
private isHierarchicalFile(fileName: string): boolean

// Get configuration for a hierarchical file
private getHierarchicalFileConfig(fileName: string): HierarchicalFileConfig | null

// Determine if a line is a main record (vs child line)
private isMainRecordLine(valueMap: {[key: string]: string}, fileName: string, headers: string[]): boolean

// Get the number of child lines for a record (if explicitly counted)
private getChildLineCount(valueMap: {[key: string]: string}, config: HierarchicalFileConfig, fileName: string): number
```

### Benefits

1. **Correct Indexing**: Only main records (soils, plant communities) are indexed as FK targets
2. **Performance**: Skipping child lines reduces index size and improves lookup speed
3. **Navigation**: Ctrl+Click on a soil name navigates to the main soil record, not layer data
4. **Diagnostics**: FK validation checks against actual main records, not layer data

### Limitations

- **soils.sol**: Layer count not explicitly stored; detection uses heuristics
- **Decision tables**: Current implementation is conservative (doesn't skip lines)
- **Unknown formats**: New hierarchical files must be added to metadata configuration

## Documentation Sources

The metadata and file purposes are extracted from:
- `docs/EXTENSION_FILE_SCHEMA.md` - Detailed schema with PK/FK information
- `docs/DEPENDENCY_ANALYSIS.md` - Comprehensive dependency analysis
- `docs/FILE_RELATIONSHIPS.md` - Summary relationship tables
- `docs/COMPLETE_DEPENDENCY_MAP.md` - Complete dependency mapping
- `docs/QUICK_REFERENCE.md` - Quick reference diagrams

These documentation files were created from the SWAT+ GitBook documentation and provide authoritative information about file structure and relationships.
