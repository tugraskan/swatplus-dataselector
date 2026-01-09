#!/usr/bin/env python3
"""
Add .con file definitions to swatplus-editor-schema.json

These files were documented in INPUT_FILES_STRUCTURE.md but missing from
the main schema file, preventing them from being indexed.
"""

import json
from pathlib import Path

def create_con_table(file_name, config):
    """Create a table definition for a .con file"""
    columns = [
        {
            "name": "id",
            "db_column": "id",
            "type": "AutoField",
            "nullable": False,
            "is_primary_key": True,
            "is_foreign_key": False
        },
        {
            "name": "name",
            "db_column": "name",
            "type": "CharField",
            "nullable": False,
            "is_primary_key": False,
            "is_foreign_key": False
        },
        {
            "name": "gis_id",
            "db_column": "gis_id",
            "type": "IntegerField",
            "nullable": True,
            "is_primary_key": False,
            "is_foreign_key": False
        },
        {
            "name": "area",
            "db_column": "area",
            "type": "DecimalField",
            "nullable": True,
            "is_primary_key": False,
            "is_foreign_key": False
        },
        {
            "name": "lat",
            "db_column": "lat",
            "type": "DecimalField",
            "nullable": True,
            "is_primary_key": False,
            "is_foreign_key": False
        },
        {
            "name": "lon",
            "db_column": "lon",
            "type": "DecimalField",
            "nullable": True,
            "is_primary_key": False,
            "is_foreign_key": False
        },
        {
            "name": "elev",
            "db_column": "elev",
            "type": "DecimalField",
            "nullable": True,
            "is_primary_key": False,
            "is_foreign_key": False
        },
        {
            "name": config['object_pointer'],
            "db_column": config['object_pointer'],
            "type": "IntegerField",
            "nullable": True,
            "is_primary_key": False,
            "is_foreign_key": True
        },
        {
            "name": "wst",
            "db_column": "wst",
            "type": "CharField",
            "nullable": True,
            "is_primary_key": False,
            "is_foreign_key": True,
            "fk_target": {
                "table": "weather_sta_cli",
                "column": "name"
            }
        },
        {
            "name": "cst",
            "db_column": "cst",
            "type": "IntegerField",
            "nullable": True,
            "is_primary_key": False,
            "is_foreign_key": False
        },
        {
            "name": "ovfl",
            "db_column": "ovfl",
            "type": "IntegerField",
            "nullable": True,
            "is_primary_key": False,
            "is_foreign_key": False
        },
        {
            "name": "rule",
            "db_column": "rule",
            "type": "IntegerField",
            "nullable": True,
            "is_primary_key": False,
            "is_foreign_key": False
        },
        {
            "name": "out_tot",
            "db_column": "out_tot",
            "type": "IntegerField",
            "nullable": True,
            "is_primary_key": False,
            "is_foreign_key": False
        },
        {
            "name": "obj_typ",
            "db_column": "obj_typ",
            "type": "CharField",
            "nullable": True,
            "is_primary_key": False,
            "is_foreign_key": False
        },
        {
            "name": "obj_id",
            "db_column": "obj_id",
            "type": "IntegerField",
            "nullable": True,
            "is_primary_key": False,
            "is_foreign_key": True
        },
        {
            "name": "hyd_typ",
            "db_column": "hyd_typ",
            "type": "CharField",
            "nullable": True,
            "is_primary_key": False,
            "is_foreign_key": False
        },
        {
            "name": "frac",
            "db_column": "frac",
            "type": "DecimalField",
            "nullable": True,
            "is_primary_key": False,
            "is_foreign_key": False
        }
    ]
    
    table = {
        "file_name": file_name,
        "table_name": config['table_name'],
        "model_class": config['model_class'],
        "source_file": "project/connect.py",
        "has_metadata_line": True,
        "has_header_line": True,
        "data_starts_after": 2,
        "columns": columns,
        "primary_keys": ["id"],
        "foreign_keys": [
            {
                "column": "wst",
                "db_column": "wst",
                "references": {
                    "table": "weather_sta_cli",
                    "column": "name"
                }
            }
        ],
        "notes": f"Auto-generated for {config['description']} connectivity"
    }
    
    return table


def main():
    # Define the .con files and their specific object pointers
    con_files = {
        'hru.con': {
            'table_name': 'hru_con',
            'model_class': 'project.connect.Hru_con',
            'object_pointer': 'hru',
            'description': 'HRU'
        },
        'rout_unit.con': {
            'table_name': 'rout_unit_con',
            'model_class': 'project.connect.Rout_unit_con',
            'object_pointer': 'ru',
            'description': 'routing unit'
        },
        'aquifer.con': {
            'table_name': 'aquifer_con',
            'model_class': 'project.connect.Aquifer_con',
            'object_pointer': 'aqu',
            'description': 'aquifer'
        },
        'chandeg.con': {
            'table_name': 'chandeg_con',
            'model_class': 'project.connect.Chandeg_con',
            'object_pointer': 'lcha',
            'description': 'channel'
        },
        'reservoir.con': {
            'table_name': 'reservoir_con',
            'model_class': 'project.connect.Reservoir_con',
            'object_pointer': 'res',
            'description': 'reservoir'
        },
        'recall.con': {
            'table_name': 'recall_con',
            'model_class': 'project.connect.Recall_con',
            'object_pointer': 'rec',
            'description': 'recall'
        }
    }
    
    # Load the schema
    script_dir = Path(__file__).parent
    schema_path = script_dir.parent / 'resources' / 'schema' / 'swatplus-editor-schema.json'
    
    with open(schema_path, 'r', encoding='utf-8') as f:
        schema = json.load(f)
    
    # Add .con files to schema
    tables = schema.get('tables', {})
    added_count = 0
    
    for file_name, config in con_files.items():
        if file_name not in tables:
            tables[file_name] = create_con_table(file_name, config)
            added_count += 1
            print(f"Added {file_name} to schema")
        else:
            print(f"Skipped {file_name} (already exists)")
    
    # Save the updated schema
    with open(schema_path, 'w', encoding='utf-8') as f:
        json.dump(schema, f, indent=2, ensure_ascii=False)
    
    print(f"\nAdded {added_count} .con files to {schema_path}")
    print(f"Total tables in schema: {len(tables)}")
    
    return 0


if __name__ == '__main__':
    exit(main())
