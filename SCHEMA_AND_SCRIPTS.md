# Understanding SWAT+ Editor Schema and Scripts Changes

## Overview

This document explains what happens when the schema and scripts from the SWAT+ Editor application change, and how it impacts the SWAT+ Dataset Selector VS Code extension.

## Background

### What is SWAT+ Editor?

[SWAT+ Editor](https://github.com/swat-model/swatplus-editor) is a desktop application (Electron-based with Python backend) that provides a graphical interface for:
- Importing SWAT+ projects from GIS tools (like QSWAT+)
- Editing SWAT+ model input parameters
- Managing database schemas for SWAT+ projects
- Writing text input files for the SWAT+ model
- Running SWAT+ simulations

### What is SWAT+ Dataset Selector?

This VS Code extension allows developers working on the SWAT+ model source code to:
- Browse and select dataset folders containing SWAT+ input files
- Launch debug sessions with different datasets
- View and edit dataset files directly in VS Code

## Database Schema in SWAT+ Editor

### Schema Structure

SWAT+ Editor uses SQLite databases to manage project data. The main database schemas include:

1. **Project Database** (`project.db` or `*.sqlite`)
   - Stores all model configuration data
   - Contains tables for HRUs, channels, reservoirs, climate data, etc.
   - Defines relationships between model components

2. **Datasets Database** (`swatplus_datasets.sqlite`)
   - Contains reference data like plant types, soil properties, etc.
   - Provides lookup tables and default values
   - Updated with each SWAT+ Editor version

### What Happens When Schema Changes?

When SWAT+ Editor updates its database schema (typically with major or minor version releases):

#### 1. **Database Version Updates**
- Schema version numbers are incremented
- New tables may be added for new features
- Existing tables may have columns added, removed, or modified
- Data types or constraints may change

**Example from SWAT+ Editor v3.0.0:**
```
- Added tables for GWFLOW (groundwater flow module)
- Updated constituent tables for salinity module
- Modified weather generator table structures
```

#### 2. **Backward Compatibility Issues**
- **Old datasets with new editor:** SWAT+ Editor typically includes migration scripts to upgrade old databases
- **New datasets with old editor:** Older versions cannot read newer schema versions
- **This extension:** Must handle datasets from different editor versions

#### 3. **Impact on File.cio and Text Files**
When schema changes occur:
- The `File.cio` file structure may change (new sections, removed sections)
- Text file formats may be updated (`.bsn`, `.con`, `.hru`, etc.)
- New file types may be introduced
- File naming conventions may change

## Scripts in SWAT+ Editor

### Types of Scripts

SWAT+ Editor contains several types of scripts:

1. **Python Backend Scripts** (`src/api/`)
   - Database migration scripts
   - Input file writers (convert database → text files)
   - Output file readers (parse SWAT+ model output)
   - GIS import/export utilities

2. **Build Scripts** (`scripts/`)
   - Python compilation scripts for different platforms
   - Electron build configuration
   - Development server setup

3. **Database Scripts**
   - Schema creation scripts
   - Data migration/upgrade scripts
   - Default data population scripts

### What Happens When Scripts Change?

#### 1. **Input File Writing Changes**
When SWAT+ Editor updates its file writing scripts:
- **Format changes:** Text files may use different delimiters, column orders, or precision
- **New parameters:** Additional model parameters may be written to files
- **Removed parameters:** Deprecated parameters may be removed
- **Validation rules:** Stricter or modified validation may be applied

**Impact on this extension:**
```
✓ Can still open and view files (text-based)
⚠ May display files that don't match the latest SWAT+ model version
⚠ No automatic validation of file content
✓ Allows manual editing regardless of version
```

#### 2. **Output File Reading Changes**
When output parsing scripts change:
- New output file formats from updated SWAT+ model
- Different column structures in output tables
- New output variables or removed variables

**Impact on this extension:**
```
✓ Extension doesn't parse output files directly
✓ Users view output as plain text
```

#### 3. **Migration Script Updates**
When database migration scripts change:
- Datasets can be upgraded from old versions to new versions
- Migration may add default values for new parameters
- Migration may restructure data organization

## Version Compatibility Matrix

### SWAT+ Editor Versions and Model Versions

| Editor Version | Model Version | Database Schema | Major Changes |
|---------------|---------------|-----------------|---------------|
| 2.x | 60.5.x | 2.x | Basic functionality |
| 3.0.0 | 61.0 | 3.0 | GWFLOW, Salinity, Constituents |
| 3.0.12 | 61.0.2 | 3.0 | Bug fixes, UI improvements |
| 3.1.0+ | 61.0.2+ | 3.1+ | Updated parameters |

### This Extension's Compatibility

**File-level compatibility:** ✅ **Universal**
- This extension works at the file system level
- It doesn't directly read or validate database schemas
- It allows opening and editing text files from any version

**Workflow compatibility:** ⚠️ **Version-dependent**
- Debugging requires matching model executable version
- File.cio structure must match the SWAT+ model version
- Parameter names/values must be valid for the model version

## Impact on Different Workflows

### Scenario 1: Dataset Created with Old SWAT+ Editor

```
Situation: You have a dataset created with SWAT+ Editor v2.3
Current: SWAT+ Editor v3.1 is latest

Using this extension:
✓ Can browse and view all files
✓ Can open files in editor
⚠ Files may be missing new v3.1 parameters
⚠ Debugging requires SWAT+ model v60.5.x (old version)
⚠ Consider upgrading dataset in SWAT+ Editor before use
```

### Scenario 2: Dataset Created with New SWAT+ Editor

```
Situation: You have a dataset created with SWAT+ Editor v3.1
Your code: Developing SWAT+ model source code

Using this extension:
✓ Can browse and view all files
✓ Can edit files manually
✓ Debugging works if your compiled model matches v61.0.2+
⚠ Manual edits must match current schema expectations
⚠ Invalid edits won't be caught until model runs
```

### Scenario 3: Schema Change During Development

```
Situation: SWAT+ Editor releases v3.2 with schema changes
Your workflow: Active development on a dataset

Recommended approach:
1. Backup your current dataset folder
2. Note your current SWAT+ Editor and model versions
3. Decide: upgrade dataset or stay on current version
4. If upgrading:
   - Open dataset in new SWAT+ Editor
   - Allow automatic migration
   - Review changes to File.cio and text files
   - Update your compiled model to match new version
5. Continue using this extension with upgraded dataset
```

## Best Practices

### 1. Version Tracking
- Document which SWAT+ Editor version created your dataset
- Include version info in dataset folder README
- Keep track of SWAT+ model executable version you're using

### 2. File Backups
- Always backup datasets before SWAT+ Editor upgrades
- Use version control (git) for text files when possible
- Keep copies of working configurations

### 3. Validation Workflow
```
1. Edit files in VS Code (using this extension)
2. Verify changes in SWAT+ Editor (schema validation)
3. Test run the model
4. Review output for errors
```

### 4. Development Environment Synchronization
- Match SWAT+ Editor version with team members
- Document required editor version in project README
- Use consistent SWAT+ model source code versions

## File.cio: The Central Configuration File

### Why File.cio Matters

The `file.cio` file is the master configuration file that:
- Lists all input files the model should read
- Defines the model structure
- Controls which modules are enabled

### Schema Impact on File.cio

When SWAT+ Editor schema changes:

**New sections may appear:**
```
! previous version
print.prt
codes.bsn
...

! new version with GWFLOW
print.prt
codes.bsn
gwflow.con    <- new section added
gwflow_grid.grd  <- new files
...
```

**File formats may change:**
```
! version 60.5
time.sim
codes.bsn

! version 61.0
time.sim
codes.bsn : Simulation codes
```

### What This Extension Displays

When you open a dataset folder in this extension:
- ✅ Shows File.cio exists (or missing)
- ✅ Allows opening File.cio for viewing/editing
- ✅ Lists all files in the dataset directory
- ⚠️ Doesn't validate File.cio structure against any schema
- ⚠️ Doesn't check if listed files exist

## Handling Migration and Compatibility

### Manual Migration Checklist

If you need to manually update files after a schema change:

1. **Backup everything first**
2. **Compare file formats:**
   - Download example dataset from SWAT+ website for new version
   - Compare your files with examples
   - Note differences in structure
3. **Update File.cio:**
   - Add new required files
   - Remove deprecated files
   - Update file descriptions if format changed
4. **Update individual files:**
   - Add new required columns/parameters
   - Remove deprecated parameters
   - Adjust data types or ranges
5. **Test thoroughly:**
   - Run SWAT+ Check in Editor
   - Test model run
   - Review output for errors

### Automated Migration via SWAT+ Editor

Recommended approach:
1. Open dataset in SWAT+ Editor
2. Allow automatic migration when prompted
3. Review migration log/warnings
4. Save project (rewrites all text files)
5. Continue using dataset with this extension

## Developer Considerations

### If You're Developing SWAT+ Model Source Code

When schema/scripts change in SWAT+ Editor, you may need to:

1. **Update Model Code:**
   - Input file reading routines
   - Parameter definitions
   - Output file writing

2. **Update Test Datasets:**
   - Regenerate test datasets with new editor
   - Update expected output for tests
   - Verify backward compatibility handling

3. **Documentation:**
   - Update input file format documentation
   - Note breaking changes in release notes
   - Provide migration guidance for users

### If You're Extending This Extension

To make this extension more schema-aware:

```typescript
// Example: Could add schema version detection
function detectSchemaVersion(datasetPath: string): string {
    const projectDb = path.join(datasetPath, 'project.db');
    if (fs.existsSync(projectDb)) {
        // Query database for version info
        // Return version string
    }
    return 'unknown';
}

// Could add compatibility warnings
function checkCompatibility(datasetPath: string, modelVersion: string) {
    const schemaVersion = detectSchemaVersion(datasetPath);
    // Compare versions and warn if mismatch
}
```

## Resources

- **SWAT+ Editor Repository:** https://github.com/swat-model/swatplus-editor
- **SWAT+ Documentation:** https://swatplus.gitbook.io/docs
- **SWAT+ Editor User Group:** https://groups.google.com/g/swatplus-editor
- **Model Release Notes:** https://swatplus.gitbook.io/docs/release-notes

## Summary

### Key Takeaways

1. **Schema changes** affect database structure, file formats, and available parameters
2. **Script changes** affect how files are generated and validated
3. **This extension** operates at file-level and is mostly schema-agnostic
4. **Best practice:** Keep SWAT+ Editor, model version, and datasets synchronized
5. **Compatibility:** Datasets should be upgraded through SWAT+ Editor when schema changes
6. **Development:** Test with datasets from the SWAT+ Editor version you're targeting

### When to Worry About Schema Changes

❗ **You should be concerned when:**
- Upgrading SWAT+ Editor to a new major version (e.g., 2.x → 3.x)
- SWAT+ model version changes (e.g., 60.x → 61.x)
- File.cio structure documented in model changes
- Your model debugging fails with "file format" errors

✅ **You're probably fine when:**
- Using patch versions (e.g., 3.0.11 → 3.0.12)
- Only viewing files (not debugging)
- Working with recently created datasets
- Using SWAT+ Editor for file validation before debugging

---

*This document was created to help developers understand the relationship between SWAT+ Editor schema/script changes and the SWAT+ Dataset Selector VS Code extension.*
