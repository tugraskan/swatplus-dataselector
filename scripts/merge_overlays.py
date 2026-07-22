#!/usr/bin/env python3
"""Merge swatplus-doc-builder io overlays into the extension schema.

Combines the *structure* from the swatplus-editor schema
(``swatplus-editor-schema-full.json``) with the *semantics* from the
swatplus-doc-builder ``overlays/io/*.json`` files (per-column meaning, units,
Fortran types/targets, defaults, and source citations).

Enrichment is purely additive: existing schema fields are never modified or
removed. File-level docs are attached under ``tables.<file>.doc`` and
column-level docs under ``tables.<file>.columns[].doc``.

The output is deterministic (stable ordering, no wall-clock timestamp) so that
running the script twice produces byte-identical results.

Usage:
    python3 scripts/merge_overlays.py \\
        --schema resources/schema/swatplus-editor-schema-full.json \\
        --overlays /path/to/swatplus-doc-builder/overlays \\
        --out resources/schema/swatplus-schema-enriched.json \\
        --report resources/schema/merge-report.md
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
from typing import Any


# ---------------------------------------------------------------------------
# Naming helpers
# ---------------------------------------------------------------------------

def norm_file(name: str) -> str:
    """Normalize a file/table name for cross-source matching.

    The editor schema uses hyphens (``cal-parms.cal``); the overlays use
    underscores (``cal_parms.cal``). Lowercase and fold ``-`` to ``_``.
    """
    return name.lower().replace("-", "_")


def norm_col(name: str) -> str:
    """Normalize a column/header name: lowercase, strip underscores."""
    return name.lower().replace("_", "")


# ---------------------------------------------------------------------------
# Value cleaning
# ---------------------------------------------------------------------------

_EMPTY_UNITS = {"", "none", "-", "na", "n/a"}
_EMPTY_DEFAULT = {"", "-", "na", "n/a"}


def clean_units(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    v = value.strip()
    return None if v.lower() in _EMPTY_UNITS else v


def clean_default(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    v = value.strip()
    return None if v.lower() in _EMPTY_DEFAULT else v


def clean_str(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    v = value.strip()
    return v or None


# ---------------------------------------------------------------------------
# Overlay loading
# ---------------------------------------------------------------------------

def load_io_overlays(overlays_dir: str) -> dict[str, dict]:
    """Load ``overlays/io/*.json`` keyed by normalized file name."""
    io_dir = os.path.join(overlays_dir, "io")
    result: dict[str, dict] = {}
    for path in sorted(glob.glob(os.path.join(io_dir, "*.json"))):
        base = os.path.basename(path)[:-5]  # strip .json
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        result[norm_file(base)] = {"file_name": base, "data": data}
    return result


def read_swatplus_version(overlays_dir: str) -> str | None:
    """Read the SWAT+ version label from the doc-builder toml, if present."""
    root = os.path.dirname(os.path.abspath(overlays_dir.rstrip("/")))
    toml_path = os.path.join(root, "swatplus-doc-builder.toml")
    if not os.path.isfile(toml_path):
        return None
    with open(toml_path, encoding="utf-8") as fh:
        text = fh.read()
    m = re.search(r'swatplus_version\s*=\s*"([^"]+)"', text)
    return m.group(1) if m else None


# ---------------------------------------------------------------------------
# File-level doc extraction
# ---------------------------------------------------------------------------

def build_file_doc(overlay_data: dict) -> dict:
    """Build the file-level ``doc`` block from an overlay's top-level fields."""
    doc: dict[str, Any] = {}
    links = overlay_data.get("links") or {}
    reader = clean_str(links.get("source"))
    if reader:
        doc["reader_source"] = reader

    primary = clean_str(overlay_data.get("primary_target"))
    if primary:
        doc["primary_target"] = primary

    bottom = overlay_data.get("bottom_line")
    if isinstance(bottom, list):
        summary = [s.strip() for s in bottom if isinstance(s, str) and s.strip()]
        if summary:
            doc["summary"] = summary
    elif isinstance(bottom, str) and bottom.strip():
        doc["summary"] = [bottom.strip()]

    layout = clean_str(overlay_data.get("file_variables_intro"))
    if layout:
        doc["layout_notes"] = layout

    usage = overlay_data.get("module_usage")
    if isinstance(usage, dict) and usage:
        cleaned = {k: v.strip() for k, v in usage.items()
                   if isinstance(v, str) and v.strip()}
        if cleaned:
            doc["module_usage"] = cleaned

    return doc


# ---------------------------------------------------------------------------
# Column-level doc extraction and matching
# ---------------------------------------------------------------------------

def build_col_doc(row: dict, match: str) -> dict:
    """Build a column-level ``doc`` block from an overlay ``file_variables`` row."""
    doc: dict[str, Any] = {}
    description = clean_str(row.get("manual_description")) or \
        clean_str(row.get("source_meaning"))
    if description:
        doc["description"] = description

    meaning = clean_str(row.get("source_meaning"))
    if meaning:
        doc["source_meaning"] = meaning

    units = clean_units(row.get("units"))
    if units:
        doc["units"] = units

    ftype = clean_str(row.get("type"))
    if ftype:
        doc["fortran_type"] = ftype

    target = clean_str(row.get("target"))
    if target:
        doc["fortran_target"] = target

    default = clean_default(row.get("default"))
    if default:
        doc["default"] = default

    ref = clean_str(row.get("source_line"))
    if ref:
        doc["source_ref"] = ref

    doc["match"] = match
    return doc


def _col_position(row: dict) -> int | None:
    try:
        return int(str(row.get("column")).strip())
    except (TypeError, ValueError):
        return None


def is_data_row(row: dict) -> bool:
    """True if an overlay ``file_variables`` row describes a real data column.

    SWAT+ readers skip title/comment lines with a dummy read into ``titldum``;
    the overlays capture those as rows too. They are not file columns and must
    never be matched to a schema column (or synthesized into one).
    """
    target = (row.get("target") or "").strip().lower()
    header = (row.get("header") or "").strip().lower()
    if target in {"titldum", "header", "titl"}:
        return False
    if "title line" in header or header in {"title", "header line"}:
        return False
    return True


def field_from_target(target: Any) -> str | None:
    """Extract the Fortran field name from an overlay ``target`` expression.

    e.g. ``bsn_cc%gampt`` -> ``gampt``; ``aqudb%flo`` -> ``flo``;
    ``dr_salt_name(ii)`` -> ``dr_salt_name``. Array/aggregate expressions
    (containing a leading parenthesis or a comma) are not single fields and
    return ``None``.
    """
    if not isinstance(target, str):
        return None
    t = target.strip()
    if not t or t.startswith("(") or "," in t:
        return None
    t = re.sub(r"\(.*", "", t)      # strip trailing (ii), (isalt) ...
    if "%" in t:
        t = t.split("%")[-1]
    t = t.strip()
    return t or None


def match_columns(schema_cols: list[dict], overlay_rows: list[dict]) -> tuple[
        dict[int, tuple[dict, str]], list[dict]]:
    """Match schema columns to overlay rows.

    Returns ``(matches, unmatched_rows)`` where ``matches`` maps a schema column
    index to ``(overlay_row, match_method)`` and ``unmatched_rows`` is the list
    of overlay data rows that were not consumed.

    Matching is by name identity only, in priority order: exact header,
    normalized header, exact target field name, normalized target field name.

    Position-based matching is deliberately NOT used: the editor schema's column
    order (from its Python DB models) does not reliably match the file's physical
    read order, so aligning by position produces silently wrong docs wherever the
    two orders diverge. A column with no name match is left unenriched rather than
    mis-documented.
    """
    data_rows = [r for r in overlay_rows if is_data_row(r)]

    matches: dict[int, tuple[dict, str]] = {}
    used_rows: set[int] = set()

    # Build lookup tables. Each keeps the first row for a given key; a key that
    # maps to more than one row is dropped as ambiguous.
    def build_index(key_fn):
        seen: dict[str, int] = {}
        dupes: set[str] = set()
        for ri, row in enumerate(data_rows):
            key = key_fn(row)
            if not key:
                continue
            if key in seen:
                dupes.add(key)
            else:
                seen[key] = ri
        for k in dupes:
            seen.pop(k, None)
        return seen

    header_exact = build_index(
        lambda r: r["header"].strip() if isinstance(r.get("header"), str)
        and r["header"].strip() else None)
    header_norm = build_index(
        lambda r: norm_col(r["header"].strip()) if isinstance(r.get("header"), str)
        and r["header"].strip() else None)
    target_exact = build_index(lambda r: field_from_target(r.get("target")))
    target_norm = build_index(
        lambda r: norm_col(f) if (f := field_from_target(r.get("target")))
        else None)

    def try_match(key, index, method):
        ri = index.get(key)
        if ri is not None and ri not in used_rows:
            matches[ci] = (data_rows[ri], method)
            used_rows.add(ri)
            return True
        return False

    for ci, col in enumerate(schema_cols):
        name = col.get("name") or col.get("db_column") or ""
        db = col.get("db_column") or ""
        if not name and not db:
            continue
        nname = norm_col(name)
        if try_match(name, header_exact, "header"):
            continue
        if db and try_match(db, header_exact, "header"):
            continue
        if try_match(nname, header_norm, "header-normalized"):
            continue
        if try_match(name, target_exact, "target"):
            continue
        if db and try_match(db, target_exact, "target"):
            continue
        if try_match(nname, target_norm, "target-normalized"):
            continue

    unmatched_rows = [r for i, r in enumerate(data_rows) if i not in used_rows]
    return matches, unmatched_rows


# ---------------------------------------------------------------------------
# Child-table parent inference
# ---------------------------------------------------------------------------

def parent_candidates(norm_name: str) -> list[str]:
    """Candidate parent overlay keys for a normalized child table name.

    e.g. ``calibration_cal.cond`` -> ``calibration.cal``;
         ``ch_sed_budget_sft.item`` -> ``ch_sed_budget.sft``.
    """
    base, dot, ext = norm_name.rpartition(".")
    if not dot or "_" not in base:
        return []
    head, _, tail = base.rpartition("_")
    return [f"{head}.{tail}"]


# ---------------------------------------------------------------------------
# Overlay-only table synthesis
# ---------------------------------------------------------------------------

def synthesize_overlay_only_table(file_name: str, overlay_data: dict) -> dict:
    """Build a new ``tables`` entry from an overlay that has no schema match."""
    columns = []
    for row in overlay_data.get("file_variables", []):
        if not is_data_row(row):
            continue
        header = clean_str(row.get("header"))
        if not header:
            continue
        columns.append({
            "name": header,
            "db_column": header,
            "is_primary_key": False,
            "is_foreign_key": False,
            "doc": build_col_doc(row, "overlay"),
        })
    entry: dict[str, Any] = {
        "file_name": file_name,
        "origin": "overlay-only",
        "columns": columns,
    }
    file_doc = build_file_doc(overlay_data)
    if file_doc:
        entry["doc"] = file_doc
    return entry


# ---------------------------------------------------------------------------
# Main merge
# ---------------------------------------------------------------------------

def merge(schema: dict, io_overlays: dict[str, dict],
          swatplus_version: str | None) -> tuple[dict, dict]:
    """Perform the merge. Returns ``(enriched_schema, report_data)``."""
    tables = schema.get("tables", {})
    overlay_by_norm = io_overlays  # keyed by normalized name

    used_overlays: set[str] = set()
    report: dict[str, Any] = {
        "direct": [],        # (schema_key, overlay_name, matched_cols, total_cols)
        "inherited": [],     # (schema_key, parent_overlay)
        "schema_only": [],   # schema_key with no overlay
        "overlay_only": [],  # overlay_name added as new table
        "unmatched_cols": [],  # (schema_key, [col names])
    }

    enriched_tables: dict[str, Any] = {}

    for key, table in tables.items():
        new_table = dict(table)  # shallow copy; we replace columns below
        nkey = norm_file(key)
        schema_cols = table.get("columns", [])

        overlay = overlay_by_norm.get(nkey)
        if overlay is not None:
            used_overlays.add(nkey)
            data = overlay["data"]
            file_doc = build_file_doc(data)
            if file_doc:
                new_table["doc"] = file_doc
            overlay_rows = data.get("file_variables", [])
            matches, _ = match_columns(schema_cols, overlay_rows)
            new_cols = []
            unmatched_names = []
            for ci, col in enumerate(schema_cols):
                nc = dict(col)
                if ci in matches:
                    row, method = matches[ci]
                    nc["doc"] = build_col_doc(row, method)
                else:
                    unmatched_names.append(col.get("name", f"#{ci}"))
                new_cols.append(nc)
            new_table["columns"] = new_cols
            report["direct"].append(
                (key, overlay["file_name"], len(matches), len(schema_cols)))
            if unmatched_names:
                report["unmatched_cols"].append((key, unmatched_names))
            enriched_tables[key] = new_table
            continue

        # No direct overlay: try child inheritance from a parent overlay.
        inherited = False
        for cand in parent_candidates(nkey):
            parent = overlay_by_norm.get(cand)
            if parent is None:
                continue
            used_overlays.add(cand)
            data = parent["data"]
            file_doc = build_file_doc(data)
            if file_doc:
                file_doc = dict(file_doc)
                file_doc["inherited_from"] = parent["file_name"]
                new_table["doc"] = file_doc
            # Attempt name-based column enrichment against the parent overlay.
            overlay_rows = data.get("file_variables", [])
            matches, _ = match_columns(schema_cols, overlay_rows)
            new_cols = []
            for ci, col in enumerate(schema_cols):
                nc = dict(col)
                if ci in matches:
                    row, method = matches[ci]
                    cdoc = build_col_doc(row, method)
                    cdoc["inherited_from"] = parent["file_name"]
                    nc["doc"] = cdoc
                new_cols.append(nc)
            new_table["columns"] = new_cols
            report["inherited"].append((key, parent["file_name"]))
            enriched_tables[key] = new_table
            inherited = True
            break

        if not inherited:
            report["schema_only"].append(key)
            enriched_tables[key] = new_table

    # Add overlay-only tables (overlays never consumed above).
    for nkey in sorted(overlay_by_norm):
        if nkey in used_overlays:
            continue
        overlay = overlay_by_norm[nkey]
        file_name = overlay["file_name"]
        enriched_tables[file_name] = synthesize_overlay_only_table(
            file_name, overlay["data"])
        report["overlay_only"].append(file_name)

    # Assemble enriched schema, preserving top-level provenance.
    enriched = {}
    for k in ("schema_version", "source", "statistics"):
        if k in schema:
            enriched[k] = schema[k]
    enriched["enrichment"] = {
        "overlays_repo": "tugraskan/swatplus-doc-builder",
        "swatplus_version": swatplus_version or "unknown",
        "files_enriched": len(report["direct"]),
        "files_inherited": len(report["inherited"]),
        "overlay_only_tables": len(report["overlay_only"]),
        "note": ("Enrichment is additive under 'doc' keys. Output is "
                 "deterministic; no wall-clock timestamp is recorded so that "
                 "re-runs are byte-identical."),
    }
    enriched["tables"] = enriched_tables
    return enriched, report


# ---------------------------------------------------------------------------
# Report rendering
# ---------------------------------------------------------------------------

def render_report(report: dict, enriched: dict) -> str:
    e = enriched["enrichment"]
    lines: list[str] = []
    lines.append("# Overlay Merge Report")
    lines.append("")
    lines.append(f"- SWAT+ version: **{e['swatplus_version']}**")
    lines.append(f"- Overlays repo: {e['overlays_repo']}")
    lines.append(f"- Tables enriched directly: **{e['files_enriched']}**")
    lines.append(f"- Tables enriched by parent inheritance: "
                 f"**{e['files_inherited']}**")
    lines.append(f"- Overlay-only tables added: **{e['overlay_only_tables']}**")
    lines.append(f"- Schema tables with no overlay: "
                 f"**{len(report['schema_only'])}**")
    lines.append("")
    lines.append("> Columns are enriched only when they match an overlay row by "
                 "name identity (file header or the Fortran field name in the "
                 "overlay `target`). Position-based matching is intentionally not "
                 "used: the editor schema's column order does not reliably match "
                 "the file's physical read order, so a column that matches "
                 "neither name is left unenriched rather than risk a wrong doc.")
    lines.append("")

    lines.append("## Direct matches")
    lines.append("")
    lines.append("| Schema file | Overlay | Columns matched |")
    lines.append("|---|---|---|")
    for key, overlay, matched, total in sorted(report["direct"]):
        lines.append(f"| `{key}` | `{overlay}` | {matched}/{total} |")
    lines.append("")

    lines.append("## Inherited from parent overlay")
    lines.append("")
    if report["inherited"]:
        lines.append("| Child schema file | Parent overlay |")
        lines.append("|---|---|")
        for key, parent in sorted(report["inherited"]):
            lines.append(f"| `{key}` | `{parent}` |")
    else:
        lines.append("_None._")
    lines.append("")

    lines.append("## Overlay-only tables added")
    lines.append("")
    if report["overlay_only"]:
        for name in sorted(report["overlay_only"]):
            lines.append(f"- `{name}`")
    else:
        lines.append("_None._")
    lines.append("")

    lines.append("## Schema tables with no overlay (no enrichment)")
    lines.append("")
    if report["schema_only"]:
        for name in sorted(report["schema_only"]):
            lines.append(f"- `{name}`")
    else:
        lines.append("_None._")
    lines.append("")

    lines.append("## Columns not matched within enriched files")
    lines.append("")
    lines.append("_These columns are in an enriched file but their name matched "
                 "no overlay row (the editor column name differs from both the "
                 "file header and the Fortran field name). Left unenriched._")
    lines.append("")
    if report["unmatched_cols"]:
        lines.append("| Schema file | Unmatched columns |")
        lines.append("|---|---|")
        for key, cols in sorted(report["unmatched_cols"]):
            lines.append(f"| `{key}` | {', '.join(f'`{c}`' for c in cols)} |")
    else:
        lines.append("_All columns in enriched files matched._")
    lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--schema", required=True,
                    help="Path to swatplus-editor-schema-full.json")
    ap.add_argument("--overlays", required=True,
                    help="Path to swatplus-doc-builder/overlays directory")
    ap.add_argument("--out", required=True,
                    help="Output path for enriched schema JSON")
    ap.add_argument("--report", default=None,
                    help="Optional output path for the markdown coverage report")
    args = ap.parse_args()

    with open(args.schema, encoding="utf-8") as fh:
        schema = json.load(fh)
    io_overlays = load_io_overlays(args.overlays)
    version = read_swatplus_version(args.overlays)

    enriched, report = merge(schema, io_overlays, version)

    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(enriched, fh, indent=1, ensure_ascii=False, sort_keys=False)
        fh.write("\n")

    if args.report:
        with open(args.report, "w", encoding="utf-8") as fh:
            fh.write(render_report(report, enriched))

    print(f"Enriched {len(report['direct'])} tables directly, "
          f"{len(report['inherited'])} by inheritance, "
          f"added {len(report['overlay_only'])} overlay-only tables.")
    print(f"Wrote {args.out}")
    if args.report:
        print(f"Wrote {args.report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
