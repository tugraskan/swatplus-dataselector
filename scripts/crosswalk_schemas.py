#!/usr/bin/env python3
"""
Cross-walk the TxtInOut source schema vs. the SWAT+ Editor schema.

Compares:
  resources/schema/txtinout-source-schema.json  (generated from INPUT_FILES_STRUCTURE.md)
  resources/schema/swatplus-editor-schema.json  (generated from swatplus-editor Peewee models)

Issues are classified into three severity tiers:

  MAJOR     – File format / structure differences that could break parsing:
               • data_starts_after differs
               • has_header_line or has_metadata_line differs
               • Column count differs by more than ±1

  POTENTIAL – Data-type changes that may silently corrupt values:
               • A "real" or "integer" column maps to CharField in the editor
               • An "integer" column maps to DoubleField (precision loss)
               • Any type change that is NOT a compatible widening
                 (e.g. real→DoubleField IS compatible; integer→CharField is NOT)

  MINOR     – Name mismatches at the same column position
               (may be a genuine rename OR just a documentation / DB naming difference)

Output: resources/schema/schema-crosswalk.json
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Compatible type pairs: (source_orm_type, editor_orm_type)
# If the pair is in this set the type change is considered compatible (no issue).
# ---------------------------------------------------------------------------
COMPATIBLE_TYPES = {
    ("AutoField",    "AutoField"),
    ("IntegerField", "AutoField"),       # id col often AutoField in editor
    ("AutoField",    "IntegerField"),
    ("IntegerField", "IntegerField"),
    ("DoubleField",  "DoubleField"),
    ("FloatField",   "DoubleField"),
    ("DoubleField",  "FloatField"),
    ("FloatField",   "FloatField"),
    ("CharField",    "CharField"),
    ("CharField",    "TextField"),
    ("TextField",    "CharField"),
    ("ForeignKeyField", "ForeignKeyField"),
    ("ForeignKeyField", "CharField"),   # editor sometimes stores FK name as char
    ("CharField",    "ForeignKeyField"),# pointer col may be FK in editor
    ("BooleanField", "BooleanField"),
    ("IntegerField", "BooleanField"),   # 0/1 integer used as bool
}

# Type changes that are definitively incompatible (POTENTIAL issue)
# key = (source_orm_type, editor_orm_type)
INCOMPATIBLE_TYPES = {
    ("IntegerField",  "CharField"),
    ("IntegerField",  "TextField"),
    ("DoubleField",   "CharField"),
    ("DoubleField",   "TextField"),
    ("FloatField",    "CharField"),
    ("FloatField",    "TextField"),
    ("CharField",     "IntegerField"),
    ("CharField",     "DoubleField"),
    ("CharField",     "FloatField"),
    ("IntegerField",  "DoubleField"),   # may cause silent precision issues
    ("DoubleField",   "IntegerField"),  # truncation
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_json(path: Path) -> dict:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def col_by_name(columns: List[dict]) -> Dict[str, dict]:
    return {c["name"]: c for c in columns}


def col_by_position(columns: List[dict]) -> Dict[int, dict]:
    result: Dict[int, dict] = {}
    for idx, col in enumerate(columns):
        pos = col.get("column_order", idx + 1)
        result[pos] = col
    return result


def classify_type_change(src_type: str, ed_type: str) -> Optional[str]:
    """
    Return 'incompatible', 'compatible', or None if types match.
    """
    if src_type == ed_type:
        return None
    if (src_type, ed_type) in COMPATIBLE_TYPES:
        return "compatible"
    if (src_type, ed_type) in INCOMPATIBLE_TYPES:
        return "incompatible"
    # Unknown combination — flag as potential
    return "unknown"


# ---------------------------------------------------------------------------
# Per-file comparison
# ---------------------------------------------------------------------------

def compare_file(
    file_name: str,
    src_table: dict,
    ed_table: Optional[dict],
) -> dict:
    """
    Compare a single file's source entry against the editor entry.
    Returns a structured result dict.
    """
    result: dict = {
        "file_name": file_name,
        "in_source": True,
        "in_editor": ed_table is not None,
        "severity": "ok",          # will be upgraded below
        "structure_changes": [],   # MAJOR
        "type_changes": [],        # POTENTIAL
        "name_mismatches": [],     # MINOR
        "missing_in_editor": [],   # columns present in source but absent in editor (by name)
        "extra_in_editor": [],     # columns present in editor but absent in source (by name)
        # Columns unaccounted for even after reconciling positional name mismatches:
        "unmatched_source_cols": [],
        "unmatched_editor_cols": [],
        "notes": [],
    }

    if ed_table is None:
        result["severity"] = "info"
        result["notes"].append("File exists in source schema but not in editor schema.")
        return result

    src_cols = src_table.get("columns", [])
    ed_cols  = ed_table.get("columns", [])

    # -----------------------------------------------------------------------
    # 1. Structure / format checks  →  MAJOR
    # -----------------------------------------------------------------------

    # data_starts_after
    src_dsa = src_table.get("data_starts_after", 2)
    ed_dsa  = ed_table.get("data_starts_after", 2)
    if src_dsa != ed_dsa:
        result["structure_changes"].append({
            "field": "data_starts_after",
            "source_value": src_dsa,
            "editor_value": ed_dsa,
            "impact": "File data offset differs — reader may misalign rows.",
        })

    # has_header_line
    src_hhl = src_table.get("has_header_line", True)
    ed_hhl  = ed_table.get("has_header_line", True)
    if src_hhl != ed_hhl:
        result["structure_changes"].append({
            "field": "has_header_line",
            "source_value": src_hhl,
            "editor_value": ed_hhl,
            "impact": "Header line presence differs — column mapping may break.",
        })

    # has_metadata_line
    src_hml = src_table.get("has_metadata_line", True)
    ed_hml  = ed_table.get("has_metadata_line", True)
    if src_hml != ed_hml:
        result["structure_changes"].append({
            "field": "has_metadata_line",
            "source_value": src_hml,
            "editor_value": ed_hml,
            "impact": "Metadata / title line presence differs.",
        })

    # Column count
    src_n = len(src_cols)
    ed_n  = len(ed_cols)
    delta = abs(src_n - ed_n)
    if delta > 1:
        result["structure_changes"].append({
            "field": "column_count",
            "source_value": src_n,
            "editor_value": ed_n,
            "delta": ed_n - src_n,
            "impact": (
                f"Column count differs by {delta}. "
                "File may have gained or lost columns since documentation was written."
            ),
        })

    # -----------------------------------------------------------------------
    # 2. Column-level comparison
    # Strategy: match by name first; fall back to positional matching.
    # -----------------------------------------------------------------------

    src_by_name = col_by_name(src_cols)
    ed_by_name  = col_by_name(ed_cols)
    src_by_pos  = col_by_position(src_cols)
    ed_by_pos   = col_by_position(ed_cols)

    # Columns present in source but absent in editor (by name) — informational
    for name in src_by_name:
        if name not in ed_by_name:
            result["missing_in_editor"].append(name)

    # Columns present in editor but absent in source (by name) — informational
    for name in ed_by_name:
        if name not in src_by_name:
            result["extra_in_editor"].append(name)

    # --- Positional name mismatch check ---
    # For each position that exists in both schemas, if names differ → MINOR
    # Track which source/editor names are "explained" by a positional match
    # so they don't also drive severity as truly-unmatched columns.
    explained_source_names: set = set()
    explained_editor_names: set = set()

    for pos in sorted(set(src_by_pos) & set(ed_by_pos)):
        sc = src_by_pos[pos]
        ec = ed_by_pos[pos]
        sname = sc["name"]
        ename = ec["name"]

        if sname != ename:
            result["name_mismatches"].append({
                "position": pos,
                "source_name": sname,
                "editor_name": ename,
                "note": (
                    "Same column position, different name. "
                    "Could be a rename, abbreviation difference, or a genuine "
                    "replacement of the attribute — manual review needed."
                ),
            })
        explained_source_names.add(sname)
        explained_editor_names.add(ename)

    # Truly unmatched columns: not found by name AND not explained by position
    result["unmatched_source_cols"] = [
        n for n in result["missing_in_editor"] if n not in explained_source_names
    ]
    result["unmatched_editor_cols"] = [
        n for n in result["extra_in_editor"] if n not in explained_editor_names
    ]

    # --- Type change check ---
    # For columns that share a name, compare ORM types.
    for name in src_by_name:
        if name not in ed_by_name:
            continue
        sc = src_by_name[name]
        ec = ed_by_name[name]
        src_t = sc.get("type", "")
        ed_t  = ec.get("type", "")
        src_raw = sc.get("source_type", "")

        change = classify_type_change(src_t, ed_t)
        if change == "incompatible":
            result["type_changes"].append({
                "column": name,
                "source_type": src_t,
                "source_raw_type": src_raw,
                "editor_type": ed_t,
                "severity": "incompatible",
                "note": (
                    f"Type '{src_raw}' (→ {src_t}) in source "
                    f"mapped to '{ed_t}' in editor. "
                    "This is a real type change and may cause data errors."
                ),
            })
        elif change in ("compatible", "unknown") and src_t != ed_t:
            result["type_changes"].append({
                "column": name,
                "source_type": src_t,
                "source_raw_type": src_raw,
                "editor_type": ed_t,
                "severity": change,
                "note": (
                    f"Type '{src_raw}' (→ {src_t}) in source "
                    f"mapped to '{ed_t}' in editor. "
                    "Types differ but may be compatible — verify."
                ),
            })

    # -----------------------------------------------------------------------
    # 3. Roll up severity
    # -----------------------------------------------------------------------
    # Use unmatched_* (not missing/extra) for severity — columns that are
    # fully explained by a positional name-mismatch are not independently
    # escalating.
    has_incompatible_type = any(
        tc["severity"] == "incompatible" for tc in result["type_changes"]
    )
    has_type_change = bool(result["type_changes"])
    truly_unmatched = bool(
        result["unmatched_source_cols"] or result["unmatched_editor_cols"]
    )

    if result["structure_changes"]:
        result["severity"] = "major"
    elif has_incompatible_type or truly_unmatched:
        result["severity"] = "potential"
    elif has_type_change:
        result["severity"] = "potential"
    elif result["name_mismatches"]:
        result["severity"] = "minor"

    return result


# ---------------------------------------------------------------------------
# Summary helpers
# ---------------------------------------------------------------------------

def build_summary(results: List[dict]) -> dict:
    counts = {"ok": 0, "minor": 0, "potential": 0, "major": 0, "info": 0}
    type_incompatible: List[dict] = []
    name_mismatch_files: List[str] = []
    structure_change_files: List[str] = []
    missing_files: List[str] = []
    unmatched_col_files: List[str] = []

    for r in results:
        sev = r["severity"]
        counts[sev] = counts.get(sev, 0) + 1

        if r["structure_changes"]:
            structure_change_files.append(r["file_name"])
        if r["name_mismatches"]:
            name_mismatch_files.append(r["file_name"])
        for tc in r["type_changes"]:
            if tc["severity"] == "incompatible":
                type_incompatible.append({
                    "file": r["file_name"],
                    "column": tc["column"],
                    "source_type": tc["source_raw_type"],
                    "editor_type": tc["editor_type"],
                })
        if not r["in_editor"]:
            missing_files.append(r["file_name"])
        if r.get("unmatched_source_cols") or r.get("unmatched_editor_cols"):
            unmatched_col_files.append(r["file_name"])

    return {
        "severity_counts": counts,
        "files_with_structure_changes": structure_change_files,
        "files_with_name_mismatches": name_mismatch_files,
        "files_with_unmatched_columns": unmatched_col_files,
        "incompatible_type_changes": type_incompatible,
        "files_only_in_source": missing_files,
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> int:
    script_dir = Path(__file__).parent
    repo_root  = script_dir.parent
    schema_dir = repo_root / "resources" / "schema"

    src_path = schema_dir / "txtinout-source-schema.json"
    ed_path  = schema_dir / "swatplus-editor-schema.json"

    if not src_path.exists():
        print(f"ERROR: {src_path} not found. Run generate_source_schema.py first.")
        return 1

    if not ed_path.exists():
        print(f"ERROR: {ed_path} not found.")
        return 1

    print(f"Loading source schema:  {src_path.name}")
    src_schema = load_json(src_path)
    print(f"Loading editor schema:  {ed_path.name}")
    ed_schema  = load_json(ed_path)

    src_tables = src_schema.get("tables", {})
    ed_tables  = ed_schema.get("tables", {})

    print(f"  Source tables: {len(src_tables)}")
    print(f"  Editor tables: {len(ed_tables)}")

    results: List[dict] = []

    # Compare all files that appear in either schema
    all_files = sorted(set(src_tables) | set(ed_tables))

    for file_name in all_files:
        src_t = src_tables.get(file_name)
        ed_t  = ed_tables.get(file_name)

        if src_t is None:
            # File only in editor schema
            results.append({
                "file_name": file_name,
                "in_source": False,
                "in_editor": True,
                "severity": "info",
                "structure_changes": [],
                "type_changes": [],
                "name_mismatches": [],
                "missing_in_editor": [],
                "extra_in_editor": [],
                "notes": ["File exists in editor schema but not in source documentation."],
            })
        else:
            results.append(compare_file(file_name, src_t, ed_t))

    summary = build_summary(results)

    output = {
        "crosswalk_version": "1.0.0",
        "generated_on": datetime.now(timezone.utc).isoformat(),
        "source_schema": str(src_path.name),
        "editor_schema": str(ed_path.name),
        "severity_legend": {
            "ok":        "No issues detected.",
            "minor":     "Column name mismatches at the same position — may be a rename or abbreviation difference. Manual review required to determine if it is a genuine attribute replacement.",
            "potential": "Data-type differences or column set changes — verify that values are not silently corrupted.",
            "major":     "File format / structure differences — data_starts_after, header presence, or significant column count changes that may break file parsing.",
            "info":      "File present in only one schema — may be new, removed, or not yet documented.",
        },
        "summary": summary,
        "files": {r["file_name"]: r for r in results},
    }

    out_path = schema_dir / "schema-crosswalk.json"
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(output, fh, indent=2, ensure_ascii=False)

    print(f"\nCrosswalk written → {out_path}")
    print("\nSeverity summary:")
    for sev, count in summary["severity_counts"].items():
        if count:
            print(f"  {sev:10s}: {count}")

    if summary["files_with_structure_changes"]:
        print(f"\nMAJOR — Files with structure changes ({len(summary['files_with_structure_changes'])}):")
        for fn in summary["files_with_structure_changes"]:
            print(f"  {fn}")

    if summary["incompatible_type_changes"]:
        print(f"\nPOTENTIAL — Incompatible type changes ({len(summary['incompatible_type_changes'])}):")
        for tc in summary["incompatible_type_changes"]:
            print(f"  {tc['file']}  col={tc['column']}  {tc['source_type']} → {tc['editor_type']}")

    if summary["files_with_name_mismatches"]:
        print(f"\nMINOR — Files with name mismatches ({len(summary['files_with_name_mismatches'])}):")
        for fn in summary["files_with_name_mismatches"]:
            print(f"  {fn}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
