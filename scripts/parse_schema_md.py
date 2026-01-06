#!/usr/bin/env python3
"""
Parse SWAT+ markdown schema documentation to extract FK and file pointer information.

This script processes the markdown documentation files in docs/schema/ to extract:
- Foreign key relationships between files
- File pointer columns (columns that reference file names, not FK values)
- Primary key information
- Enhanced column metadata

The output is a JSON file that can be merged with the existing schema.
"""

import re
import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict


# Category headers to skip (not actual file names)
CATEGORY_HEADERS = {
    'Aquifers', 'Basin', 'Calibration', 'Channels', 'Climate',
    'Connectivity', 'Constituents', 'Databases', 'Hydrologic Response Units',
    'Hydrology', 'Landscape Units', 'Landuse And Management',
    'Management Practices', 'Nutrient Initialization', 'Point Sources And Inlets',
    'Reservoirs', 'Routing Units', 'Simulation Settings', 'Soils',
    'Structural Practices', 'Water Allocation', 'Wetlands', 'Basin 1'
}


@dataclass
class ColumnInfo:
    """Represents information about a column from markdown documentation."""
    column_order: int
    field_name: str
    description: str
    type: str
    unit: str
    default: str
    range: str
    is_pk: bool
    is_fk: bool
    is_pointer: bool
    points_to: str
    referenced_by: str


@dataclass
class FileInfo:
    """Represents information about a SWAT+ input file."""
    file_name: str
    description: str
    metadata_structure: str
    columns: List[ColumnInfo]
    special_structure: bool = False


def parse_markdown_table(lines: List[str], start_idx: int) -> Tuple[List[Dict[str, str]], int]:
    """
    Parse a markdown table and return rows as dictionaries.
    
    Returns:
        (list of row dictionaries, index after table)
    """
    # Find header row
    header_idx = start_idx
    while header_idx < len(lines) and not lines[header_idx].strip().startswith('|'):
        header_idx += 1
    
    if header_idx >= len(lines):
        return [], start_idx
    
    # Parse header
    header_line = lines[header_idx].strip()
    headers = [h.strip() for h in header_line.split('|')[1:-1]]
    
    # Skip separator line
    sep_idx = header_idx + 1
    
    # Parse data rows
    rows = []
    current_idx = sep_idx + 1
    while current_idx < len(lines):
        line = lines[current_idx].strip()
        if not line.startswith('|'):
            break
        
        values = [v.strip() for v in line.split('|')[1:-1]]
        if len(values) == len(headers):
            row = dict(zip(headers, values))
            rows.append(row)
        
        current_idx += 1
    
    return rows, current_idx


def parse_input_files_structure_md(md_path: Path) -> Dict[str, FileInfo]:
    """
    Parse INPUT_FILES_STRUCTURE.md (from GitBooks).
    
    This file contains comprehensive FK and pointer information.
    """
    print(f"Parsing {md_path.name}...")
    
    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.split('\n')
    files_info: Dict[str, FileInfo] = {}
    
    i = 0
    current_file = None
    
    while i < len(lines):
        line = lines[i].strip()
        
        # Look for file section headers (### filename or ### File Name)
        if line.startswith('###'):
            file_header = line[3:].strip()
            
            # Skip category headers
            if file_header in CATEGORY_HEADERS:
                i += 1
                continue
            
            # Extract filename from header
            current_file = file_header.strip()
            
            # Look ahead for description and special structure markers
            description = ""
            special_structure = False
            metadata_structure = "Standard (Line 1: Title, Line 2: Header, Line 3+: Data)"
            
            j = i + 1
            while j < min(i + 10, len(lines)):
                next_line = lines[j].strip()
                
                if next_line.startswith('**⚠️ SPECIAL STRUCTURE**'):
                    special_structure = True
                
                if next_line.startswith('**Description:**'):
                    description = next_line.replace('**Description:**', '').strip()
                
                if next_line.startswith('**Metadata Structure:**'):
                    metadata_structure = next_line.replace('**Metadata Structure:**', '').strip()
                
                # Look for table start
                if next_line.startswith('| Column Order'):
                    # Parse the table
                    rows, end_idx = parse_markdown_table(lines, j)
                    columns = []
                    
                    for row in rows:
                        try:
                            column_order = int(row.get('Column Order', '0'))
                        except ValueError:
                            continue
                        
                        field_name = row.get('Field', '')
                        if not field_name:
                            continue
                        
                        # Check for PK, FK, and Pointer markers
                        is_pk = row.get('PK', '').strip() == '✓'
                        is_fk = row.get('FK', '').strip() == '✓'
                        is_pointer = row.get('Pointer', '').strip() == '✓'
                        points_to = row.get('Points To', '').strip()
                        referenced_by = row.get('Referenced By', '').strip()
                        
                        col_info = ColumnInfo(
                            column_order=column_order,
                            field_name=field_name,
                            description=row.get('Description', ''),
                            type=row.get('Type', ''),
                            unit=row.get('Unit', ''),
                            default=row.get('Default', ''),
                            range=row.get('Range', ''),
                            is_pk=is_pk,
                            is_fk=is_fk,
                            is_pointer=is_pointer,
                            points_to=points_to,
                            referenced_by=referenced_by
                        )
                        columns.append(col_info)
                    
                    if columns and current_file:
                        files_info[current_file] = FileInfo(
                            file_name=current_file,
                            description=description,
                            metadata_structure=metadata_structure,
                            columns=columns,
                            special_structure=special_structure
                        )
                    
                    i = end_idx
                    break
                
                j += 1
        
        i += 1
    
    print(f"  Found {len(files_info)} files with schema information")
    return files_info


def parse_swat_input_file_structure_md(md_path: Path) -> Dict[str, Dict]:
    """
    Parse SWAT_INPUT_FILE_STRUCTURE.md (from SWAT editor database models).
    
    This file contains the database model structure.
    """
    print(f"Parsing {md_path.name}...")
    
    # This file has a similar structure, so we can reuse the same parser
    files_info = parse_input_files_structure_md(md_path)
    
    return {name: asdict(info) for name, info in files_info.items()}


def merge_schema_info(gitbooks_info: Dict[str, FileInfo], 
                      db_info: Dict[str, Dict]) -> Dict[str, Dict]:
    """
    Merge information from both markdown sources.
    
    Priority: GitBooks documentation for FK/pointer info, DB models for structure.
    """
    merged = {}
    
    # Start with GitBooks info (has better FK/pointer documentation)
    for file_name, file_info in gitbooks_info.items():
        merged[file_name] = asdict(file_info)
    
    # Enhance with DB model info where available
    for file_name, db_file_info in db_info.items():
        if file_name not in merged:
            merged[file_name] = db_file_info
        else:
            # Merge column information - prefer GitBooks for FK/pointer info
            # but use DB for type information if missing
            pass
    
    return merged


def extract_fk_relationships(merged_info: Dict[str, Dict]) -> Dict[str, List[Dict]]:
    """
    Extract all FK relationships from the merged schema information.
    
    Returns a mapping of: source_file -> list of FK relationships
    """
    fk_relationships = {}
    
    for file_name, file_info in merged_info.items():
        relationships = []
        
        for col in file_info.get('columns', []):
            if col.get('is_fk') or col.get('is_pointer'):
                target_file = col.get('points_to', '').strip()
                
                if target_file and target_file.lower() != 'n/a':
                    relationships.append({
                        'column': col['field_name'],
                        'is_fk': col.get('is_fk', False),
                        'is_pointer': col.get('is_pointer', False),
                        'target_file': target_file,
                        'description': col.get('description', '')
                    })
        
        if relationships:
            fk_relationships[file_name] = relationships
    
    return fk_relationships


def extract_file_pointers(merged_info: Dict[str, Dict]) -> Dict[str, List[str]]:
    """
    Extract file pointer columns (columns that reference filenames, not FK values).
    
    Returns a mapping of: file_name -> list of file pointer column names
    """
    file_pointers = {}
    
    for file_name, file_info in merged_info.items():
        pointer_columns = []
        
        for col in file_info.get('columns', []):
            # File pointers are marked as pointer but not FK
            # OR have "Pointer to" in description
            # OR point to files with extensions
            if col.get('is_pointer') and not col.get('is_fk'):
                pointer_columns.append(col['field_name'])
            elif 'pointer to' in col.get('description', '').lower():
                pointer_columns.append(col['field_name'])
            elif col.get('points_to') and '.' in col.get('points_to', ''):
                pointer_columns.append(col['field_name'])
        
        if pointer_columns:
            file_pointers[file_name] = pointer_columns
    
    return file_pointers


def generate_enhanced_metadata(merged_info: Dict[str, Dict], 
                               fk_relationships: Dict[str, List[Dict]],
                               file_pointers: Dict[str, List[str]]) -> Dict:
    """
    Generate enhanced metadata JSON that can be merged with existing schema.
    """
    return {
        "metadata_version": "2.0.0",
        "description": "Enhanced metadata extracted from markdown documentation",
        "source": "docs/schema/INPUT_FILES_STRUCTURE.md and SWAT_INPUT_FILE_STRUCTURE.md",
        "generated_from_markdown": True,
        
        "foreign_key_relationships": fk_relationships,
        
        "file_pointer_columns": file_pointers,
        
        "file_metadata": {
            file_name: {
                "description": info.get('description', ''),
                "metadata_structure": info.get('metadata_structure', ''),
                "special_structure": info.get('special_structure', False),
                "primary_keys": [
                    col['field_name'] for col in info.get('columns', []) 
                    if col.get('is_pk', False)
                ]
            }
            for file_name, info in merged_info.items()
        }
    }


def main():
    """Main entry point."""
    # Locate the markdown documentation files
    script_dir = Path(__file__).parent
    docs_schema_dir = script_dir.parent / 'docs' / 'schema'
    
    gitbooks_md = docs_schema_dir / 'INPUT_FILES_STRUCTURE.md'
    db_models_md = docs_schema_dir / 'SWAT_INPUT_FILE_STRUCTURE.md'
    
    if not gitbooks_md.exists():
        print(f"Error: {gitbooks_md} not found")
        return 1
    
    if not db_models_md.exists():
        print(f"Warning: {db_models_md} not found, using only GitBooks documentation")
        db_info = {}
    else:
        db_info = parse_swat_input_file_structure_md(db_models_md)
    
    # Parse both markdown files
    gitbooks_info = parse_input_files_structure_md(gitbooks_md)
    
    # Merge the information
    merged_info = merge_schema_info(gitbooks_info, db_info)
    
    # Extract FK relationships and file pointers
    fk_relationships = extract_fk_relationships(merged_info)
    file_pointers = extract_file_pointers(merged_info)
    
    print(f"\nExtracted {len(fk_relationships)} files with FK relationships")
    print(f"Extracted {len(file_pointers)} files with file pointer columns")
    
    # Generate enhanced metadata
    enhanced_metadata = generate_enhanced_metadata(merged_info, fk_relationships, file_pointers)
    
    # Save to output file
    output_path = script_dir.parent / 'resources' / 'schema' / 'enhanced-schema-from-markdown.json'
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(enhanced_metadata, f, indent=2, ensure_ascii=False)
    
    print(f"\nEnhanced schema written to: {output_path}")
    print(f"  - {len(enhanced_metadata['foreign_key_relationships'])} files with FK info")
    print(f"  - {len(enhanced_metadata['file_pointer_columns'])} files with pointer columns")
    print(f"  - {len(enhanced_metadata['file_metadata'])} files with metadata")
    
    return 0


if __name__ == '__main__':
    exit(main())
