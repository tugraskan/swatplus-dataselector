#!/usr/bin/env python3
"""
Merge enhanced schema from markdown with existing txtinout-metadata.json.

This script combines the information extracted from markdown documentation
with the existing metadata to create a comprehensive schema.
"""

import json
from pathlib import Path
from typing import Dict


def merge_file_pointer_columns(existing: Dict, enhanced: Dict) -> Dict:
    """
    Merge file_pointer_columns from enhanced schema into existing metadata.
    """
    # Start with existing file pointer columns
    merged = existing.get('file_pointer_columns', {}).copy()
    
    # Get FK relationships for better descriptions
    fk_relationships = enhanced.get('foreign_key_relationships', {})
    
    # Add enhanced file pointer columns
    for file_name, columns in enhanced.get('file_pointer_columns', {}).items():
        if file_name not in merged:
            # Build column descriptions from FK relationships if available
            col_descriptions = {}
            # FK relationships in enhanced schema are stored as lists directly
            file_fks = fk_relationships.get(file_name, [])
            if isinstance(file_fks, dict):
                file_fks = file_fks.get('relationships', [])
            
            for col in columns:
                # Try to find a better description from FK relationships
                description = f"Points to {col} file"
                for fk in file_fks:
                    if fk.get('column') == col:
                        target = fk.get('target_file', '')
                        desc = fk.get('description', '')
                        # Use the more specific description from markdown if available
                        if desc:
                            description = desc
                        elif target:
                            description = f"Points to {target}"
                        break
                col_descriptions[col] = description
            
            merged[file_name] = {
                "description": f"File pointer columns for {file_name}",
                **col_descriptions
            }
        else:
            # Merge with existing
            if isinstance(merged[file_name], dict):
                file_fks = fk_relationships.get(file_name, [])
                if isinstance(file_fks, dict):
                    file_fks = file_fks.get('relationships', [])
                    
                for col in columns:
                    if col not in merged[file_name]:
                        # Try to get description from FK relationships
                        description = f"Points to {col} file"
                        for fk in file_fks:
                            if fk.get('column') == col:
                                target = fk.get('target_file', '')
                                desc = fk.get('description', '')
                                # Use the more specific description from markdown if available
                                if desc:
                                    description = desc
                                elif target:
                                    description = f"Points to {target}"
                                break
                        merged[file_name][col] = description
            else:
                # Convert old format to new format
                merged[file_name] = {
                    "description": f"File pointer columns for {file_name}",
                    **{col: f"Points to {col} file" for col in columns}
                }
    
    return merged


def merge_foreign_key_relationships(existing: Dict, enhanced: Dict) -> Dict:
    """
    Merge foreign_key_relationships from enhanced schema.
    """
    merged = {}
    
    # Add enhanced FK relationships
    for file_name, relationships in enhanced.get('foreign_key_relationships', {}).items():
        merged[file_name] = {
            "description": f"Foreign key relationships for {file_name}",
            "relationships": relationships
        }
    
    return merged


def merge_file_metadata(existing: Dict, enhanced: Dict) -> Dict:
    """
    Merge file metadata from enhanced schema, preserving existing metadata.
    """
    # Start with deep copy of existing file metadata
    import copy
    merged = copy.deepcopy(existing.get('file_metadata', {}))
    
    # Add or update enhanced file metadata
    for file_name, metadata in enhanced.get('file_metadata', {}).items():
        if file_name in merged:
            # Update existing entry, preserving fields not in enhanced schema
            merged[file_name].update({
                "description": metadata.get('description', ''),
                "metadata_structure": metadata.get('metadata_structure', ''),
                "special_structure": metadata.get('special_structure', False),
                "primary_keys": metadata.get('primary_keys', [])
            })
        else:
            # New entry from enhanced schema
            merged[file_name] = {
                "description": metadata.get('description', ''),
                "metadata_structure": metadata.get('metadata_structure', ''),
                "special_structure": metadata.get('special_structure', False),
                "primary_keys": metadata.get('primary_keys', [])
            }
    
    return merged


def main():
    """Main entry point."""
    script_dir = Path(__file__).parent
    resources_dir = script_dir.parent / 'resources' / 'schema'
    
    # Load existing metadata
    existing_path = resources_dir / 'txtinout-metadata.json'
    with open(existing_path, 'r', encoding='utf-8') as f:
        existing_metadata = json.load(f)
    
    # Load enhanced schema from markdown
    enhanced_path = resources_dir / 'enhanced-schema-from-markdown.json'
    with open(enhanced_path, 'r', encoding='utf-8') as f:
        enhanced_schema = json.load(f)
    
    # Create merged metadata
    merged_metadata = existing_metadata.copy()
    
    # Update version and source
    merged_metadata['metadata_version'] = '2.1.0'
    merged_metadata['enhanced_from_markdown'] = True
    merged_metadata['markdown_sources'] = [
        'docs/schema/INPUT_FILES_STRUCTURE.md',
        'docs/schema/SWAT_INPUT_FILE_STRUCTURE.md'
    ]
    
    # Merge file pointer columns
    merged_metadata['file_pointer_columns'] = merge_file_pointer_columns(
        existing_metadata, enhanced_schema
    )
    
    # Add foreign key relationships
    merged_metadata['foreign_key_relationships'] = merge_foreign_key_relationships(
        existing_metadata, enhanced_schema
    )
    
    # Add file metadata
    merged_metadata['file_metadata'] = merge_file_metadata(
        existing_metadata, enhanced_schema
    )
    
    # Add enhanced schema reference
    merged_metadata['enhanced_schema_available'] = True
    
    # Save merged metadata
    output_path = resources_dir / 'txtinout-metadata-enhanced.json'
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(merged_metadata, f, indent=2, ensure_ascii=False)
    
    print(f"Merged metadata written to: {output_path}")
    print(f"  - File pointer columns for {len(merged_metadata['file_pointer_columns'])} files")
    print(f"  - FK relationships for {len(merged_metadata['foreign_key_relationships'])} files")
    print(f"  - Metadata for {len(merged_metadata['file_metadata'])} files")
    
    # Also update the original txtinout-metadata.json with a backup
    backup_path = resources_dir / 'txtinout-metadata.json.backup'
    import shutil
    shutil.copy2(existing_path, backup_path)
    print(f"  - Created backup at {backup_path}")
    
    with open(existing_path, 'w', encoding='utf-8') as f:
        json.dump(merged_metadata, f, indent=2, ensure_ascii=False)
    print(f"  - Updated {existing_path}")
    
    return 0


if __name__ == '__main__':
    exit(main())
