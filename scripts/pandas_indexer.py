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
from typing import Dict, List, Optional, Tuple

import pandas as pd


# Constants
NUMERIC_VALUE_PATTERN = re.compile(r'^\d+(\.\d+)?$')
MAX_CHILD_LINES = 1000  # Sanity check limit to prevent excessive line skipping
MANAGEMENT_SCH_OP_DATA1_INDEX = 6  # Position of op_data1 field in management schedule operation lines
DTL_ACTION_FP_INDEX = 7  # Position of fp field in decision table action lines
WEATHER_FILE_POINTER_FK_TABLES = {"pcp_cli", "tmp_cli", "slr_cli", "hmd_cli", "wnd_cli"}


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


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


def is_main_record_line(value_map: Dict[str, str], file_name: str) -> bool:
    """Check if a line is a main record (vs child line) in a hierarchical file."""
    # For soils.sol: Main record lines have a 'name' field that looks like a valid identifier
    if file_name == 'soils.sol':
        name_value = value_map.get('name', '')
        # Main record has a non-empty name that's not purely numeric
        return len(name_value) > 0 and not NUMERIC_VALUE_PATTERN.match(name_value)
    
    # For plant.ini: Main record has plnt_cnt field
    if file_name == 'plant.ini':
        return 'plnt_cnt' in value_map
    
    # For decision tables: More complex, for now treat all as main records
    if file_name.endswith('.dtl'):
        return True
    
    # Default: treat as main record
    return True


def parse_lines_to_dataframe(
    file_path: Path, 
    table: dict, 
    metadata: dict
) -> Tuple[pd.DataFrame, List[Tuple[int, int]]]:
    """
    Parse TxtInOut rows into a DataFrame starting at data_starts_after.
    
    Returns:
        (DataFrame with main records, List of (start_line, child_count) tuples for child processing)
    """
    file_name = file_path.name
    start_line = table.get("data_starts_after", 0)
    # Filter out AutoField columns (database-only fields like 'id' that don't exist in physical files)
    columns = [col["name"] for col in table.get("columns", []) if col.get("type") != "AutoField"]
    records: List[Dict[str, str]] = []
    child_line_info: List[Tuple[int, int]] = []  # (line_number, num_children)
    
    # Check if this is a hierarchical file
    is_hierarchical = is_hierarchical_file(file_name, metadata)
    hierarchical_config = get_hierarchical_config(file_name, metadata) if is_hierarchical else None
    
    with file_path.open("r", encoding="utf-8", errors="ignore") as handle:
        lines = handle.readlines()
    
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
                is_main_record = is_main_record_line(value_map, file_name)
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
        return df, child_line_info
    
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
    
    return df, child_line_info


def build_fk_references(
    df: pd.DataFrame, 
    table: dict, 
    file_path: Path, 
    fk_null_values: List[str],
    metadata: dict
) -> List[dict]:
    references: List[dict] = []
    null_set = {val.lower() for val in fk_null_values}
    
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
        
        # Skip file pointer columns (they point to files, not table rows)
        # Allow weather list files (pcp/tmp/slr/hmd/wnd) to behave as FK targets.
        if column in file_pointer_columns and fk.get("references", {}).get("table") not in WEATHER_FILE_POINTER_FK_TABLES:
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
                    "targetColumn": txtinout_target_column,
                    "resolved": False,
                }
            )
    
    # Process markdown-derived FK relationships (enhanced schema)
    # This provides additional FK information not captured in the database schema
    md_fk_relationships = metadata.get("foreign_key_relationships", {}).get(file_name, {})
    if isinstance(md_fk_relationships, dict):
        md_fks = md_fk_relationships.get("relationships", [])
        for md_fk in md_fks:
            column = md_fk.get("column")
            if not column or column not in df.columns:
                continue
            
            # Skip if this column is a file pointer (not an FK to table rows)
            if md_fk.get("is_pointer") and not md_fk.get("is_fk"):
                continue
            
            # Skip if already processed by schema FK
            already_processed = any(
                ref["sourceColumn"] == column for ref in references
            )
            if already_processed:
                continue
            
            # Extract target table from target_file
            target_file = md_fk.get("target_file", "")
            if not target_file:
                continue
            
            # Try to resolve target file to table name
            target_table = None
            for table_name, file_mapping in metadata.get("table_name_to_file_name", {}).items():
                if file_mapping == target_file:
                    target_table = table_name
                    break
            
            # If not found in mapping, use file name without extension as table name
            if not target_table:
                target_table = target_file.replace(".", "_").replace("-", "_")
            
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
                        "targetTable": target_table,
                        "targetColumn": txtinout_target_column,
                        "resolved": False,
                        "from_markdown": True,  # Mark that this came from markdown docs
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
    null_set = set(fk_null_values)
    
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
            if dtl_name and dtl_name not in null_set:
                references.append({
                    "sourceFile": str(file_path),
                    "sourceTable": table["table_name"],
                    "sourceLine": current_line + 1,
                    "sourceColumn": "auto_op_dtl",
                    "fkValue": dtl_name,
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
                
                if op_type and op_data1 and op_type in op_type_to_table and op_data1 not in null_set:
                    references.append({
                        "sourceFile": str(file_path),
                        "sourceTable": table["table_name"],
                        "sourceLine": current_line + 1,
                        "sourceColumn": f"op_data1({op_type})",
                        "fkValue": op_data1,
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
    null_set = set(fk_null_values)
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
    
    # Skip the global header line (NAME  CONDS  ALTS  ACTS)
    if current_line < len(lines):
        possible_header_line = lines[current_line].strip().upper()
        if possible_header_line.startswith('NAME'):
            current_line += 1
    
    # Process each decision table
    for table_idx in range(num_tables):
        if current_line >= len(lines):
            break
        
        # Skip blank lines before decision table
        while current_line < len(lines) and not lines[current_line].strip():
            current_line += 1
        
        if current_line >= len(lines):
            break
        
        header_line = lines[current_line].strip()
        if not header_line:
            break
        
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
            }
        })
        
        current_line += 1  # Move past decision table header
        
        # Skip conditions section header line
        current_line += 1
        
        # Skip conditions section data lines
        current_line += conds
        
        # Skip actions section header line
        current_line += 1
        
        # Process actions section data lines
        for act_idx in range(acts):
            if current_line >= len(lines):
                break
            action_line = lines[current_line].strip()
            if action_line:
                action_values = action_line.split()
                
                # Action line structure: act_typ, obj, obj_num, name, option, const, const2, fp, outcome...
                # fp field is at index DTL_ACTION_FP_INDEX (8th field, 0-based index 7)
                if len(action_values) > DTL_ACTION_FP_INDEX:
                    act_typ = action_values[0]
                    fp = action_values[DTL_ACTION_FP_INDEX]
                    
                    # Track FK if action type has a mapping and fp is not null
                    if act_typ in action_type_to_table and fp not in null_set:
                        fk_references.append({
                            "sourceFile": str(file_path),
                            "sourceTable": table["table_name"],
                            "sourceLine": current_line + 1,
                            "sourceColumn": f"fp({act_typ})",
                            "fkValue": fp,
                            "targetTable": action_type_to_table[act_typ],
                            "targetColumn": "name",
                            "resolved": False
                        })
            current_line += 1
    
    return row_payload, fk_references


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
        
        # Skip file.cio - it has a special classification-based format that is handled
        # separately in the TypeScript parseFileCio() method
        if file_name.lower() == 'file.cio':
            continue
        
        # Special handling for decision table files (*.dtl)
        if file_name.endswith('.dtl'):
            row_payload, dtl_fk_refs = process_dtl_file(file_path, table, fk_null_values)
            if row_payload:
                tables_payload[table["table_name"]] = row_payload
                fk_references.extend(dtl_fk_refs)
            continue

        # Parse the file with hierarchical support
        df, child_line_info = parse_lines_to_dataframe(file_path, table, metadata)
        if df.empty:
            continue

        lines = None
        if file_name == 'soils.sol':
            with file_path.open("r", encoding="utf-8", errors="ignore") as handle:
                lines = handle.readlines()

        # Build row payload
        row_payload = []
        for idx, row in df.iterrows():
            # Filter out AutoField columns (same as parsing logic)
            values = {col["name"]: str(row.get(col["name"], "")) for col in table.get("columns", []) if col.get("type") != "AutoField"}
            row_dict = {
                "file": str(file_path),
                "tableName": table["table_name"],
                "lineNumber": int(row["lineNumber"]),
                "pkValue": str(row["pkValue"]),
                "values": values,
            }

            # Special handling for soils.sol: capture layer data lines
            if file_name == 'soils.sol' and lines:
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

                        hyd_grp = main_tokens[2] if len(main_tokens) > 2 else ""
                        dp_tot = main_tokens[3] if len(main_tokens) > 3 else ""
                        anion_excl = main_tokens[4] if len(main_tokens) > 4 else ""
                        perc_crk = main_tokens[5] if len(main_tokens) > 5 else ""
                        texture = main_tokens[6] if len(main_tokens) > 6 else ""
                        description = " ".join(main_tokens[7:]) if len(main_tokens) > 7 else ""

                        row_dict["values"].update({
                            "name": name,
                            "nly": str(layer_count) if layer_count else "",
                            "hyd_grp": hyd_grp,
                            "dp_tot": dp_tot,
                            "anion_excl": anion_excl,
                            "perc_crk": perc_crk,
                            "texture": texture,
                            "description": description,
                        })

                if layer_count > 0:
                    layer_columns = [
                        "dp", "bd", "awc", "soil_k", "carbon", "clay", "silt", "sand",
                        "rock", "alb", "usle_k", "ec", "caco3", "ph"
                    ]
                    child_rows = []
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

                    if child_rows:
                        row_dict["childRows"] = child_rows
            
            # Special handling for weather-wgn.cli: capture monthly data child lines
            if file_name == 'weather-wgn.cli' and child_line_info and idx < len(child_line_info):
                line_num, child_count = child_line_info[idx]
                if child_count > 0:
                    with file_path.open("r", encoding="utf-8", errors="ignore") as handle:
                        lines = handle.readlines()
                    
                    # Skip the header line (first child line) and capture the 12 monthly data lines
                    child_rows = []
                    # Monthly data columns based on the weather-wgn.cli documentation
                    monthly_columns = [
                        'tmp_max_ave', 'tmp_min_ave', 'tmp_max_sd', 'tmp_min_sd',
                        'pcp_ave', 'pcp_sd', 'pcp_skew', 'wet_dry', 'wet_wet',
                        'pcp_days', 'pcp_hhr', 'slr_ave', 'dew_ave', 'wnd_ave'
                    ]
                    
                    # Start from line after main record, skip header, then read 12 months
                    # line_num is 1-based, but lines array is 0-based
                    start_idx = line_num - 1  # Convert to 0-based index
                    for month_idx in range(12):
                        # Skip header line (1) + month offset
                        child_line_idx = start_idx + 1 + month_idx + 1  # +1 for next line, +month_idx for month, +1 for header skip
                        if child_line_idx < len(lines):
                            child_line = lines[child_line_idx].strip()
                            if child_line:
                                child_values_list = child_line.split()
                                child_value_map = {}
                                for col_idx, col_name in enumerate(monthly_columns):
                                    child_value_map[col_name] = child_values_list[col_idx] if col_idx < len(child_values_list) else ""
                                child_value_map['month'] = str(month_idx + 1)  # Add month number (1-12)
                                child_rows.append({
                                    "lineNumber": child_line_idx + 1,  # Convert back to 1-based for display
                                    "values": child_value_map
                                })
                    
                    if child_rows:
                        row_dict["childRows"] = child_rows
            
            # Special handling for atmo.cli: capture station deposition data
            if file_name == 'atmo.cli':
                with file_path.open("r", encoding="utf-8", errors="ignore") as handle:
                    lines = handle.readlines()
                
                # The main record has num_sta which tells us how many stations
                try:
                    num_sta = int(row.get('num_sta', 0)) if 'num_sta' in row.index else 0
                    num_aa = int(row.get('num_aa', 0)) if 'num_aa' in row.index else 0
                except (ValueError, TypeError):
                    num_sta = 0
                    num_aa = 0
                
                if num_sta > 0 and num_aa > 0:
                    child_rows = []
                    # Start after the metadata line (line 3, index 2 in 0-based)
                    # line_num is the metadata line number (1-based)
                    current_line_idx = int(row.get('lineNumber', 0)) - 1  # Convert to 0-based
                    
                    deposition_types = ['nh4_wet', 'no3_wet', 'nh4_dry', 'no3_dry']
                    
                    for station_idx in range(num_sta):
                        # Next line is station name
                        station_line_idx = current_line_idx + 1 + (station_idx * 5)  # 1 name line + 4 data lines per station
                        if station_line_idx < len(lines):
                            station_name = lines[station_line_idx].strip()
                            
                            # Next 4 lines are deposition data
                            station_data = {'station_name': station_name}
                            for dep_idx, dep_type in enumerate(deposition_types):
                                data_line_idx = station_line_idx + 1 + dep_idx
                                if data_line_idx < len(lines):
                                    data_line = lines[data_line_idx].strip()
                                    # Split the line and take values (last token is the label)
                                    values = data_line.split()
                                    # The last value is the label (nh4_wet, etc), rest are data values
                                    if values:
                                        station_data[dep_type] = values[:-1] if len(values) > 1 else values
                                        station_data[f'{dep_type}_line'] = data_line_idx + 1  # Store line number
                            
                            if 'station_name' in station_data:
                                child_rows.append({
                                    "lineNumber": station_line_idx + 1,  # 1-based line number
                                    "values": station_data
                                })
                    
                    if child_rows:
                        row_dict["childRows"] = child_rows
            
            row_payload.append(row_dict)

        tables_payload[table["table_name"]] = row_payload
        
        # Build FK references for main records
        fk_references.extend(build_fk_references(df, table, file_path, fk_null_values, metadata))
        
        # Special handling for management.sch child lines
        if file_name == 'management.sch' and child_line_info:
            with file_path.open("r", encoding="utf-8", errors="ignore") as handle:
                lines = handle.readlines()
            
            # Process child lines for each main record
            for idx, (line_num, _) in enumerate(child_line_info):
                # Get the main record to extract numb_auto and numb_ops
                main_record = df.iloc[idx]
                try:
                    numb_auto = int(main_record.get('numb_auto', 0))
                    numb_ops = int(main_record.get('numb_ops', 0))
                except (ValueError, KeyError):
                    numb_auto = 0
                    numb_ops = 0
                
                # Process child lines starting from the line after the main record
                child_refs = process_management_sch_child_lines(
                    file_path, table, lines, line_num, numb_auto, numb_ops, fk_null_values
                )
                fk_references.extend(child_refs)

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
