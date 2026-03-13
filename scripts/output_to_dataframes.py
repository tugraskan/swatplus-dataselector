#!/usr/bin/env python3
"""Convert common SWAT+ structured outputs into pandas DataFrames.

Expected record shape (single object or list of objects):
{
  "title": "...",
  "header": ["col1", "col2", ...],
  "units": ["-", "mm", ...],
  "data": [[...], [...], ...]
}

The script is intentionally permissive:
- header/units can be list-like or whitespace-delimited strings
- data can be row lists or dict rows
- records can be top-level, nested under common keys, or mixed
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Iterable, Iterator, List

import pandas as pd

COMMON_CONTAINER_KEYS = (
    "outputs",
    "output",
    "tables",
    "records",
    "result",
    "results",
    "items",
)


def _as_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value]
    if isinstance(value, str):
        stripped = value.strip()
        return stripped.split() if stripped else []
    return [str(value)]


def _iter_candidate_records(payload: Any) -> Iterator[dict]:
    if isinstance(payload, dict):
        if "data" in payload and ("header" in payload or "title" in payload):
            yield payload
        for key in COMMON_CONTAINER_KEYS:
            child = payload.get(key)
            if child is not None:
                yield from _iter_candidate_records(child)
        for child in payload.values():
            if isinstance(child, (dict, list)):
                yield from _iter_candidate_records(child)
    elif isinstance(payload, list):
        for item in payload:
            yield from _iter_candidate_records(item)


def _rows_to_dataframe(rows: Any, columns: List[str]) -> pd.DataFrame:
    if isinstance(rows, list) and rows and isinstance(rows[0], dict):
        df = pd.DataFrame.from_records(rows)
        if columns:
            for col in columns:
                if col not in df.columns:
                    df[col] = ""
            return df[columns]
        return df

    if not isinstance(rows, list):
        return pd.DataFrame(columns=columns)

    if columns:
        width = len(columns)
    else:
        width = max((len(r) if isinstance(r, list) else 1) for r in rows) if rows else 0
        columns = [f"col{i + 1}" for i in range(width)]

    normalized = []
    for row in rows:
        if isinstance(row, list):
            padded = row[:width] + [""] * max(0, width - len(row))
            normalized.append(padded)
        else:
            normalized.append([row] + [""] * max(0, width - 1))

    return pd.DataFrame(normalized, columns=columns)


def build_dataframes(payload: Any) -> List[tuple[str, pd.DataFrame, List[str]]]:
    frames: List[tuple[str, pd.DataFrame, List[str]]] = []
    seen: set[int] = set()
    for idx, rec in enumerate(_iter_candidate_records(payload), start=1):
        rec_id = id(rec)
        if rec_id in seen:
            continue
        seen.add(rec_id)

        title = str(rec.get("title") or f"table_{idx}")
        columns = _as_list(rec.get("header"))
        units = _as_list(rec.get("units"))
        df = _rows_to_dataframe(rec.get("data"), columns)

        if units:
            if len(units) < len(df.columns):
                units = units + [""] * (len(df.columns) - len(units))
            elif len(units) > len(df.columns):
                units = units[: len(df.columns)]

        frames.append((title, df, units))
    return frames


def write_frames(frames: Iterable[tuple[str, pd.DataFrame, List[str]]], out_dir: Path, fmt: str) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for idx, (title, df, units) in enumerate(frames, start=1):
        safe_title = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in title).strip("_")
        safe_title = safe_title or f"table_{idx}"

        if units:
            units_df = pd.DataFrame([units], columns=df.columns)
            units_df.insert(0, "__row_type", "units")
            data_df = df.copy()
            data_df.insert(0, "__row_type", "data")
            export_df = pd.concat([units_df, data_df], ignore_index=True)
        else:
            export_df = df

        out_path = out_dir / f"{idx:02d}_{safe_title}.{fmt}"
        if fmt == "csv":
            export_df.to_csv(out_path, index=False)
        else:
            export_df.to_parquet(out_path, index=False)
        print(f"Wrote {out_path} ({len(df)} data rows)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert output JSON records to DataFrames")
    parser.add_argument("--input", required=True, type=Path, help="JSON file with output records")
    parser.add_argument("--out-dir", default=Path("workdata/dataframes"), type=Path, help="Output directory")
    parser.add_argument("--format", choices=("csv", "parquet"), default="csv", help="Output file format")
    args = parser.parse_args()

    with args.input.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    frames = build_dataframes(payload)
    if not frames:
        raise SystemExit("No records with data/header/title found in input JSON")

    write_frames(frames, args.out_dir, args.format)


if __name__ == "__main__":
    main()
