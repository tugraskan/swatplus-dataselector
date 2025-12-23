# Fix for Empty Tables During Database Import

## Problem
When importing/converting SWAT+ text files to a database, several tables remained empty:
- Connection tables: `aquifer_con`, `channel_con`, `reservoir_con`, `hru_con`, etc.
- Structural BMP tables: `bmpuser_str`, `septic_str`, `tiledrain_str`, `filterstrip_str`, `grassedww_str`

## Root Causes

### Issue 1: Structural Files Not Being Imported
The `import_structural()` function did not exist in `import_text_files.py`, even though the structural.py module had working `read()` implementations for all 5 structural file types.

### Issue 2: Connection Files Not Being Imported  
The `import_connect()` function had all import code commented out because the connection file classes in `fileio/connect.py` did not have `read()` implementations.

## Solution

### Part 1: Structural Files (Committed: 0c7149b)
Added `import_structural()` method to `actions/import_text_files.py` that imports:
- `septic.str` → `Septic_str` table
- `bmpuser.str` → `Bmpuser_str` table
- `filterstrip.str` → `Filterstrip_str` table
- `grassedww.str` → `Grassedww_str` table
- `tiledrain.str` → `Tiledrain_str` table

### Part 2: Connection Files (Committed: 160f3cc)

#### Added Generic Connection File Reader
Created `read_con_table()` function in `fileio/connect.py` that:
- Parses connection file format: `id name gis_id area lat lon elev elem_id wst cst ovfl rule out_tot [obj_typ obj_id hyd_typ frac]...`
- Handles variable-length rows with multiple outflow connections (out_tot determines how many)
- Looks up foreign keys for weather stations and element tables
- Inserts data into both connection tables and connection outflow tables (e.g., `aquifer_con` and `aquifer_con_out`)
- Properly maps file row IDs to database IDs for outflow foreign keys

#### Implemented Read Methods for All Connection Classes
Added `read()` implementations for:
- `Hru_con` / `Hru_lte_con` → `hru.con` / `hru-lte.con`
- `Rout_unit_con` → `rout_unit.con`
- `Aquifer_con` → `aquifer.con` ⭐ (main issue reported)
- `Channel_con` / `Chandeg_con` → `channel.con` / `chandeg.con`
- `Reservoir_con` → `reservoir.con`
- `Recall_con` / `Exco_con` → `recall.con` / `exco.con`
- `Delratio_con` → `delratio.con`

#### Enabled Connection File Import
Uncommented and updated the `import_connect()` function to actually import all connection files.

## Testing

To test this fix with the OSU1 dataset (or any SWAT+ dataset):

### Prerequisites
```bash
# Ensure Python and peewee are installed
pip install peewee
```

### Import Test Dataset
```bash
# Navigate to the python scripts directory
cd src/python-scripts

# Run the import (replace paths with your actual dataset location)
python3 actions/import_text_files.py \
    /path/to/dataset/project.db \
    /path/to/dataset/TxtInOut
```

### Verify Tables Are Populated
Use SQLite browser or command line to check:

```bash
sqlite3 /path/to/dataset/project.db
```

```sql
-- Check structural tables
SELECT COUNT(*) FROM bmpuser_str;
SELECT COUNT(*) FROM septic_str;
SELECT COUNT(*) FROM tiledrain_str;
SELECT COUNT(*) FROM filterstrip_str;
SELECT COUNT(*) FROM grassedww_str;

-- Check connection tables
SELECT COUNT(*) FROM aquifer_con;
SELECT COUNT(*) FROM aquifer_con_out;
SELECT COUNT(*) FROM channel_con;
SELECT COUNT(*) FROM channel_con_out;
SELECT COUNT(*) FROM reservoir_con;
SELECT COUNT(*) FROM reservoir_con_out;
SELECT COUNT(*) FROM hru_con;
SELECT COUNT(*) FROM hru_con_out;

-- View sample data
SELECT * FROM aquifer_con LIMIT 5;
SELECT * FROM bmpuser_str LIMIT 5;
```

### Expected Results
- All tables should have data if the corresponding .con or .str files exist in the TxtInOut directory
- Connection outflow tables should have matching records linked to their parent connections
- Foreign keys should be properly resolved (e.g., wst → weather_sta_cli, aqu → aquifer_aqu)

## Technical Details

### Connection File Format
Connection files (.con) have this structure:
```
[header line 1]
[header line 2]
id  name     gis_id  area  lat  lon  elev  elem_id  wst  cst  ovfl  rule  out_tot  [obj_typ obj_id hyd_typ frac] ...
1   aqu_001  1       100   45   90   150   1        null 0    0     0     2        cha      1       tot     1.0  ...
```

Key points:
- First 13 columns are the main connection record
- `out_tot` indicates how many outflow connections follow
- Each outflow is 4 columns: obj_typ, obj_id, hyd_typ, frac
- Total columns = 13 + (out_tot * 4)

### Database Schema
Connection data is split across two tables:
1. **Connection table** (e.g., `aquifer_con`): Main connection properties
   - Fields: name, gis_id, area, lat, lon, elev, wst_id, cst_id, ovfl, rule, aqu_id (FK to aquifer_aqu)

2. **Connection outflow table** (e.g., `aquifer_con_out`): Outflow connections  
   - Fields: order, obj_typ, obj_id, hyd_typ, frac, aquifer_con_id (FK to aquifer_con)

The `read_con_table()` function handles reading both and linking them properly.

## Files Modified
- `src/python-scripts/actions/import_text_files.py`
  - Added `import_structural()` method
  - Enabled `import_connect()` method
  - Added call to `import_structural()` in main import workflow

- `src/python-scripts/fileio/connect.py`
  - Added `read_con_table()` helper function
  - Implemented `read()` methods for all connection file classes
  - Added necessary imports (climate, simulation, db_lib, project_base)

## Future Improvements
- Add unit tests with sample connection and structural files
- Add validation to ensure foreign key references exist before import
- Add better error handling and reporting during import
- Consider adding progress indicators for large connection files
