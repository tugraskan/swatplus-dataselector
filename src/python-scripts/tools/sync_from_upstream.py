#!/usr/bin/env python3
"""
Sync Files from Upstream swatplus-editor

This script synchronizes fileio, database, and helpers modules from the
upstream swatplus-editor submodule, while preserving local modifications.

Local modifications are documented in COPIED_FILES.md and include:
- fileio/routing_unit.py: Added backwards-compatible alias
- fileio/hru_parm_db.py: Tolerance for malformed lines  
- fileio/base.py: Modified read logic for better error handling
- database/lib.py: Added on_conflict('REPLACE') for UNIQUE constraints
- helpers/utils.py: Bug fix in get_num_format

Usage:
    python tools/sync_from_upstream.py [--dry-run] [--force]

Options:
    --dry-run    Show what would be copied without making changes
    --force      Overwrite local modifications (use with caution!)
"""

import os
import sys
import shutil
import argparse
from pathlib import Path

# Directories to sync
SYNC_DIRS = ['fileio', 'database', 'helpers']

# Files with local modifications that should NOT be overwritten by default
LOCAL_MODIFICATIONS = {
    'fileio/routing_unit.py': 'Backwards-compatible alias for import_text_files',
    'fileio/hru_parm_db.py': 'Tolerance for malformed septic.sep lines',
    'fileio/base.py': 'Modified read_default_table for better field handling',
    'database/lib.py': 'Added on_conflict REPLACE for bulk inserts',
    'helpers/utils.py': 'Bug fix in get_num_format function'
}

def get_script_dir():
    """Get the python-scripts directory."""
    return Path(__file__).parent.parent

def get_vendor_path():
    """Get the path to the vendor submodule."""
    return get_script_dir() / 'vendor' / 'swatplus-editor' / 'src' / 'api'

def sync_directory(src_dir, dest_dir, dry_run=False, force=False, stats=None):
    """
    Recursively sync files from src_dir to dest_dir.
    
    Args:
        src_dir: Source directory path
        dest_dir: Destination directory path
        dry_run: If True, only show what would be done
        force: If True, overwrite even locally modified files
        stats: Dictionary to track statistics
    """
    if stats is None:
        stats = {'copied': 0, 'skipped': 0, 'modified_protected': 0}
    
    src_path = Path(src_dir)
    dest_path = Path(dest_dir)
    
    if not src_path.exists():
        print(f"Warning: Source directory does not exist: {src_dir}")
        return stats
    
    # Create destination directory if it doesn't exist
    if not dry_run:
        dest_path.mkdir(parents=True, exist_ok=True)
    
    # Iterate through source files
    for src_file in src_path.rglob('*.py'):
        # Get relative path
        rel_path = src_file.relative_to(src_path.parent)
        dest_file = dest_path.parent / rel_path
        rel_str = str(rel_path)
        
        # Check if this file has local modifications
        is_modified = rel_str in LOCAL_MODIFICATIONS
        
        # Determine if we should copy
        should_copy = True
        reason = ""
        
        if is_modified and not force:
            should_copy = False
            reason = f"(LOCAL MOD: {LOCAL_MODIFICATIONS[rel_str]})"
            stats['modified_protected'] += 1
        
        # Copy or skip
        if should_copy:
            if dry_run:
                print(f"  WOULD COPY: {rel_str}")
            else:
                dest_file.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src_file, dest_file)
                print(f"  COPIED: {rel_str}")
            stats['copied'] += 1
        else:
            print(f"  SKIPPED: {rel_str} {reason}")
            stats['skipped'] += 1
    
    return stats

def main():
    parser = argparse.ArgumentParser(
        description='Sync files from upstream swatplus-editor submodule',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument('--dry-run', action='store_true',
                        help='Show what would be copied without making changes')
    parser.add_argument('--force', action='store_true',
                        help='Overwrite files with local modifications')
    args = parser.parse_args()
    
    script_dir = get_script_dir()
    vendor_path = get_vendor_path()
    
    print("SWAT+ Upstream Sync Tool")
    print("=" * 60)
    print(f"Script directory: {script_dir}")
    print(f"Vendor path: {vendor_path}")
    print()
    
    # Check if vendor submodule exists
    if not vendor_path.exists():
        print("ERROR: Vendor submodule not found!")
        print(f"Expected at: {vendor_path}")
        print()
        print("To initialize the submodule, run:")
        print("  git submodule update --init --recursive")
        sys.exit(1)
    
    if args.dry_run:
        print("DRY RUN MODE - No files will be modified")
        print()
    
    if args.force:
        print("WARNING: Force mode enabled - local modifications will be overwritten!")
        print()
    
    # Sync each directory
    total_stats = {'copied': 0, 'skipped': 0, 'modified_protected': 0}
    
    for dir_name in SYNC_DIRS:
        print(f"Syncing {dir_name}/...")
        src = vendor_path / dir_name
        dest = script_dir / dir_name
        stats = sync_directory(src, dest, args.dry_run, args.force)
        
        for key in total_stats:
            total_stats[key] += stats[key]
        
        print()
    
    # Print summary
    print("=" * 60)
    print("Summary:")
    print(f"  Files copied: {total_stats['copied']}")
    print(f"  Files skipped: {total_stats['skipped']}")
    print(f"  Files with local mods protected: {total_stats['modified_protected']}")
    
    if total_stats['modified_protected'] > 0 and not args.force:
        print()
        print("Files with local modifications were not overwritten.")
        print("Use --force to overwrite them (not recommended unless you know what you're doing).")
        print()
        print("Locally modified files:")
        for file_path, reason in LOCAL_MODIFICATIONS.items():
            print(f"  - {file_path}: {reason}")

if __name__ == '__main__':
    main()
