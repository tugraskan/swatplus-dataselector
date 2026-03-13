# Dynamic Schema Extraction for SWAT+ Editor

This directory contains scripts to automatically extract schema information from the swatplus-editor repository.

## Overview

The SWAT+ Editor uses Peewee ORM models to define ~197+ model classes for the SWAT+ input file schema. Instead of manually maintaining a hardcoded list of tables, we use **dynamic extraction** to automatically discover all model classes.

## Quick Start

### 1. Clone swatplus-editor

```bash
git clone https://github.com/swat-model/swatplus-editor.git /tmp/swatplus-editor
```

### 2. Run the extraction script

```bash
cd /home/runner/work/swatplus-dataselector/swatplus-dataselector
python3 scripts/extract_all_models.py
```

This will:
- Scan all `.py` files in `swatplus-editor/src/api/database/`
- Extract all Peewee `BaseModel` subclasses
- Generate `resources/schema/swatplus-editor-schema-full.json`

### 3. Check the results

The script outputs statistics:
```
Files scanned: 55
Models found: 256
Tables mapped: 213
```

## Script Options

```bash
python3 scripts/extract_all_models.py --help
```

Options:
- `--editor-path`: Path to swatplus-editor database directory (default: `/tmp/swatplus-editor/src/api/database`)
- `--output`: Output JSON file path (default: `resources/schema/swatplus-editor-schema-full.json`)

### Custom paths

```bash
python3 scripts/extract_all_models.py \
  --editor-path ~/projects/swatplus-editor/src/api/database \
  --output my-schema.json
```

## How It Works

### 1. **Dynamic Discovery**
Instead of hardcoding which files and classes to extract, the script:
- Recursively scans all Python files in `database/project/`, `database/output/`, and `database/datasets/`
- Uses regex to find all classes that inherit from `BaseModel`
- Automatically extracts column definitions, foreign keys, and primary keys

### 2. **Table Name Mapping**
The script intelligently converts table names to TxtInOut filenames:
- Known mappings: `hru_data_hru` → `hru-data.hru`
- Pattern-based: Last part used as extension if 3-4 chars
- Fallback: Replace underscores with dashes

### 3. **Foreign Key Detection**
- Detects `ForeignKeyField` definitions
- Extracts target model references
- Normalizes qualified names (`hydrology.Topography_hyd` → `topography_hyd`)

### 4. **De-duplication**
- Some models appear in multiple directories (datasets vs project)
- Script uses filename as key to prevent duplicates
- Warns when models map to same file

## Output Format

The generated JSON schema includes:

```json
{
  "schema_version": "2.0.0",
  "source": {
    "repo": "swat-model/swatplus-editor",
    "commit": "f8ff21e40d52895ea91028035959f20ca4104405",
    "generated_on": "2025-12-30T19:08:45.123456",
    "extraction_method": "dynamic_recursive_scan"
  },
  "tables": {
    "hru-data.hru": {
      "file_name": "hru-data.hru",
      "table_name": "hru_data_hru",
      "model_class": "project.hru.Hru_data_hru",
      "source_file": "project/hru.py",
      "columns": [...],
      "primary_keys": ["id"],
      "foreign_keys": [...]
    }
  },
  "statistics": {
    "files_scanned": 55,
    "models_found": 256,
    "tables_mapped": 213
  }
}
```

## Updating When SWAT Editor Changes

When the swatplus-editor repository updates:

1. **Pull latest changes**:
   ```bash
   cd /tmp/swatplus-editor
   git pull origin master
   ```

2. **Re-run extraction**:
   ```bash
   cd /home/runner/work/swatplus-dataselector/swatplus-dataselector
   python3 scripts/extract_all_models.py
   ```

3. **Commit the new schema**:
   ```bash
   git add resources/schema/swatplus-editor-schema-full.json
   git commit -m "Update schema from swatplus-editor"
   ```

**No code changes needed!** The script automatically discovers new tables and columns.

## Comparison: Old vs New

### Old Approach (extract_schema_static.py in PR #13)
- ✗ Hardcoded list of 7 files and 13 classes
- ✗ Manual updates required when editor changes
- ✗ Only extracted MVP subset (13 tables)
- ✗ Missed 184+ other model classes

### New Approach (extract_all_models.py)
- ✓ Automatically scans all 55 database files
- ✓ Discovers all 256 model classes
- ✓ Maps 213 unique tables
- ✓ No manual updates needed
- ✓ Future-proof: automatically picks up new models

## Directory Structure

```
scripts/
├── extract_all_models.py      # New: Dynamic extraction (this script)
└── extract_schema_static.py   # Old: MVP only (13 tables, deprecated)

resources/schema/
├── swatplus-editor-schema-full.json   # All 213 tables (full schema)
└── swatplus-editor-schema.json        # All 213 tables (same as -full.json)
```

**Note**: Both schema files contain the complete 213-table schema. The `-full` suffix is kept for clarity, while `swatplus-editor-schema.json` is maintained for backward compatibility with existing code.

## Integration with Extension

The VS Code extension can load the generated schema to:
- Provide autocomplete for SWAT+ file columns
- Validate foreign key references
- Enable "Go to Definition" for FK values
- Display table/column documentation

## Troubleshooting

### "Editor path not found"
Make sure swatplus-editor is cloned:
```bash
git clone https://github.com/swat-model/swatplus-editor.git /tmp/swatplus-editor
```

### "Permission denied"
Make script executable:
```bash
chmod +x scripts/extract_all_models.py
```

### No models found
Check that you're pointing to the database directory, not the root:
```bash
# Wrong
--editor-path /tmp/swatplus-editor

# Correct
--editor-path /tmp/swatplus-editor/src/api/database
```

## Dependencies

- Python 3.6+
- Standard library only (no external dependencies) for schema extraction
- Optional: pandas (see `scripts/requirements.txt`) for the pandas-backed indexing helper

## License

This script is part of the swatplus-dataselector project. See LICENSE for details.

## Pandas-backed indexing helper

The extension uses a pandas-backed indexing system by default for improved performance and maintainability. The pandas indexer handles:

- **Hierarchical files**: soils.sol, plant.ini, management.sch (multi-line records)
- **Decision tables**: *.dtl files with complex condition-action structures
- **FK references**: Automatic detection and tracking including child line references
- **Vectorized filtering**: Fast null value detection using pandas operations

To manually test the indexer:

```bash
pip install -r scripts/requirements.txt
python3 scripts/pandas_indexer.py --dataset /path/to/TxtInOut \
  --schema resources/schema/swatplus-editor-schema.json \
  --metadata resources/schema/txtinout-metadata.json
```

To include generated output/weather data tables (`*.pcp`, `*.tmp`, `*.slr`, `*.hmd`, `*.wnd`), opt in explicitly:

```bash
python3 scripts/pandas_indexer.py --dataset /path/to/TxtInOut \
  --schema resources/schema/swatplus-editor-schema.json \
  --metadata resources/schema/txtinout-metadata.json \
  --include-output-tables
```

This prints a JSON payload containing table rows and foreign key references using the same shape consumed by the VS Code extension.

The extension automatically uses this indexer when building the index. If the pandas indexer is not available (e.g., Python or pandas not installed), the extension falls back to a TypeScript-based indexer.

## Quick DataFrame conversion for output JSON

If your output JSON records are shaped like:

```json
{
  "title": "...",
  "header": ["..."],
  "units": ["..."],
  "data": [["..."], ["..."]]
}
```

(or nested under keys like `outputs`, `tables`, `results`, etc.), convert them to quick DataFrame exports:

```bash
python3 scripts/output_to_dataframes.py --input /path/to/output.json --out-dir workdata/dataframes --format csv
```

Notes:
- `header` / `units` can be arrays or whitespace-delimited strings.
- `data` can be list rows or object rows.
- If `units` are present, exports add a `__row_type` column and prepend a units row.
