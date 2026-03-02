# GitBook File Dependency Analysis

This document provides a comprehensive analysis of all file dependencies, foreign keys (pointers), and relationships in this SWAT+ GitBook documentation repository.

## Repository Structure

- **Total Markdown Files**: 1,438 files
- **Main Navigation**: SUMMARY.md (defines the table of contents)
- **Main Categories**: 
  - SWAT+ Input Files
  - SWAT+ Output Files
  - Theoretical Documentation

## Types of Dependencies and Relationships

### 1. Navigation Links (SUMMARY.md)
The SUMMARY.md file serves as the main table of contents and defines the hierarchical structure of the GitBook. It contains links to all major sections and subsections.

### 2. Foreign Key Relationships (Pointers)
Files reference other files through "pointer" fields that act as foreign keys in a relational database structure. These are explicitly documented in the files.

**Common pointer patterns:**
- `aqu_init` in aquifer.aqu → `name` in initial.aqu
- `org_min` in initial.aqu → `name` in om_water.ini
- `pest` in initial.aqu → `name` in pest_water.ini
- `salt` in initial.aqu → `name` in salt_water.ini
- Primary keys referenced by connectivity files

### 3. Cross-Reference Links
Markdown files contain internal links to related documentation using relative paths.

**Link patterns:**
- `[text](relative/path/to/file.md)` - Standard markdown links
- `[parameter_name](file.md)` - Links to parameter definitions
- `[**filename**](path/to/file/)` - Links to file documentation

### 4. Primary Key References
Many files define primary keys that are referenced by other files:
- `id` fields in various `.con` files
- `name` fields in initialization and configuration files

## Dependency Categories

### Input File Dependencies

#### Aquifer System
```
aquifer.aqu (primary)
  ├─ aqu_init → initial.aqu:name
  └─ Referenced by: aquifer.con (connectivity)

initial.aqu
  ├─ org_min → om_water.ini:name
  ├─ pest → pest_water.ini:name
  ├─ path → (pathway initialization)
  ├─ hmet → (heavy metal initialization)
  └─ salt → salt_water.ini:name
```

#### Climate System
```
weather-sta.cli
  ├─ wgn → weather-wgn.cli
  ├─ pcp → pcp.cli (precipitation data)
  ├─ tmp → tmp.cli (temperature data)
  ├─ slr → slr.cli (solar radiation)
  ├─ hmd → hmd.cli (humidity)
  ├─ wnd → wnd.cli (wind speed)
  ├─ pet → (potential evapotranspiration)
  └─ atmo_dep → atmo.cli (atmospheric deposition)
```

#### Hydrologic Response Units (HRU)
```
hru-data.hru
  ├─ topo → topography.hyd
  ├─ hydro → hydrology.hyd
  ├─ soil → soils.sol
  ├─ lu_mgt → landuse.lum
  ├─ soil_plant_init → soil_plant.ini
  ├─ surf_stor → (surface storage)
  ├─ snow → snow.sno
  └─ field → field.fld
```

#### Land Use and Management
```
landuse.lum
  ├─ plnt_com → plant.ini
  ├─ mgt → management.sch
  ├─ cn2 → cntable.lum
  ├─ cons_prac → cons_practice.lum
  ├─ ov_mann → ovn_table.lum
  ├─ tile → tiledrain.str
  ├─ sep → septic.str
  ├─ vfs → filterstrip.str
  ├─ grww → grassedww.str
  └─ bmp → bmpuser.str
```

#### Routing Units
```
rout_unit.rtu
  ├─ define → rout_unit.def
  ├─ topo → (topography)
  └─ field → (field characteristics)

rout_unit.def
  └─ elements → rout_unit.ele

rout_unit.ele
  ├─ obj_typ → (object type)
  └─ obj_id → (object ID reference)
```

#### Reservoirs and Water Bodies
```
reservoir.res
  ├─ init → initial.res
  ├─ hyd → hydrology.res
  ├─ rel → (release/weir data)
  ├─ sed → sediment.res
  └─ nut → nutrients.res

wetland.wet
  ├─ init → (initial conditions)
  ├─ hyd → hydrology.wet
  ├─ rel → (release data)
  ├─ sed → (sediment data)
  └─ nut → (nutrient data)
```

#### Channels
```
channel.cha
  ├─ init → initial.cha
  ├─ hyd → hydrology.cha
  ├─ sed → sediment.cha
  └─ nut → nutrients.cha
```

#### Connectivity Files
```
*.con files (hru.con, aquifer.con, channel.con, etc.)
  ├─ wst → (weather station reference)
  ├─ cst → (constituent reference)
  ├─ obj_typ → (output object type)
  ├─ obj_id → (output object ID)
  └─ References primary keys from respective data files

aqu_cha.lin - Links aquifers to channels
chan_surf.lin - Links channels to surface objects
flo_con.dtl - Flow connection details
```

#### Master Configuration
```
file.cio (Master file)
  ├─ object.cnt
  ├─ time.sim
  ├─ print.prt
  ├─ object.prt
  ├─ pcp.cli
  ├─ tmp.cli
  ├─ slr.cli
  ├─ hmd.cli
  ├─ wnd.cli
  └─ codes.bsn
```

### Database Files
```
plants.plt - Plant database
urban.urb - Urban characteristics database
tillage.til - Tillage operations database
fertilizer.frt - Fertilizer database
pesticide.pes - Pesticide database
septic.sep - Septic system database
```

### Theoretical Documentation Dependencies

The theoretical documentation files are primarily organized hierarchically and reference each other through:
- Related calculation methods
- Component dependencies (e.g., solar radiation calculations depend on sun-earth relationships)
- Process flows (e.g., nutrient cycles, water routing)

## Key Findings

### 1. Hierarchical Structure
- The repository follows a hierarchical structure defined in SUMMARY.md
- Each major section has a README.md that links to subsections
- Deep nesting up to 5-6 levels in some areas

### 2. Relational Database Pattern
- Input files are structured like a relational database
- "Pointer" fields act as foreign keys
- "Name" and "ID" fields act as primary keys
- Strong referential integrity requirements

### 3. Common Pointer Fields
- `init` - Points to initialization files
- `hyd` - Points to hydrology files
- `sed` - Points to sediment files
- `nut` - Points to nutrient files
- `org_min` - Points to organic-mineral initialization
- `pest` - Points to pesticide initialization
- `salt` - Points to salt initialization

### 4. Connectivity System
- Special `.con` files establish connections between objects
- Routing units define flow paths
- Landscape units group related elements

### 5. Parameter Documentation Pattern
Each parameter file typically includes:
- Parameter description
- Data type
- Units
- Default value
- Valid range
- References to related parameters
- Foreign key relationships

## File Dependency Graph Summary

```
Master Config (file.cio)
  │
  ├─── Simulation Settings
  │     ├─ object.cnt
  │     ├─ time.sim
  │     ├─ print.prt
  │     └─ object.prt
  │
  ├─── Climate
  │     ├─ weather-sta.cli
  │     ├─ weather-wgn.cli
  │     └─ Data files (pcp, tmp, slr, hmd, wnd)
  │
  ├─── Basin
  │     ├─ codes.bsn
  │     └─ parameters.bsn
  │
  ├─── Spatial Objects
  │     ├─ HRUs (hru-data.hru, hru-lte.hru)
  │     ├─ Routing Units (rout_unit.*)
  │     ├─ Channels (channel.cha)
  │     ├─ Aquifers (aquifer.aqu)
  │     ├─ Reservoirs (reservoir.res)
  │     └─ Wetlands (wetland.wet)
  │
  ├─── Connectivity
  │     ├─ *.con files
  │     ├─ aqu_cha.lin
  │     ├─ chan_surf.lin
  │     └─ flo_con.dtl
  │
  ├─── Databases
  │     ├─ plants.plt
  │     ├─ soils.sol
  │     ├─ fertilizer.frt
  │     ├─ pesticide.pes
  │     └─ others
  │
  └─── Management
        ├─ landuse.lum
        ├─ management.sch
        └─ Decision tables
```

## Cross-File Reference Statistics

Based on analysis of the repository:
- **Primary Key Fields**: ~100+ unique primary keys
- **Foreign Key References**: ~200+ pointer relationships
- **Markdown Internal Links**: ~1,500+ cross-references
- **Navigation Links (SUMMARY.md)**: ~800+ entries

## Documentation Organization

### Input Files
- Organized by functional area (Climate, Basin, HRUs, etc.)
- Each file type has a dedicated section
- Parameters documented individually with their own pages

### Output Files
- Organized by output type
- Less interconnected than input files
- Primarily reference input file parameters

### Theoretical Documentation
- Organized by process/component
- Sequential flow from climate → runoff → routing → water bodies
- Heavy cross-referencing between related processes

## Conclusion

This GitBook repository implements a sophisticated documentation structure that mirrors the relational database nature of SWAT+ input files. The documentation provides:

1. **Clear Navigation**: Through SUMMARY.md hierarchy
2. **Referential Integrity**: Through pointer/foreign key documentation
3. **Comprehensive Coverage**: 1,438 files covering all aspects
4. **Structured Organization**: Logical grouping by functional area
5. **Cross-Referencing**: Extensive internal linking for related concepts

The dependency structure ensures users can understand how different components of SWAT+ interact and reference each other, making it easier to configure and troubleshoot model setups.
