#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional


REPO_ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = REPO_ROOT / "resources" / "schema" / "swatplus-editor-schema.json"
METADATA_PATH = REPO_ROOT / "resources" / "schema" / "txtinout-metadata.json"
OUTPUT_PATH = REPO_ROOT / "docs" / "INPUT_SCHEMA_RELATIONSHIPS.md"


def load_json(path: Path) -> dict:
    return json.loads(path.read_text())


def build_fk_target_label(table_name: str, target_table: str, metadata: dict) -> str:
    table_to_file = metadata.get("table_name_to_file_name", {})
    target_file = table_to_file.get(target_table)
    if target_file:
        return f"{target_table} ({target_file})"
    return target_table


def get_file_description(file_name: str, metadata: dict) -> str:
    file_metadata = metadata.get("file_metadata", {}).get(file_name, {})
    if file_metadata.get("description"):
        return file_metadata["description"].strip()
    file_purpose = metadata.get("file_purposes", {}).get(file_name)
    if file_purpose:
        return file_purpose.strip()
    return "Description not available."


def build_relationship_map(file_name: str, schema_table: dict, metadata: dict) -> Dict[str, dict]:
    rel_map: Dict[str, dict] = {}
    # Schema-based FK relationships
    for column in schema_table.get("columns", []):
        col_name = column.get("name")
        if not col_name:
            continue
        if column.get("is_foreign_key") and column.get("fk_target"):
            rel_map.setdefault(col_name, {})
            rel_map[col_name]["is_fk"] = True
            rel_map[col_name]["fk_target"] = column["fk_target"]["table"]

    # Markdown-derived relationships (FK + file pointers)
    for rel in metadata.get("foreign_key_relationships", {}).get(file_name, {}).get(
        "relationships", []
    ):
        col_name = rel.get("column")
        if not col_name:
            continue
        entry = rel_map.setdefault(col_name, {})
        if rel.get("is_fk"):
            entry["is_fk"] = True
        if rel.get("is_pointer"):
            entry["is_pointer"] = True
        if rel.get("target_file"):
            entry["target_file"] = rel["target_file"]

    # File pointers (explicit)
    for col_name, description in (
        metadata.get("file_pointer_columns", {}).get(file_name, {}).items()
    ):
        if col_name == "description":
            continue
        entry = rel_map.setdefault(col_name, {})
        entry["is_pointer"] = True
        entry.setdefault("pointer_description", description)

    return rel_map


def render_file_section(
    file_name: str, schema_table: dict, metadata: dict
) -> List[str]:
    description = get_file_description(file_name, metadata)
    table_name = schema_table.get("table_name", "")
    rel_map = build_relationship_map(file_name, schema_table, metadata)

    lines: List[str] = []
    lines.append(f"## {file_name}")
    lines.append("")
    lines.append(f"- **Description**: {description}")
    if table_name:
        lines.append(f"- **Table name**: `{table_name}`")
    primary_keys = schema_table.get("primary_keys") or []
    if primary_keys:
        lines.append(f"- **Primary keys**: {', '.join(f'`{pk}`' for pk in primary_keys)}")
    fk_cols = [col for col, rel in rel_map.items() if rel.get("is_fk")]
    fp_cols = [col for col, rel in rel_map.items() if rel.get("is_pointer")]
    lines.append(
        f"- **Relationships**: {len(fk_cols)} FK column(s), {len(fp_cols)} file pointer column(s)"
    )
    lines.append("")
    lines.append("| Column | Type | FK Target | File Pointer | Notes |")
    lines.append("| --- | --- | --- | --- | --- |")

    schema_column_list = schema_table.get("columns", [])
    schema_columns = {col["name"]: col for col in schema_column_list if col.get("name")}
    ordered_columns: List[str] = [col["name"] for col in schema_column_list if col.get("name")]
    for col_name in sorted(set(rel_map) - set(schema_columns)):
        ordered_columns.append(col_name)
    for col_name in ordered_columns:
        col = schema_columns.get(col_name)
        col_type = col.get("type") if col else "Unknown (metadata)"
        rel = rel_map.get(col_name, {})
        fk_target = ""
        if rel.get("is_fk"):
            if rel.get("fk_target"):
                fk_target = build_fk_target_label(file_name, rel["fk_target"], metadata)
            elif rel.get("target_file"):
                fk_target = rel["target_file"]
            else:
                fk_target = "Yes"
        fp_target = ""
        if rel.get("is_pointer") and rel.get("target_file"):
            fp_target = str(rel.get("target_file"))
        notes: List[str] = []
        if rel.get("pointer_description"):
            notes.append(str(rel["pointer_description"]))
        if col and col.get("nullable"):
            notes.append("nullable")
        if col and col.get("is_primary_key"):
            notes.append("primary key")
        lines.append(
            f"| `{col_name}` | {col_type} | {fk_target} | {fp_target} | {'; '.join(notes)} |"
        )
    lines.append("")
    return lines


def main() -> None:
    schema = load_json(SCHEMA_PATH)
    metadata = load_json(METADATA_PATH)

    lines: List[str] = []
    lines.append("# SWAT+ Input Schema Relationships")
    lines.append("")
    lines.append(
        "This document enumerates every tracked SWAT+ input file, its column schema, "
        "and relationship metadata (foreign keys and file pointers)."
    )
    lines.append("")
    lines.append(
        "_Generated by `scripts/generate_input_schema_relationships_doc.py` from the "
        "current schema and metadata JSON files._"
    )
    lines.append("")
    lines.append("## Sources")
    lines.append("")
    lines.append(
        "- `resources/schema/swatplus-editor-schema.json` (database-derived schema)"
    )
    lines.append(
        "- `resources/schema/txtinout-metadata.json` (markdown-derived FK/pointer metadata)"
    )
    lines.append("")
    lines.append("## Legend")
    lines.append("")
    lines.append("- **FK Target**: Target table (and file when known).")
    lines.append("- **File Pointer**: File name referenced by string pointer columns.")
    lines.append("")

    for file_name in sorted(schema.get("tables", {}).keys()):
        lines.extend(render_file_section(file_name, schema["tables"][file_name], metadata))

    OUTPUT_PATH.write_text("\n".join(lines).rstrip() + "\n")


if __name__ == "__main__":
    main()
