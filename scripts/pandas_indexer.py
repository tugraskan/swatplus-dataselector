"""
Pandas-backed index builder for SWAT+ TxtInOut datasets.

This helper parses TxtInOut files into pandas DataFrames using the SWAT+ schema
and emits a JSON payload that mirrors the extension's in-memory index
representation. It favors lightweight parsing (whitespace-delimited rows) to
stay resilient to the loosely formatted TxtInOut files while leveraging
vectorized filtering for FK detection.

Enhanced to handle:
- Hierarchical files (soils.sol, plant.ini, management.sch)
- Decision table files (*.dtl)
- file.cio parsing
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

import pandas as pd


# Constants
NUMERIC_VALUE_PATTERN = re.compile(r'^\d+(\.\d+)?$')
MAX_CHILD_LINES = 1000  # Sanity check limit to prevent excessive line skipping
MANAGEMENT_SCH_OP_DATA1_INDEX = 6  # Position of op_data1 field in management schedule operation lines
DTL_ACTION_FP_INDEX = 7  # Position of fp field in decision table action lines
WEATHER_FILE_POINTER_FK_TABLES = {"pcp_cli", "tmp_cli", "slr_cli", "hmd_cli", "wnd_cli"}
WEATHER_DATA_SCHEMA_FILES = {
    ".pcp": "weather-pcp.pcp",
    ".tmp": "weather-tmp.tmp",
    ".slr": "weather-slr.slr",
    ".hmd": "weather-hmd.hmd",
    ".wnd": "weather-wnd.wnd",
}


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_file_cio_filenames(dataset_path: Path) -> Set[str]:
    file_cio_path = dataset_path / "file.cio"
    if not file_cio_path.exists():
        return set()
    try:
        with file_cio_path.open("r", encoding="utf-8", errors="ignore") as handle:
            lines = handle.readlines()
    except OSError:
        return set()

    filenames: Set[str] = set()
    for line in lines[1:]:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        parts = stripped.split()
        if len(parts) < 2:
            continue
        for name in parts[1:]:
            candidate = name.strip()
            if not candidate:
                continue
            candidate_lower = candidate.lower()
            if candidate_lower in {"null", "0"}:
                continue
            filenames.add(candidate_lower)
    return filenames


def find_file_cio_override(
    dataset_path: Path,
    schema_file: str,
    file_cio_files: Set[str]
) -> Optional[Path]:
    if not file_cio_files:
        return None

    schema_path = Path(schema_file)
    base = schema_path.stem.lower()
    suffix = schema_path.suffix.lower()
    candidates = [
        name for name in file_cio_files
        if name.endswith(suffix) and name.split(".")[0].startswith(base)
    ]
    if len(candidates) != 1:
        return None
    candidate_path = dataset_path / candidates[0]
    return candidate_path if candidate_path.exists() else None


def is_hierarchical_file(file_name: str, metadata: dict) -> bool:
    """Check if a file is hierarchical (multi-line records)."""
    hierarchical_files = metadata.get("hierarchical_files", {})
    # Skip the 'description' key which is metadata
    return file_name in hierarchical_files and file_name != "description"


def get_hierarchical_config(file_name: str, metadata: dict) -> Optional[dict]:
    """Get hierarchical file configuration."""
    if not is_hierarchical_file(file_name, metadata):
        return None
    return metadata["hierarchical_files"][file_name]


def get_child_line_count(value_map: Dict[str, str], config: dict, file_name: str) -> int:
    """Determine the number of child lines for a hierarchical record."""
    structure = config.get("structure", {})
    
    # Check for fixed child line count first (e.g., weather-wgn.cli has 13 fixed lines)
    fixed_count = structure.get("child_line_count_fixed")
    if fixed_count is not None and fixed_count > 0:
        if fixed_count > MAX_CHILD_LINES:
            return MAX_CHILD_LINES
        return fixed_count
    
    # Otherwise, check for dynamic child line count from a field
    count_field = structure.get("child_line_count_field")
    
    if not count_field:
        return 0
    
    # Handle special case for multiple fields (e.g., "numb_auto+numb_ops")
    if '+' in count_field:
        fields = [f.strip() for f in count_field.split('+')]
        total_count = 0
        
        for field in fields:
            if field in value_map:
                try:
                    count = int(value_map[field])
                    if count > 0:
                        total_count += count
                except ValueError:
                    pass
        
        # Sanity check: prevent excessive line skipping
        if total_count < 0:
            return 0
        if total_count > MAX_CHILD_LINES:
            return MAX_CHILD_LINES
        
        return total_count
    
    # Handle plant.ini alternate count field name
    if file_name == "plant.ini" and count_field not in value_map and "plt_cnt" in value_map:
        count_field = "plt_cnt"

    # Handle single field case with optional multiplier
    if count_field in value_map:
        try:
            count = int(value_map[count_field])
            
            # Apply multiplier if specified (e.g., for atmo.cli: num_sta * 5)
            multiplier = structure.get("child_line_count_multiplier", 1)
            count = count * multiplier
            
            if count < 0:
                return 0
            if count > MAX_CHILD_LINES:
                return MAX_CHILD_LINES
            
            return count
        except ValueError:
            return 0
    
    return 0


def is_main_record_line(value_map: Dict[str, str], file_name: str, tokens: List[str]) -> bool:
    """Check if a line is a main record (vs child line) in a hierarchical file."""
    # For soils.sol: Main record lines have an integer layer count and an alpha hydrologic group.
    # Soil names can be numeric, so avoid rejecting purely numeric identifiers.
    if file_name == 'soils.sol':
        if len(tokens) < 3:
            return False
        try:
            int(tokens[1])
        except ValueError:
            return False
        return tokens[2].isalpha()
    
    # For plant.ini: Main record has numeric plant count as the second token
    if file_name == 'plant.ini':
        if len(tokens) < 2:
            return False
        try:
            int(tokens[1])
            return True
        except ValueError:
            return False
    
    # For decision tables: More complex, for now treat all as main records
    if file_name.endswith('.dtl'):
        return True
    
    # Default: treat as main record
    return True


def parse_lines_to_dataframe(
    file_path: Path,
    table: dict,
    metadata: dict,
    lines: Optional[List[str]] = None
) -> Tuple[pd.DataFrame, List[Tuple[int, int]], List[str], List[Dict[str, str]]]:
    """
    Parse TxtInOut rows into a DataFrame starting at data_starts_after.
    
    Returns:
        (
            DataFrame with main records,
            List of (start_line, child_count) tuples for child processing,
            Column names used for parsing,
            Raw record list for payload construction
        )
    """
    file_name = file_path.name
    start_line = table.get("data_starts_after", 0)
    file_metadata = metadata.get("file_metadata", {}).get(file_name, {})
    include_auto_fields = "id" in (file_metadata.get("primary_keys") or [])
    # Filter out AutoField columns by default (database-only fields like 'id' that don't exist in physical files)
    schema_columns_all = [col["name"] for col in table.get("columns", [])]
    schema_columns = [
        col["name"]
        for col in table.get("columns", [])
        if include_auto_fields or col.get("type") != "AutoField"
    ]
    records: List[Dict[str, str]] = []
    child_line_info: List[Tuple[int, int]] = []  # (line_number, num_children)
    
    # Check if this is a hierarchical file
    is_hierarchical = is_hierarchical_file(file_name, metadata)
    hierarchical_config = get_hierarchical_config(file_name, metadata) if is_hierarchical else None
    
    if lines is None:
        with file_path.open("r", encoding="utf-8", errors="ignore") as handle:
            lines = handle.readlines()

    columns = schema_columns
    if table.get("has_header_line") and lines:
        header_index = max(start_line - 1, 0)
        if header_index < len(lines):
            header_line = lines[header_index].strip()
            if header_line:
                header_columns = [col.strip() for col in header_line.split()]
                if header_columns:
                    if file_name == "plant.ini":
                        plant_header_map = {
                            "pcom_name": "name",
                            "plt_cnt": "plnt_cnt",
                            "plt_name": "plnt_name"
                        }
                        columns = [plant_header_map.get(col.lower(), col.lower()) for col in header_columns]
                    else:
                        header_lower = [col.lower() for col in header_columns]
                        if all(col in schema_columns_all for col in header_columns):
                            columns = header_columns
                        elif all(col in schema_columns_all for col in header_lower):
                            columns = header_lower
                        elif any(col in schema_columns_all for col in header_lower):
                            columns = header_lower
    
    i = start_line
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        
        values = line.split()
        value_map: Dict[str, str] = {}
        for col_idx, col_name in enumerate(columns):
            value_map[col_name] = values[col_idx] if col_idx < len(values) else ""
        
        # For hierarchical files, determine if this is a main record or child line
        skip_count = 0
        if is_hierarchical and hierarchical_config:
            # First, try explicit child count
            explicit_count = get_child_line_count(value_map, hierarchical_config, file_name)
            
            if explicit_count > 0:
                # This file has explicit child counts - use them
                skip_count = explicit_count
                # Store info about child lines for later processing
                child_line_info.append((i + 1, skip_count))
            else:
                # No explicit count - use heuristic detection
                is_main_record = is_main_record_line(value_map, file_name, values)
                if file_name == "plant.ini" and is_main_record and len(values) > 1:
                    try:
                        skip_count = int(values[1])
                        if skip_count > 0:
                            child_line_info.append((i + 1, skip_count))
                    except ValueError:
                        skip_count = 0
                if not is_main_record:
                    # This is a child line - skip it
                    i += 1
                    continue
        
        # Add the main record
        records.append({"lineNumber": i + 1, **value_map})
        
        # Skip child lines if we have an explicit count
        if skip_count > 0:
            i += skip_count
        
        i += 1
    
    df = pd.DataFrame.from_records(records)
    if df.empty:
        return df, child_line_info, columns, records
    
    # Determine primary key
    pk_candidates = table.get("primary_keys") or []
    pk_column = pk_candidates[0] if pk_candidates else None
    
    # Try schema PK first, but fall back to common key columns if PK not in file headers
    if pk_column and pk_column in df.columns:
        df["pkValue"] = df[pk_column].astype(str)
    elif "name" in df.columns:
        df["pkValue"] = df["name"].astype(str)
    elif "filename" in df.columns:
        df["pkValue"] = df["filename"].astype(str)
    else:
        df["pkValue"] = df.index.astype(str)

    df["pkValueLower"] = df["pkValue"].str.lower()

    for idx, record in enumerate(records):
        record["pkValue"] = str(df.at[idx, "pkValue"])
        record["pkValueLower"] = str(df.at[idx, "pkValueLower"])

    return df, child_line_info, columns, records


def build_weather_data_rows(file_path: Path, table: dict) -> Tuple[List[dict], Dict[str, str]]:
    """Build row payloads for weather data files with comment + header + station metadata + all data rows."""
    with file_path.open("r", encoding="utf-8", errors="ignore") as handle:
        lines = handle.readlines()

    if not lines:
        return [], {}

    comment_line = lines[0].strip()
    header_idx = None
    station_idx = None
    for idx in range(1, len(lines)):
        if header_idx is None and lines[idx].strip():
            header_idx = idx
            continue
        if header_idx is not None and lines[idx].strip():
            station_idx = idx
            break

    if station_idx is None:
        return [], {}

    station_values = lines[station_idx].strip().split()
    schema_columns = [
        col["name"]
        for col in table.get("columns", [])
        if col.get("type") != "AutoField"
    ]

    values: Dict[str, str] = {col: "" for col in schema_columns}
    name_value = comment_line or file_path.name
    if "name" in values:
        values["name"] = name_value

    station_columns = [col for col in ("nbyr", "tstep", "lat", "lon", "elev") if col in values]
    for idx, col in enumerate(station_columns):
        if idx < len(station_values):
            values[col] = station_values[idx]

    pk_value = values.get("name") or file_path.name
    
    # Build child rows from data lines (all lines after station metadata)
    child_rows: List[dict] = []
    data_columns = [col for col in ("year", "month", "value") if col in schema_columns]
    
    # If no specific data columns, use all remaining columns or allow flexible parsing
    if not data_columns:
        data_columns = schema_columns[:]
    
    for data_line_idx in range(station_idx + 1, len(lines)):
        line = lines[data_line_idx].strip()
        if not line:
            continue
        
        data_values = line.split()
        data_value_map: Dict[str, str] = {}
        for col_idx, col_name in enumerate(data_columns):
            data_value_map[col_name] = data_values[col_idx] if col_idx < len(data_values) else ""
        
        # Store generic column values for flexible data structures
        for col_idx, val in enumerate(data_values):
            if col_idx < len(data_columns):
                data_value_map[data_columns[col_idx]] = val
            else:
                # Store extra columns as col1, col2, etc.
                data_value_map[f"col{col_idx + 1}"] = val
        
        child_rows.append({
            "lineNumber": data_line_idx + 1,
            "values": data_value_map
        })
    
    row_payload = [{
        "file": str(file_path),
        "tableName": table["table_name"],
        "lineNumber": station_idx + 1,
        "pkValue": str(pk_value),
        "pkValueLower": str(pk_value).lower(),
        "values": values,
        "childRows": child_rows if child_rows else None,
    }]

    return row_payload, {file_path.name.lower(): table["table_name"]}


def build_fk_references(
    df: pd.DataFrame, 
    table: dict, 
    file_path: Path, 
    fk_null_values: List[str],
    metadata: dict
) -> List[dict]:
    references: List[dict] = []
    null_set = {val.lower() for val in fk_null_values}
    processed_columns: set[str] = set()
    column_values_cache: Dict[str, pd.Series] = {}
    column_lower_cache: Dict[str, pd.Series] = {}
    
    # Get the default target column for TxtInOut FK references
    txtinout_target_column = metadata.get("txtinout_fk_behavior", {}).get("default_target_column", "name")
    
    # Get file pointer columns to skip (these point to files, not FK references)
    file_name = file_path.name
    file_pointer_config = metadata.get("file_pointer_columns", {}).get(file_name, {})
    file_pointer_columns = set()
    if isinstance(file_pointer_config, dict):
        # Extract column names from the config (exclude the description key if present)
        file_pointer_columns = {col for col in file_pointer_config.keys() if col != "description"}

    # Process schema-defined foreign keys
    for fk in table.get("foreign_keys", []):
        column = fk.get("column")
        if not column or column not in df.columns:
            continue
        processed_columns.add(column)
        
        # Skip file pointer columns (they point to files, not table rows)
        # Allow weather list files (pcp/tmp/slr/hmd/wnd) to behave as FK targets.
        if column in file_pointer_columns and fk.get("references", {}).get("table") not in WEATHER_FILE_POINTER_FK_TABLES:
            continue

        if column not in column_values_cache:
            column_values_cache[column] = df[column].astype(str)
        if column not in column_lower_cache:
            column_lower_cache[column] = column_values_cache[column].str.lower()
        column_lower = column_lower_cache[column]
        mask = ~column_lower.isin(null_set)
        filtered = df.loc[mask, ["lineNumber", column]]

        for line_number, fk_value, fk_value_lower in zip(
            filtered["lineNumber"],
            filtered[column],
            column_lower.loc[mask]
        ):
            references.append(
                {
                    "sourceFile": str(file_path),
                    "sourceTable": table["table_name"],
                    "sourceLine": int(line_number),
                    "sourceColumn": column,
                    "fkValue": str(fk_value),
                    "fkValueLower": str(fk_value_lower),
                    "targetTable": fk["references"]["table"],
                    "targetColumn": txtinout_target_column,
                    "resolved": False,
                }
            )
    
    return references


def process_management_sch_child_lines(
    file_path: Path,
    table: dict,
    lines: List[str],
    start_line: int,
    numb_auto: int,
    numb_ops: int,
    fk_null_values: List[str]
) -> List[dict]:
    """Process child lines for management.sch and extract FK references."""
    references: List[dict] = []
    null_set = {val.lower() for val in fk_null_values}
    
    # Operation type to target table mapping
    op_type_to_table = {
        'plnt': 'plant_ini',
        'harv': 'harv_ops',
        'hvkl': 'plant_ini',
        'kill': 'plant_ini',
        'till': 'tillage_til',
        'irrm': 'irr_ops',
        'irra': 'irr_ops',
        'fert': 'fertilizer_frt',
        'frta': 'fertilizer_frt',
        'frtc': 'fertilizer_frt',
        'pest': 'pesticide_pes',
        'pstc': 'pesticide_pes',
        'graz': 'graze_ops'
    }
    
    current_line = start_line
    
    # Process first numb_auto lines (decision table references)
    for j in range(numb_auto):
        if current_line >= len(lines):
            break
        line = lines[current_line].strip()
        if line:
            dtl_name = line.split()[0] if line.split() else None
            if dtl_name and dtl_name.lower() not in null_set:
                references.append({
                    "sourceFile": str(file_path),
                    "sourceTable": table["table_name"],
                    "sourceLine": current_line + 1,
                    "sourceColumn": "auto_op_dtl",
                    "fkValue": dtl_name,
                    "fkValueLower": dtl_name.lower(),
                    "targetTable": "lum_dtl",
                    "targetColumn": "name",
                    "resolved": False
                })
        current_line += 1
    
    # Process next numb_ops lines (explicit operations)
    for j in range(numb_ops):
        if current_line >= len(lines):
            break
        line = lines[current_line].strip()
        if line:
            values = line.split()
            if values:
                op_type = values[0]
                # op_data1 is typically at index 6 in management schedule operation lines
                op_data1 = values[MANAGEMENT_SCH_OP_DATA1_INDEX] if len(values) > MANAGEMENT_SCH_OP_DATA1_INDEX else None
                
                if op_type and op_data1 and op_type in op_type_to_table and op_data1.lower() not in null_set:
                    references.append({
                        "sourceFile": str(file_path),
                        "sourceTable": table["table_name"],
                        "sourceLine": current_line + 1,
                        "sourceColumn": f"op_data1({op_type})",
                        "fkValue": op_data1,
                        "fkValueLower": op_data1.lower(),
                        "targetTable": op_type_to_table[op_type],
                        "targetColumn": "name",
                        "resolved": False
                    })
        current_line += 1
    
    return references


def process_dtl_file(
    file_path: Path,
    table: dict,
    fk_null_values: List[str]
) -> Tuple[List[dict], List[dict]]:
    """
    Process decision table files (*.dtl) and extract FK references from fp fields.
    
    Returns:
        (list of row payloads, list of FK references)
    """
    null_set = {val.lower() for val in fk_null_values}
    row_payload: List[dict] = []
    fk_references: List[dict] = []
    
    # Action type to target table mapping for fp field
    action_type_to_table = {
        'harvest': 'harv_ops',
        'harvest_kill': 'harv_ops',
        'pest_apply': 'chem_app_ops',
        'fertilize': 'chem_app_ops'
    }
    
    with file_path.open("r", encoding="utf-8", errors="ignore") as handle:
        lines = handle.readlines()
    
    if len(lines) < 2:
        return row_payload, fk_references
    
    # Skip title line (line 0)
    # Line 1 contains the number of decision tables
    num_tables_line = lines[1].strip()
    try:
        num_tables = int(num_tables_line)
    except ValueError:
        return row_payload, fk_references
    
    if num_tables < 0:
        return row_payload, fk_references
    
    current_line = 2  # Start after title and count lines
    
    # Skip blank lines after count
    while current_line < len(lines) and not lines[current_line].strip():
        current_line += 1
    
    # Skip the global header line (NAME / DTBL_NAME  CONDS  ALTS  ACTS)
    if current_line < len(lines):
        possible_header_line = lines[current_line].strip().upper()
        if possible_header_line.startswith('NAME') or possible_header_line.startswith('DTBL_NAME'):
            current_line += 1
    
    # Process each decision table
    processed_tables = 0
    while processed_tables < num_tables and current_line < len(lines):
        # Skip blank lines before decision table
        while current_line < len(lines) and not lines[current_line].strip():
            current_line += 1

        if current_line >= len(lines):
            break

        header_line = lines[current_line].strip()
        if not header_line:
            break

        header_upper = header_line.upper()
        if header_upper.startswith('NAME') or header_upper.startswith('DTBL_NAME'):
            current_line += 1
            continue

        header_values = header_line.split()
        if len(header_values) < 4:
            current_line += 1
            continue

        dtbl_name = header_values[0]
        try:
            conds = int(header_values[1])
            alts = int(header_values[2])
            acts = int(header_values[3])
        except ValueError:
            current_line += 1
            continue
        
        child_rows: List[dict] = []

        # Index the decision table main record
        row_payload.append({
            "file": str(file_path),
            "tableName": table["table_name"],
            "lineNumber": current_line + 1,
            "pkValue": dtbl_name,
            "values": {
                "name": dtbl_name,
                "conds": str(conds),
                "alts": str(alts),
                "acts": str(acts)
            },
            "childRows": child_rows
        })
        
        current_line += 1  # Move past decision table header
        processed_tables += 1
        
        # Skip conditions section header line
        while current_line < len(lines) and not lines[current_line].strip():
            current_line += 1
        if current_line < len(lines):
            possible_cond_header = lines[current_line].strip().upper()
            if possible_cond_header.startswith('COND_VAR'):
                current_line += 1
        
        # Skip conditions section data lines
        condition_columns = ["cond_var", "obj", "obj_num", "lim_var", "lim_op", "lim_const"]
        condition_columns.extend([f"alt{idx + 1}" for idx in range(alts)])
        for cond_idx in range(conds):
            while current_line < len(lines) and not lines[current_line].strip():
                current_line += 1
            if current_line >= len(lines):
                break
            condition_line = lines[current_line].strip()
            condition_values = condition_line.split()
            condition_map = {
                col_name: condition_values[col_idx] if col_idx < len(condition_values) else ""
                for col_idx, col_name in enumerate(condition_columns)
            }
            condition_map["section"] = "condition"
            child_rows.append({
                "lineNumber": current_line + 1,
                "values": condition_map
            })
            current_line += 1
        
        # Skip actions section header line
        while current_line < len(lines) and not lines[current_line].strip():
            current_line += 1
        if current_line < len(lines):
            possible_act_header = lines[current_line].strip().upper()
            if possible_act_header.startswith('ACT_TYP'):
                current_line += 1
        
        # Process actions section data lines
        action_columns = [
            "act_typ", "obj", "obj_num", "act_name", "act_option",
            "const", "const2", "fp"
        ]
        action_columns.extend([f"out{idx + 1}" for idx in range(alts)])
        for act_idx in range(acts):
            if current_line >= len(lines):
                break
            action_line = lines[current_line].strip()
            if action_line:
                action_values = action_line.split()
                action_map = {
                    col_name: action_values[col_idx] if col_idx < len(action_values) else ""
                    for col_idx, col_name in enumerate(action_columns)
                }
                action_map["section"] = "action"
                child_rows.append({
                    "lineNumber": current_line + 1,
                    "values": action_map
                })
                
                # Action line structure: act_typ, obj, obj_num, name, option, const, const2, fp, outcome...
                # fp field is at index DTL_ACTION_FP_INDEX (8th field, 0-based index 7)
                if len(action_values) > DTL_ACTION_FP_INDEX:
                    act_typ = action_values[0]
                    fp = action_values[DTL_ACTION_FP_INDEX]
                    
                    # Track FK if action type has a mapping and fp is not null
                    if act_typ in action_type_to_table and fp.lower() not in null_set:
                        fk_references.append({
                            "sourceFile": str(file_path),
                            "sourceTable": table["table_name"],
                            "sourceLine": current_line + 1,
                            "sourceColumn": f"fp({act_typ})",
                            "fkValue": fp,
                            "fkValueLower": fp.lower(),
                            "targetTable": action_type_to_table[act_typ],
                            "targetColumn": "name",
                            "resolved": False
                        })
            current_line += 1
    
    return row_payload, fk_references


def extract_soils_details(row: dict, lines: List[str]) -> Tuple[Dict[str, str], List[dict]]:
    value_updates: Dict[str, str] = {}
    child_rows: List[dict] = []
    line_num = int(row.get("lineNumber", 0))
    line_idx = line_num - 1
    layer_count = 0

    if 0 <= line_idx < len(lines):
        main_tokens = lines[line_idx].strip().split()
        if main_tokens:
            name = main_tokens[0]
            try:
                layer_count = int(main_tokens[1]) if len(main_tokens) > 1 else 0
            except (ValueError, TypeError):
                layer_count = 0

            value_updates.update({
                "name": name,
                "nly": str(layer_count) if layer_count else "",
                "hyd_grp": main_tokens[2] if len(main_tokens) > 2 else "",
                "dp_tot": main_tokens[3] if len(main_tokens) > 3 else "",
                "anion_excl": main_tokens[4] if len(main_tokens) > 4 else "",
                "perc_crk": main_tokens[5] if len(main_tokens) > 5 else "",
                "texture": main_tokens[6] if len(main_tokens) > 6 else "",
                "description": " ".join(main_tokens[7:]) if len(main_tokens) > 7 else "",
            })

    if layer_count > 0:
        layer_columns = [
            "dp", "bd", "awc", "soil_k", "carbon", "clay", "silt", "sand",
            "rock", "alb", "usle_k", "ec", "caco3", "ph"
        ]
        for layer_idx in range(layer_count):
            child_line_idx = line_idx + 1 + layer_idx
            if child_line_idx >= len(lines):
                break
            child_line = lines[child_line_idx].strip()
            if not child_line:
                continue
            child_tokens = child_line.split()
            child_value_map = {
                col_name: child_tokens[col_idx] if col_idx < len(child_tokens) else ""
                for col_idx, col_name in enumerate(layer_columns)
            }
            child_value_map["layer"] = str(layer_idx + 1)
            child_rows.append({
                "lineNumber": child_line_idx + 1,
                "values": child_value_map
            })

    return value_updates, child_rows


def extract_plant_details(
    lines: List[str],
    child_line_info: List[Tuple[int, int]],
    record_index: int
) -> Tuple[Dict[str, str], List[dict]]:
    value_updates: Dict[str, str] = {}
    child_rows: List[dict] = []
    if not child_line_info or record_index >= len(child_line_info):
        return value_updates, child_rows

    line_num, child_count = child_line_info[record_index]
    if child_count <= 0:
        return value_updates, child_rows

    line_idx = line_num - 1
    if 0 <= line_idx < len(lines):
        main_tokens = lines[line_idx].strip().split()
        if len(main_tokens) >= 3:
            value_updates.update({
                "name": main_tokens[0],
                "plnt_cnt": main_tokens[1],
                "rot_yr_ini": main_tokens[2],
            })

    plant_columns = [
        "plnt_name", "lc_status", "lai_init", "bm_init",
        "phu_init", "plnt_pop", "yrs_init", "rsd_init"
    ]
    for plant_idx in range(child_count):
        child_line_idx = line_idx + 1 + plant_idx
        if child_line_idx >= len(lines):
            break
        child_line = lines[child_line_idx].strip()
        if not child_line:
            continue
        child_tokens = child_line.split()
        child_value_map = {
            col_name: child_tokens[col_idx] if col_idx < len(child_tokens) else ""
            for col_idx, col_name in enumerate(plant_columns)
        }
        child_rows.append({
            "lineNumber": child_line_idx + 1,
            "values": child_value_map
        })

    return value_updates, child_rows


def get_management_sch_counts(lines: List[str], record: dict) -> Tuple[int, int, Dict[str, str]]:
    value_updates: Dict[str, str] = {}
    line_num = int(record.get("lineNumber", 0))
    line_idx = line_num - 1
    main_tokens: List[str] = []
    if 0 <= line_idx < len(lines):
        main_tokens = lines[line_idx].strip().split()

    if len(main_tokens) >= 3:
        if not record.get("numb_ops"):
            value_updates["numb_ops"] = main_tokens[1]
        if not record.get("numb_auto"):
            value_updates["numb_auto"] = main_tokens[2]

    def parse_int(value: Optional[str]) -> int:
        try:
            return int(value) if value not in (None, "") else 0
        except (ValueError, TypeError):
            return 0

    numb_ops = parse_int(value_updates.get("numb_ops") or record.get("numb_ops"))
    numb_auto = parse_int(value_updates.get("numb_auto") or record.get("numb_auto"))
    return numb_auto, numb_ops, value_updates


def extract_management_sch_details(lines: List[str], record: dict) -> Tuple[Dict[str, str], List[dict]]:
    value_updates: Dict[str, str] = {}
    child_rows: List[dict] = []

    line_num = int(record.get("lineNumber", 0))
    if line_num <= 0:
        return value_updates, child_rows

    numb_auto, numb_ops, value_updates = get_management_sch_counts(lines, record)

    start_idx = line_num

    for auto_idx in range(numb_auto):
        child_line_idx = start_idx + auto_idx
        if child_line_idx >= len(lines):
            break
        child_line = lines[child_line_idx].strip()
        if not child_line:
            continue
        tokens = child_line.split()
        if not tokens:
            continue
        child_rows.append({
            "lineNumber": child_line_idx + 1,
            "values": {
                "section": "auto",
                "name": tokens[0],
                "d_table": tokens[0],
                "plant1": tokens[1] if len(tokens) > 1 else "",
                "plant2": tokens[2] if len(tokens) > 2 else "",
            }
        })

    op_start_idx = start_idx + numb_auto
    for op_idx in range(numb_ops):
        child_line_idx = op_start_idx + op_idx
        if child_line_idx >= len(lines):
            break
        child_line = lines[child_line_idx].strip()
        if not child_line:
            continue
        tokens = child_line.split()
        if not tokens:
            continue
        child_rows.append({
            "lineNumber": child_line_idx + 1,
            "values": {
                "section": "op",
                "op_typ": tokens[0],
                "mon": tokens[1] if len(tokens) > 1 else "",
                "day": tokens[2] if len(tokens) > 2 else "",
                "hu_sch": tokens[3] if len(tokens) > 3 else "",
                "op_data1": tokens[4] if len(tokens) > 4 else "",
                "op_data2": tokens[5] if len(tokens) > 5 else "",
                "op_data3": tokens[6] if len(tokens) > 6 else "",
            }
        })

    return value_updates, child_rows


def extract_weather_wgn_details(
    lines: List[str],
    child_line_info: List[Tuple[int, int]],
    record_index: int
) -> List[dict]:
    if not child_line_info or record_index >= len(child_line_info):
        return []
    line_num, child_count = child_line_info[record_index]
    if child_count <= 0:
        return []

    child_rows = []
    monthly_columns = [
        'tmp_max_ave', 'tmp_min_ave', 'tmp_max_sd', 'tmp_min_sd',
        'pcp_ave', 'pcp_sd', 'pcp_skew', 'wet_dry', 'wet_wet',
        'pcp_days', 'pcp_hhr', 'slr_ave', 'dew_ave', 'wnd_ave'
    ]
    start_idx = line_num - 1
    for month_idx in range(12):
        child_line_idx = start_idx + 1 + month_idx + 1
        if child_line_idx < len(lines):
            child_line = lines[child_line_idx].strip()
            if child_line:
                child_values_list = child_line.split()
                child_value_map = {}
                for col_idx, col_name in enumerate(monthly_columns):
                    child_value_map[col_name] = child_values_list[col_idx] if col_idx < len(child_values_list) else ""
                child_value_map['month'] = str(month_idx + 1)
                child_rows.append({
                    "lineNumber": child_line_idx + 1,
                    "values": child_value_map
                })

    return child_rows


def extract_atmo_details(row: dict, lines: List[str]) -> List[dict]:
    try:
        num_sta = int(row.get('num_sta', 0)) if 'num_sta' in row else 0
        num_aa = int(row.get('num_aa', 0)) if 'num_aa' in row else 0
    except (ValueError, TypeError):
        num_sta = 0
        num_aa = 0

    if num_sta <= 0 or num_aa <= 0:
        return []

    child_rows = []
    current_line_idx = int(row.get('lineNumber', 0)) - 1
    deposition_types = ['nh4_wet', 'no3_wet', 'nh4_dry', 'no3_dry']

    for station_idx in range(num_sta):
        station_line_idx = current_line_idx + 1 + (station_idx * 5)
        if station_line_idx < len(lines):
            station_name = lines[station_line_idx].strip()
            station_data = {'station_name': station_name}
            for dep_idx, dep_type in enumerate(deposition_types):
                data_line_idx = station_line_idx + 1 + dep_idx
                if data_line_idx < len(lines):
                    data_line = lines[data_line_idx].strip()
                    values = data_line.split()
                    if values:
                        station_data[dep_type] = values[:-1] if len(values) > 1 else values
                        station_data[f'{dep_type}_line'] = data_line_idx + 1

            if 'station_name' in station_data:
                child_rows.append({
                    "lineNumber": station_line_idx + 1,
                    "values": station_data
                })

    return child_rows


def build_index(dataset_path: Path, schema_path: Path, metadata_path: Path) -> dict:
    schema = load_json(schema_path)
    metadata = load_json(metadata_path) if metadata_path.exists() else {}

    fk_null_values = metadata.get("null_sentinel_values", {}).get("global", ["null", "0", ""])

    tables_payload: Dict[str, List[dict]] = {}
    fk_references: List[dict] = []
    processed_files = set()
    file_table_map: Dict[str, str] = {}

    table_name_to_file = metadata.get("table_name_to_file_name", {}) if isinstance(metadata, dict) else {}
    file_cio_files = load_file_cio_filenames(dataset_path)

    for file_name, table in schema.get("tables", {}).items():
        file_path = dataset_path / file_name
        if not file_path.exists():
            mapped_name = table_name_to_file.get(table.get("table_name"))
            if mapped_name:
                mapped_path = dataset_path / mapped_name
                if mapped_path.exists():
                    file_path = mapped_path

        if not file_path.exists():
            alternate_names = set()
            if "-" in file_name:
                alternate_names.add(file_name.replace("-", "_"))
            if "_" in file_name:
                alternate_names.add(file_name.replace("_", "-"))
            alternate_names.add(file_name.replace("-", "_").replace("_", "-"))
            for alternate_name in alternate_names:
                candidate_path = dataset_path / alternate_name
                if candidate_path.exists():
                    file_path = candidate_path
                    break
            if not file_path.exists():
                file_cio_override = find_file_cio_override(dataset_path, file_name, file_cio_files)
                if file_cio_override is not None:
                    file_path = file_cio_override
                else:
                    continue

        actual_file_name = file_path.name
        processed_files.add(actual_file_name.lower())
        file_table_map[actual_file_name.lower()] = table["table_name"]
        
        # Skip file.cio - it has a special classification-based format that is handled
        # separately in the TypeScript parseFileCio() method
        if actual_file_name.lower() == 'file.cio':
            continue
        
        # Special handling for decision table files (*.dtl)
        if actual_file_name.endswith('.dtl'):
            row_payload, dtl_fk_refs = process_dtl_file(file_path, table, fk_null_values)
            if row_payload:
                tables_payload[table["table_name"]] = row_payload
                fk_references.extend(dtl_fk_refs)
            continue

        with file_path.open("r", encoding="utf-8", errors="ignore") as handle:
            lines = handle.readlines()

        # Parse the file with hierarchical support
        df, child_line_info, columns, records = parse_lines_to_dataframe(file_path, table, metadata, lines)
        if df.empty:
            continue

        # Build row payload
        row_payload = []
        for idx, row in enumerate(records):
            values = {col: str(row.get(col, "")) for col in columns}
            row_dict = {
                "file": str(file_path),
                "tableName": table["table_name"],
                "lineNumber": int(row["lineNumber"]),
                "pkValue": str(row["pkValue"]),
                "pkValueLower": str(row.get("pkValueLower", "")).lower() if row.get("pkValueLower") else str(row["pkValue"]).lower(),
                "values": values,
            }

            # Special handling for soils.sol: capture layer data lines
            if actual_file_name == 'soils.sol' and lines:
                value_updates, child_rows = extract_soils_details(row, lines)
                if value_updates:
                    row_dict["values"].update(value_updates)
                if child_rows:
                    row_dict["childRows"] = child_rows

            # Special handling for plant.ini: capture plant community member lines
            if actual_file_name == 'plant.ini' and lines:
                value_updates, child_rows = extract_plant_details(lines, child_line_info, idx)
                if value_updates:
                    row_dict["values"].update(value_updates)
                if child_rows:
                    row_dict["childRows"] = child_rows

            # Special handling for management.sch: capture auto/op detail lines
            if actual_file_name == 'management.sch' and lines:
                value_updates, child_rows = extract_management_sch_details(lines, row)
                if value_updates:
                    row_dict["values"].update(value_updates)
                if child_rows:
                    row_dict["childRows"] = child_rows
            
            # Special handling for weather-wgn.cli: capture monthly data child lines
            if actual_file_name == 'weather-wgn.cli':
                child_rows = extract_weather_wgn_details(lines, child_line_info, idx)
                if child_rows:
                    row_dict["childRows"] = child_rows
            
            # Special handling for atmo.cli: capture station deposition data
            if actual_file_name == 'atmo.cli':
                child_rows = extract_atmo_details(row, lines)
                if child_rows:
                    row_dict["childRows"] = child_rows

            row_payload.append(row_dict)

        tables_payload[table["table_name"]] = row_payload
        
        # Build FK references for main records
        fk_references.extend(build_fk_references(df, table, file_path, fk_null_values, metadata))
        
        # Special handling for management.sch child lines
        if actual_file_name == 'management.sch' and lines:
            for main_record in records:
                line_num = int(main_record.get("lineNumber", 0))
                if line_num <= 0:
                    continue
                numb_auto, numb_ops, _ = get_management_sch_counts(lines, main_record)
                if numb_auto <= 0 and numb_ops <= 0:
                    continue
                child_refs = process_management_sch_child_lines(
                    file_path, table, lines, line_num, numb_auto, numb_ops, fk_null_values
                )
                fk_references.extend(child_refs)

    for extension, schema_file in WEATHER_DATA_SCHEMA_FILES.items():
        table = schema.get("tables", {}).get(schema_file)
        if not table:
            continue
        for file_path in dataset_path.glob(f"*{extension}"):
            if file_path.name.lower() in processed_files:
                continue
            row_payload, file_map = build_weather_data_rows(file_path, table)
            if not row_payload:
                continue
            table_name = table["table_name"]
            tables_payload.setdefault(table_name, []).extend(row_payload)
            file_table_map.update(file_map)
            processed_files.add(file_path.name.lower())

    # Process additional decision table files not covered by the schema
    for dtl_path in dataset_path.glob("*.dtl"):
        if dtl_path.name.lower() in processed_files:
            continue
        derived_table_name = dtl_path.name.replace(".", "_").replace("-", "_").lower()
        dtl_table = {"table_name": derived_table_name, "file_name": dtl_path.name}
        row_payload, dtl_fk_refs = process_dtl_file(dtl_path, dtl_table, fk_null_values)
        if row_payload:
            tables_payload[derived_table_name] = row_payload
            fk_references.extend(dtl_fk_refs)

    return {
        "tables": tables_payload,
        "fkReferences": fk_references,
        "fileTableMap": file_table_map,
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
    parser.add_argument("--output", type=Path, help="Optional output file path for JSON payload")

    args = parser.parse_args()

    payload = build_index(args.dataset, args.schema, args.metadata)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
    else:
        print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
