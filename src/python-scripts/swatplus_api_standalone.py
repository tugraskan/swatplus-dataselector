!/usr/bin/env python
"""
Standalone SWAT+ Text Files Importer
Comment viewBundled version for use with VS Code extension

This is a simplified, self-contained version of swatplus_api.py
that only handles the import_text_files action.
"""

import sys
import os
import argparse

# Add current directory to path for imports when bundled
script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)

# Import the ImportTextFiles class
try:
    from actions.import_text_files import ImportTextFiles
except ImportError as e:
    print(f"Error: Unable to import required modules. {e}", file=sys.stderr)
    print(f"Script directory: {script_dir}", file=sys.stderr)
    print(f"Python path: {sys.path}", file=sys.stderr)
    sys.exit(1)


class Unbuffered:
    """Helper class to make stdout unbuffered for real-time progress output."""
    def __init__(self, stream):
        self.stream = stream

    def write(self, data):
        self.stream.write(data)
        self.stream.flush()

    def writelines(self, datas):
        self.stream.writelines(datas)
        self.stream.flush()

    def __getattr__(self, attr):
        return getattr(self.stream, attr)


def main():
    """Main entry point for the standalone importer."""
    # Make stdout unbuffered for real-time progress
    sys.stdout = Unbuffered(sys.stdout)
    
    # Parse command line arguments
    parser = argparse.ArgumentParser(
        description="SWAT+ Text Files Importer - Import text files from TxtInOut to SQLite database",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Example:
  python swatplus_api_standalone.py import_text_files \\
    --project_db_file project.sqlite \\
    --txtinout_dir /path/to/TxtInOut
        """
    )
    
    parser.add_argument(
        "action", 
        type=str, 
        choices=["import_text_files"],
        help="Action to perform (only import_text_files is supported in standalone version)"
    )
    
    parser.add_argument(
        "--project_db_file", 
        type=str, 
        required=True,
        help="Full path where the project SQLite database will be created"
    )
    
    parser.add_argument(
        "--txtinout_dir", 
        type=str, 
        required=True,
        help="Full path to the TxtInOut directory containing SWAT+ text files"
    )
    
    parser.add_argument(
        "--editor_version", 
        type=str, 
        default=ImportTextFiles.DEFAULT_EDITOR_VERSION,
        help=f"Editor version (default: {ImportTextFiles.DEFAULT_EDITOR_VERSION})"
    )
    
    parser.add_argument(
        "--swat_version", 
        type=str, 
        default=ImportTextFiles.DEFAULT_SWAT_VERSION,
        help=f"SWAT+ version (default: {ImportTextFiles.DEFAULT_SWAT_VERSION})"
    )
    
    args = parser.parse_args()
    
    # Validate paths
    if not os.path.exists(args.txtinout_dir):
        print(f"Error: TxtInOut directory does not exist: {args.txtinout_dir}", file=sys.stderr)
        sys.exit(1)
    
    if not os.path.isdir(args.txtinout_dir):
        print(f"Error: Path is not a directory: {args.txtinout_dir}", file=sys.stderr)
        sys.exit(1)
    
    # Check if project database already exists
    if os.path.exists(args.project_db_file):
        print(f"Warning: Database file already exists and will be overwritten: {args.project_db_file}")
    
    # Execute the import action
    if args.action == "import_text_files":
        try:
            print(f"Starting SWAT+ text files import...")
            print(f"  TxtInOut directory: {args.txtinout_dir}")
            print(f"  Project database:   {args.project_db_file}")
            print(f"  Editor version:     {args.editor_version}")
            print(f"  SWAT+ version:      {args.swat_version}")
            print()
            
            api = ImportTextFiles(
                args.project_db_file, 
                args.txtinout_dir, 
                args.editor_version, 
                args.swat_version
            )
            api.import_files()
            
            print()
            print("Import completed successfully!")
            sys.exit(0)
            
        except Exception as e:
            print(f"\nError during import: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()
            sys.exit(1)
    else:
        print(f"Error: Unknown action '{args.action}'", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
