#!/usr/bin/env python3
"""Create reduced SWAT+ TxtInOut folders for selected HRUs.

The extension uses this as a dependency-free sidecar. It vendors the useful
core behavior from SWATPLUS_HRU_Processor and replaces the Tkinter GUI with a
small CLI that returns JSON.
"""

from __future__ import annotations

import argparse
import contextlib
from collections import deque
from datetime import datetime
import fnmatch
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from typing import Any


OBJ_TYPE_FILES = {
    "hru": ("hru.con", "hru-data.hru"),
    "ru": ("rout_unit.con", "rout_unit.rtu"),
    "sdc": ("chandeg.con", "channel-lte.cha"),
    "cha": ("channel.con", "channel.cha"),
    "aqu": ("aquifer.con", "aquifer.aqu"),
    "res": ("reservoir.con", "reservoir.res"),
    "rec": ("recall.con", "recall.rec"),
    "exc": ("exco.con", None),
    "dr": ("delratio.con", None),
    "out": ("outlet.con", None),
}

COUNT_COLUMN_ALIASES = {
    "obj": ("obj", "objs"),
    "hru": ("hru",),
    "hru_lte": ("lhru", "hru_lte", "hrulte", "hlt"),
    "ru": ("rtu", "ru"),
    "gwflow": ("gwfl", "gwflow"),
    "aqu": ("aqu",),
    "cha": ("cha", "chan"),
    "res": ("res",),
    "recall": ("rec", "recall"),
    "exco": ("exco",),
    "dr": ("dlr", "dr", "del"),
    "canal": ("can", "canal"),
    "pump": ("pmp", "pump"),
    "outlet": ("out", "outlet"),
    "chandeg": ("lcha", "chandeg", "sdc"),
    "aqu2d": ("aqu2d",),
    "herd": ("hrd", "herd"),
    "wro": ("wro",),
}

OBJECT_TYPE_TO_COUNT_KEY = {
    "hru": "hru",
    "hlt": "hru_lte",
    "hru_lte": "hru_lte",
    "ru": "ru",
    "gwflow": "gwflow",
    "aqu": "aqu",
    "cha": "cha",
    "res": "res",
    "rec": "recall",
    "recall": "recall",
    "exc": "exco",
    "exco": "exco",
    "dr": "dr",
    "out": "outlet",
    "outlet": "outlet",
    "sdc": "chandeg",
    "chandeg": "chandeg",
}

COUNT_KEYS = tuple(key for key in COUNT_COLUMN_ALIASES if key != "obj")


def parse_filter_ids(filter_input: str) -> list[int]:
    ids: set[int] = set()
    if not filter_input or not filter_input.strip():
        raise ValueError("Please provide at least one HRU ID.")

    for part in filter_input.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            try:
                start_text, end_text = part.split("-", 1)
                start = int(start_text.strip())
                end = int(end_text.strip())
            except ValueError as exc:
                raise ValueError(f"Invalid range format: '{part}'") from exc
            if start > end:
                raise ValueError(f"Invalid range '{part}': start should be <= end.")
            ids.update(range(start, end + 1))
        else:
            try:
                ids.add(int(part))
            except ValueError as exc:
                raise ValueError(f"Invalid ID format: '{part}'") from exc

    if not ids:
        raise ValueError("Please provide at least one HRU ID.")
    if any(value <= 0 for value in ids):
        raise ValueError("HRU IDs must be positive integers.")
    return sorted(ids)


def resolve_txtinout_dir(dataset_path: str | os.PathLike[str]) -> Path:
    dataset = Path(dataset_path).resolve()
    if (dataset / "file.cio").is_file():
        return dataset
    txtinout = dataset / "TxtInOut"
    if (txtinout / "file.cio").is_file():
        return txtinout
    raise ValueError(f"No file.cio found in {dataset}. Select a SWAT+ TxtInOut folder.")


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def count_column_index(headers: list[str], key: str) -> int | None:
    aliases = {normalize(alias) for alias in COUNT_COLUMN_ALIASES[key]}
    for index, header in enumerate(headers):
        if normalize(header) in aliases:
            return index
    return None


def canonical_counts(counts: dict[str, int]) -> dict[str, int]:
    canonical: dict[str, int] = {}
    for key, value in counts.items():
        count_key = OBJECT_TYPE_TO_COUNT_KEY.get(key, key)
        if count_key not in COUNT_COLUMN_ALIASES:
            continue
        canonical[count_key] = canonical.get(count_key, 0) + int(value)
    return canonical


def format_count_fields(headers: list[str], fields: list[str]) -> str:
    width_count = max(len(headers), len(fields))
    widths = []
    for index in range(width_count):
        header = headers[index] if index < len(headers) else ""
        field = fields[index] if index < len(fields) else ""
        widths.append(max(len(header), len(field)))
    return " ".join(fields[index].rjust(widths[index]) for index in range(len(fields))) + "\n"


def update_object_count_file(path: str | os.PathLike[str], counts: dict[str, int]) -> None:
    path = Path(path)
    with path.open("r") as file:
        lines = file.readlines()
    if len(lines) < 3:
        raise ValueError(f"{path.name} must contain a title, header, and data row.")

    title = lines[0]
    header_line = lines[1]
    headers = header_line.split()
    obj_index = count_column_index(headers, "obj")
    if obj_index is None:
        raise ValueError("object.cnt does not contain an object total column.")

    counts_by_key = canonical_counts(counts)
    total = sum(counts_by_key.get(key, 0) for key in COUNT_KEYS)
    new_lines = [title, header_line]

    for line in lines[2:]:
        fields = line.split()
        if not fields:
            new_lines.append(line)
            continue
        if obj_index >= len(fields):
            raise ValueError("object.cnt data row has fewer columns than its header.")

        for key in COUNT_KEYS:
            index = count_column_index(headers, key)
            if index is not None and index < len(fields):
                fields[index] = "0"

        fields[obj_index] = str(total)
        for key, value in counts_by_key.items():
            if key == "obj":
                continue
            index = count_column_index(headers, key)
            if index is None:
                if value:
                    raise ValueError(f"object.cnt is missing a column for {key}.")
                continue
            if index >= len(fields):
                raise ValueError("object.cnt data row has fewer columns than its header.")
            fields[index] = str(value)
        new_lines.append(format_count_fields(headers, fields))

    with path.open("w") as file:
        file.writelines(new_lines)


def make_unique_destination(path: Path) -> Path:
    if not path.exists():
        return path
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    candidate = path.with_name(f"{path.name}_{timestamp}")
    if not candidate.exists():
        return candidate
    suffix = 2
    while True:
        candidate = path.with_name(f"{path.name}_{timestamp}_{suffix}")
        if not candidate.exists():
            return candidate
        suffix += 1


def copy_swat(
    src_dir: str | os.PathLike[str],
    dest_dir: str | os.PathLike[str],
    overwrite: bool = False,
    exclude_suffixes: list[str] | None = None,
) -> Path:
    src = Path(src_dir).resolve()
    dest = Path(dest_dir).resolve()
    if not src.exists():
        raise FileNotFoundError(f"Source directory {src} does not exist.")

    if dest.exists():
        if overwrite:
            shutil.rmtree(dest)
        else:
            dest = make_unique_destination(dest)

    if exclude_suffixes is None:
        exclude_suffixes = [
            "*.txt",
            "*.csv",
            "*.out",
            "*.fin",
            "*.sqlite",
            "*.db",
            "*.log",
            "*.pid",
            "fort.*",
        ]

    dest.mkdir(parents=True, exist_ok=True)
    for entry in src.iterdir():
        if not entry.is_file():
            continue
        lower_name = entry.name.lower()
        if any(fnmatch.fnmatch(lower_name, pattern.lower()) for pattern in exclude_suffixes):
            continue
        shutil.copy2(entry, dest / entry.name)

    print(f"Working copy created: {dest}")
    return dest


class FileModifier:
    def __init__(self, txtinout_dir: str | os.PathLike[str]):
        self.txtinout_dir = os.fspath(txtinout_dir)
        self.hru_id_map: dict[int, int] = {}
        self.hru_props_map: dict[int, int] = {}

    def _file_path(self, filename: str) -> str:
        direct = os.path.join(self.txtinout_dir, filename)
        if os.path.isfile(direct):
            return direct
        target = filename.lower()
        for existing in os.listdir(self.txtinout_dir):
            if existing.lower() == target:
                return os.path.join(self.txtinout_dir, existing)
        return direct

    def _read_hru_rows(self) -> tuple[list[str], list[dict[str, str]]]:
        path = self._file_path("hru.con")
        with open(path, "r") as file:
            lines = file.readlines()
        if len(lines) < 2:
            raise ValueError("hru.con must contain a title and column header.")

        headers = lines[1].split()
        rows: list[dict[str, str]] = []
        for line in lines[2:]:
            fields = line.split()
            if fields:
                rows.append(dict(zip(headers, fields)))
        return headers, rows

    def _expand_element_tokens(self, tokens: list[str]) -> list[int]:
        values: list[int] = []
        for token in tokens:
            try:
                values.append(int(token))
            except ValueError:
                continue

        expanded: list[int] = []
        index = 0
        while index < len(values):
            if index + 1 < len(values) and values[index + 1] < 0:
                start = values[index]
                end = abs(values[index + 1])
                step = 1 if start <= end else -1
                expanded.extend(range(start, end + step, step))
                index += 2
            else:
                expanded.append(values[index])
                index += 1
        return expanded

    def _format_row(self, fields: list[str], width: int = 12) -> str:
        return " ".join(str(value).rjust(width) for value in fields) + "\n"

    def _header_index(self, headers: list[str], names: set[str], default: int | None = None) -> int | None:
        lowered = {name.lower() for name in names}
        return next((index for index, header in enumerate(headers) if header.lower() in lowered), default)

    def get_hru_range(self) -> tuple[int, int, int]:
        headers, rows = self._read_hru_rows()
        id_column = next((column for column in headers if column.lower() == "id"), None)
        if id_column is None:
            raise ValueError("No 'ID' column found in hru.con file.")

        hru_ids = []
        for row in rows:
            try:
                hru_ids.append(int(row[id_column]))
            except (KeyError, ValueError):
                continue
        if not hru_ids:
            raise ValueError("No HRU IDs found in hru.con file.")
        return min(hru_ids), max(hru_ids), len(hru_ids)

    def get_hru_line(self, filter_id: int) -> dict[str, str] | None:
        headers, rows = self._read_hru_rows()
        id_column = next((column for column in headers if column.lower() == "id"), None)
        if id_column is None:
            raise ValueError("No 'ID' column found in hru.con file.")
        for row in rows:
            try:
                if int(row[id_column]) == int(filter_id):
                    return row
            except (KeyError, ValueError):
                continue
        return None

    def modify_hru_con(self, filter_ids: list[int]) -> list[int]:
        path = self._file_path("hru.con")
        with open(path, "r") as file:
            lines = file.readlines()
        if len(lines) < 2:
            raise ValueError("hru.con must contain a title and column header.")

        title = lines[0]
        column_header = lines[1]
        column_names = column_header.split()
        id_idx = next((i for i, col in enumerate(column_names) if col.lower() == "id"), None)
        out_idx = next(
            (
                i
                for i, col in enumerate(column_names)
                if col.lower() in {"out_tot", "src_tot"}
            ),
            None,
        )
        props_idx = 7 if len(column_names) > 7 else None
        if id_idx is None:
            raise ValueError("No 'id' column found in hru.con.")
        if out_idx is None:
            raise ValueError("No 'out_tot' or 'src_tot' column found in hru.con.")

        filter_set = {int(filter_id) for filter_id in filter_ids}
        selected: list[list[str]] = []
        found_ids: set[int] = set()
        for line in lines[2:]:
            fields = line.split()
            if not fields:
                continue
            try:
                hru_id = int(fields[id_idx])
            except (IndexError, ValueError):
                continue
            if hru_id in filter_set:
                selected.append(fields)
                found_ids.add(hru_id)

        missing_ids = sorted(filter_set - found_ids)
        if missing_ids:
            raise ValueError(f"HRU ID(s) not found in hru.con: {missing_ids}")

        original_props: list[int] = []
        if props_idx is not None:
            for fields in selected:
                if props_idx < len(fields):
                    try:
                        original_props.append(int(fields[props_idx]))
                    except ValueError:
                        pass
        unique_props = sorted(set(original_props))
        props_map = {old: new for new, old in enumerate(unique_props, start=1)}
        self.hru_props_map = props_map

        base_col_count = out_idx + 1
        base_col_names = column_names[:base_col_count]
        renumbered: list[list[str]] = []
        self.hru_id_map = {}
        for new_id, fields in enumerate(selected, start=1):
            old_id = int(fields[id_idx])
            self.hru_id_map[old_id] = new_id
            row = fields[:base_col_count]
            row[id_idx] = str(new_id)
            if props_idx is not None and props_idx < len(row):
                try:
                    row[props_idx] = str(props_map[int(row[props_idx])])
                except (KeyError, ValueError):
                    pass
            row[out_idx] = "0"
            renumbered.append(row)

        column_widths = []
        for index, column in enumerate(base_col_names):
            max_data = max(len(row[index]) for row in renumbered)
            column_widths.append(max(len(column), max_data))

        with open(path, "w") as file:
            file.write(title)
            file.write(
                " ".join(column.rjust(width) for column, width in zip(base_col_names, column_widths))
                + "\n"
            )
            for row in renumbered:
                file.write(
                    " ".join(value.rjust(width) for value, width in zip(row, column_widths))
                    + "\n"
                )

        print(f"hru.con updated: kept {len(renumbered)} HRU(s).")
        return unique_props

    def modify_object_cnt(self, hru_count: int) -> None:
        update_object_count_file(self._file_path("object.cnt"), {"hru": hru_count})
        print("object.cnt updated successfully.")

    def modify_file_cio(self, parameters_to_nullify: set[str] | None = None) -> None:
        if parameters_to_nullify is None:
            parameters_to_nullify = {
                "rout_unit.dr",
                "water_allocation.wro",
                "element.wro",
                "water_rights.wro",
                "object.prt",
                "rout_unit.con",
                "aquifer.con",
                "aquifer2d.con",
                "channel.con",
                "reservoir.con",
                "recall.con",
                "exco.con",
                "delratio.con",
                "outlet.con",
                "chandeg.con",
                "gwflow.con",
                "hru-lte.con",
            }
        path = self._file_path("file.cio")
        with open(path, "r") as file:
            content = file.read()
        for filename in parameters_to_nullify:
            pattern = re.compile(rf"\b{re.escape(filename)}\b", re.IGNORECASE)
            if pattern.search(content):
                content = pattern.sub("null", content)
                print(f"  {filename} -> null")
        with open(path, "w") as file:
            file.write(content)
        print("file.cio updated successfully.")

    def disable_print_objects(self, object_names: set[str]) -> None:
        path = self._file_path("print.prt")
        if not os.path.isfile(path):
            return
        disabled = {name.lower() for name in object_names}
        changed = 0
        new_lines: list[str] = []
        with open(path, "r") as file:
            for line in file:
                fields = line.split()
                if len(fields) >= 5 and fields[0].lower() in disabled:
                    fields[1:5] = ["n", "n", "n", "n"]
                    line = " ".join(fields) + "\n"
                    changed += 1
                new_lines.append(line)
        if changed:
            with open(path, "w") as file:
                file.writelines(new_lines)
            print(f"print.prt updated: disabled {changed} routing-unit output row(s).")

    def modify_secondary_references(self, hru_id_map: dict[int, int] | None = None) -> dict[str, dict[int, int]]:
        hru_id_map = hru_id_map or self.hru_id_map
        if not hru_id_map:
            raise ValueError("HRU ID map is empty. Run modify_hru_con first.")
        lsu_elem_map = self.modify_ls_unit_ele(hru_id_map)
        self.modify_ls_unit_def(lsu_elem_map)
        ru_elem_map = self.modify_rout_unit_ele(hru_id_map)
        ru_id_map = self.modify_rout_unit_def(ru_elem_map)
        self.modify_rout_unit_rtu(ru_id_map)
        return {
            "ls_unit_elements": lsu_elem_map,
            "rout_unit_elements": ru_elem_map,
            "rout_units": ru_id_map,
        }

    def modify_ls_unit_ele(self, hru_id_map: dict[int, int]) -> dict[int, int]:
        path = self._file_path("ls_unit.ele")
        if not os.path.isfile(path):
            return {}
        with open(path, "r") as file:
            lines = file.readlines()
        if len(lines) < 2:
            return {}

        title = lines[0]
        column_header = lines[1]
        headers = column_header.split()
        id_idx = self._header_index(headers, {"id"}, 0)
        typ_idx = self._header_index(headers, {"obj_typ", "objtyp"}, 2)
        obj_idx = self._header_index(headers, {"obj_typ_no", "objtypno", "obj_id"}, 3)
        if id_idx is None or typ_idx is None or obj_idx is None:
            return {}

        selected: list[tuple[int, int, list[str]]] = []
        for line in lines[2:]:
            fields = line.split()
            if len(fields) <= max(id_idx, typ_idx, obj_idx):
                continue
            try:
                old_elem_id = int(fields[id_idx])
                old_hru_id = int(fields[obj_idx])
            except ValueError:
                continue
            if fields[typ_idx].lower() == "hru" and old_hru_id in hru_id_map:
                selected.append((hru_id_map[old_hru_id], old_elem_id, fields))

        selected.sort(key=lambda item: item[0])
        elem_map: dict[int, int] = {}
        renumbered: list[list[str]] = []
        for new_hru_id, old_elem_id, fields in selected:
            elem_map[old_elem_id] = new_hru_id
            fields[id_idx] = str(new_hru_id)
            fields[obj_idx] = str(new_hru_id)
            renumbered.append(fields)

        with open(path, "w") as file:
            file.write(title)
            file.write(column_header)
            for row in renumbered:
                file.write(self._format_row(row))
        print(f"ls_unit.ele updated: kept {len(renumbered)} element(s).")
        return elem_map

    def modify_ls_unit_def(self, elem_map: dict[int, int]) -> dict[int, int]:
        path = self._file_path("ls_unit.def")
        if not os.path.isfile(path):
            return {}
        with open(path, "r") as file:
            lines = file.readlines()
        if len(lines) < 3:
            return {}

        title = lines[0]
        column_header = lines[2]
        def_map: dict[int, int] = {}
        renumbered: list[list[str]] = []
        for line in lines[3:]:
            fields = line.split()
            if len(fields) < 4:
                continue
            try:
                old_def_id = int(fields[0])
                elem_tot = int(fields[3])
            except ValueError:
                continue
            old_elements = self._expand_element_tokens(fields[4 : 4 + elem_tot])
            new_elements = [str(elem_map[elem]) for elem in old_elements if elem in elem_map]
            if not new_elements:
                continue
            new_def_id = len(renumbered) + 1
            def_map[old_def_id] = new_def_id
            fields[0] = str(new_def_id)
            fields[3] = str(len(new_elements))
            renumbered.append(fields[:4] + new_elements)

        with open(path, "w") as file:
            file.write(title)
            file.write(f"{len(renumbered)}\n")
            file.write(column_header)
            for row in renumbered:
                file.write(self._format_row(row))
        print(f"ls_unit.def updated: kept {len(renumbered)} definition(s).")
        return def_map

    def modify_rout_unit_ele(self, hru_id_map: dict[int, int]) -> dict[int, int]:
        path = self._file_path("rout_unit.ele")
        if not os.path.isfile(path):
            return {}
        with open(path, "r") as file:
            lines = file.readlines()
        if len(lines) < 2:
            return {}

        title = lines[0]
        column_header = lines[1]
        headers = column_header.split()
        id_idx = self._header_index(headers, {"id"}, 0)
        typ_idx = self._header_index(headers, {"obj_typ", "objtyp"}, 2)
        obj_idx = self._header_index(headers, {"obj_id", "obj_typ_no", "objtypno"}, 3)
        if id_idx is None or typ_idx is None or obj_idx is None:
            return {}

        selected: list[tuple[int, int, list[str]]] = []
        for line in lines[2:]:
            fields = line.split()
            if len(fields) <= max(id_idx, typ_idx, obj_idx):
                continue
            try:
                old_elem_id = int(fields[id_idx])
                old_hru_id = int(fields[obj_idx])
            except ValueError:
                continue
            if fields[typ_idx].lower() == "hru" and old_hru_id in hru_id_map:
                selected.append((hru_id_map[old_hru_id], old_elem_id, fields))

        selected.sort(key=lambda item: item[0])
        elem_map: dict[int, int] = {}
        renumbered: list[list[str]] = []
        for new_elem_id, (new_hru_id, old_elem_id, fields) in enumerate(selected, start=1):
            elem_map[old_elem_id] = new_elem_id
            fields[id_idx] = str(new_elem_id)
            fields[obj_idx] = str(new_hru_id)
            renumbered.append(fields)

        with open(path, "w") as file:
            file.write(title)
            file.write(column_header)
            for row in renumbered:
                file.write(self._format_row(row))
        print(f"rout_unit.ele updated: kept {len(renumbered)} element(s).")
        return elem_map

    def modify_rout_unit_def(self, elem_map: dict[int, int]) -> dict[int, int]:
        path = self._file_path("rout_unit.def")
        if not os.path.isfile(path):
            return {}
        with open(path, "r") as file:
            lines = file.readlines()
        if len(lines) < 2:
            return {}

        title = lines[0]
        column_header = lines[1]
        ru_map: dict[int, int] = {}
        renumbered: list[list[str]] = []
        for line in lines[2:]:
            fields = line.split()
            if len(fields) < 3:
                continue
            try:
                old_ru_id = int(fields[0])
                elem_tot = int(fields[2])
            except ValueError:
                continue
            old_elements = self._expand_element_tokens(fields[3 : 3 + elem_tot])
            new_elements = [str(elem_map[elem]) for elem in old_elements if elem in elem_map]
            if not new_elements:
                continue
            new_ru_id = len(renumbered) + 1
            ru_map[old_ru_id] = new_ru_id
            fields[0] = str(new_ru_id)
            fields[2] = str(len(new_elements))
            renumbered.append(fields[:3] + new_elements)

        with open(path, "w") as file:
            file.write(title)
            file.write(column_header)
            for row in renumbered:
                file.write(self._format_row(row))
        print(f"rout_unit.def updated: kept {len(renumbered)} definition(s).")
        return ru_map

    def modify_rout_unit_rtu(self, ru_id_map: dict[int, int]) -> None:
        path = self._file_path("rout_unit.rtu")
        if not os.path.isfile(path):
            return
        with open(path, "r") as file:
            lines = file.readlines()
        if len(lines) < 2:
            return

        title = lines[0]
        column_header = lines[1]
        renumbered: list[list[str]] = []
        for line in lines[2:]:
            fields = line.split()
            if not fields:
                continue
            try:
                old_ru_id = int(fields[0])
            except ValueError:
                continue
            if old_ru_id not in ru_id_map:
                continue
            fields[0] = str(ru_id_map[old_ru_id])
            renumbered.append(fields)

        with open(path, "w") as file:
            file.write(title)
            file.write(column_header)
            for row in renumbered:
                file.write(self._format_row(row))
        print(f"rout_unit.rtu updated: kept {len(renumbered)} row(s).")

    def modify_hru_data(self, filter_ids: list[int]) -> None:
        path = self._file_path("hru-data.hru")
        if not os.path.isfile(path):
            raise FileNotFoundError("hru-data.hru not found.")
        with open(path, "r") as file:
            lines = file.readlines()
        if len(lines) < 3:
            raise ValueError("hru-data.hru must contain a title, header, and data row.")

        title = lines[0]
        column_header = lines[1]
        filter_set = {int(filter_id) for filter_id in filter_ids}
        selected: list[str] = []
        found_ids: set[int] = set()
        for line in lines[2:]:
            fields = line.split()
            if not fields:
                continue
            try:
                data_id = int(fields[0])
            except ValueError:
                continue
            if data_id in filter_set:
                selected.append(line)
                found_ids.add(data_id)

        missing_ids = sorted(filter_set - found_ids)
        if missing_ids:
            raise ValueError(f"ID(s) not found in hru-data.hru: {missing_ids}")

        renumbered: list[str] = []
        for new_id, line in enumerate(selected, start=1):
            fields = line.split(maxsplit=1)
            if len(fields) > 1:
                renumbered.append(f"{new_id:>8} {fields[1]}\n")
            else:
                renumbered.append(f"{new_id:>8}\n")

        with open(path, "w") as file:
            file.write(title)
            file.write(column_header)
            file.writelines(renumbered)
        print(f"hru-data.hru updated: kept {len(renumbered)} row(s).")


class RoutingTracer:
    def __init__(self, txtinout_dir: str | os.PathLike[str]):
        self.dir = os.fspath(txtinout_dir)
        self._elem_id_map: dict[int, int] = {}

    def trace_and_filter(self, selected_hru_ids: list[int]) -> tuple[dict[str, set[int]], dict[str, dict[int, int]]]:
        ru_ids = self._find_routing_units_for_hrus(selected_hru_ids)
        print(f"Routing units containing selected HRUs: {sorted(ru_ids)}")

        graph: dict[tuple[str, int], list[tuple[str, int, str, float]]] = {}
        for typ, (con_file, _) in OBJ_TYPE_FILES.items():
            path = os.path.join(self.dir, con_file)
            if not os.path.isfile(path):
                continue
            rows = self._parse_con_file(path)
            for obj_id, fields in rows.items():
                graph[(typ, obj_id)] = self._extract_routing_targets(fields)

        keep: dict[str, set[int]] = {}
        keep.setdefault("hru", set()).update(selected_hru_ids)
        keep.setdefault("ru", set()).update(ru_ids)

        queue: deque[tuple[str, int]] = deque()
        for hid in selected_hru_ids:
            queue.append(("hru", hid))
        for rid in ru_ids:
            queue.append(("ru", rid))

        visited = set(queue)
        while queue:
            node = queue.popleft()
            for target_typ, target_id, _, _ in graph.get(node, []):
                key = (target_typ, target_id)
                if key not in visited:
                    visited.add(key)
                    keep.setdefault(target_typ, set()).add(target_id)
                    queue.append(key)

        print("Objects to keep:")
        for typ in sorted(keep):
            print(f"  {typ}: {sorted(keep[typ])}")

        id_maps = {
            typ: {old: new for new, old in enumerate(sorted(ids), start=1)}
            for typ, ids in keep.items()
        }

        for typ, (con_file, data_file) in OBJ_TYPE_FILES.items():
            if typ not in keep:
                continue
            con_path = os.path.join(self.dir, con_file)
            original_props: set[int] = set()
            if os.path.isfile(con_path):
                original_props = self._filter_con_file(con_path, keep[typ], id_maps[typ], id_maps)
            if data_file:
                data_path = os.path.join(self.dir, data_file)
                if os.path.isfile(data_path):
                    filter_ids_for_data = original_props if original_props else keep[typ]
                    data_map = {old: new for new, old in enumerate(sorted(filter_ids_for_data), start=1)}
                    self._filter_data_file(data_path, filter_ids_for_data, data_map)

        if "ru" in keep:
            self._filter_rout_unit_ele(keep, id_maps)
            self._filter_rout_unit_def(keep["ru"], id_maps)

        if "hru" in id_maps:
            modifier = FileModifier(self.dir)
            lsu_elem_map = modifier.modify_ls_unit_ele(id_maps["hru"])
            modifier.modify_ls_unit_def(lsu_elem_map)

        update_object_count_file(
            os.path.join(self.dir, "object.cnt"),
            {typ: len(ids) for typ, ids in keep.items()},
        )
        print("  object.cnt updated")
        self._update_file_cio(keep)
        return keep, id_maps

    def _parse_con_file(self, path: str) -> dict[int, list[str]]:
        rows: dict[int, list[str]] = {}
        with open(path, "r") as file:
            lines = file.readlines()
        if len(lines) < 3:
            return rows
        for line in lines[2:]:
            fields = line.split()
            if not fields:
                continue
            try:
                rows[int(fields[0])] = fields
            except ValueError:
                continue
        return rows

    def _expand_element_tokens(self, tokens: list[str]) -> list[int]:
        values: list[int] = []
        for token in tokens:
            try:
                values.append(int(token))
            except ValueError:
                continue

        expanded: list[int] = []
        index = 0
        while index < len(values):
            if index + 1 < len(values) and values[index + 1] < 0:
                start = values[index]
                end = abs(values[index + 1])
                step = 1 if start <= end else -1
                expanded.extend(range(start, end + step, step))
                index += 2
            else:
                expanded.append(values[index])
                index += 1
        return expanded

    def _extract_routing_targets(self, fields: list[str]) -> list[tuple[str, int, str, float]]:
        targets: list[tuple[str, int, str, float]] = []
        try:
            src_tot = int(fields[12])
        except (IndexError, ValueError):
            return targets
        for index in range(src_tot):
            base = 13 + index * 4
            if base + 3 >= len(fields):
                break
            obj_typ = fields[base]
            try:
                obj_id = int(fields[base + 1])
            except ValueError:
                continue
            hyd_typ = fields[base + 2]
            try:
                frac = float(fields[base + 3])
            except ValueError:
                frac = 1.0
            targets.append((obj_typ, obj_id, hyd_typ, frac))
        return targets

    def _find_routing_units_for_hrus(self, hru_ids: list[int]) -> set[int]:
        hru_set = set(hru_ids)
        ele_path = os.path.join(self.dir, "rout_unit.ele")
        hru_elem_ids: set[int] = set()
        if os.path.isfile(ele_path):
            with open(ele_path, "r") as file:
                lines = file.readlines()
            for line in lines[2:]:
                fields = line.split()
                if len(fields) < 4:
                    continue
                try:
                    elem_id = int(fields[0])
                    obj_typ = fields[2]
                    obj_typ_no = int(fields[3])
                except (ValueError, IndexError):
                    continue
                if obj_typ == "hru" and obj_typ_no in hru_set:
                    hru_elem_ids.add(elem_id)

        def_path = os.path.join(self.dir, "rout_unit.def")
        ru_ids: set[int] = set()
        if os.path.isfile(def_path):
            with open(def_path, "r") as file:
                lines = file.readlines()
            for line in lines[2:]:
                fields = line.split()
                if len(fields) < 3:
                    continue
                try:
                    ru_id = int(fields[0])
                    num_elem = int(fields[2])
                except (ValueError, IndexError):
                    continue
                elem_ids = set(self._expand_element_tokens(fields[3 : 3 + num_elem]))
                if elem_ids & hru_elem_ids:
                    ru_ids.add(ru_id)
        return ru_ids

    def _filter_con_file(
        self,
        path: str,
        kept_ids: set[int],
        my_map: dict[int, int],
        all_maps: dict[str, dict[int, int]],
    ) -> set[int]:
        with open(path, "r") as file:
            lines = file.readlines()
        if len(lines) < 2:
            return set()

        header = lines[0]
        col_header = lines[1]
        col_names = col_header.split()
        id_idx = 0
        props_idx = 7 if len(col_names) > 7 else None
        src_idx = next((i for i, col in enumerate(col_names) if col.lower() == "src_tot"), 12)

        kept_strs = {str(item) for item in kept_ids}
        selected: list[list[str]] = []
        for line in lines[2:]:
            fields = line.split()
            if fields and fields[id_idx] in kept_strs:
                selected.append(fields)

        original_props: set[int] = set()
        if props_idx is not None:
            for fields in selected:
                if props_idx < len(fields):
                    try:
                        original_props.add(int(fields[props_idx]))
                    except ValueError:
                        pass
        props_map = {old: new for new, old in enumerate(sorted(original_props), start=1)}

        renumbered: list[list[str]] = []
        for fields in selected:
            old_id = int(fields[id_idx])
            fields[id_idx] = str(my_map[old_id])
            if props_idx is not None and props_idx < len(fields):
                try:
                    fields[props_idx] = str(props_map[int(fields[props_idx])])
                except (ValueError, KeyError):
                    pass

            try:
                src_tot = int(fields[src_idx])
            except (IndexError, ValueError):
                src_tot = 0
            new_targets: list[list[str]] = []
            for index in range(src_tot):
                typ_col = src_idx + 1 + index * 4
                id_col = typ_col + 1
                hyd_col = typ_col + 2
                frac_col = typ_col + 3
                if frac_col >= len(fields):
                    break
                target_typ = fields[typ_col]
                try:
                    target_old_id = int(fields[id_col])
                except ValueError:
                    continue
                target_map = all_maps.get(target_typ, {})
                if target_old_id in target_map:
                    new_targets.append([
                        target_typ,
                        str(target_map[target_old_id]),
                        fields[hyd_col],
                        fields[frac_col],
                    ])

            base = fields[:src_idx]
            base.append(str(len(new_targets)))
            for target in new_targets:
                base.extend(target)
            renumbered.append(base)

        with open(path, "w") as file:
            file.write(header)
            file.write(col_header)
            for row in renumbered:
                file.write("  ".join(value.rjust(8) for value in row) + "\n")
        print(f"  {os.path.basename(path)}: kept {len(renumbered)} rows")
        return original_props

    def _filter_data_file(self, path: str, kept_ids: set[int], id_map: dict[int, int]) -> None:
        with open(path, "r") as file:
            lines = file.readlines()
        if len(lines) < 3:
            return

        header = lines[0]
        col_header = lines[1]
        kept_strs = {str(item) for item in kept_ids}
        renumbered: list[str] = []
        for line in lines[2:]:
            fields = line.split()
            if not fields or fields[0] not in kept_strs:
                continue
            old_id = int(fields[0])
            new_id = id_map[old_id]
            rest = line.split(maxsplit=1)
            if len(rest) > 1:
                renumbered.append(f"{new_id:>8} {rest[1]}")
            else:
                renumbered.append(f"{new_id:>8}\n")

        with open(path, "w") as file:
            file.write(header)
            file.write(col_header)
            for line in renumbered:
                file.write(line if line.endswith("\n") else line + "\n")
        print(f"  {os.path.basename(path)}: kept {len(renumbered)} rows")

    def _filter_rout_unit_ele(self, keep: dict[str, set[int]], id_maps: dict[str, dict[int, int]]) -> None:
        path = os.path.join(self.dir, "rout_unit.ele")
        if not os.path.isfile(path):
            return
        with open(path, "r") as file:
            lines = file.readlines()
        if len(lines) < 3:
            return

        header = lines[0]
        col_header = lines[1]
        selected: list[list[str]] = []
        for line in lines[2:]:
            fields = line.split()
            if len(fields) < 4:
                continue
            obj_typ = fields[2]
            try:
                obj_typ_no = int(fields[3])
            except ValueError:
                continue
            if obj_typ in keep and obj_typ_no in keep[obj_typ]:
                selected.append(fields)

        self._elem_id_map = {}
        renumbered: list[list[str]] = []
        for new_elem_id, fields in enumerate(selected, start=1):
            old_elem_id = int(fields[0])
            self._elem_id_map[old_elem_id] = new_elem_id
            fields[0] = str(new_elem_id)
            obj_typ = fields[2]
            old_obj_no = int(fields[3])
            type_map = id_maps.get(obj_typ, {})
            if old_obj_no in type_map:
                fields[3] = str(type_map[old_obj_no])
            renumbered.append(fields)

        with open(path, "w") as file:
            file.write(header)
            file.write(col_header)
            for row in renumbered:
                file.write("  ".join(value.rjust(12) for value in row) + "\n")
        print(f"  rout_unit.ele: kept {len(renumbered)} elements")

    def _filter_rout_unit_def(self, kept_ru_ids: set[int], id_maps: dict[str, dict[int, int]]) -> None:
        path = os.path.join(self.dir, "rout_unit.def")
        if not os.path.isfile(path):
            return
        with open(path, "r") as file:
            lines = file.readlines()
        if len(lines) < 3:
            return

        header = lines[0]
        col_header = lines[1]
        ru_map = id_maps.get("ru", {})
        kept_strs = {str(item) for item in kept_ru_ids}
        renumbered: list[list[str]] = []
        for line in lines[2:]:
            fields = line.split()
            if not fields or fields[0] not in kept_strs:
                continue
            old_ru_id = int(fields[0])
            fields[0] = str(ru_map.get(old_ru_id, old_ru_id))
            try:
                num_elem = int(fields[2])
            except ValueError:
                num_elem = 0
            old_elements = self._expand_element_tokens(fields[3 : 3 + num_elem])
            new_elem_refs = [
                str(self._elem_id_map[old_elem])
                for old_elem in old_elements
                if old_elem in self._elem_id_map
            ]
            fields[2] = str(len(new_elem_refs))
            renumbered.append(fields[:3] + new_elem_refs)

        with open(path, "w") as file:
            file.write(header)
            file.write(col_header)
            for row in renumbered:
                file.write("  ".join(value.rjust(12) for value in row) + "\n")
        print(f"  rout_unit.def: kept {len(renumbered)} routing units")

    def _update_file_cio(self, keep: dict[str, set[int]]) -> None:
        always_null = {
            "water_allocation.wro",
            "element.wro",
            "water_rights.wro",
            "object.prt",
        }
        for typ, (con_file, data_file) in OBJ_TYPE_FILES.items():
            if typ not in keep:
                always_null.add(con_file)
                if data_file:
                    always_null.add(data_file)

        path = os.path.join(self.dir, "file.cio")
        with open(path, "r") as file:
            content = file.read()
        for param in always_null:
            pattern = re.compile(rf"\b{re.escape(param)}\b", re.IGNORECASE)
            if pattern.search(content):
                content = pattern.sub("null", content)
                print(f"    {param} -> null")
        with open(path, "w") as file:
            file.write(content)
        print("  file.cio updated")


def find_swat_executable(directory: Path, explicit: str | None) -> Path:
    if explicit:
        exe = Path(explicit).resolve()
        if not exe.is_file():
            raise ValueError(f"Invalid executable path: {exe}")
        return exe

    candidates = [path for path in directory.iterdir() if path.is_file() and path.suffix.lower() == ".exe"]
    if len(candidates) == 1:
        return candidates[0]
    if not candidates:
        raise ValueError("No SWAT+ executable found in the generated folder.")
    names = ", ".join(path.name for path in candidates)
    raise ValueError(f"Multiple executables found. Provide --exe. Found: {names}")


def run_swat(directory: Path, exe_path: Path) -> None:
    print(f"Running SWAT+ simulation with executable: {exe_path}")
    with subprocess.Popen(
        [str(exe_path)],
        cwd=str(directory),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    ) as process:
        assert process.stdout is not None
        while True:
            raw_output = process.stdout.readline()
            if raw_output == b"" and process.poll() is not None:
                break
            output = raw_output.decode("latin-1", errors="replace").strip()
            if output:
                print(output)
        if process.returncode != 0:
            raise RuntimeError(f"SWAT+ exited with code {process.returncode}.")
    print("SWAT+ simulation completed successfully.")


def process_hru_subset(
    dataset: str,
    hru_ids: list[int],
    keep_routing: bool = False,
    run_simulation: bool = False,
    exe_path: str | None = None,
    output_dir: str | None = None,
    overwrite: bool = False,
) -> dict[str, Any]:
    source_dir = resolve_txtinout_dir(dataset)
    dest_folder_name = (
        f"solo_{hru_ids[0]}"
        if len(hru_ids) == 1
        else f"multi_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    )
    requested_dest = Path(output_dir).resolve() if output_dir else source_dir / dest_folder_name
    dest_dir = copy_swat(source_dir, requested_dest, overwrite=overwrite)

    if keep_routing:
        keep, id_maps = RoutingTracer(dest_dir).trace_and_filter(hru_ids)
        retained_counts = {key: len(value) for key, value in keep.items()}
    else:
        modifier = FileModifier(dest_dir)
        props_ids = modifier.modify_hru_con(hru_ids)
        modifier.modify_hru_data(props_ids if props_ids else hru_ids)
        modifier.modify_secondary_references()
        modifier.modify_object_cnt(len(hru_ids))
        modifier.modify_file_cio()
        modifier.disable_print_objects({
            "lsunit_wb",
            "lsunit_nb",
            "lsunit_ls",
            "lsunit_pw",
            "ru",
            "ru_salt",
            "ru_cs",
        })
        id_maps = {"hru": modifier.hru_id_map}
        retained_counts = {"hru": len(hru_ids)}

    simulation_exe: str | None = None
    if run_simulation:
        exe = find_swat_executable(dest_dir, exe_path)
        simulation_exe = str(exe)
        run_swat(dest_dir, exe)

    return {
        "ok": True,
        "source_dir": str(source_dir),
        "output_dir": str(dest_dir),
        "hru_ids": hru_ids,
        "keep_routing": keep_routing,
        "run_simulation": run_simulation,
        "simulation_exe": simulation_exe,
        "retained_counts": retained_counts,
        "id_maps": {
            key: {str(old): new for old, new in value.items()}
            for key, value in id_maps.items()
        },
    }


def inspect_hru_range(dataset: str) -> dict[str, Any]:
    source_dir = resolve_txtinout_dir(dataset)
    minimum, maximum, total = FileModifier(source_dir).get_hru_range()
    return {
        "ok": True,
        "source_dir": str(source_dir),
        "min_hru": minimum,
        "max_hru": maximum,
        "total_hrus": total,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Create a SWAT+ subset for selected HRUs.")
    parser.add_argument("--dataset", required=True, help="SWAT+ dataset or TxtInOut folder.")
    parser.add_argument("--hru-ids", help="HRU IDs and ranges, for example: 1,4-6,10.")
    parser.add_argument("--keep-routing", action="store_true", help="Preserve downstream routing.")
    parser.add_argument("--run-swat", action="store_true", help="Run SWAT+ after creating the subset.")
    parser.add_argument("--exe", help="SWAT+ executable path for --run-swat.")
    parser.add_argument("--output-dir", help="Destination folder. Defaults under the source TxtInOut folder.")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite output folder if it exists.")
    parser.add_argument("--hru-range", action="store_true", help="Print HRU range/count only.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        if args.hru_range:
            if args.json:
                with contextlib.redirect_stdout(sys.stderr):
                    result = inspect_hru_range(args.dataset)
            else:
                result = inspect_hru_range(args.dataset)
        else:
            if not args.hru_ids:
                raise ValueError("--hru-ids is required unless --hru-range is used.")
            hru_ids = parse_filter_ids(args.hru_ids)
            if args.json:
                with contextlib.redirect_stdout(sys.stderr):
                    result = process_hru_subset(
                        dataset=args.dataset,
                        hru_ids=hru_ids,
                        keep_routing=args.keep_routing,
                        run_simulation=args.run_swat,
                        exe_path=args.exe,
                        output_dir=args.output_dir,
                        overwrite=args.overwrite,
                    )
            else:
                result = process_hru_subset(
                    dataset=args.dataset,
                    hru_ids=hru_ids,
                    keep_routing=args.keep_routing,
                    run_simulation=args.run_swat,
                    exe_path=args.exe,
                    output_dir=args.output_dir,
                    overwrite=args.overwrite,
                )

        if args.json:
            print(json.dumps(result, indent=2))
        elif args.hru_range:
            print(
                f"HRU range: {result['min_hru']} - {result['max_hru']} "
                f"({result['total_hrus']} total)"
            )
        else:
            print(f"Subset created: {result['output_dir']}")
        return 0
    except Exception as exc:
        if args.json:
            print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        else:
            print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
