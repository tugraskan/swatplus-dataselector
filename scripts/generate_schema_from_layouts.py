#!/usr/bin/env python3
"""Build the dataselector schema from Tamandua's input-file layouts.

Tamandua's ``swatplus-layouts`` reports, for each input file, the columns SWAT+
reads in the order it reads them, derived from the Fortran source -- so it
follows whichever SWAT+ tree it was built from. This script turns that into a
schema in the same shape as ``swatplus-editor-schema.json``, so the indexer,
diagnostics and panels read it unchanged.

Three sources, each used only for what it is right about:

- **Tamandua layouts** -- which columns SWAT+ reads, their order, types, units,
  descriptions, and the source line behind each. Also the title/header lines
  SWAT+ skips before data.
- **Real files' header lines** (``--headers``, in priority order: the selected
  dataset, then SWAT+'s own ``refdata`` datasets) -- what the columns are
  called. Matched by position, which is safe because the layout *is* the read
  order. The editor schema's column order is not the physical order in about a
  third of files, so it is never matched by position.
- **Learned names** (``--names``) -- header names recorded by an earlier run
  against real headers, keyed by where the value lands in SWAT+
  (``hru_db%dbsc%land_use_mgt`` -> ``lu_mgt``), so they survive a column
  moving. Used where no header line is available.
- **The editor schema** -- file links (foreign keys) and primary keys, by
  column name, plus every table the layouts do not cover. Also the fallback
  for names when no header line is available, by exact name only.

Column docs come from Tamandua only. Multi-line files the dataselector already
parses specially (soils.sol, management.sch, decision tables, ...) keep the
editor's structure; they only gain docs where a column name matches.

The output is deterministic (stable ordering, no wall-clock timestamp).

Usage:
    python3 scripts/generate_schema_from_layouts.py \\
        --layouts swatplus-layouts.json \\
        --editor-schema resources/schema/swatplus-editor-schema.json \\
        --metadata resources/schema/txtinout-metadata.json \\
        --headers /path/to/dataset --headers /path/to/swatplus/refdata/Ames_sub1 \\
        --out swatplus-generated-schema.json [--report report.md]
"""

from __future__ import annotations

import argparse
import copy
import json
import os
import re
from typing import Any

SCHEMA_VERSION = "3.0.0"

# Files whose records span several lines. The indexer and panels already have
# hand-written handling for these, so their editor structure is kept.
_ALWAYS_SPECIAL = {"file.cio", "weather-wgn.cli", "atmo.cli"}

_TYPE_FIELDS = (
    ("integer", "IntegerField"),
    ("real", "DoubleField"),
    ("double", "DoubleField"),
    ("character", "CharField"),
    ("logical", "BooleanField"),
)

_NUMBER_RE = re.compile(r"^[+-]?(\d+\.?\d*|\.\d+)([eEdD][+-]?\d+)?$")


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def file_variants(name: str) -> list[str]:
    """``cal_parms.cal`` and ``cal-parms.cal`` name the same file."""
    lowered = name.lower()
    variants = [lowered, lowered.replace("_", "-"), lowered.replace("-", "_")]
    return list(dict.fromkeys(variants))


def field_type(vartype: str | None) -> str:
    lowered = (vartype or "").strip().lower()
    for prefix, orm in _TYPE_FIELDS:
        if lowered.startswith(prefix):
            return orm
    return "CharField"


#: Share of positions whose Fortran name must equal the editor's column name
#: before the editor's names are borrowed by position. Measured against real
#: headers on SWAT+ 62.0.0's Ames and Osu datasets: at 0.7 every verifiable
#: file came out exact (8 of 8); at 0.5 hydrology.hyd shifted by one column.
EDITOR_ALIGNMENT = 0.7


def norm_name(name: str) -> str:
    return name.lower().replace("_", "")


def editor_physical_columns(editor: dict[str, Any], metadata: dict[str, Any]) -> list[dict[str, Any]]:
    """The editor columns a file physically holds (same rule as the validator)."""
    keys = (metadata.get("file_metadata") or {}).get(editor.get("file_name"), {}).get("primary_keys") or []
    return [c for c in editor.get("columns", []) if "id" in keys or c.get("type") != "AutoField"]


def aligned_editor_names(read: list[dict[str, Any]], editor: dict[str, Any] | None,
                         metadata: dict[str, Any]) -> list[str] | None:
    """The editor's names by position, when the Fortran names confirm the order.

    The editor schema's column order is not the file's physical order in about
    a third of files, so it is only trusted where enough positions agree by
    name that a shift would have shown.
    """
    if not editor or not read:
        return None
    physical = [c["name"] for c in editor_physical_columns(editor, metadata)]
    if len(physical) < len(read):
        return None
    anchors = sum(norm_name(c["name"]) == norm_name(e) for c, e in zip(read, physical))
    if anchors < EDITOR_ALIGNMENT * len(read):
        return None
    return physical


def column_key(column: dict[str, Any]) -> str | None:
    """Identity of a read column across SWAT+ versions: where it lands.

    ``hru_db%dbsc%land_use_mgt``, plus the element for an expanded array
    (``cntbl%cn(2)``). Unlike a position, this survives a column being
    inserted before it.
    """
    path = column.get("path")
    if not path:
        return None
    name = column.get("name", "")
    return path + name[name.index("("):] if "(" in name else path


def learned_names(schema: dict[str, Any]) -> dict[str, Any]:
    """Header names by column key, from every column a real header named."""
    files: dict[str, dict[str, Any]] = {}
    for table in schema.get("tables", {}).values():
        if table.get("origin") != "tamandua":
            continue
        names: dict[str, str] = {}
        trailing: list[str] = []
        for column in table["columns"]:
            if column.get("name_source") not in ("header", "editor-aligned"):
                continue
            if not column.get("read_by_swat", True):
                trailing.append(column["name"])
                continue
            swat = column.get("swat") or {}
            key = column_key({"path": swat.get("path"), "name": swat.get("name", "")})
            if key:
                names[key] = column["name"]
        if names or trailing:
            files[table["file_name"].lower()] = {"columns": names, "trailing": trailing}
    return {"names_format": "1", "files": dict(sorted(files.items()))}


def derived_table_name(file_name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", file_name.lower()).strip("_")


def looks_like_header(tokens: list[str]) -> bool:
    """A header names columns; a data row carries numbers."""
    return bool(tokens) and not any(_NUMBER_RE.match(token) for token in tokens)


def special_files(metadata: dict[str, Any]) -> set[str]:
    hierarchical = metadata.get("hierarchical_files") or {}
    names = {name.lower() for name in hierarchical if name != "description"}
    return names | _ALWAYS_SPECIAL


def is_special(file_name: str, specials: set[str]) -> bool:
    lowered = file_name.lower()
    return lowered in specials or lowered.endswith(".dtl")


# ---------------------------------------------------------------------------
# Header lines from real files
# ---------------------------------------------------------------------------

class HeaderSource:
    """Header lines from datasets, first directory that has the file wins."""

    def __init__(self, directories: list[str]):
        self.directories = [d for d in directories if d and os.path.isdir(d)]
        self._listing: dict[str, dict[str, str]] = {}

    def _files(self, directory: str) -> dict[str, str]:
        if directory not in self._listing:
            try:
                names = os.listdir(directory)
            except OSError:
                names = []
            self._listing[directory] = {name.lower(): name for name in names}
        return self._listing[directory]

    def header(self, file_name: str, skipped: int) -> tuple[list[str], str] | None:
        """The header tokens for ``file_name`` and where they came from.

        SWAT+ skips ``skipped`` lines before data; the header is normally the
        last of them. A dataset whose file lacks the title line has its header
        one line earlier -- still a header, so every skipped line is tried,
        last first, and one that carries numbers is taken for data.
        """
        for directory in self.directories:
            listing = self._files(directory)
            actual = next((listing[v] for v in file_variants(file_name) if v in listing), None)
            if actual is None:
                continue
            path = os.path.join(directory, actual)
            try:
                with open(path, encoding="utf-8", errors="replace") as handle:
                    lines = [handle.readline() for _ in range(max(skipped, 1) + 1)]
            except OSError:
                continue
            for index in range(min(skipped, len(lines)) - 1, -1, -1):
                tokens = lines[index].split()
                if looks_like_header(tokens):
                    return tokens, f"{os.path.basename(directory)}/{actual}:{index + 1}"
        return None


# ---------------------------------------------------------------------------
# Building tables
# ---------------------------------------------------------------------------

def _doc(column: dict[str, Any], read_at: str) -> dict[str, Any]:
    """Tamandua's facts for a column, in the enriched-schema doc shape."""
    doc = {
        "description": column.get("description"),
        "units": column.get("units"),
        "fortran_type": column.get("vartype"),
        "fortran_target": column.get("path"),
        "source_ref": column.get("declared_at"),
        "read_at": read_at,
    }
    return {key: value for key, value in doc.items() if value}


def _main(layout: dict[str, Any]) -> dict[str, Any] | None:
    return next((r for r in layout.get("records", []) if r.get("role") == "main"), None)


def row_shape(layout: dict[str, Any]) -> str:
    """How a file's data lines relate to its main record.

    ``records`` -- one main record per line, read in a loop (``hru-data.hru``);
    ``single`` -- one record, read once (``codes.bsn``); ``sections`` --
    several different lines at the main record's level (``print.prt``), where
    a per-line value count means nothing. The bare ``do`` SWAT+ wraps most
    readers in (to ``exit`` on end of file) does not make a record repeat.
    """
    records = layout.get("records", [])
    if any(r.get("role") == "line" for r in records):
        return "sections"
    main = _main(layout) or {}
    return "records" if any(loop != "do" for loop in main.get("loops", [])) else "single"


def generated_table(
    file_name: str,
    layout: dict[str, Any],
    editor: dict[str, Any] | None,
    headers: HeaderSource,
    metadata: dict[str, Any],
    known_names: dict[str, dict[str, str]] | None = None,
) -> tuple[dict[str, Any], list[str]]:
    """One table built from a layout; also returns notes for the report."""
    notes: list[str] = []
    main = _main(layout)
    read = main["columns"]
    skipped = int(layout.get("data_starts_after", 0))
    found = headers.header(file_name, skipped) if skipped >= 1 else None
    header_tokens, header_source = found if found else ([], None)

    # Names map by position only up to the first repeating group: after it,
    # position in the file depends on a count known only at run time.
    mappable = next((k for k, c in enumerate(read) if c.get("repeat")), len(read))
    editor_columns = {c["name"].lower(): c for c in (editor or {}).get("columns", [])}
    aligned = None
    remembered_here = (known_names or {}).get(file_name.lower(), {}).get("columns")
    if not header_tokens and mappable == len(read) and not remembered_here:
        aligned = aligned_editor_names(read, editor, metadata)
        if aligned:
            header_tokens, header_source = aligned, "editor schema (aligned)"
    name_by_position = "editor-aligned" if aligned else "header"

    remembered_file = (known_names or {}).get(file_name.lower(), {})
    remembered = remembered_file.get("columns", {})
    columns: list[dict[str, Any]] = []
    for position, column in enumerate(read):
        fortran = column["name"]
        key = column_key(column)
        if header_tokens and position < min(mappable, len(header_tokens)):
            name, name_source = header_tokens[position], name_by_position
        elif key in remembered:
            name, name_source = remembered[key], "learned"
        elif fortran.lower() in editor_columns:
            name, name_source = editor_columns[fortran.lower()]["name"], "editor"
        else:
            name, name_source = fortran, "fortran"
        columns.append({
            "name": name,
            "db_column": name,
            "type": field_type(column.get("vartype")),
            "nullable": True,
            "is_primary_key": False,
            "is_foreign_key": False,
            "read_by_swat": True,
            "name_source": name_source,
            "swat": {
                key: value for key, value in {
                    "name": fortran,
                    "path": column.get("path"),
                    "vartype": column.get("vartype"),
                    "declared_at": column.get("declared_at"),
                    "read_at": main["at"],
                    "repeat": column.get("repeat"),
                }.items() if value
            },
            "doc": _doc(column, main["at"]),
        })

    # A header naming more columns than SWAT+ reads: the tail is in the file
    # but never read (a list-directed read stops once its variables are full).
    if header_tokens and mappable == len(read) and len(header_tokens) > len(read):
        for name in header_tokens[len(read):]:
            columns.append({
                "name": name, "db_column": name, "type": "CharField",
                "nullable": True, "is_primary_key": False, "is_foreign_key": False,
                "read_by_swat": False, "name_source": name_by_position,
            })
    elif not header_tokens and mappable == len(read):
        # No header line this time: the unread tail an earlier run saw, minus
        # any name SWAT+ has since started reading.
        used = {c["name"].lower() for c in columns}
        for name in remembered_file.get("trailing", []):
            if name.lower() not in used:
                columns.append({
                    "name": name, "db_column": name, "type": "CharField",
                    "nullable": True, "is_primary_key": False, "is_foreign_key": False,
                    "read_by_swat": False, "name_source": "learned",
                })
    if header_tokens and len(header_tokens) < mappable:
        notes.append(f"header names {len(header_tokens)} of the {mappable} values SWAT+ reads")

    # Keys and file links from the editor, by name.
    names = {c["name"].lower(): c for c in columns}
    primary_keys: list[str] = []
    foreign_keys: list[dict[str, Any]] = []
    if editor:
        for key in editor.get("primary_keys") or []:
            if key.lower() in names:
                names[key.lower()]["is_primary_key"] = True
                names[key.lower()]["nullable"] = False
                primary_keys.append(names[key.lower()]["name"])
        for fk in editor.get("foreign_keys") or []:
            target = names.get(str(fk.get("column", "")).lower())
            if target is None:
                notes.append(f"link {fk.get('column')} -> {fk['references']['table']} "
                             "dropped: no such column in what SWAT+ reads")
                continue
            target["type"] = "ForeignKeyField"
            target["is_foreign_key"] = True
            target["fk_target"] = copy.deepcopy(fk["references"])
            foreign_keys.append({
                "column": target["name"],
                "db_column": fk.get("db_column", target["name"]),
                "references": copy.deepcopy(fk["references"]),
            })
        for name, column in names.items():
            source = editor_columns.get(name)
            if source is not None and not column["is_primary_key"]:
                column["nullable"] = bool(source.get("nullable", True))
    if not primary_keys and "name" in names:
        primary_keys = [names["name"]["name"]]

    widths = sorted({len(r["columns"]) for r in layout["records"]
                     if r.get("role") in ("main", "alternative")
                     and not any(c.get("repeat") for c in r["columns"])})
    unread = sum(1 for c in columns if not c["read_by_swat"])
    table = {
        "file_name": layout["file"],
        "table_name": (editor or {}).get("table_name") or derived_table_name(layout["file"]),
        "model_class": (editor or {}).get("model_class") or "tamandua.layout",
        "origin": "tamandua",
        "has_metadata_line": skipped >= 1,
        "has_header_line": skipped >= 2,
        "data_starts_after": skipped,
        "columns": columns,
        "primary_keys": primary_keys,
        "foreign_keys": foreign_keys,
        "swat_layout": {
            "readers": layout.get("readers", []),
            "read_at": main["at"],
            "values_read": len(read),
            "record_widths": widths,
            "rows": row_shape(layout),
            "preamble": layout.get("preamble", []),
            "header_source": header_source,
        },
        "doc": {
            "reader_source": main["at"],
            "layout_notes": (
                f"SWAT+ reads {len(read)} value{'s' if len(read) != 1 else ''} per record"
                + (f"; {unread} trailing column{'s' if unread != 1 else ''} not read"
                   if unread else "")
                + (f"; also read as {', '.join(str(w) for w in widths if w != len(read))}"
                   " values on another branch" if len(widths) > 1 else "")
            ),
        },
        "notes": "Generated from SWAT+ source by Tamandua layouts",
    }
    return table, notes


def annotate_special(table: dict[str, Any], layout: dict[str, Any] | None) -> dict[str, Any]:
    """Keep the editor's structure; attach Tamandua docs where names match."""
    kept = copy.deepcopy(table)
    kept["origin"] = "editor"
    if not layout:
        return kept
    by_name: dict[str, tuple[dict[str, Any], str]] = {}
    for record in layout.get("records", []):
        for column in record.get("columns", []):
            by_name.setdefault(column["name"].lower(), (column, record["at"]))
    for column in kept.get("columns", []):
        match = by_name.get(column["name"].lower())
        if match:
            column["doc"] = _doc(*match)
    main = _main(layout)
    if main:
        kept["doc"] = {"reader_source": main["at"]}
    return kept


def build_schema(
    layouts: dict[str, Any],
    editor_schema: dict[str, Any],
    metadata: dict[str, Any],
    header_dirs: list[str],
    names: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], dict[str, list[str]]]:
    headers = HeaderSource(header_dirs)
    specials = special_files(metadata)
    editor_tables: dict[str, Any] = editor_schema.get("tables", {})
    editor_by_variant: dict[str, str] = {}
    for key in editor_tables:
        for variant in file_variants(key):
            editor_by_variant.setdefault(variant, key)
    # The metadata names the real file for some editor tables whose own key
    # differs by more than a hyphen: `cons-prac.lum` is `cons_practice.lum`.
    editor_by_table = {t.get("table_name"): key for key, t in editor_tables.items()}
    for table_name, real in (metadata.get("table_name_to_file_name") or {}).items():
        if table_name in editor_by_table:
            for variant in file_variants(real):
                editor_by_variant.setdefault(variant, editor_by_table[table_name])

    tables: dict[str, Any] = {}
    report: dict[str, list[str]] = {}
    taken_table_names = {t.get("table_name") for t in editor_tables.values()}
    used_editor: set[str] = set()
    counts = {"generated": 0, "generated_new": 0, "special": 0, "editor_only": 0}

    for key in sorted(layouts.get("files", {})):
        layout = layouts["files"][key]
        main = _main(layout)
        if not layout.get("filename_is_default") or main is None or not main.get("complete"):
            continue
        editor_key = next((editor_by_variant[v] for v in file_variants(layout["file"])
                           if v in editor_by_variant), None)
        editor = editor_tables.get(editor_key) if editor_key else None
        if is_special(layout["file"], specials):
            if editor is not None:
                tables[editor_key] = annotate_special(editor, layout)
                used_editor.add(editor_key)
                counts["special"] += 1
            continue
        table, notes = generated_table(layout["file"], layout, editor, headers, metadata,
                                       (names or {}).get("files"))
        if editor is None and table["table_name"] in taken_table_names:
            # `gwflow.wetland` derives `gwflow_wetland`, which an unrelated
            # editor table (`gwflow-wetland.txt`) already uses.
            table["table_name"] += "_source"
        taken_table_names.add(table["table_name"])
        tables[layout["file"]] = table
        if editor_key:
            used_editor.add(editor_key)
        else:
            counts["generated_new"] += 1
        counts["generated"] += 1
        if notes:
            report[layout["file"]] = notes

    for key in sorted(editor_tables):
        if key in used_editor:
            continue
        kept = annotate_special(editor_tables[key], layouts["files"].get(key.lower()))
        tables[key] = kept
        counts["editor_only"] += 1

    provenance = layouts.get("provenance", {})
    columns = [c for t in tables.values() if t.get("origin") == "tamandua" for c in t["columns"]]
    schema = {
        "schema_version": SCHEMA_VERSION,
        "source": {
            "repo": "swat-model/swatplus",
            "commit": provenance.get("source_commit"),
            "generated_on": provenance.get("source_describe") or provenance.get("source_commit"),
            "extraction_method": "tamandua_layouts",
        },
        "generated_from": {
            "layout_format": layouts.get("layout_format"),
            "swatplus": {
                "commit": provenance.get("source_commit"),
                "describe": provenance.get("source_describe"),
                "fingerprint": provenance.get("source_fingerprint"),
            },
            "parser_commit": provenance.get("parser_commit"),
            "editor_schema": editor_schema.get("source", {}),
            "header_references": [os.path.basename(d) for d in headers.directories],
        },
        "statistics": {
            "tables": len(tables),
            "tables_from_source": counts["generated"],
            "tables_only_in_source": counts["generated_new"],
            "special_tables_kept": counts["special"],
            "editor_tables_kept": counts["editor_only"],
            "columns_named_by_header": sum(c.get("name_source") == "header" for c in columns),
            "columns_named_by_aligned_editor": sum(
                c.get("name_source") == "editor-aligned" for c in columns),
            "columns_named_by_learned_names": sum(c.get("name_source") == "learned" for c in columns),
            "columns_named_by_editor": sum(c.get("name_source") == "editor" for c in columns),
            "columns_named_by_fortran": sum(c.get("name_source") == "fortran" for c in columns),
            "columns_not_read_by_swat": sum(not c.get("read_by_swat", True) for c in columns),
        },
        "tables": {key: tables[key] for key in sorted(tables)},
    }
    return schema, report


def render_report(schema: dict[str, Any], report: dict[str, list[str]]) -> str:
    stats = schema["statistics"]
    origin = schema["generated_from"]
    lines = [
        "# Generated schema report",
        "",
        f"- SWAT+: `{origin['swatplus'].get('describe')}` "
        f"(`{(origin['swatplus'].get('commit') or '')[:10]}`), parser "
        f"`{(origin.get('parser_commit') or '')[:10]}`",
        f"- Header references: {', '.join(origin['header_references']) or 'none'}",
        "",
    ]
    lines += [f"- {key.replace('_', ' ')}: **{value}**" for key, value in stats.items()]
    if report:
        lines += ["", "## Notes by file", ""]
        for file_name in sorted(report):
            for note in report[file_name]:
                lines.append(f"- `{file_name}`: {note}")
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--layouts", required=True, help="swatplus-layouts JSON")
    ap.add_argument("--editor-schema", required=True)
    ap.add_argument("--metadata", required=True)
    ap.add_argument("--headers", action="append", default=[],
                    help="dataset directory whose header lines name the columns "
                         "(repeatable; earlier wins)")
    ap.add_argument("--names", default=None,
                    help="names JSON from --write-names: header names by column, "
                         "used where no header line is available")
    ap.add_argument("--out", required=True)
    ap.add_argument("--report", default=None)
    ap.add_argument("--write-names", default=None,
                    help="also write the header names this run learned, for --names")
    args = ap.parse_args()

    def load(path: str) -> dict[str, Any]:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)

    names = load(args.names) if args.names and os.path.exists(args.names) else None
    schema, report = build_schema(load(args.layouts), load(args.editor_schema),
                                  load(args.metadata), args.headers, names)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(schema, handle, indent=1, ensure_ascii=False)
        handle.write("\n")
    if args.report:
        with open(args.report, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(render_report(schema, report))
    if args.write_names:
        with open(args.write_names, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(learned_names(schema), handle, indent=1, ensure_ascii=False)
            handle.write("\n")
    stats = schema["statistics"]
    print(f"tables {stats['tables']} ({stats['tables_from_source']} from source, "
          f"{stats['special_tables_kept']} special kept, {stats['editor_tables_kept']} editor only)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
