# Schema Enhancement from Markdown Documentation

This document describes the enhancement to the SWAT+ DataSelector schema that incorporates information from the markdown documentation files.

## Overview

The SWAT+ DataSelector extension uses a JSON schema (`swatplus-editor-schema.json`) extracted from the SWAT+ Editor database models. However, additional valuable information about foreign key relationships and file pointers exists in the markdown documentation:

- `docs/schema/INPUT_FILES_STRUCTURE.md` - Comprehensive documentation from SWAT+ GitBooks
- `docs/schema/SWAT_INPUT_FILE_STRUCTURE.md` - Documentation from SWAT+ Editor database models

This enhancement extracts and integrates that information to provide:
1. **Better FK detection** - Additional foreign key relationships not captured in the database schema
2. **File pointer identification** - Clear distinction between columns that reference file names vs. columns that reference table rows
3. **Enhanced metadata** - File descriptions, primary keys, and special structure indicators

## Architecture

### Components

1. **`parse_schema_md.py`** - Parses markdown tables to extract:
   - Column information (name, type, description)
   - FK relationships (marked with ✓ in FK column)
   - File pointers (marked with ✓ in Pointer column)
   - Primary keys (marked with ✓ in PK column)
   - Special structure indicators

2. **`merge_schema_metadata.py`** - Merges extracted information into `txtinout-metadata.json`:
   - Combines markdown-derived and existing metadata
   - Creates comprehensive file pointer column mappings
   - Adds FK relationships section
   - Preserves backward compatibility

3. **Enhanced Pandas Indexer** - `pandas_indexer.py` updated to:
   - Use file pointer column information to skip non-FK columns
   - Process markdown-derived FK relationships
   - Mark FK references by source (schema vs. markdown)

### Data Flow

```
docs/schema/*.md
       ↓
parse_schema_md.py
       ↓
enhanced-schema-from-markdown.json
       ↓
merge_schema_metadata.py
       ↓
txtinout-metadata.json (enhanced)
       ↓
pandas_indexer.py (uses enhanced metadata)
       ↓
Better FK detection and indexing
```

## Enhanced Metadata Structure

The enhanced `txtinout-metadata.json` now includes:

### 1. Foreign Key Relationships

```json
{
  "foreign_key_relationships": {
    "aquifer.aqu": {
      "description": "Foreign key relationships for aquifer.aqu",
      "relationships": [
        {
          "column": "aqu_init",
          "is_fk": true,
          "is_pointer": true,
          "target_file": "initial.aqu",
          "description": "Pointer to the aquifer initialization file"
        }
      ]
    }
  }
}
```

### 2. File Pointer Columns

```json
{
  "file_pointer_columns": {
    "hru-data.hru": {
      "description": "File pointer columns for hru-data.hru",
      "topo": "Points to topography.hyd",
      "hydro": "Points to hydrology.hyd",
      "soil": "Points to soils.sol",
      "lu_mgt": "Points to landuse.lum"
    }
  }
}
```

### 3. File Metadata

```json
{
  "file_metadata": {
    "aquifer.aqu": {
      "description": "This file contains the general physical and chemical aquifer properties.",
      "metadata_structure": "Standard (Line 1: Title, Line 2: Header, Line 3+: Data)",
      "special_structure": false,
      "primary_keys": ["id"]
    },
    "soils.sol": {
      "description": "This file contains the physical soil properties.",
      "metadata_structure": "Standard (Line 1: Title, Line 2: Header, Line 3+: Data)",
      "special_structure": true,
      "primary_keys": ["name"]
    }
  }
}
```

## Benefits

1. **More Complete FK Detection**
   - Captures FK relationships documented in markdown but not in database schema
   - Properly identifies file pointer columns vs. FK columns
   - Prevents false FK references for file name columns

2. **Better User Experience**
   - More accurate "Go to Definition" navigation
   - Fewer false FK diagnostics
   - Better hover information

3. **Maintainability**
   - Markdown documentation serves as authoritative source
   - Automated extraction reduces manual schema maintenance
   - Easy to update when documentation changes

## Usage

### Regenerating Enhanced Schema

To regenerate the enhanced schema from updated markdown documentation:

```bash
# 1. Parse markdown documentation
python scripts/parse_schema_md.py

# 2. Merge with existing metadata
python scripts/merge_schema_metadata.py

# 3. Test the enhanced schema
python scripts/test_enhanced_schema.py
```

### Manual Updates

If you need to manually update the schema:

1. Edit `docs/schema/INPUT_FILES_STRUCTURE.md` or `SWAT_INPUT_FILE_STRUCTURE.md`
2. Run the regeneration scripts above
3. The pandas indexer will automatically use the enhanced metadata

## Testing

Run the test suite to verify the enhanced schema:

```bash
python scripts/test_enhanced_schema.py
```

Expected output:
```
Running enhanced schema tests...

Enhanced schema file exists: PASS
Enhanced metadata structure: PASS
FK relationships populated: PASS
File pointer columns populated: PASS
File metadata populated: PASS
Special structure detection: PASS

Test Results: 6/6 passed
✓ All tests passed!
```

## Backward Compatibility

The enhancement is fully backward compatible:

- Existing schema-based FK detection continues to work
- Markdown-derived FKs are additive (don't replace schema FKs)
- File pointer detection gracefully handles missing metadata
- All existing functionality preserved

## Future Enhancements

Possible future improvements:

1. **Validation** - Cross-validate markdown documentation against actual TxtInOut files
2. **Auto-generation** - Generate parts of markdown documentation from database schema
3. **Type inference** - Use markdown type information to validate data values
4. **Range checking** - Use documented value ranges for validation
5. **Unit support** - Display units in hover information

## Files Modified

- `resources/schema/txtinout-metadata.json` - Enhanced with markdown-derived information
- `resources/schema/enhanced-schema-from-markdown.json` - Generated from markdown
- `scripts/pandas_indexer.py` - Updated to use markdown-derived FK relationships
- `scripts/parse_schema_md.py` - New parser for markdown documentation
- `scripts/merge_schema_metadata.py` - New merger for metadata
- `scripts/test_enhanced_schema.py` - New test suite

## Statistics

From the current enhancement:

- **69 files** with extracted metadata
- **13 files** with FK relationship information
- **20 files** with file pointer column information
- **4 files** marked with special structure indicators

## References

- [INPUT_FILES_STRUCTURE.md](../../docs/schema/INPUT_FILES_STRUCTURE.md) - GitBooks documentation
- [SWAT_INPUT_FILE_STRUCTURE.md](../../docs/schema/SWAT_INPUT_FILE_STRUCTURE.md) - Database model documentation
- [swatplus-editor-schema.json](../../resources/schema/swatplus-editor-schema.json) - Database-derived schema
