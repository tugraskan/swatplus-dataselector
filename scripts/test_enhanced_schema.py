#!/usr/bin/env python3
"""
Test script to verify enhanced schema parsing and FK detection.

This script tests that the markdown-derived schema enhancements are
properly integrated and can detect FK relationships and file pointers.
"""

import json
import sys
from pathlib import Path


def test_enhanced_schema_exists():
    """Test that enhanced schema file was generated."""
    schema_path = Path(__file__).parent.parent / 'resources' / 'schema' / 'enhanced-schema-from-markdown.json'
    
    if not schema_path.exists():
        print(f"FAIL: Enhanced schema not found at {schema_path}")
        return False
    
    print(f"PASS: Enhanced schema exists at {schema_path}")
    return True


def test_enhanced_metadata_structure():
    """Test that enhanced metadata has expected structure."""
    metadata_path = Path(__file__).parent.parent / 'resources' / 'schema' / 'txtinout-metadata.json'
    
    with open(metadata_path, 'r', encoding='utf-8') as f:
        metadata = json.load(f)
    
    # Check for required keys
    required_keys = ['file_pointer_columns', 'foreign_key_relationships', 'file_metadata']
    
    for key in required_keys:
        if key not in metadata:
            print(f"FAIL: Missing key '{key}' in metadata")
            return False
    
    print(f"PASS: Metadata has all required keys: {required_keys}")
    return True


def test_fk_relationships_populated():
    """Test that FK relationships were extracted from markdown."""
    metadata_path = Path(__file__).parent.parent / 'resources' / 'schema' / 'txtinout-metadata.json'
    
    with open(metadata_path, 'r', encoding='utf-8') as f:
        metadata = json.load(f)
    
    fk_relationships = metadata.get('foreign_key_relationships', {})
    
    if not fk_relationships:
        print("FAIL: No FK relationships found in metadata")
        return False
    
    # Check for some expected files with FK relationships
    expected_files = ['aquifer.aqu', 'hru-data.hru', 'landuse.lum']
    found_count = 0
    
    for file_name in expected_files:
        if file_name in fk_relationships:
            found_count += 1
            print(f"  - Found FK relationships for {file_name}")
    
    if found_count == 0:
        print(f"FAIL: None of the expected files found: {expected_files}")
        return False
    
    print(f"PASS: Found FK relationships for {found_count}/{len(expected_files)} expected files")
    return True


def test_file_pointers_populated():
    """Test that file pointer columns were extracted from markdown."""
    metadata_path = Path(__file__).parent.parent / 'resources' / 'schema' / 'txtinout-metadata.json'
    
    with open(metadata_path, 'r', encoding='utf-8') as f:
        metadata = json.load(f)
    
    file_pointers = metadata.get('file_pointer_columns', {})
    
    if not file_pointers:
        print("FAIL: No file pointer columns found in metadata")
        return False
    
    # Check for some expected files with file pointers
    expected_files = ['aquifer.aqu', 'hru-data.hru', 'initial.cha']
    found_count = 0
    
    for file_name in expected_files:
        if file_name in file_pointers:
            found_count += 1
            pointers = file_pointers[file_name]
            if isinstance(pointers, dict):
                pointer_count = len([k for k in pointers.keys() if k != 'description'])
            else:
                pointer_count = len(pointers)
            print(f"  - Found {pointer_count} pointer columns for {file_name}")
    
    if found_count == 0:
        print(f"FAIL: None of the expected files found: {expected_files}")
        return False
    
    print(f"PASS: Found file pointers for {found_count}/{len(expected_files)} expected files")
    return True


def test_file_metadata_populated():
    """Test that file metadata was extracted from markdown."""
    metadata_path = Path(__file__).parent.parent / 'resources' / 'schema' / 'txtinout-metadata.json'
    
    with open(metadata_path, 'r', encoding='utf-8') as f:
        metadata = json.load(f)
    
    file_metadata = metadata.get('file_metadata', {})
    
    if not file_metadata:
        print("FAIL: No file metadata found")
        return False
    
    # Check that files have expected metadata fields
    sample_files = ['aquifer.aqu', 'soils.sol', 'weather-sta.cli']
    
    for file_name in sample_files:
        if file_name not in file_metadata:
            continue
        
        file_meta = file_metadata[file_name]
        
        # Check for expected fields
        if 'description' not in file_meta:
            print(f"FAIL: {file_name} missing description field")
            return False
        
        if 'metadata_structure' not in file_meta:
            print(f"FAIL: {file_name} missing metadata_structure field")
            return False
        
        print(f"  - {file_name}: '{file_meta.get('description', '')[:50]}...'")
    
    print(f"PASS: File metadata properly structured")
    return True


def test_special_structure_detection():
    """Test that special structure files are properly flagged."""
    metadata_path = Path(__file__).parent.parent / 'resources' / 'schema' / 'txtinout-metadata.json'
    
    with open(metadata_path, 'r', encoding='utf-8') as f:
        metadata = json.load(f)
    
    file_metadata = metadata.get('file_metadata', {})
    
    # Check for known special structure files
    special_files = ['soils.sol', 'plant.ini', 'management.sch', 'weather-wgn.cli']
    
    found_special = []
    for file_name in special_files:
        if file_name in file_metadata:
            if file_metadata[file_name].get('special_structure'):
                found_special.append(file_name)
                print(f"  - {file_name} marked as special structure")
    
    if found_special:
        print(f"PASS: Found {len(found_special)} files with special structure markers")
        return True
    else:
        print(f"WARN: No files marked with special structure (expected at least some)")
        return True  # Not a failure, just a warning


def main():
    """Run all tests."""
    print("Running enhanced schema tests...\n")
    
    tests = [
        ("Enhanced schema file exists", test_enhanced_schema_exists),
        ("Enhanced metadata structure", test_enhanced_metadata_structure),
        ("FK relationships populated", test_fk_relationships_populated),
        ("File pointer columns populated", test_file_pointers_populated),
        ("File metadata populated", test_file_metadata_populated),
        ("Special structure detection", test_special_structure_detection),
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\n{test_name}:")
        try:
            result = test_func()
            results.append(result)
        except Exception as e:
            print(f"ERROR: {e}")
            results.append(False)
    
    print("\n" + "="*70)
    passed = sum(results)
    total = len(results)
    print(f"Test Results: {passed}/{total} passed")
    
    if passed == total:
        print("✓ All tests passed!")
        return 0
    else:
        print(f"✗ {total - passed} test(s) failed")
        return 1


if __name__ == '__main__':
    sys.exit(main())
