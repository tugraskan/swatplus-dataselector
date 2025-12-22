# SWAT+ Sample Dataset

This directory contains a minimal example SWAT+ dataset to demonstrate the database navigation features.

## Files

- `hru-data.hru` - HRU (Hydrologic Response Unit) data with foreign key references
- `hydrology.hyd` - Hydrology parameters referenced by HRUs
- `topography.hyd` - Topography data referenced by HRUs
- `field.fld` - Field dimension data referenced by HRUs

## Testing Database Navigation

To test the "Go to Definition" feature:

1. **Without a database** (file-based navigation):
   - Open `hru-data.hru`
   - Click on any value in the `hydro` column (e.g., `hydro_001`)
   - Press `F12` or right-click and select "Go to Definition"
   - VS Code should navigate to the corresponding line in `hydrology.hyd`

2. **With a database** (requires importing):
   - First, create a project database by running the Import/Convert DB command
   - Select this folder as the dataset
   - The extension will create a `project.db` file here
   - Open `hru-data.hru` again
   - Now clicking on foreign key values will use the database to resolve references more accurately

## Foreign Key Relationships

In this example dataset:

- `hru-data.hru` references:
  - `topo` → `topography.hyd`
  - `hydro` → `hydrology.hyd`
  - `field` → `field.fld`

**Example navigation flow**:
1. Open `hru-data.hru`
2. Find row for `hru_001`
3. Click on `hydro_001` in the `hydro` column
4. Press F12 → navigates to `hydrology.hyd` line containing `hydro_001`
5. Hover over `hydro_001` to see a preview of the hydrology parameters

## Note

This is a simplified example. Real SWAT+ datasets contain many more files and complex relationships. The navigation feature supports all standard SWAT+ file types including:

- `.hru`, `.hyd`, `.fld`, `.sol`, `.lum`, `.ini`
- `.wet`, `.sno`, `.plt`, `.dtl`, `.con`, `.cha`
- `.res`, `.aqu`, `.rtu`, `.ele`, `.rec`, `.bsn`
- And more...
