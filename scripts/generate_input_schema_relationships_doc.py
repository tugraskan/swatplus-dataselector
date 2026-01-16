#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple


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


def get_txtinout_key_column(schema_table: dict, metadata: dict) -> Optional[str]:
    default_key = metadata.get("txtinout_fk_behavior", {}).get("default_target_column")
    if not default_key:
        return None
    for column in schema_table.get("columns", []):
        if column.get("name") == default_key:
            return default_key
    return None


def get_target_key_column(target_file: str, schema: dict, metadata: dict) -> str:
    default_key = metadata.get("txtinout_fk_behavior", {}).get("default_target_column")
    if target_file in schema.get("tables", {}):
        txt_key = get_txtinout_key_column(schema["tables"][target_file], metadata)
        if txt_key:
            return txt_key
    if default_key:
        return default_key
    return "id"


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
    file_name: str,
    schema_table: dict,
    metadata: dict,
    schema: dict,
    reverse_relationships: Dict[str, List[dict]],
) -> List[str]:
    description = get_file_description(file_name, metadata)
    table_name = schema_table.get("table_name", "")
    rel_map = build_relationship_map(file_name, schema_table, metadata)
    txtinout_key = get_txtinout_key_column(schema_table, metadata)

    lines: List[str] = []
    lines.append(f"## {file_name}")
    lines.append("")
    lines.append(f"- **Description**: {description}")
    if table_name:
        lines.append(f"- **Table name**: `{table_name}`")
    primary_keys = schema_table.get("primary_keys") or []
    if primary_keys:
        lines.append(f"- **Primary keys**: {', '.join(f'`{pk}`' for pk in primary_keys)}")
    if txtinout_key:
        lines.append(f"- **TxtInOut key**: `{txtinout_key}`")
    fk_cols = [col for col, rel in rel_map.items() if rel.get("is_fk")]
    fp_cols = [col for col, rel in rel_map.items() if rel.get("is_pointer")]
    lines.append(
        f"- **Relationships**: {len(fk_cols)} FK column(s), {len(fp_cols)} file pointer column(s)"
    )
    lines.append("")
    lines.append("| Column | Type | Key / References | FK Target | File Pointer | Notes |")
    lines.append("| --- | --- | --- | --- | --- | --- |")

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
        key_refs = ""
        if col and col.get("is_primary_key"):
            key_refs = "PK"
        if txtinout_key and col_name == txtinout_key:
            key_refs = "Key"
        if rel.get("is_fk") or rel.get("is_pointer"):
            target_file = rel.get("target_file")
            if not target_file and rel.get("fk_target"):
                target_file = metadata.get("table_name_to_file_name", {}).get(
                    rel["fk_target"]
                )
            if target_file:
                target_key = get_target_key_column(target_file, schema, metadata)
                relationship_label = "FK" if rel.get("is_fk") else "File Pointer"
                key_refs = f"{relationship_label} → {target_file}.{target_key}"
        notes: List[str] = []
        pointer_description = rel.get("pointer_description")
        if isinstance(pointer_description, dict):
            pointer_description = pointer_description.get("description")
        if pointer_description:
            notes.append(str(pointer_description))
        if col and col.get("nullable"):
            notes.append("nullable")
        if col and col.get("is_primary_key"):
            notes.append("primary key")
        if col and col.get("type") == "AutoField":
            notes.append("schema-only (not in raw file)")
        lines.append(
            f"| `{col_name}` | {col_type} | {key_refs} | {fk_target} | {fp_target} | {'; '.join(notes)} |"
        )
    lines.append("")
    relationship_entries: List[str] = []
    for col_name in ordered_columns:
        rel = rel_map.get(col_name, {})
        if not (rel.get("is_fk") or rel.get("is_pointer")):
            continue
        target_file = rel.get("target_file")
        if not target_file and rel.get("fk_target"):
            target_file = metadata.get("table_name_to_file_name", {}).get(rel["fk_target"])
        if not target_file:
            continue
        target_key = get_target_key_column(target_file, schema, metadata)
        rel_type = "FK" if rel.get("is_fk") else "File Pointer"
        cardinality = "many-to-one"
        constraint = "optional"
        col = schema_columns.get(col_name)
        if col and not col.get("nullable"):
            constraint = "required"
        relationship_entries.append(
            f"- `{file_name}.{col_name}` (many) {rel_type} → `{target_file}.{target_key}` (one) "
            f"(cardinality: {cardinality}, constraint: {constraint})"
        )
    if relationship_entries:
        lines.append("**Relationships**")
        lines.append("")
        lines.extend(relationship_entries)
        lines.append("")
    reverse_entries = reverse_relationships.get(file_name, [])
    if reverse_entries:
        lines.append("**Referenced by**")
        lines.append("")
        lines.append("| Source file | Column | Relationship |")
        lines.append("| --- | --- | --- |")
        for entry in reverse_entries:
            lines.append(
                f"| `{entry['source_file']}` | `{entry['column']}` | {entry['relationship']} |"
            )
        lines.append("")
    return lines


def main() -> None:
    schema = load_json(SCHEMA_PATH)
    metadata = load_json(METADATA_PATH)
    input_files = set()
    for files in metadata.get("file_categories", {}).values():
        input_files.update(files)
    reverse_relationships: Dict[str, Dict[Tuple[str, str], set]] = {}

    table_to_file = metadata.get("table_name_to_file_name", {})
    for file_name, table in schema.get("tables", {}).items():
        for column in table.get("columns", []):
            if column.get("is_foreign_key") and column.get("fk_target"):
                target_table = column["fk_target"].get("table")
                target_file = table_to_file.get(target_table)
                if not target_file:
                    continue
                key = (file_name, column.get("name", ""))
                reverse_relationships.setdefault(target_file, {}).setdefault(
                    key, set()
                ).add("FK")

    for file_name, rel_block in metadata.get("foreign_key_relationships", {}).items():
        for rel in rel_block.get("relationships", []):
            if not rel.get("target_file"):
                continue
            if not rel.get("column"):
                continue
            relationship_types: List[str] = []
            if rel.get("is_fk"):
                relationship_types.append("FK")
            if rel.get("is_pointer"):
                relationship_types.append("File Pointer")
            if not relationship_types:
                continue
            key = (file_name, rel["column"])
            reverse_relationships.setdefault(rel["target_file"], {}).setdefault(
                key, set()
            ).update(relationship_types)

    reverse_relationship_list: Dict[str, List[dict]] = {}
    for target_file, entries in reverse_relationships.items():
        deduped: List[dict] = []
        for (source_file, column), relationships in entries.items():
            deduped.append(
                {
                    "source_file": source_file,
                    "column": column,
                    "relationship": ", ".join(sorted(relationships)),
                }
            )
        deduped.sort(key=lambda item: (item["source_file"], item["column"]))
        reverse_relationship_list[target_file] = deduped

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
        if file_name not in input_files:
            continue
        lines.extend(
            render_file_section(
                file_name,
                schema["tables"][file_name],
                metadata,
                schema,
                reverse_relationship_list,
            )
        )

    OUTPUT_PATH.write_text("\n".join(lines).rstrip() + "\n")


if __name__ == "__main__":
    main()
