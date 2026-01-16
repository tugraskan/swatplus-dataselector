# SWAT+ Input Schema Relationships Guide

This guide explains where the **overall input schema** lives in this repository and how to trace **file relationships** (foreign keys and file pointers) across SWAT+ TxtInOut files. It is intended as a single starting point for understanding and auditing how input files connect to each other.

## What this covers

Use this guide when you need to:

- Identify **foreign key (FK)** relationships between SWAT+ input files.
- Track **file pointer** columns (string references to other files).
- Understand **where relationship data is sourced** and how it is updated.

## Key relationship sources (authoritative)

These files collectively describe the full relationship map:

1. **Database-derived schema** (FKs from swatplus-editor models)
   - `resources/schema/swatplus-editor-schema.json`
   - Contains table definitions and FK targets based on Peewee ORM models.

2. **Markdown-derived metadata** (file pointers + additional FKs)
   - `resources/schema/txtinout-metadata.json`
   - Adds file pointer columns and FK relationships parsed from SWAT+ docs.

3. **Human-readable per-file schema**
   - `docs/EXTENSION_FILE_SCHEMA.md`
   - Lists each input file with columns, types, and reference targets.

4. **Repository-wide dependency analysis**
   - `docs/DEPENDENCY_ANALYSIS.md`
   - Consolidated relationship summary and analysis.

## Relationship types

### Foreign Keys (FKs)

FKs are references that point to a target table/file. They come from two sources:

- **Schema FKs**: extracted from the swatplus-editor database models.
- **Markdown FKs**: extracted from SWAT+ documentation tables that explicitly mark FK columns.

Both are merged into `txtinout-metadata.json`, which the extension uses to resolve FK targets.

### File Pointers

File pointers are string references to another input file (often named like `*.hru`, `*.sol`, etc.).
These are not always modeled as database FKs, so they are tracked separately in the markdown-derived metadata.

The `txtinout-metadata.json` file contains a `file_pointers` section for these relationships.

## How to follow a relationship

1. **Start with a file** (e.g., `hru-data.hru`).
2. Look in **`docs/EXTENSION_FILE_SCHEMA.md`** to identify FK or pointer columns.
3. Confirm FK targets in **`resources/schema/swatplus-editor-schema.json`**.
4. Confirm file pointer targets in **`resources/schema/txtinout-metadata.json`**.
5. For a broad summary, check **`docs/DEPENDENCY_ANALYSIS.md`**.

## How to regenerate relationship metadata

If documentation or schema sources change, refresh the derived metadata using the scripts below:

```bash
python scripts/parse_schema_md.py
python scripts/merge_schema_metadata.py
python scripts/test_enhanced_schema.py
```

These scripts parse the markdown schema tables and merge them into the JSON metadata used by the extension.

## Related documentation

- `docs/SCHEMA_ENHANCEMENT.md` — details how markdown-derived relationship data is extracted.
- `docs/METADATA_USAGE.md` — explains how relationship metadata is used in the extension.
- `docs/schema-source.md` — describes how the schema JSON is generated.
