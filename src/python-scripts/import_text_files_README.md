# Import Text Files to SQLite Database

## Overview

The `import_text_files` action allows you to import existing SWAT+ text files from a TxtInOut directory into a project SQLite database. This is useful when you have:
- An existing SWAT+ project with text files but no SQLite database
- Text files from another source that you want to import into the SWAT+ Editor
- A need to recreate the database from a backup of text files

## Two Versions Available

### 1. Standard Version (`swatplus_api.py`)
Full-featured API with all SWAT+ actions. Use when working with the complete swatplus-editor repository.

### 2. Standalone Version (`swatplus_api_standalone.py`) ⭐ **Recommended for Extensions**
Self-contained, bundled version designed specifically for integration with VS Code extensions and other tools.

---

## Usage

### Standard API

```bash
python swatplus_api.py import_text_files \
  --project_db_file /path/to/project.sqlite \
  --txtinout_dir /path/to/TxtInOut \
  --editor_version 3.0.0 \
  --swat_version 60.5.4
```

### Standalone API (for bundling in extensions)

```bash
python swatplus_api_standalone.py import_text_files \
  --project_db_file /path/to/project.sqlite \
  --txtinout_dir /path/to/TxtInOut \
  --editor_version 3.0.0 \
  --swat_version 60.5.4
```

### Parameters

- `project_db_file` (required): Full path to the project SQLite database file
- `txtinout_dir` (required): Full path to the TxtInOut directory containing SWAT+ text files
- `editor_version` (optional): Editor version string (default: "3.0.0")
- `swat_version` (optional): SWAT+ version string (default: "60.5.4")

---

## Standalone Version for VS Code Extensions

### What is `swatplus_api_standalone.py`?

A **self-contained, bundled version** of the import functionality specifically designed for integration with VS Code extensions and other tools. It provides the same import capabilities as the standard API but with enhanced features for extension integration.

### Key Features

1. **Self-Contained**
   - Works independently without the full swatplus-editor repository
   - All necessary code in one script
   - Only requires Python + dependencies (peewee, flask)

2. **Extension-Friendly**
   - Real-time unbuffered output for progress tracking in UI
   - Enhanced error messages with validation
   - Clear argument requirements and helpful `--help` output
   - Structured output perfect for extension progress notifications

3. **Simplified Interface**
   - Focused solely on `import_text_files` action
   - No unnecessary dependencies or imports
   - Cleaner argument parsing

### How It Works

The standalone version works by:

1. **Self-Contained Imports**: Uses `sys.path.insert()` to find modules relative to its location
2. **Unbuffered Output**: Flushes stdout immediately so extensions can show real-time progress
3. **Enhanced Validation**: Checks paths and provides clear error messages before attempting import
4. **Graceful Error Handling**: Catches exceptions and provides useful debugging information

### Integration with VS Code Extensions

#### Extension Structure
```
your-vscode-extension/
├── src/
│   ├── extension.ts          # Main extension code
│   └── importHelper.ts       # Helper to call Python script
├── python-scripts/           # Bundled Python code
│   ├── swatplus_api_standalone.py  ← The standalone script
│   ├── actions/
│   │   ├── __init__.py
│   │   └── import_text_files.py
│   ├── database/
│   │   └── project/ (entire folder)
│   ├── fileio/
│   │   └── *.py (all fileio modules)
│   └── helpers/
│       └── *.py (all helper modules)
└── package.json
```

#### How Extension Calls the Script

**TypeScript/JavaScript Code:**
```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';

export class ImportHelper {
    private pythonPath: string;
    private apiPath: string;

    constructor(context: vscode.ExtensionContext) {
        const config = vscode.workspace.getConfiguration('your-extension');
        this.pythonPath = config.get('pythonPath', 'python');
        
        // Use bundled standalone script
        this.apiPath = path.join(
            context.extensionPath, 
            'python-scripts', 
            'swatplus_api_standalone.py'
        );
    }

    async importTextFiles(txtinoutDir: string, dbPath: string): Promise<void> {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Importing SWAT+ text files",
            cancellable: false
        }, async (progress) => {
            const args = [
                this.apiPath,
                'import_text_files',
                '--project_db_file', dbPath,
                '--txtinout_dir', txtinoutDir
            ];

            return new Promise((resolve, reject) => {
                const proc = spawn(this.pythonPath, args);
                
                // Real-time progress updates
                proc.stdout.on('data', (data) => {
                    const msg = data.toString().trim();
                    console.log(msg);
                    progress.report({ message: msg });
                });

                proc.stderr.on('data', (data) => {
                    console.error(data.toString());
                });

                proc.on('close', (code) => {
                    if (code === 0) {
                        vscode.window.showInformationMessage(
                            `Database created successfully: ${dbPath}`
                        );
                        resolve();
                    } else {
                        reject(new Error(`Import failed with code ${code}`));
                    }
                });
            });
        });
    }
}
```

#### What Happens When User Triggers Import

1. **User Action**: Clicks "Import to Database" button in extension
2. **Extension**: Shows save dialog for database location
3. **Extension**: Builds command with paths to Python and standalone script
4. **Extension**: Spawns Python process with `import_text_files` action
5. **Python Script**: 
   - Validates TxtInOut directory exists
   - Validates paths and arguments
   - Prints progress messages (unbuffered for real-time display)
   - Imports files in dependency order
   - Returns exit code 0 on success
6. **Extension**: Shows progress in VS Code notification
7. **Extension**: Displays success/error message when complete

### Instructions for Extension Developers

To integrate the standalone version into your VS Code extension:

#### Step 1: Bundle the Python Scripts

Copy these files from `swatplus-editor/src/api/` to your extension's `python-scripts/` folder:
- `swatplus_api_standalone.py` (the main script)
- `actions/` folder (with `import_text_files.py`)
- `database/project/` folder (all database models)
- `fileio/` folder (all fileio modules)
- `helpers/` folder (all helper modules)

#### Step 2: Update Extension Configuration

Add Python path setting to `package.json`:
```json
"configuration": {
  "properties": {
    "your-extension.pythonPath": {
      "type": "string",
      "default": "python",
      "description": "Path to Python executable"
    }
  }
}
```

#### Step 3: Create Import Helper

Use the TypeScript code example above to create an import helper class.

#### Step 4: Register Extension Command

```typescript
const importHelper = new ImportHelper(context);

const importCommand = vscode.commands.registerCommand(
    'your-extension.importTextFiles', 
    async () => {
        // Get TxtInOut directory from user
        const txtinoutUri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            openLabel: 'Select TxtInOut Folder'
        });
        
        if (!txtinoutUri) return;
        
        // Get save location for database
        const dbUri = await vscode.window.showSaveDialog({
            filters: { 'SQLite Database': ['sqlite', 'db'] },
            saveLabel: 'Create Database'
        });
        
        if (!dbUri) return;
        
        // Perform import
        await importHelper.importTextFiles(
            txtinoutUri[0].fsPath, 
            dbUri.fsPath
        );
    }
);

context.subscriptions.push(importCommand);
```

#### Step 5: Ensure Python Dependencies

Users need Python installed with these dependencies:
- `peewee` (database ORM)
- `flask` (only if using other SWAT+ features)

Your extension can check for dependencies or provide installation instructions.

### Benefits for Extension Users

1. **No Separate Repository**: Don't need to clone swatplus-editor
2. **Simple Setup**: Just configure Python path in extension settings
3. **Self-Contained**: All scripts bundled with the extension
4. **Real-Time Feedback**: See import progress in VS Code notifications
5. **Integrated Workflow**: Import directly from dataset selection in extension

### Troubleshooting

**Script not found:**
- Ensure `python-scripts` folder is included in extension package
- Check `.vscodeignore` doesn't exclude Python files

**Import errors:**
- Verify user has Python installed
- Check Python dependencies (peewee) are installed
- Validate TxtInOut directory path

**No progress output:**
- Standalone version uses unbuffered output by default
- Check stdout handling in extension code

---

## Prerequisites

1. **Create an empty project database** if one doesn't exist:
   ```bash
   python swatplus_api.py create_database \
     --db_type project \
     --db_file /path/to/project.sqlite \
     --db_file2 /path/to/datasets.sqlite \
     --project_name "MyProject" \
     --editor_version 3.0.0
   ```

2. **Ensure TxtInOut directory exists** and contains valid SWAT+ text files

## File Import Order

The import process reads files in a specific order to satisfy database foreign key dependencies:

1. Simulation configuration (time.sim, print.prt, object.prt)
2. Climate/weather files (weather-sta.cli, weather-wgn.cli)
3. Parameter database files (plants.plt, fertilizer.frt, tillage.til, etc.)
4. Soil files (soils_lte.sol, nutrients.sol)
5. Decision tables (lum.dtl, res_rel.dtl, etc.)
6. Connection files (hru.con, channel.con, etc.)
7. Channel files (channel.cha, hydrology.cha, etc.)
8. Reservoir files (reservoir.res, hydrology.res, etc.)
9. Routing unit files (rout_unit.rtu, rout_unit.ele)
10. Aquifer files (aquifer.aqu, initial.aqu)
11. HRU files (hru-data.hru, hru-lte.hru)
12. Hydrology files (hydrology.hyd, topography.hyd, field.fld)
13. Initialization files (plant.ini, soil_plant.ini, etc.)
14. Land use management files (landuse.lum, management.sch, etc.)
15. Operations files (harv.ops, graze.ops, etc.)
16. Recall files (recall.rec)
17. Basin files (codes.bsn, parameters.bsn)
18. Change/calibration files (calibration.cal, cal_parms.cal)
19. Regions files (ls_unit.def, ls_unit.ele)

## Current Limitations

Many SWAT+ text file types currently have `read()` methods that are not yet implemented. The import process:
- Gracefully handles files without read implementations (catches NotImplementedError)
- Imports files that have working read implementations (e.g., soils_lte.sol)
- Can be extended by implementing read() methods in the respective fileio classes

## Implementation Status

### Files with Working Read Implementations
- `soils_lte.sol` - LTE soil data

### Files Needing Read Implementation
Most other file types currently raise NotImplementedError when read() is called. These can be implemented as needed by:
1. Opening the respective file in `/src/api/fileio/`
2. Implementing the `read()` method using `read_default_table()` or custom parsing logic
3. Following the pattern used in working implementations

## Example Workflow

```bash
# 1. Create a new project database
python swatplus_api.py create_database \
  --db_type project \
  --db_file /home/user/projects/myproject.sqlite \
  --db_file2 /home/user/swatplus_datasets.sqlite \
  --project_name "MyProject" \
  --editor_version 3.0.0

# 2. Import text files from TxtInOut directory
python swatplus_api.py import_text_files \
  --project_db_file /home/user/projects/myproject.sqlite \
  --txtinout_dir /home/user/projects/TxtInOut \
  --editor_version 3.0.0 \
  --swat_version 60.5.4

# 3. Use the populated database in SWAT+ Editor or export data
python swatplus_api.py export_csv table_name myproject.sqlite ...
```

## Error Handling

The import process will:
- Check if the TxtInOut directory exists before starting
- Check if each individual file exists before attempting to read it
- Gracefully skip files that don't have read implementations
- Display progress messages during import
- Report any errors that occur during the import process

## Future Enhancements

To fully support all SWAT+ file types, additional read() implementations are needed. The framework is in place and individual file types can be added incrementally based on user needs.

## Related Actions

- `create_database`: Create a new project database
- `write_files`: Write SQLite database data to text files (opposite operation)
- `import_csv`: Import CSV data into specific tables
- `export_csv`: Export table data to CSV

## Support

For issues or questions:
1. Check that your TxtInOut directory contains valid SWAT+ text files
2. Verify the project database was created successfully
3. Check the console output for specific error messages
4. Refer to SWAT+ documentation for file format specifications
