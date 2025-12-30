#!/usr/bin/env python3
"""
Extract SWAT+ schema from swatplus-editor Peewee models using static analysis.
This script parses Python files without executing them to extract schema information.
"""

import os
import json
import re
from datetime import datetime
from pathlib import Path

EDITOR_PATH = Path("/tmp/swatplus-editor/src/api/database/project")

def parse_model_file(file_path):
    """Parse a Python model file and extract class definitions"""
    with open(file_path, 'r') as f:
        content = f.read()
    
    models = {}
    
    # Find all class definitions that inherit from BaseModel
    class_pattern = r'class\s+(\w+)\s*\(\s*(?:base\.)?BaseModel\s*\)\s*:'
    matches = re.finditer(class_pattern, content)
    
    for match in matches:
        class_name = match.group(1)
        class_start = match.end()
        
        # Find the end of the class (next class or end of file)
        next_class = re.search(r'\nclass\s+', content[class_start:])
        class_end = class_start + next_class.start() if next_class else len(content)
        class_body = content[class_start:class_end]
        
        # Extract fields
        fields = []
        foreign_keys = []
        primary_keys = []
        
        # Pattern for field definitions
        field_pattern = r'(\w+)\s*=\s*(\w+Field)\s*\((.*?)\)'
        for field_match in re.finditer(field_pattern, class_body, re.DOTALL):
            field_name = field_match.group(1)
            field_type = field_match.group(2)
            field_args = field_match.group(3)
            
            # Skip Meta class fields
            if field_name in ['Meta', 'DoesNotExist']:
                continue
            
            col_info = {
                "name": field_name,
                "db_column": field_name,
                "type": field_type,
                "nullable": 'null=True' in field_args or 'null = True' in field_args,
                "is_primary_key": False,
                "is_foreign_key": False
            }
            
            # Check for primary key
            if 'primary_key=True' in field_args or 'primary_key = True' in field_args:
                primary_keys.append(field_name)
                col_info["is_primary_key"] = True
            
            # Check for foreign key
            if field_type == 'ForeignKeyField':
                # Extract target model
                target_match = re.search(r'^([^,\)]+)', field_args.strip())
                if target_match:
                    target_model = target_match.group(1).strip()
                    
                    # Handle qualified names like hydrology.Topography_hyd
                    if '.' in target_model:
                        target_parts = target_model.split('.')
                        target_table = '_'.join(target_parts[-1].split('_')[:-1] + [target_parts[-1].split('_')[-1]]).lower()
                    else:
                        # Convert CamelCase to snake_case
                        target_table = re.sub(r'(?<!^)(?=[A-Z])', '_', target_model).lower()
                    
                    fk_info = {
                        "column": field_name,
                        "db_column": f"{field_name}_id",
                        "references": {
                            "table": target_table,
                            "column": "id"
                        }
                    }
                    foreign_keys.append(fk_info)
                    col_info["is_foreign_key"] = True
                    col_info["fk_target"] = fk_info["references"]
            
            fields.append(col_info)
        
        # Add implicit 'id' field if no primary key defined
        if not primary_keys and not any(f['name'] == 'id' for f in fields):
            fields.insert(0, {
                "name": "id",
                "db_column": "id",
                "type": "AutoField",
                "nullable": False,
                "is_primary_key": True,
                "is_foreign_key": False
            })
            primary_keys.append("id")
        
        # Convert class name to table name (CamelCase to snake_case)
        table_name = re.sub(r'(?<!^)(?=[A-Z])', '_', class_name).lower()
        
        models[class_name] = {
            "table_name": table_name,
            "columns": fields,
            "primary_keys": primary_keys,
            "foreign_keys": foreign_keys
        }
    
    return models

def normalize_table_to_filename(table_name):
    """Convert table name to TxtInOut filename"""
    # Known mappings from analyzing swatplus-editor
    known_mappings = {
        'hru_data_hru': 'hru-data.hru',
        'hru_lte_hru': 'hru-lte.hru',
        'topography_hyd': 'topography.hyd',
        'hydrology_hyd': 'hydrology.hyd',
        'soils_sol': 'soils.sol',
        'soils_lte_sol': 'soils-lte.sol',
        'landuse_lum': 'landuse.lum',
        'management_sch': 'management.sch',
        'soil_plant_ini': 'soil-plant.ini',
        'snow_sno': 'snow.sno',
        'plants_plt': 'plants.plt',
        'd_table_dtl': 'd_table.dtl'
    }
    
    if table_name in known_mappings:
        return known_mappings[table_name]
    
    # Default conversion
    parts = table_name.split('_')
    if len(parts) >= 2:
        # Check if last part looks like an extension
        last = parts[-1]
        if len(last) <= 4 and last.isalpha():
            base = '-'.join(parts[:-1])
            return f"{base}.{last}"
    
    return table_name.replace('_', '-') + '.txt'

def extract_mvp_tables():
    """Extract schema for MVP subset of tables"""
    mvp_files = [
        ("hru.py", ["Hru_data_hru", "Hru_lte_hru"]),
        ("hydrology.py", ["Topography_hyd", "Hydrology_hyd", "Field_fld"]),
        ("soils.py", ["Soils_sol", "Soils_lte_sol"]),
        ("lum.py", ["Landuse_lum", "Management_sch"]),
        ("init.py", ["Soil_plant_ini"]),
        ("hru_parm_db.py", ["Snow_sno", "Plants_plt"]),
        ("decision_table.py", ["D_table_dtl"])
    ]
    
    schema = {
        "schema_version": "1.0.0",
        "source": {
            "repo": "swat-model/swatplus-editor",
            "commit": "f8ff21e40d52895ea91028035959f20ca4104405",
            "generated_on": datetime.now().isoformat()
        },
        "tables": {}
    }
    
    for file_name, class_names in mvp_files:
        file_path = EDITOR_PATH / file_name
        
        if not file_path.exists():
            print(f"✗ File not found: {file_path}")
            continue
        
        try:
            models = parse_model_file(file_path)
            
            for class_name in class_names:
                if class_name not in models:
                    print(f"✗ Class {class_name} not found in {file_name}")
                    continue
                
                model_info = models[class_name]
                table_name = model_info["table_name"]
                txt_file_name = normalize_table_to_filename(table_name)
                
                schema["tables"][txt_file_name] = {
                    "file_name": txt_file_name,
                    "table_name": table_name,
                    "model_class": f"{file_name.replace('.py', '')}.{class_name}",
                    "has_metadata_line": True,
                    "has_header_line": True,
                    "data_starts_after": 2,
                    "columns": model_info["columns"],
                    "primary_keys": model_info["primary_keys"],
                    "foreign_keys": model_info["foreign_keys"],
                    "notes": "Auto-generated from Peewee model via static analysis"
                }
                
                print(f"✓ Extracted: {class_name} -> {txt_file_name}")
                
        except Exception as e:
            print(f"✗ Failed to parse {file_name}: {e}")
            import traceback
            traceback.print_exc()
    
    return schema

def main():
    """Main execution"""
    print("Extracting SWAT+ schema from swatplus-editor (static analysis)...")
    print(f"Editor path: {EDITOR_PATH}")
    print()
    
    schema = extract_mvp_tables()
    
    # Write schema to JSON
    output_path = "/home/runner/work/swatplus-dataselector/swatplus-dataselector/resources/schema/swatplus-editor-schema.json"
    with open(output_path, 'w') as f:
        json.dump(schema, f, indent=2)
    
    print()
    print(f"✓ Schema written to: {output_path}")
    print(f"  Tables extracted: {len(schema['tables'])}")
    print()
    
    # Print summary
    print("Summary:")
    for file_name, table_info in sorted(schema["tables"].items()):
        fk_count = len(table_info["foreign_keys"])
        col_count = len(table_info["columns"])
        print(f"  {file_name}: {col_count} columns, {fk_count} FKs")

if __name__ == "__main__":
    main()
