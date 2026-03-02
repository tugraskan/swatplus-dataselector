# SWAT+ Editor Schema Source

This document explains how the SWAT+ input file schema was derived from the swatplus-editor project.

## Schema Source

- **Repository**: https://github.com/swat-model/swatplus-editor
- **Commit**: `f8ff21e40d52895ea91028035959f20ca4104405`
- **Schema File**: `resources/schema/swatplus-editor-schema.json`
- **Generated**: 2025-12-30

## Schema Extraction Process

The schema was extracted from Peewee ORM models located in the swatplus-editor repository at `src/api/database/project/`.

### Models Analyzed

The schema extraction script analyzed 31 Python model files containing approximately 197 Peewee model classes. For the MVP (Minimum Viable Product) release, we focused on 13 core tables representing the HRU-centric workflow:

1. **HRU Tables** (2 files):
   - `hru-data.hru` - HRU data with foreign key references
   - `hru-lte.hru` - HRU low-time-efficiency parameters

2. **Hydrology Tables** (3 files):
   - `topography.hyd` - Topography parameters
   - `hydrology.hyd` - Hydrology parameters
   - `field.fld` - Field parameters

3. **Soils Tables** (2 files):
   - `soils.sol` - Soil definitions
   - `soils-lte.sol` - Low-time-efficiency soil parameters

4. **Land Use Tables** (2 files):
   - `landuse.lum` - Land use management
   - `management.sch` - Management schedules

5. **Initialization Tables** (1 file):
   - `soil-plant.ini` - Soil and plant initialization

6. **Parameter Database Tables** (2 files):
   - `snow.sno` - Snow parameters
   - `plants.plt` - Plant parameters

7. **Decision Table** (1 file):
   - `d_table.dtl` - Decision table details

### Extraction Methodology

The extraction was performed using static Python code analysis to avoid dependency issues:

1. **Parse Model Files**: Used regex patterns to extract class definitions, field definitions, and metadata
2. **Identify Foreign Keys**: Detected `ForeignKeyField` declarations and extracted target models
3. **Map Table Names**: Converted Peewee model class names (CamelCase) to database table names (snake_case)
4. **Map to TxtInOut Files**: Converted database table names to SWAT+ TxtInOut filenames using known conventions

### Table Name → Filename Mapping

The swatplus-editor uses the following naming conventions:

- Database tables use snake_case (e.g., `hru_data_hru`)
- TxtInOut filenames use kebab-case with extensions (e.g., `hru-data.hru`)
- Extension typically matches the last part of the table name after the final underscore
- Known mappings were hard-coded for accuracy

### Foreign Key Relationships

Foreign keys were extracted from Peewee `ForeignKeyField` declarations:

```python
# Example from hru.py
topo = ForeignKeyField(hydrology.Topography_hyd, null=True, on_delete='SET NULL')
```

This translates to:
- Column: `topo`
- DB Column: `topo_id` (Peewee convention)
- References: `topography_hyd.id`

### File Header Conventions

Based on analysis of the `fileio/` modules in swatplus-editor:

- **Metadata Line** (Line 1): File description, version, and SWAT+ revision
- **Header Line** (Line 2): Column names, space-separated
- **Data Lines** (Line 3+): Actual data rows

Example from `fileio/hru.py`:
```python
file.write(self.get_meta_line())  # Line 1: metadata
file.write(utils.string_pad("name", direction="left"))  # Line 2: headers
file.write(utils.string_pad("topo"))
# ... more headers
file.write("\n")
# ... data rows start
```

## How to Update the Schema

To regenerate the schema with updated models or additional tables:

1. **Clone/Update swatplus-editor**:
   ```bash
   cd /tmp
   git clone https://github.com/swat-model/swatplus-editor.git
   # OR
   cd /tmp/swatplus-editor && git pull
   ```

2. **Run the extraction script**:
   ```bash
   # The extraction script is located in the repository
   # It was used during initial generation but can be reused
   python3 scripts/extract_schema_static.py
   ```

3. **Update the MVP table list** in the script if needed:
   - Edit the `mvp_files` list in `extract_schema_static.py`
   - Add new `(filename, [ClassNames])` tuples
   - Run the script again

4. **Verify the schema**:
   - Check `resources/schema/swatplus-editor-schema.json`
   - Ensure all expected tables are present
   - Verify foreign key relationships are correct

5. **Test with the extension**:
   - Build the VS Code extension
   - Test indexing with a real SWAT+ dataset
   - Verify FK navigation works correctly

## Schema Format

The schema JSON has the following structure:

```json
{
  "schema_version": "1.0.0",
  "source": {
    "repo": "swat-model/swatplus-editor",
    "commit": "<git-commit-hash>",
    "generated_on": "<ISO-datetime>"
  },
  "tables": {
    "<filename>": {
      "file_name": "<filename>",
      "table_name": "<db-table-name>",
      "model_class": "<module>.<ClassName>",
      "has_metadata_line": true|false,
      "has_header_line": true|false,
      "data_starts_after": <line-number>,
      "columns": [
        {
          "name": "<field-name>",
          "db_column": "<db-column-name>",
          "type": "<FieldType>",
          "nullable": true|false,
          "is_primary_key": true|false,
          "is_foreign_key": true|false,
          "fk_target": {
            "table": "<target-table>",
            "column": "<target-column>"
          }
        }
      ],
      "primary_keys": ["<pk-field-names>"],
      "foreign_keys": [
        {
          "column": "<fk-field>",
          "db_column": "<db-fk-column>",
          "references": {
            "table": "<target-table>",
            "column": "<target-column>"
          }
        }
      ],
      "notes": "..."
    }
  }
}
```

## References

- [SWAT+ Editor Documentation](https://swatpluseditor.readthedocs.io/)
- [Peewee ORM Foreign Keys](http://docs.peewee-orm.com/en/latest/peewee/models.html#foreignkeyfield)
- [SWAT+ File I/O Design](https://swatpluseditor.readthedocs.io/en/latest/design/)
