# SWAT+ Editor: Import GIS to Database Functionality

## Overview

This document explains how SWAT+ Editor's "Import from GIS" functionality works, which is a critical step in creating SWAT+ projects from geographic data.

## High-Level Process Flow

```
┌─────────────────────────────────────────────────────────────────┐
│          SWAT+ Project Creation Workflow                        │
└─────────────────────────────────────────────────────────────────┘

1. GIS Tool (QSWAT+ or ArcSWAT3)
   ├─ Watershed delineation
   ├─ HRU definition
   ├─ Stream network routing
   └─ Generates: GIS shapefiles + SQLite database

                    ↓

2. SWAT+ Editor Import Process
   ├─ Reads GIS-generated SQLite database
   ├─ Transforms GIS data → Project database schema
   ├─ Creates routing units, channels, HRUs, etc.
   └─ Populates project.db with structured data

                    ↓

3. SWAT+ Editor Editing
   ├─ User modifies parameters via GUI
   ├─ Changes stored in project.db
   └─ Ready for text file generation

                    ↓

4. Write Text Files
   ├─ Reads project.db
   ├─ Generates SWAT+ input files (.bsn, .con, .hru, etc.)
   └─ Creates dataset folder for model execution
```

## Import GIS Functionality Breakdown

### Entry Point

**File:** `src/api/actions/import_gis.py`  
**Class:** `GisImport`  
**Main Method:** `insert_default()`

### What Gets Imported

The import process transforms GIS data into SWAT+ Editor's project database structure:

```python
# Import sequence in insert_default():
1. Routing units (from GIS subbasins)
2. Channels (from GIS stream network)
3. Reservoirs (from GIS water bodies)
4. Point sources/Recall (from GIS inlet points)
5. HRUs (from GIS HRU definitions)
6. Aquifers (from GIS aquifer data)
7. Connections (routing between components)
8. Landscape units (default creation)
9. Weather stations (matching)
```

### Database Tables Created/Populated

#### 1. **Routing Units** (`routing_unit` tables)
- **Source:** GIS `Gis_subbasins` table
- **Purpose:** Define watershed subbasins
- **Data transformed:**
  - Subbasin geometry → routing unit properties
  - Area calculations
  - Outlet assignments

#### 2. **Channels** (`channel_cha` tables)
- **Source:** GIS channel/stream network data
- **Purpose:** Define stream reaches
- **Data transformed:**
  - Channel geometry → hydraulic properties
  - Length, slope, width calculations
  - Initial conditions

#### 3. **Reservoirs** (`reservoir_res` tables)
- **Source:** GIS water body features
- **Purpose:** Define lakes, ponds, reservoirs
- **Data transformed:**
  - Reservoir geometry → storage properties
  - Surface area, volume relationships
  - Outlet structures

#### 4. **HRUs** (`hru_data_hru` tables)
- **Source:** GIS HRU polygons with landuse/soil/slope
- **Purpose:** Define hydrologic response units
- **Data transformed:**
  - HRU attributes → model parameters
  - Landuse code → plant/management linkage
  - Soil code → soil profile linkage
  - Slope → topography properties

#### 5. **Aquifers** (`aquifer_aqu` tables)
- **Source:** GIS aquifer zones
- **Purpose:** Define groundwater systems
- **Data transformed:**
  - Aquifer geometry → storage/flow properties
  - Hydraulic conductivity, porosity
  - Initial water table depth

#### 6. **Connections** (`connect_con` tables)
- **Source:** GIS routing table (`gis_routing`)
- **Purpose:** Define how water flows between components
- **Data transformed:**
  - GIS routing IDs → database object links
  - Upstream/downstream relationships
  - Outlet connections

### Step-by-Step Import Process

#### Step 1: Initialization

```python
class GisImport(ExecutableApi):
    def __init__(self, project_db_file, delete_existing=False, constant_ps=True, rollback_db=None):
        # Initialize project database connection
        SetupProjectDatabase.init(project_db_file)
        
        # Load project configuration
        self.config = Project_config.get()
        
        # Connect to reference datasets database
        datasets_db = utils.full_path(project_db_file, self.config.reference_db)
        SetupDatasetsDatabase.init(datasets_db)
```

**What happens:**
- Opens `project.db` (empty or partially filled)
- Opens `swatplus_datasets.sqlite` (reference data)
- Reads project configuration (GIS type, version, etc.)
- Optionally deletes existing imported data

#### Step 2: Version Check

```python
if not is_supported_version(self.config.gis_version, self.config.gis_type):
    legacy_api = GisImportLegacy(...)
    legacy_api.insert_default()
```

**What happens:**
- Checks GIS tool version (QSWAT+ vs ArcSWAT, version number)
- Routes to legacy import for older GIS versions
- Ensures compatibility with GIS output format

#### Step 3: Import Routing Units

```python
def insert_routing_units(self):
    # Read from gis_subbasins table
    subbasins = gis.Gis_subbasins.select()
    
    for sub in subbasins:
        # Create routing_unit entry
        rtu = routing_unit.Routing_unit_rtu.create(
            name=get_name("ru", sub.subbasin, max_sub),
            description=sub.description,
            area=sub.area
        )
        
        # Map GIS ID to database ID
        self.gis_to_rtu_ids[sub.subbasin] = rtu.id
```

**What happens:**
- Reads GIS subbasin polygons
- Creates routing unit database entries
- Calculates areas from GIS geometry
- Maintains mapping between GIS IDs and database IDs

#### Step 4: Import Channels

```python
def insert_channels_lte(self):
    # Read from gis_channels table
    channels = gis.Gis_channels.select()
    
    for cha in channels:
        # Create channel entry
        channel_obj = channel.Channel_cha.create(
            name=get_name("cha", cha.channel, max_cha),
            wst=cha.width,
            dep=cha.depth,
            len=cha.length,
            slp=cha.slope
        )
        
        # Link to hydrology parameters
        hydrology_obj = channel.Hydrology_cha.create(...)
```

**What happens:**
- Reads GIS channel/stream features
- Extracts hydraulic geometry (width, depth, slope)
- Creates channel database entries
- Links to default hydrology parameters from datasets database

#### Step 5: Import HRUs

```python
def insert_hrus(self):
    # Read from gis_hrus table
    hrus = gis.Gis_hrus.select()
    
    for hru_gis in hrus:
        # Lookup landuse management
        lum_name = self.get_lum_name(hru_gis.landuse)
        
        # Lookup soil profile
        soil_name = self.get_soil_name(hru_gis.soil)
        
        # Create HRU entry
        hru_obj = hru.Hru_data_hru.create(
            name=get_name("hru", hru_gis.hru, max_hru),
            lum=lum_name,
            soil=soil_name,
            slope=hru_gis.slope,
            area=hru_gis.area
        )
```

**What happens:**
- Reads GIS HRU polygons with attributes
- **Critical lookup:** Matches landuse codes to `landuse.lum` table
- **Critical lookup:** Matches soil codes to `soils.sol` table
- Creates HRU database entries with parameter references
- If lookups fail, uses defaults or creates new entries

#### Step 6: Import Connections

```python
def insert_connections(self):
    # Read from gis_routing table
    routes = gis.Gis_routing.select()
    
    for route in routes:
        # Determine connection type (channel, reservoir, etc.)
        from_obj = self.get_object_by_type(route.sourcetype, route.sourceid)
        to_obj = self.get_object_by_type(route.targettype, route.targetid)
        
        # Create connection
        connect.Rout_unit_con.create(
            rtu=from_obj,
            obj_typ=route.targettype,
            obj=to_obj,
            order=route.order
        )
```

**What happens:**
- Reads GIS routing table (how water flows)
- Maps GIS object IDs to database object IDs
- Creates connection entries defining watershed topology
- Handles special cases (outlets, aquifer routing, etc.)

### Reference Database Lookups

During import, SWAT+ Editor frequently queries the **datasets database** (`swatplus_datasets.sqlite`) for default values:

```python
# Example: Getting default plant data
plant = ds_lum.Plants_plt.get(ds_lum.Plants_plt.name == landuse_code)

# Example: Getting default soil data  
soil = ds_soils.Soils_sol.get(ds_soils.Soils_sol.name == soil_code)

# Example: Getting default urban parameters
urban = ds_hru_parm_db.Urban_urb.get_or_none(ds_hru_parm_db.Urban_urb.name == 'urb')
```

**What this means:**
- GIS provides landuse/soil codes (e.g., "CORN", "CLAY")
- Editor looks up those codes in datasets database
- If found, uses associated parameters (growth rates, hydraulic conductivity, etc.)
- If not found, creates new entry with default values or fails with error

### Error Handling and Rollback

```python
try:
    # Import operations...
except Exception as err:
    if self.rollback_db is not None:
        self.emit_progress(50, "Error occurred. Rolling back database...")
        SetupProjectDatabase.rollback(self.project_db_file, self.rollback_db)
    sys.exit(traceback.format_exc())
```

**What happens:**
- If import fails at any step, catches exception
- If rollback database provided, restores to pre-import state
- Reports error with full stack trace
- Prevents partially-imported corrupt database

### Progress Reporting

```python
self.emit_progress(15, "Importing routing units from GIS...")
self.emit_progress(30, "Importing channels from GIS...")
self.emit_progress(60, "Importing hrus from GIS...")
```

The import process reports progress back to the GUI at various stages, allowing users to see what's happening.

## Two Import Modes

### Standard Mode (SWAT+)

Full import with all components:
1. Routing units
2. Channels
3. Reservoirs
4. Point sources
5. HRUs
6. Aquifers
7. Connections
8. Landscape units

### LTE Mode (SWAT+ LTE - discontinued in v3.0.12+)

Simplified import for Land Treatment Evaluation:
1. Channels (simplified)
2. Landscape units
3. HRU-LTEs (different structure)
4. Connections (simplified)

## Key Data Transformations

### 1. Name Generation

GIS objects have integer IDs; SWAT+ uses string names:

```python
def get_name(name, id, digits):
    return "{name}{num}".format(name=name, num=str(id).zfill(len(str(digits))))

# Examples:
# Subbasin 1 → "ru0001" (routing unit 1)
# Channel 42 → "cha0042"
# HRU 123 → "hru0123"
```

### 2. ID Mapping

Maintains dictionaries to map GIS IDs to database IDs:

```python
self.gis_to_rtu_ids[gis_subbasin_id] = database_rtu_id
self.gis_to_cha_ids[gis_channel_id] = database_cha_id
self.gis_to_hru_ids[gis_hru_id] = database_hru_id
```

This allows connections to reference the correct database objects.

### 3. Parameter Defaulting

When GIS provides minimal data, editor fills in defaults:

```python
# GIS provides: landuse code, area
# Editor adds: plant growth parameters, management operations, etc.

# Process:
1. GIS says HRU has landuse "CORN"
2. Editor looks up "CORN" in plants.plt table from datasets DB
3. Finds growth parameters, LAI curves, biomass ratios, etc.
4. Links HRU to that plant/management configuration
```

## Database Schema Changes Impact

### When SWAT+ Editor schema changes:

**Example: Adding GWFLOW module (v3.0.0)**

1. **New tables created:**
   - `gwflow_grid` (groundwater grid cells)
   - `gwflow_zones` (parameter zones)
   - `gwflow_wetlands` (wetland-groundwater interaction)

2. **Import process updated:**
   - `import_gis.py` checks if GWFLOW enabled
   - If yes, imports additional GIS data for groundwater grid
   - Links grid cells to existing aquifer objects
   - Populates new tables with default parameters

3. **Old datasets:**
   - Don't have GWFLOW GIS data
   - Import skips GWFLOW steps
   - Tables remain empty (allowed)
   
4. **New GIS tools (QSWAT+ updated):**
   - Generate GWFLOW GIS tables
   - Import process populates new tables
   - Full GWFLOW functionality available

**This is why schema versions matter:** The import script must match:
- GIS tool version (what data is provided)
- Project database schema (what tables exist)
- Datasets database schema (what reference data is available)

## Common Import Issues

### Issue 1: Landuse Code Not Found

```
Error: Landuse 'CUSTOM_CROP' not found in reference database
```

**Cause:** GIS uses custom landuse code not in `swatplus_datasets.sqlite`

**Solution:**
1. Add custom plant to `plants.plt` table in datasets DB before import
2. Or let import create default entry (may have wrong parameters)
3. Edit parameters in SWAT+ Editor after import

### Issue 2: Routing Connection Errors

```
Error: Cannot connect HRU 42 to Channel 99 - channel not found
```

**Cause:** GIS routing table references object IDs that don't exist

**Solution:**
1. Verify GIS data integrity in QSWAT+/ArcSWAT
2. Re-export GIS database with correct routing
3. Check for gaps in sequential numbering

### Issue 3: Schema Version Mismatch

```
Error: Missing column 'aeration' in plants_plt table
```

**Cause:** GIS tool version doesn't match SWAT+ Editor version

**Solution:**
1. Upgrade GIS tool (QSWAT+/ArcSWAT) to match editor version
2. Or downgrade editor to match GIS tool
3. Run database migration scripts if available

## After Import: What's Next?

Once import completes successfully:

1. **project.db is populated** with:
   - All watershed components (routing units, channels, HRUs, etc.)
   - Initial parameter values from datasets database
   - Routing topology (connections)

2. **User can now:**
   - Edit parameters via SWAT+ Editor GUI
   - Add/remove components
   - Configure simulation settings
   - Run SWAT+ Check to validate

3. **To run model:**
   - Write text files (File → Write Input Files)
   - Text files generated from project.db
   - Model reads text files, not database

## Relationship to This Extension

### What This Extension Does

- Views/edits text files generated from project.db
- Launches debugging with dataset folders
- No direct interaction with import process

### What This Extension Doesn't Do

- Import GIS data (use SWAT+ Editor)
- Modify project.db (use SWAT+ Editor)
- Validate dataset compatibility (use SWAT+ Editor)

### Why Understanding Import Matters

When debugging SWAT+ model source code with this extension:

1. **Dataset source:** All datasets start from GIS import
2. **Parameter origins:** Values in text files trace back to import process
3. **Schema dependencies:** Text file format matches database schema at import time
4. **Version matching:** Dataset schema version = SWAT+ Editor version at import time

**Example scenario:**
```
You're debugging SWAT+ model v61.0.2 with a dataset.

The dataset was created:
1. GIS tool: QSWAT+ v2.3 (generates GIS database)
2. SWAT+ Editor v3.1.0 (imports GIS → project.db schema v3.1)
3. SWAT+ Editor v3.1.0 (writes text files from project.db)

Your debugging:
- Model code must match v61.0.2 (dataset text file format)
- If you modify model code, text files may need regeneration
- If schema changes, must re-import GIS or migrate database
```

## Summary

### Import Process in Brief

1. **Input:** GIS-generated SQLite database with spatial data
2. **Process:** Transform GIS data → SWAT+ project database schema
3. **Output:** Populated `project.db` ready for editing/simulation
4. **Key operation:** Lookup reference data, create relationships, default parameters
5. **Critical for:** Ensuring all components have valid parameters

### Schema Version Impact

- Import script tied to specific database schema version
- Must match: GIS tool version ↔ Editor version ↔ Model version
- Schema changes require updated import scripts
- Old GIS data may need re-export or migration

### This Extension's Role

- Works with datasets **after** import and text file generation
- Doesn't participate in import process
- Helps debug model code that reads text files created from imported data

---

**For more information:**
- SWAT+ Editor source: https://github.com/swat-model/swatplus-editor
- SWAT+ Documentation: https://swatplus.gitbook.io/docs
- GIS Import Troubleshooting: Join SWAT+ Editor user group
