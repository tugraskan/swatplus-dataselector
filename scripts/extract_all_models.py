#!/usr/bin/env python3
"""
Dynamically extract ALL SWAT+ schema from swatplus-editor Peewee models.
This script recursively scans all model files and extracts all BaseModel subclasses.
"""

import os
import json
import re
from datetime import datetime
from pathlib import Path
import argparse

def parse_model_file(file_path):
    """Parse a Python model file and extract all class definitions"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"  ⚠ Could not read {file_path}: {e}")
        return {}
    
    models = {}
    
    # Find all class definitions that inherit from BaseModel
    # Match variations: BaseModel, base.BaseModel, BaseModel with metaclass, etc.
    class_pattern = r'class\s+(\w+)\s*\(\s*(?:base\.)?BaseModel(?:\s*,.*?)?\s*\)\s*:'
    matches = list(re.finditer(class_pattern, content))
    
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
        
        # Pattern for field definitions - capture multiline field definitions
        field_pattern = r'(\w+)\s*=\s*(\w+Field)\s*\((.*?)\)(?:\s|$)'
        for field_match in re.finditer(field_pattern, class_body, re.DOTALL):
            field_name = field_match.group(1)
            field_type = field_match.group(2)
            field_args = field_match.group(3)
            
            # Skip Meta class fields and other special attributes
            if field_name in ['Meta', 'DoesNotExist', 'objects']:
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
                        target_model = target_parts[-1]
                    
                    # Convert CamelCase to snake_case for table name
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
    """Convert table name to TxtInOut filename with intelligent mapping"""
    # Known mappings from analyzing swatplus-editor
    known_mappings = {
        'hru_data_hru': 'hru-data.hru',
        'hru_lte_hru': 'hru-lte.hru',
        'topography_hyd': 'topography.hyd',
        'hydrology_hyd': 'hydrology.hyd',
        'field_fld': 'field.fld',
        'soils_sol': 'soils.sol',
        'soils_lte_sol': 'soils-lte.sol',
        'soils_sol_layer': 'soils.sol',  # Nested in soils.sol
        'nutrients_sol': 'nutrients.sol',
        'landuse_lum': 'landuse.lum',
        'management_sch': 'management.sch',
        'soil_plant_ini': 'soil-plant.ini',
        'snow_sno': 'snow.sno',
        'plants_plt': 'plants.plt',
        'd_table_dtl': 'd_table.dtl',
        'codes_bsn': 'codes.bsn',
        'parameters_bsn': 'parameters.bsn',
        'print_prt': 'print.prt',
        'print_prt_object': 'object.prt',
        'time_sim': 'time.sim',
        'weather_sta_cli': 'weather-sta.cli',
        'weather_wgn_cli': 'weather-wgn.cli',
        'wind_cli': 'wind.cli',
        'recall_rec': 'recall.rec',
        'aquifer_aqu': 'aquifer.aqu',
        'initial_aqu': 'initial.aqu',
        'channel_cha': 'channel.cha',
        'hydrology_cha': 'hydrology.cha',
        'sediment_cha': 'sediment.cha',
        'nutrients_cha': 'nutrients.cha',
        'initial_cha': 'initial.cha',
        'reservoir_res': 'reservoir.res',
        'hydrology_res': 'hydrology.res',
        'sediment_res': 'sediment.res',
        'nutrients_res': 'nutrients.res',
        'initial_res': 'initial.res',
        'wetland_wet': 'wetland.wet',
        'hydrology_wet': 'hydrology.wet',
        'routing_unit_rtu': 'routing-unit.rtu',
        'rout_unit_rtu': 'rout-unit.rtu',
        'rout_unit_dr': 'rout-unit.dr',
    }
    
    if table_name in known_mappings:
        return known_mappings[table_name]
    
    # Default conversion: split on underscore, use last part as extension
    parts = table_name.split('_')
    if len(parts) >= 2:
        # Check if last part looks like an extension (3-4 chars, all alpha)
        last = parts[-1]
        if len(last) <= 4 and last.isalpha():
            base = '-'.join(parts[:-1])
            return f"{base}.{last}"
    
    # Fallback: just replace underscores with dashes and add .txt
    return table_name.replace('_', '-') + '.txt'

def scan_all_models(editor_path):
    """Recursively scan all Python files in database directories"""
    schema = {
        "schema_version": "2.0.0",
        "source": {
            "repo": "swat-model/swatplus-editor",
            "commit": "f8ff21e40d52895ea91028035959f20ca4104405",
            "generated_on": datetime.now().isoformat(),
            "extraction_method": "dynamic_recursive_scan"
        },
        "tables": {},
        "statistics": {
            "files_scanned": 0,
            "models_found": 0,
            "tables_mapped": 0
        }
    }
    
    # Directories to scan
    db_dirs = ['project', 'output', 'datasets']
    
    print(f"📁 Scanning swatplus-editor database models...")
    print(f"   Editor path: {editor_path}")
    print()
    
    for db_dir in db_dirs:
        dir_path = editor_path / db_dir
        
        if not dir_path.exists():
            print(f"  ⚠ Directory not found: {dir_path}")
            continue
        
        print(f"📂 Scanning {db_dir}/...")
        
        # Find all Python files in this directory
        py_files = list(dir_path.glob('*.py'))
        
        for py_file in sorted(py_files):
            # Skip __init__.py and base.py
            if py_file.name in ['__init__.py', 'base.py']:
                continue
            
            schema["statistics"]["files_scanned"] += 1
            
            try:
                models = parse_model_file(py_file)
                
                if models:
                    print(f"  📄 {py_file.name}: {len(models)} models")
                    
                    for class_name, model_info in models.items():
                        schema["statistics"]["models_found"] += 1
                        
                        table_name = model_info["table_name"]
                        txt_file_name = normalize_table_to_filename(table_name)
                        
                        # Use txt_file_name as key to avoid duplicates
                        if txt_file_name not in schema["tables"]:
                            schema["tables"][txt_file_name] = {
                                "file_name": txt_file_name,
                                "table_name": table_name,
                                "model_class": f"{db_dir}.{py_file.stem}.{class_name}",
                                "source_file": f"{db_dir}/{py_file.name}",
                                "has_metadata_line": True,
                                "has_header_line": True,
                                "data_starts_after": 2,
                                "columns": model_info["columns"],
                                "primary_keys": model_info["primary_keys"],
                                "foreign_keys": model_info["foreign_keys"],
                                "notes": "Auto-generated via dynamic scan"
                            }
                            schema["statistics"]["tables_mapped"] += 1
                            print(f"     ✓ {class_name} -> {txt_file_name}")
                        else:
                            # Model already mapped (possible duplicate or nested table)
                            print(f"     ⚠ {class_name} -> {txt_file_name} (already mapped)")
                
            except Exception as e:
                print(f"  ✗ Error parsing {py_file.name}: {e}")
                import traceback
                traceback.print_exc()
        
        print()
    
    return schema

def main():
    """Main execution"""
    parser = argparse.ArgumentParser(description='Extract all SWAT+ schema from swatplus-editor')
    parser.add_argument('--editor-path', type=str, 
                       default='/tmp/swatplus-editor/src/api/database',
                       help='Path to swatplus-editor database directory')
    parser.add_argument('--output', type=str,
                       default='resources/schema/swatplus-editor-schema-full.json',
                       help='Output JSON file path')
    
    args = parser.parse_args()
    
    editor_path = Path(args.editor_path)
    
    if not editor_path.exists():
        print(f"❌ Editor path not found: {editor_path}")
        print(f"\nPlease clone swatplus-editor first:")
        print(f"  git clone https://github.com/swat-model/swatplus-editor.git /tmp/swatplus-editor")
        return 1
    
    # Extract schema
    schema = scan_all_models(editor_path)
    
    # Ensure output directory exists
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Write schema to JSON
    with open(output_path, 'w') as f:
        json.dump(schema, f, indent=2)
    
    print("=" * 70)
    print(f"✅ Schema extraction complete!")
    print(f"   Output: {output_path}")
    print(f"   Files scanned: {schema['statistics']['files_scanned']}")
    print(f"   Models found: {schema['statistics']['models_found']}")
    print(f"   Tables mapped: {schema['statistics']['tables_mapped']}")
    print("=" * 70)
    print()
    
    # Print summary by category
    print("📊 Summary by file type:")
    file_types = {}
    for file_name in sorted(schema["tables"].keys()):
        ext = file_name.split('.')[-1]
        file_types[ext] = file_types.get(ext, 0) + 1
    
    for ext, count in sorted(file_types.items()):
        print(f"   .{ext}: {count} tables")
    
    return 0

if __name__ == "__main__":
    exit(main())
