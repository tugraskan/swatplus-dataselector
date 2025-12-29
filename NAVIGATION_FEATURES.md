# SWAT+ Database Navigation Features - Technical Documentation

## Overview

This PR adds IDE-like navigation features to SWAT+ text files, treating them as a relational database where foreign key relationships can be discovered and navigated.

## Files Added/Modified

### 1. `src/swatPlusSchema.ts` (NEW)
**Purpose:** Contains the official SWAT+ database schema with 50+ predefined foreign key relationships.

**How it works:**
- Defines a `SchemaRelation` interface with source file, column index, target file, and display name
- Contains `SWAT_SCHEMA` array with relationships like:
  - HRU → Hydrology (column 1 references hydrology.hru)
  - HRU → Topography (column 2 references topography.hru)
  - Land Use → Management (column 2 references management.lum)
- `getFileVariations()` helper generates possible file names (e.g., "hydrology" → ["hydrology.hru", "hyd.hyd", "hydrology.hyd"])

### 2. `src/swatPlusLanguageFeatures.ts` (NEW)
**Purpose:** Main file implementing all navigation features.

**Key Components:**

#### A. `FileRelation` Interface
```typescript
interface FileRelation {
    sourceFile: string;      // e.g., "hru-data"
    columnIndex: number;     // which column has the foreign key
    targetFile: string;      // e.g., "hydrology.hru"
    displayName: string;     // e.g., "Hydrology"
}
```

#### B. `getRelationships()` Function
**What it does:** Discovers all foreign key relationships for a dataset

**How it works:**
1. **Checks cache first** - Relationships are cached per directory for performance
2. **Scans for SWAT+ files** - Finds all .hru, .hyd, .sol, .cli files in directory
3. **PRIMARY: Uses SWAT_SCHEMA** - Checks if each file matches a known schema pattern
4. **FALLBACK: Auto-discovery** - For files not in schema:
   - Reads first 2 lines (header + data)
   - Parses column names from header
   - If column name matches another file's base name → creates relationship
5. **Returns Map<string, FileRelation[]>** - Maps each file to its relationships

**Current Issue:** This function logs "getRelationships START" but then hangs. Likely hanging at:
- Cache check operation (Map.get())
- File system scanning (fs.readdirSync())
- File reading operations (fs.readFileSync())

#### C. `parseSwatFile()` Function
**What it does:** Parses a SWAT+ text file into structured data

**How it works:**
1. Reads entire file
2. Splits into lines
3. Skips first line (header)
4. For each data line: splits by whitespace → creates Record object
5. Returns array of records with name and line number

#### D. `SwatDefinitionProvider` Class
**What it does:** Implements F12 "Go to Definition" feature

**How it works:**
1. User presses F12 on a value (e.g., "hydro_001")
2. Gets current file and line
3. Calls `getRelationships()` to find foreign keys for this file
4. Determines which column the cursor is on
5. Checks if that column is a foreign key
6. If yes: searches target file for matching record name
7. Returns location in target file

#### E. `SwatHoverProvider` Class
**What it does:** Shows tooltips when hovering over foreign key values

**How it works:**
1. User hovers over a value
2. Similar to DefinitionProvider, finds the relationship
3. Reads up to 8 fields from the referenced record
4. Formats numbers for readability (e.g., 1000 → 1,000)
5. Shows organized tooltip with field names and values
6. Adds hints like "Press F12 to go to definition"

#### F. `SwatCodeLensProvider` Class
**What it does:** Shows inline hints above data rows

**How it works:**
1. Scans each line in the file
2. Checks if line is a data row (not header/comment)
3. For each data row, checks all columns for foreign keys
4. Creates hint like: `🔗 Referenced: Hydrology: hydro_001 | Topography: topo_002`
5. Shows as gray text above the row

### 3. `src/extension.ts` (MODIFIED)
**Changes:**
- Imports the three providers
- Registers them on activation
- Sets up file watcher to refresh relationships when files change
- Registers "Refresh Foreign Key Relationships" command

## Execution Flow

### When Extension Activates:
1. Extension loads
2. Registers Definition, Hover, and CodeLens providers
3. Sets up file watcher for .hru, .hyd, .sol, .cli files
4. Providers are now active but haven't done anything yet

### When User Presses F12:
1. **SwatDefinitionProvider.provideDefinition()** called
2. Logs: `[SWAT+] Definition requested for file: xxx`
3. Calls `getRelationships(directory)` ← **THIS IS WHERE IT HANGS**
4. Should log: `[SWAT+] getRelationships START`
5. Should log: `[SWAT+] Directory: xxx`
6. Should log: `[SWAT+] Checking cache...`
7. **BUT: Only first log appears, then nothing**

## Debugging the Hang

### What We Know:
- ✅ Extension activates successfully
- ✅ Definition provider is called
- ✅ First log appears: `getRelationships START`
- ❌ No subsequent logs appear
- ❌ Code hangs somewhere in `getRelationships()`

### Likely Causes:

**1. Synchronous File Operations Blocking**
```typescript
const files = fs.readdirSync(directory);  // May hang on network drives or slow disks
const content = fs.readFileSync(filePath, 'utf-8');  // May hang on large files
```

**2. Infinite Loop or Recursion**
- File watcher might be triggering relationship refresh during discovery
- Cache Map operations might have issues with Windows paths

**3. Windows Path Handling**
- Directory path: `c:\Users\...\Osu_1hru`
- Backslashes might need normalization
- Path.join() vs manual concatenation issues

**4. Extension Development Host Debugger**
- Even without breakpoints, debugger might pause on exceptions
- Try-catch blocks might be silently catching errors

### How to Diagnose:

**Option 1: Add Synchronous Logs (Already Done)**
Current code has logs at each step. If only first log appears, it's hanging between:
- Line: `console.log('[SWAT+] getRelationships START');`
- Next line: `console.log('[SWAT+] Directory:', directory);`

**This means the hang is literally on the SECOND LINE of the function** - which is just a string operation!

**Option 2: Check Console for Errors**
- Open Developer Tools → Console tab
- Look for ANY errors, not just [SWAT+] messages
- Errors might appear in red

**Option 3: Simplify getRelationships**
Replace entire function body with:
```typescript
console.log('[SWAT+] TEST 1');
console.log('[SWAT+] TEST 2');
console.log('[SWAT+] TEST 3');
return new Map();
```
If all 3 logs appear → problem is in the logic
If only TEST 1 appears → VS Code issue with console.log itself!

## Next Steps to Fix

1. **Verify npm run compile actually compiled** - Check timestamp on `out/swatPlusLanguageFeatures.js`
2. **Reload VS Code window completely** - Close all windows, reopen
3. **Check for console.log buffering** - Console might batch logs
4. **Try returning immediately** - Test if function can even return
5. **Package as .vsix** - Install as real extension, not development mode

## File Structure

```
src/
  ├── extension.ts (registers providers)
  ├── swatPlusSchema.ts (schema definitions)
  └── swatPlusLanguageFeatures.ts (main logic)
      ├── getRelationships() ← HANGS HERE
      ├── parseSwatFile()
      ├── SwatDefinitionProvider
      ├── SwatHoverProvider
      └── SwatCodeLensProvider
```

## Expected Behavior

Once working:
- Hover over "hydro_001" → See tooltip with hydrology data
- Press F12 on "hydro_001" → Jump to hydrology.hru file
- Alt+F12 on "hydro_001" → Peek inline view
- See hints above rows: `🔗 Referenced: Hydrology: hydro_001`

## Current Status

❌ **Not working** - Hangs in `getRelationships()` after first log
🔍 **Needs investigation** - Why second console.log doesn't appear
