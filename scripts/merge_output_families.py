#!/usr/bin/env python3
"""Build an output-column schema from swatplus-doc-builder output-family overlays.

The output-family overlays (`overlays/output_families/*.md`) document SWAT+ output
files (e.g. `aquifer_day.txt`/`.csv`). Each family page lists the output files it
covers, a plain-English summary, and a "Columns Written" table giving each
column's unit, source field, and source-backed meaning.

This script parses those pages into a JSON keyed by output-file stem (the file
name without its `.txt`/`.csv` extension), so the output explorer can label
columns with their meaning and units. Output is deterministic (stable ordering,
no wall-clock timestamp) for byte-identical re-runs.

Usage:
    python3 scripts/merge_output_families.py \\
        --overlays /path/to/swatplus-doc-builder/overlays \\
        --out resources/schema/swatplus-output-schema.json \\
        --report resources/schema/output-merge-report.md
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
from typing import Any


def read_swatplus_version(overlays_dir: str) -> str | None:
    root = os.path.dirname(os.path.abspath(overlays_dir.rstrip("/")))
    toml_path = os.path.join(root, "swatplus-doc-builder.toml")
    if not os.path.isfile(toml_path):
        return None
    with open(toml_path, encoding="utf-8") as fh:
        text = fh.read()
    m = re.search(r'swatplus_version\s*=\s*"([^"]+)"', text)
    return m.group(1) if m else None


def clean(value: str | None) -> str | None:
    if not value:
        return None
    v = value.strip().strip("`").strip()
    return v or None


def clean_units(value: str | None) -> str | None:
    v = clean(value)
    if not v or v.lower() in {"none", "-", "na", "n/a"}:
        return None
    return v


def parse_family_name(text: str) -> str | None:
    # First markdown H1, e.g. "# `aquifer_*`"
    m = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
    return clean(m.group(1)) if m else None


def parse_files_covered(text: str) -> list[str]:
    """Extract covered output-file stems from the '**Files covered:**' line.

    e.g. "`aquifer_day`, `aquifer_mon`, ... text/CSV pairs" -> stems list.
    """
    m = re.search(r"\*\*Files covered:\*\*(.+)", text)
    if not m:
        return []
    line = m.group(1)
    stems = re.findall(r"`([^`]+)`", line)
    result = []
    for s in stems:
        stem = s.strip()
        # Drop any extension so .txt/.csv share one entry.
        stem = re.sub(r"\.(txt|csv)$", "", stem, flags=re.IGNORECASE)
        if stem and stem not in result:
            result.append(stem)
    return result


def _split_md_row(line: str) -> list[str]:
    # Split a markdown table row into trimmed cell values.
    cells = line.strip().strip("|").split("|")
    return [c.strip() for c in cells]


def parse_columns_table(text: str) -> list[dict]:
    """Parse the '## Columns Written' table into per-column dicts."""
    m = re.search(r"##\s+Columns Written\s*\n(.*?)(?:\n##\s|\Z)", text, re.DOTALL)
    if not m:
        return []
    block = m.group(1)
    rows = [ln for ln in block.splitlines() if ln.strip().startswith("|")]
    if len(rows) < 2:
        return []
    # rows[0] = header, rows[1] = separator (---), rest = data
    columns = []
    for line in rows[2:]:
        cells = _split_md_row(line)
        if len(cells) < 4:
            continue
        name = clean(cells[0])
        if not name:
            continue
        columns.append({
            "name": name,
            "units": clean_units(cells[1]),
            "source_field": clean(cells[2]),
            "description": clean(cells[3]),
        })
    return columns


def parse_summary(text: str) -> str | None:
    """Prefer the '> **What each row means:**' note; fall back to Bottom Line."""
    m = re.search(r">\s*\*\*What each row means:\*\*\s*(.+)", text)
    if m:
        return clean_blockquote(m.group(1))
    m = re.search(r"##\s+Bottom Line\s*\n+(.+?)(?:\n\n|\n##\s|\Z)", text, re.DOTALL)
    if m:
        return " ".join(m.group(1).split())
    return None


def clean_blockquote(value: str) -> str:
    # Collapse the (possibly multi-line) blockquote into one string.
    lines = [ln.lstrip("> ").rstrip() for ln in value.splitlines()]
    return " ".join(" ".join(lines).split())


def build_column_doc(col: dict) -> dict:
    doc: dict[str, Any] = {}
    if col.get("description"):
        doc["description"] = col["description"]
    if col.get("units"):
        doc["units"] = col["units"]
    if col.get("source_field"):
        doc["source_field"] = col["source_field"]
    return doc


def parse_overlay(path: str) -> dict | None:
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    covered = parse_files_covered(text)
    columns = parse_columns_table(text)
    if not covered or not columns:
        return None
    col_docs = {}
    for col in columns:
        doc = build_column_doc(col)
        if doc:
            col_docs[col["name"]] = doc
    return {
        "family": parse_family_name(text),
        "summary": parse_summary(text),
        "covered": covered,
        "columns": col_docs,
        "source": os.path.basename(path),
    }


def merge(overlays_dir: str, version: str | None) -> tuple[dict, dict]:
    of_dir = os.path.join(overlays_dir, "output_families")
    files: dict[str, Any] = {}
    report: dict[str, Any] = {"families": [], "skipped": []}

    for path in sorted(glob.glob(os.path.join(of_dir, "*.md"))):
        parsed = parse_overlay(path)
        if parsed is None:
            report["skipped"].append(os.path.basename(path))
            continue
        family = parsed["family"]
        report["families"].append(
            (parsed["source"], family, len(parsed["covered"]), len(parsed["columns"])))
        for stem in parsed["covered"]:
            key = stem.lower()
            entry: dict[str, Any] = {"family": family}
            if parsed["summary"]:
                entry["summary"] = parsed["summary"]
            entry["columns"] = parsed["columns"]
            # First writer wins if two families claim the same stem.
            files.setdefault(key, entry)

    enriched = {
        "enrichment": {
            "overlays_repo": "tugraskan/swatplus-doc-builder",
            "swatplus_version": version or "unknown",
            "output_families": len(report["families"]),
            "output_files": len(files),
            "note": ("Output-column documentation parsed from output-family "
                     "overlays. Keyed by output-file stem (no .txt/.csv). "
                     "Deterministic; no timestamp so re-runs are byte-identical."),
        },
        "files": files,
    }
    return enriched, report


def render_report(report: dict, enriched: dict) -> str:
    e = enriched["enrichment"]
    lines = [
        "# Output Family Merge Report",
        "",
        f"- SWAT+ version: **{e['swatplus_version']}**",
        f"- Output families parsed: **{e['output_families']}**",
        f"- Output files keyed: **{e['output_files']}**",
        f"- Overlays skipped (no covered files or column table): "
        f"**{len(report['skipped'])}**",
        "",
        "## Families",
        "",
        "| Overlay | Family | Files covered | Columns |",
        "|---|---|---:|---:|",
    ]
    for src, family, ncov, ncol in sorted(report["families"]):
        lines.append(f"| `{src}` | `{family}` | {ncov} | {ncol} |")
    lines += ["", "## Skipped overlays", ""]
    if report["skipped"]:
        for name in sorted(report["skipped"]):
            lines.append(f"- `{name}`")
    else:
        lines.append("_None._")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--overlays", required=True,
                    help="Path to swatplus-doc-builder/overlays directory")
    ap.add_argument("--out", required=True, help="Output JSON path")
    ap.add_argument("--report", default=None, help="Optional markdown report path")
    args = ap.parse_args()

    version = read_swatplus_version(args.overlays)
    enriched, report = merge(args.overlays, version)

    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(enriched, fh, indent=1, ensure_ascii=False, sort_keys=False)
        fh.write("\n")

    if args.report:
        with open(args.report, "w", encoding="utf-8") as fh:
            fh.write(render_report(report, enriched))

    print(f"Parsed {len(report['families'])} output families, "
          f"keyed {len(enriched['files'])} output files, "
          f"skipped {len(report['skipped'])}.")
    print(f"Wrote {args.out}")
    if args.report:
        print(f"Wrote {args.report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
