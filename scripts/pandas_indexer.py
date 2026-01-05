"""
Pandas-backed index builder for SWAT+ TxtInOut datasets.

This helper parses TxtInOut files into pandas DataFrames using the SWAT+ schema
and emits a JSON payload that mirrors the extension's in-memory index
representation. It favors lightweight parsing (whitespace-delimited rows) to
stay resilient to the loosely formatted TxtInOut files while leveraging
vectorized filtering for FK detection.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, List

import pandas as pd


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def parse_lines_to_dataframe(file_path: Path, table: dict) -> pd.DataFrame:
    """Parse TxtInOut rows into a DataFrame starting at data_starts_after."""
    start_line = table.get("data_starts_after", 0)
    columns = [col["name"] for col in table.get("columns", [])]
    records: List[Dict[str, str]] = []

    with file_path.open("r", encoding="utf-8", errors="ignore") as handle:
        for idx, raw_line in enumerate(handle):
            if idx < start_line:
                continue
            line = raw_line.strip()
            if not line:
                continue

            values = line.split()
            value_map: Dict[str, str] = {}
            for col_idx, col_name in enumerate(columns):
                value_map[col_name] = values[col_idx] if col_idx < len(values) else ""

            records.append({"lineNumber": idx + 1, **value_map})

    df = pd.DataFrame.from_records(records)
    if df.empty:
        return df

    pk_candidates = table.get("primary_keys") or []
    pk_column = pk_candidates[0] if pk_candidates else None
    if pk_column and pk_column in df.columns:
        df["pkValue"] = df[pk_column].astype(str)
    else:
        df["pkValue"] = df.index.astype(str)

    return df


def build_fk_references(df: pd.DataFrame, table: dict, file_path: Path, fk_null_values: List[str]) -> List[dict]:
    references: List[dict] = []
    null_set = {val.lower() for val in fk_null_values}

    for fk in table.get("foreign_keys", []):
        column = fk.get("column")
        if not column or column not in df.columns:
            continue

        column_values = df[column].astype(str)
        mask = ~column_values.str.lower().isin(null_set)
        filtered = df.loc[mask, ["lineNumber", column]]

        for _, row in filtered.iterrows():
            references.append(
                {
                    "sourceFile": str(file_path),
                    "sourceTable": table["table_name"],
                    "sourceLine": int(row["lineNumber"]),
                    "sourceColumn": column,
                    "fkValue": str(row[column]),
                    "targetTable": fk["references"]["table"],
                    "targetColumn": fk["references"]["column"],
                    "resolved": False,
                }
            )

    return references


def build_index(dataset_path: Path, schema_path: Path, metadata_path: Path) -> dict:
    schema = load_json(schema_path)
    metadata = load_json(metadata_path) if metadata_path.exists() else {}

    fk_null_values = metadata.get("null_sentinel_values", {}).get("global", ["null", "0", ""])

    tables_payload: Dict[str, List[dict]] = {}
    fk_references: List[dict] = []

    for file_name, table in schema.get("tables", {}).items():
        file_path = dataset_path / file_name
        if not file_path.exists():
            continue

        df = parse_lines_to_dataframe(file_path, table)
        if df.empty:
            continue

        row_payload = []
        for _, row in df.iterrows():
            values = {col["name"]: str(row.get(col["name"], "")) for col in table.get("columns", [])}
            row_payload.append(
                {
                    "file": str(file_path),
                    "tableName": table["table_name"],
                    "lineNumber": int(row["lineNumber"]),
                    "pkValue": str(row["pkValue"]),
                    "values": values,
                }
            )

        tables_payload[table["table_name"]] = row_payload
        fk_references.extend(build_fk_references(df, table, file_path, fk_null_values))

    return {
        "tables": tables_payload,
        "fkReferences": fk_references,
        "stats": {
            "tableCount": len(tables_payload),
            "fkCount": len(fk_references),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a pandas-backed index for SWAT+ TxtInOut datasets")
    parser.add_argument("--dataset", required=True, type=Path, help="Path to the TxtInOut directory")
    parser.add_argument("--schema", required=True, type=Path, help="Path to the schema JSON file")
    parser.add_argument("--metadata", required=True, type=Path, help="Path to the TxtInOut metadata JSON file")

    args = parser.parse_args()

    payload = build_index(args.dataset, args.schema, args.metadata)
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
