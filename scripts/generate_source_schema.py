#!/usr/bin/env python3
"""
Generate a TxtInOut source schema JSON from INPUT_FILES_STRUCTURE.md.

Parses the markdown documentation describing each SWAT+ TxtInOut file
(column names, types, PKs, FKs, metadata structure) and produces a JSON
file in the same format as swatplus-editor-schema.json so the two can be
directly cross-walked.

Output: resources/schema/txtinout-source-schema.json
"""

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Type mapping: TxtInOut / Fortran type → Peewee-style ORM type name
# ---------------------------------------------------------------------------
TYPE_MAP = {
    "integer": "IntegerField",
    "int":     "IntegerField",
    "real":    "DoubleField",
    "string":  "CharField",
    "char":    "CharField",
    "character": "CharField",
    "double":  "DoubleField",
    "float":   "FloatField",
    "boolean": "BooleanField",
    "bool":    "BooleanField",
}

# Category headings that are not real file names
CATEGORY_HEADERS = {
    "Aquifers", "Basin", "Calibration", "Channels", "Climate",
    "Connectivity", "Constituents", "Databases", "Hydrologic Response Units",
    "Hydrology", "Landscape Units", "Landuse And Management",
    "Management Practices", "Nutrient Initialization", "Point Sources And Inlets",
    "Reservoirs", "Routing Units", "Simulation Settings", "Soils",
    "Structural Practices", "Water Allocation", "Wetlands", "Basin 1",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def map_type(src_type: str, is_pk: bool, is_fk: bool, is_pointer: bool) -> str:
    """Return an ORM-style type string for a source column."""
    if is_pk and src_type.lower() == "integer":
        return "AutoField"
    if is_fk or is_pointer:
        return "ForeignKeyField"
    return TYPE_MAP.get(src_type.lower().strip(), "CharField")


def parse_metadata_structure(meta_str: str) -> Tuple[bool, bool, int]:
    """
    Derive has_metadata_line, has_header_line, data_starts_after from the
    free-text "Metadata Structure" field found in INPUT_FILES_STRUCTURE.md.

    Standard format: "Standard (Line 1: Title, Line 2: Header, Line 3+: Data)"
      → has_metadata_line=True, has_header_line=True, data_starts_after=2

    Non-standard descriptions are parsed with best-effort heuristics.
    """
    meta_lower = meta_str.lower()

    if "standard" in meta_lower:
        return True, True, 2

    # Try to detect header line presence
    has_header = "header" in meta_lower

    # Try to find 'data starts' / 'line N' pattern
    data_after = 2  # default
    m = re.search(r"line\s+(\d+)[^:]*:?\s*data", meta_lower)
    if m:
        data_after = int(m.group(1)) - 1  # data_starts_after = last non-data line number

    has_meta = "title" in meta_lower or "description" in meta_lower

    return has_meta, has_header, data_after


def parse_markdown_table(lines: List[str], start_idx: int) -> Tuple[List[Dict[str, str]], int]:
    """Return (rows, next_index) for the markdown table beginning at start_idx."""
    # Advance to the first pipe character
    header_idx = start_idx
    while header_idx < len(lines) and not lines[header_idx].strip().startswith("|"):
        header_idx += 1

    if header_idx >= len(lines):
        return [], start_idx

    headers = [h.strip() for h in lines[header_idx].strip().split("|")[1:-1]]

    rows: List[Dict[str, str]] = []
    current_idx = header_idx + 2  # skip header and separator
    while current_idx < len(lines):
        line = lines[current_idx].strip()
        if not line.startswith("|"):
            break
        values = [v.strip() for v in line.split("|")[1:-1]]
        if len(values) == len(headers):
            rows.append(dict(zip(headers, values)))
        current_idx += 1

    return rows, current_idx


# ---------------------------------------------------------------------------
# Core parser
# ---------------------------------------------------------------------------

def parse_input_files_structure(md_path: Path) -> Dict[str, dict]:
    """
    Parse INPUT_FILES_STRUCTURE.md and return a dict keyed by file_name.

    Each value is a dict compatible with the swatplus-editor-schema.json
    "tables" entry format.
    """
    with open(md_path, encoding="utf-8") as fh:
        content = fh.read()

    lines = content.split("\n")
    tables: Dict[str, dict] = {}

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        if not line.startswith("###"):
            i += 1
            continue

        file_header = line[3:].strip()

        # Skip section category headers
        if file_header in CATEGORY_HEADERS:
            i += 1
            continue

        # Gather description / metadata structure from the next few lines
        description = ""
        special_structure = False
        metadata_structure = "Standard (Line 1: Title, Line 2: Header, Line 3+: Data)"
        table_start = -1

        j = i + 1
        while j < min(i + 20, len(lines)):
            nline = lines[j].strip()

            if nline.startswith("**⚠️ SPECIAL STRUCTURE**"):
                special_structure = True
            elif nline.startswith("**Description:**"):
                description = nline.replace("**Description:**", "").strip()
            elif nline.startswith("**Metadata Structure:**"):
                metadata_structure = nline.replace("**Metadata Structure:**", "").strip()
            elif nline.startswith("| Column Order"):
                table_start = j
                break
            elif nline.startswith("###"):
                # Next file section started before we found a table
                break

            j += 1

        if table_start == -1:
            i = j
            continue

        rows, end_idx = parse_markdown_table(lines, table_start)

        if not rows:
            i = end_idx
            continue

        # Build column list
        columns: List[dict] = []
        primary_keys: List[str] = []
        foreign_keys: List[dict] = []

        for row in rows:
            try:
                col_order = int(row.get("Column Order", "0"))
            except ValueError:
                continue

            field_name = row.get("Field", "").strip()
            # Remove zero-width spaces that sometimes appear in the markdown
            field_name = field_name.replace("\u200b", "").strip()
            if not field_name:
                continue

            src_type = row.get("Type", "").strip().lower()
            # Strip zero-width spaces and other invisible unicode characters,
            # keeping printable non-whitespace characters and regular spaces.
            src_type = "".join(ch for ch in src_type if ch.isprintable() and (not ch.isspace() or ch == " "))
            src_type = src_type.strip()
            is_pk = row.get("PK", "").strip() == "✓"
            is_fk = row.get("FK", "").strip() == "✓"
            is_pointer = row.get("Pointer", "").strip() == "✓"
            points_to = row.get("Points To", "").strip()

            orm_type = map_type(src_type, is_pk, is_fk, is_pointer)

            col = {
                "name": field_name,
                "db_column": field_name,
                "column_order": col_order,
                "type": orm_type,
                "source_type": src_type if src_type else "unknown",
                "nullable": not is_pk,
                "is_primary_key": is_pk,
                "is_foreign_key": is_fk or is_pointer,
                "description": row.get("Description", "").strip(),
                "unit": row.get("Unit", "").strip(),
                "default": row.get("Default", "").strip(),
                "range": row.get("Range", "").strip(),
            }

            if is_fk or is_pointer:
                col["fk_target"] = {
                    "file": points_to if points_to else "",
                    "column": "name",
                }
                if points_to:
                    fk_table = points_to.replace("-", "_").replace(".", "_")
                    foreign_keys.append({
                        "column": field_name,
                        "db_column": field_name,
                        "references": {
                            "file": points_to,
                            "table": fk_table,
                            "column": "name",
                        },
                    })

            if is_pk:
                primary_keys.append(field_name)

            columns.append(col)

        if not columns:
            i = end_idx
            continue

        # Determine structure metadata
        has_meta, has_header, data_after = parse_metadata_structure(metadata_structure)

        # Convert file name to table name (replace - and . with _)
        table_name = re.sub(r"[-.]", "_", file_header)

        tables[file_header] = {
            "file_name": file_header,
            "table_name": table_name,
            "description": description,
            "has_metadata_line": has_meta,
            "has_header_line": has_header,
            "data_starts_after": data_after,
            "special_structure": special_structure,
            "metadata_structure_raw": metadata_structure,
            "columns": columns,
            "primary_keys": primary_keys,
            "foreign_keys": foreign_keys,
        }

        i = end_idx

    return tables


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> int:
    script_dir = Path(__file__).parent
    repo_root = script_dir.parent

    md_path = repo_root / "docs" / "schema" / "INPUT_FILES_STRUCTURE.md"
    if not md_path.exists():
        print(f"ERROR: {md_path} not found")
        return 1

    print(f"Parsing {md_path} …")
    tables = parse_input_files_structure(md_path)
    print(f"  → {len(tables)} files parsed")

    output = {
        "schema_version": "1.0.0",
        "source": {
            "document": "docs/schema/INPUT_FILES_STRUCTURE.md",
            "generated_on": datetime.now(timezone.utc).isoformat(),
            "extraction_method": "markdown_parse",
        },
        "tables": tables,
    }

    out_path = repo_root / "resources" / "schema" / "txtinout-source-schema.json"
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(output, fh, indent=2, ensure_ascii=False)

    print(f"Written → {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
