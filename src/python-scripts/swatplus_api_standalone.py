!/usr/bin/env python
"""
Standalone SWAT+ Text Files Importer - Simple Version

WHAT THIS DOES:
Converts SWAT+ text files into a database file.

WHY IT EXISTS:
This script is designed to work on its own without needing lots of other files.
Perfect for VS Code extensions and simple tools.

WHAT'S SPECIAL:
- All-in-one: Everything needed is in this one script
- Shows progress: You can see what it's doing in real-time
- Checks errors: Tells you clearly if something is wrong
"""

# These are the basic Python tools we need
import sys
import os
import argparse

# Find other code files that this script needs
# (They should be in the same folder as this script)
script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)

# Import the code that does the actual importing
try:
    from actions.import_text_files import ImportTextFiles
except ImportError as e:
    print(f"Error: Unable to import required modules. {e}", file=sys.stderr)
    print(f"Script directory: {script_dir}", file=sys.stderr)
    print(f"Python path: {sys.path}", file=sys.stderr)
    sys.exit(1)


class Unbuffered:
    """
    Makes output appear immediately instead of waiting.
    
    SIMPLE EXPLANATION:
    Normally Python waits to show you messages. This makes them appear instantly.
    This is important so VS Code extensions can show you progress in real-time.
    """
    def __init__(self, stream):
        self.stream = stream

    def write(self, data):
        self.stream.write(data)
        self.stream.flush()  # This is the magic - show it NOW

    def writelines(self, datas):
        self.stream.writelines(datas)
        self.stream.flush()

    def __getattr__(self, attr):
        return getattr(self.stream, attr)


def main():
    """
    Main entry point - this is what runs when you execute the script.
    
    WHAT IT DOES:
    1. Sets up real-time output
    2. Reads the command line arguments you provided
    3. Checks that everything looks good
    4. Runs the import process
    """
    # Make output appear immediately (not buffered)
    sys.stdout = Unbuffered(sys.stdout)
    
    # Set up command line argument parser
    # This reads the options you type after "python swatplus_api_standalone.py"
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
    
    # Define what command line options are allowed
    parser.add_argument(
        "action", 
        type=str, 
        choices=["import_text_files"],
        help="What to do (this version only does import_text_files)"
    )
    
    parser.add_argument(
        "--project_db_file", 
        type=str, 
        required=True,
        help="Where to save the database file (REQUIRED)"
    )
    
    parser.add_argument(
        "--txtinout_dir", 
        type=str, 
        required=True,
        help="Where your SWAT+ text files are located (REQUIRED)"
    )
    
    parser.add_argument(
        "--editor_version", 
        type=str, 
        default=ImportTextFiles.DEFAULT_EDITOR_VERSION,
        help=f"SWAT+ Editor version (optional, default: {ImportTextFiles.DEFAULT_EDITOR_VERSION})"
    )
    
    parser.add_argument(
        "--swat_version", 
        type=str, 
        default=ImportTextFiles.DEFAULT_SWAT_VERSION,
        help=f"SWAT+ version (optional, default: {ImportTextFiles.DEFAULT_SWAT_VERSION})"
    )
    
    # Read the arguments
    args = parser.parse_args()
    
    # Check that the paths make sense before we start
    if not os.path.exists(args.txtinout_dir):
        print(f"Error: TxtInOut directory does not exist: {args.txtinout_dir}", file=sys.stderr)
        sys.exit(1)
    
    if not os.path.isdir(args.txtinout_dir):
        print(f"Error: Path is not a directory: {args.txtinout_dir}", file=sys.stderr)
        sys.exit(1)
    
    # Warn if we're about to overwrite an existing database
    if os.path.exists(args.project_db_file):
        print(f"Warning: Database file already exists and will be overwritten: {args.project_db_file}")
    
    # Do the actual import
    if args.action == "import_text_files":
        try:
            # Show user what we're about to do
            print(f"Starting SWAT+ text files import...")
            print(f"  TxtInOut directory: {args.txtinout_dir}")
            print(f"  Project database:   {args.project_db_file}")
            print(f"  Editor version:     {args.editor_version}")
            print(f"  SWAT+ version:      {args.swat_version}")
            print()
            
            # Create the importer and run it
            api = ImportTextFiles(
                args.project_db_file, 
                args.txtinout_dir, 
                args.editor_version, 
                args.swat_version
            )
            api.import_files()
            
            # Success!
            print()
            print("Import completed successfully!")
            sys.exit(0)
            
        except Exception as e:
            # Something went wrong - show the error
            print(f"\nError during import: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()  # Show full error details
            sys.exit(1)
    else:
        # This shouldn't happen but just in case
        print(f"Error: Unknown action '{args.action}'", file=sys.stderr)
        sys.exit(1)


# This runs when you execute the script directly
if __name__ == '__main__':
    main()
