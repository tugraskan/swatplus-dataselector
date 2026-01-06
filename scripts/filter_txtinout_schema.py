#!/usr/bin/env python3
"""
Filter database-only columns from SWAT+ schema to create a TxtInOut-specific schema.

The swatplus-editor schema includes database-specific columns like AutoField 'id' 
that don't exist in the actual TxtInOut files. This script creates a filtered
version of the schema that only includes columns present in the actual files.
"""

import json
import sys
from pathlib import Path
from typing import Dict, List, Any


def filter_schema_for_txtinout(schema: Dict[str, Any]) -> Dict[str, Any]:
    """
    Filter out database-only columns from the schema.
    
    Database-only columns include:
    - AutoField columns (auto-generated database IDs)
    - Any other database-specific metadata columns
    
    Args:
        schema: The full database schema
        
    Returns:
        Filtered schema with only TxtInOut file columns
    """
    filtered_schema = {
        "schema_version": schema.get("schema_version", "2.0.0"),
        "source": {
            **schema.get("source", {}),
            "filtered_for": "txtinout_files",
            "filter_note": "Database-only columns (AutoField, etc.) have been removed"
        },
        "tables": {}
    }
    
    stats = {
        "tables_processed": 0,
        "columns_removed": 0,
        "autofield_removed": 0,
        "pk_adjusted": 0
    }
    
    for file_name, table_info in schema.get("tables", {}).items():
        filtered_table = {
            **table_info,
            "columns": [],
            "primary_keys": [],
            "foreign_keys": []
        }
        
        stats["tables_processed"] += 1
        original_pk = table_info.get("primary_keys", [])
        
        # Filter columns
        for col in table_info.get("columns", []):
            col_type = col.get("type", "")
            col_name = col.get("name", "")
            
            # Skip AutoField columns (database-only)
            if col_type == "AutoField":
                stats["columns_removed"] += 1
                stats["autofield_removed"] += 1
                print(f"  Removed AutoField: {file_name}.{col_name}")
                continue
            
            # Keep all other columns
            filtered_table["columns"].append(col)
        
        # Update primary keys - remove 'id' if it was an AutoField
        for pk in original_pk:
            # Only keep PKs that still exist in columns
            if any(col["name"] == pk for col in filtered_table["columns"]):
                filtered_table["primary_keys"].append(pk)
            else:
                stats["pk_adjusted"] += 1
        
        # If no PK remains and 'name' column exists, use it as PK
        if not filtered_table["primary_keys"]:
            name_col = next((col for col in filtered_table["columns"] if col["name"] == "name"), None)
            if name_col:
                filtered_table["primary_keys"].append("name")
                # Update the column to mark it as PK
                for col in filtered_table["columns"]:
                    if col["name"] == "name":
                        col["is_primary_key"] = True
                        break
        
        # Update foreign keys - filter out references to removed columns
        # For TxtInOut files, FK columns that reference "name" fields use the column name directly
        # Foreign keys that originally referenced "id" should now reference "name"
        for fk in table_info.get("foreign_keys", []):
            fk_col = fk.get("column", "")
            # Only keep FKs where the source column still exists
            if any(col["name"] == fk_col for col in filtered_table["columns"]):
                # Update FK reference: if it was pointing to 'id', change to 'name'
                target_col = fk["references"]["column"]
                if target_col == "id":
                    target_col = "name"
                
                filtered_fk = {
                    **fk,
                    "db_column": fk_col,  # TxtInOut: no "_id" suffix
                    "references": {
                        "table": fk["references"]["table"],
                        "column": target_col  # Use 'name' if original was 'id'
                    }
                }
                filtered_table["foreign_keys"].append(filtered_fk)
        
        # Update FK column metadata
        for col in filtered_table["columns"]:
            if col.get("is_foreign_key") and col.get("fk_target"):
                # Update fk_target: if it was pointing to 'id', change to 'name'
                if col["fk_target"]["column"] == "id":
                    col["fk_target"]["column"] = "name"
        
        filtered_schema["tables"][file_name] = filtered_table
    
    return filtered_schema, stats


def main():
    """Main execution"""
    # Determine paths
    script_dir = Path(__file__).parent
    schema_dir = script_dir.parent / "resources" / "schema"
    input_file = schema_dir / "swatplus-editor-schema.json"
    output_file = schema_dir / "swatplus-editor-schema.json"  # Overwrite the original
    backup_file = schema_dir / "swatplus-editor-schema-full.json"  # Keep backup
    
    print("Filtering SWAT+ schema for TxtInOut files...")
    print(f"Input:  {input_file}")
    print(f"Backup: {backup_file}")
    print(f"Output: {output_file}")
    print()
    
    # Load schema
    try:
        with open(input_file, 'r') as f:
            schema = json.load(f)
    except Exception as e:
        print(f"❌ Error loading schema: {e}")
        sys.exit(1)
    
    # Create backup if it doesn't exist
    if not backup_file.exists():
        print(f"Creating backup of original schema...")
        with open(backup_file, 'w') as f:
            json.dump(schema, f, indent=2)
        print(f"✅ Backup created: {backup_file}")
    
    # Filter schema
    print()
    print("Filtering columns...")
    filtered_schema, stats = filter_schema_for_txtinout(schema)
    
    # Write filtered schema
    try:
        with open(output_file, 'w') as f:
            json.dump(filtered_schema, f, indent=2)
        print()
        print(f"✅ Filtered schema written to: {output_file}")
    except Exception as e:
        print(f"❌ Error writing schema: {e}")
        sys.exit(1)
    
    # Print statistics
    print()
    print("Statistics:")
    print(f"  Tables processed:     {stats['tables_processed']}")
    print(f"  Columns removed:      {stats['columns_removed']}")
    print(f"  AutoField removed:    {stats['autofield_removed']}")
    print(f"  Primary keys updated: {stats['pk_adjusted']}")
    print()
    
    # Verify
    total_columns_after = sum(
        len(table["columns"]) 
        for table in filtered_schema["tables"].values()
    )
    print(f"  Total columns after:  {total_columns_after}")
    print()
    print("✅ Done!")


if __name__ == "__main__":
    main()
