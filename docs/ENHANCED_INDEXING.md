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

## Documentation Sources

The metadata and file purposes are extracted from:
- `docs/EXTENSION_FILE_SCHEMA.md` - Detailed schema with PK/FK information
- `docs/DEPENDENCY_ANALYSIS.md` - Comprehensive dependency analysis
- `docs/FILE_RELATIONSHIPS.md` - Summary relationship tables
- `docs/COMPLETE_DEPENDENCY_MAP.md` - Complete dependency mapping
- `docs/QUICK_REFERENCE.md` - Quick reference diagrams

These documentation files were created from the SWAT+ GitBook documentation and provide authoritative information about file structure and relationships.
