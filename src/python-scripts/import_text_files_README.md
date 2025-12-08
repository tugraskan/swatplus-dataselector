# Import Text Files to SQLite Database

## What Does This Do? (Simple Explanation)

These Python scripts take SWAT+ text files and convert them into a database file. Think of it like this:
- **Input**: A folder full of `.txt` files (called "TxtInOut")
- **Output**: A single database file (`.sqlite`) that stores all that information
- **Why?**: It's easier to work with one organized database than dozens of text files

## When Would You Use This?

You have a bunch of SWAT+ text files and want to:
- Load them into the SWAT+ Editor
- Make a database from old text file backups
- Convert text files from another project into database format

## Two Versions of the Script

### 1. Standard Version (`swatplus_api.py`)
- **Who needs it**: People working with the full SWAT+ Editor codebase
- **What it does**: Has lots of features and needs the whole editor repository

### 2. Standalone Version (`swatplus_api_standalone.py`) ⭐ **Use This One**
- **Who needs it**: Anyone using VS Code extensions or simple tools
- **What it does**: Works by itself - just one script file you can run
- **Why it's better**: No complicated setup, works independently

---

## How to Use It (Simple Steps)

### Running the Standalone Script

```bash
python swatplus_api_standalone.py import_text_files \
  --project_db_file /path/where/you/want/database.sqlite \
  --txtinout_dir /path/to/your/TxtInOut/folder
```

**Translation**: 
- Replace `/path/where/you/want/database.sqlite` with where you want to save your new database
- Replace `/path/to/your/TxtInOut/folder` with the folder containing your SWAT+ text files

### What the Options Mean

- `--project_db_file`: Where to save the database file (REQUIRED)
- `--txtinout_dir`: Where your text files are located (REQUIRED)
- `--editor_version`: Which editor version you're using (optional, default is 3.0.0)
- `--swat_version`: Which SWAT+ version you're using (optional, default is 60.5.4)

### Real Example

```bash
python swatplus_api_standalone.py import_text_files \
  --project_db_file C:/MyProjects/myproject.sqlite \
  --txtinout_dir C:/MyProjects/TxtInOut
```

This creates a database file at `C:/MyProjects/myproject.sqlite` using all the text files from `C:/MyProjects/TxtInOut`

---

## How Does the Standalone Script Work? (Behind the Scenes)

### The Simple Story

1. **You run the script** with two pieces of info: where your text files are, and where to save the database
2. **The script checks** if your TxtInOut folder actually exists
3. **It creates a database file** at the location you specified
4. **It reads each text file** one by one (in a specific order)
5. **It saves the data** from each file into the database
6. **Done!** You get a database file you can use

### Why Does File Order Matter?

The script reads files in a specific order because some files depend on others. Think of it like building a house:
- First: Foundation (simulation settings)
- Then: Structure (basic data like soil types, plant types)
- Finally: Details (specific values for each location)

### What Makes the Standalone Version Special?

1. **Self-Contained**: Everything is in one script - you don't need 100 other files
2. **Real-time Updates**: Shows you progress as it works (not silent)
3. **Error Checking**: Checks if folders exist before trying to use them
4. **Extension-Friendly**: Works great with VS Code extensions

### Technical Details (How It Actually Works)

The standalone script:
- Uses `sys.path.insert()` to find needed code files next to it
- Prints progress immediately (unbuffered output) so you can see what's happening
- Checks that paths exist and gives clear error messages
- Catches problems and tells you what went wrong

---

## For Developers: Using This in VS Code Extensions

### Quick Overview

If you're building a VS Code extension, you can bundle this script and call it from your extension code. Here's the basic idea:

**What your extension will do:**
1. User clicks a button in VS Code
2. Your extension asks: "Where are your text files?"
3. Your extension asks: "Where should I save the database?"
4. Your extension runs this Python script with those paths
5. Script creates the database
6. Extension shows a success message

### Folder Structure You Need

```
your-vscode-extension/
├── src/
│   ├── extension.ts          # Your main extension code
│   └── importHelper.ts       # Helper that calls Python
├── python-scripts/           # Copy these files here
│   ├── swatplus_api_standalone.py  ← The main script
│   └── actions/
│       └── import_text_files.py    ← Helper file
└── package.json
```

### Simple TypeScript Example

```typescript
// This is simplified - shows the key parts
import { spawn } from 'child_process';

// Where is the Python script?
const scriptPath = path.join(extensionPath, 'python-scripts', 'swatplus_api_standalone.py');

// Run the script
const process = spawn('python', [
    scriptPath,
    'import_text_files',
    '--project_db_file', databasePath,
    '--txtinout_dir', textFilesFolder
]);

// Show progress to user
process.stdout.on('data', (data) => {
    console.log(data.toString()); // Shows "Importing soil files..." etc.
});

// Check if it worked
process.on('close', (code) => {
    if (code === 0) {
        console.log('Success!');
    } else {
        console.log('Failed!');
    }
});
```

---

## What Files Get Imported?

The script looks for specific text files in your TxtInOut folder. Here's what it imports (in order):

**Phase 1: Basic Setup**
- `time.sim`, `print.prt`, `object.prt` - Simulation settings
- `weather-sta.cli`, `weather-wgn.cli` - Weather/climate data

**Phase 2: Reference Data** 
- `plants.plt` - Plant types
- `fertilizer.frt` - Fertilizer types
- `tillage.til` - Tillage operations
- `pesticide.pst` - Pesticides
- `soils_lte.sol` - Soil data
- And more...

**Phase 3: Specific Location Data**
- `hru-data.hru` - Hydrologic Response Units
- `channel.cha` - Channel information
- `reservoir.res` - Reservoir data
- And more...

**Note**: Not all files have import functionality yet. The script will skip files it doesn't know how to read (no errors, just skips them).

---

## Requirements

**What you need installed:**
- Python (version 3.x)
- Python package: `peewee` (install with: `pip install peewee`)

**What files you need:**
- A folder with SWAT+ text files (TxtInOut)
- The `swatplus_api_standalone.py` script
- The `actions/import_text_files.py` helper file

---

## Common Problems and Solutions

**"Error: TxtInOut directory does not exist"**
- Check that the path is correct
- Use full path like `C:/Projects/TxtInOut` not just `TxtInOut`

**"Import failed"**
- Make sure Python is installed (`python --version`)
- Make sure peewee is installed (`pip install peewee`)
- Check that your TxtInOut folder has actual text files in it

**"No module named..."**
- The `actions/` folder needs to be in the same directory as the standalone script

---

## Quick Reference

**Minimum command:**
```bash
python swatplus_api_standalone.py import_text_files \
  --project_db_file mydata.sqlite \
  --txtinout_dir ./TxtInOut
```

**With all options:**
```bash
python swatplus_api_standalone.py import_text_files \
  --project_db_file mydata.sqlite \
  --txtinout_dir ./TxtInOut \
  --editor_version 3.0.0 \
  --swat_version 60.5.4
```

**Get help:**
```bash
python swatplus_api_standalone.py --help
```
