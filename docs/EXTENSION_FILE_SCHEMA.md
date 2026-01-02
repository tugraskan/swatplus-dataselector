# SWAT+ File Schema for VSCode Extension Index

This document provides detailed schema information for SWAT+ TxtInOut input files to support building a relational database-like index for navigation and validation in a VSCode extension.

## Document Structure

For each file type, the following information is provided:
- **Purpose**: What the file defines/contains
- **File Format**: Metadata lines, headers, data row start
- **Primary Key**: Column(s) that uniquely identify rows
- **Foreign Keys**: Columns that reference other files
- **Null/Sentinel Values**: Values to treat as "no reference"
- **Column Schema**: All columns with types and descriptions

---

## 1. Master Configuration Files

### file.cio (Master Input File)

**Purpose**: Master configuration file that references all other input files in the model

**File Format**:
- Title line: Line 1 (descriptive text)
- No header line
- Data starts: Line 2
- Format: One file reference per line

**Primary Key**: None (configuration file)

**Foreign Keys**: All lines reference other files

**Null/Sentinel Values**: N/A

**Schema**:
| Column | Type | Description | FK Reference |
|--------|------|-------------|--------------|
| filename | string | Name of referenced input file | Various files |

---

### codes.bsn (Basin Codes)

**Purpose**: Defines simulation option codes at basin level

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: None (single row configuration)

**Foreign Keys**: None

**Null/Sentinel Values**: 0 = option disabled

**Schema**:
| Column | Type | Description | Default |
|--------|------|-------------|---------|
| pet | integer | PET method code | 0 |
| crack | integer | Crack flow code | 0 |
| rte_cha | integer | Channel routing method | 0 |
| carbon | integer | Carbon cycling code | 0 |
| uhyd | integer | Unit hydrograph method | 0 |
| tiledrain | integer | Tile drainage code | 0 |
| wtable | integer | Water table method | 0 |
| soil_p | integer | Soil P cycling code | 0 |

---

### parameters.bsn (Basin Parameters)

**Purpose**: Basin-level parameter values

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: None (single row)

**Foreign Keys**: None

**Null/Sentinel Values**: 0 may indicate default/inactive

**Schema**: Contains ~50 numeric parameters (sw_init, surq_lag, adj_pkrt, etc.)

---

### object.cnt (Object Counts)

**Purpose**: Specifies number of each object type in the simulation

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: None (configuration)

**Foreign Keys**: None

**Schema**:
| Column | Type | Description |
|--------|------|-------------|
| object_type | string | Type of object (hru, aquifer, channel, etc.) |
| count | integer | Number of objects of this type |

---

### time.sim (Simulation Time)

**Purpose**: Defines simulation period and timestep

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: None

**Foreign Keys**: None

**Schema**:
| Column | Type | Description |
|--------|------|-------------|
| day_start | integer | Starting day |
| yrc_start | integer | Starting year |
| day_end | integer | Ending day |
| yrc_end | integer | Ending year |
| step | integer | Timestep code (0=daily, 1=monthly, 2=yearly) |

---

### print.prt (Print Control)

**Purpose**: Controls output printing options

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: None

**Foreign Keys**: None

---

### object.prt (Object Print Control)

**Purpose**: Specifies which objects to print output for

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: Row number

**Foreign Keys**: 
- obj_typ + obj_typ_no → references object in respective object file (hru, channel, etc.)

**Schema**:
| Column | Type | Description | FK Reference |
|--------|------|-------------|--------------|
| obj_typ | string | Object type (hru, cha, aqu, res, etc.) | Object type |
| obj_typ_no | integer | Object number within type | Object ID in type file |
| hyd_typ | string | Hydrograph type to print | N/A |

---

## 2. Climate Files

### weather-sta.cli (Weather Station Configuration)

**Purpose**: Defines weather stations and links to weather data files

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**:
| Column | References | Target PK |
|--------|-----------|-----------|
| wgn | weather-wgn.cli | name |
| pcp | pcp.cli | name |
| tmp | tmp.cli | name |
| slr | slr.cli | name |
| hmd | hmd.cli | name |
| wnd | wnd.cli | name |
| atmo_dep | atmo.cli | name |

**Null/Sentinel Values**: "null", blank = no data source

**Schema**:
| Column | Type | Description | FK Reference |
|--------|------|-------------|--------------|
| name | string | Weather station name (PK) | - |
| wgn | string | Weather generator file | weather-wgn.cli:name |
| pcp | string | Precipitation file | pcp.cli:name |
| tmp | string | Temperature file | tmp.cli:name |
| slr | string | Solar radiation file | slr.cli:name |
| hmd | string | Humidity file | hmd.cli:name |
| wnd | string | Wind speed file | wnd.cli:name |
| pet | string | PET file | pet.cli:name |
| atmo_dep | string | Atmospheric deposition file | atmo.cli:name |

---

### weather-wgn.cli (Weather Generator)

**Purpose**: Weather generator parameters for each station

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

**Schema**: Contains monthly weather statistics (12 rows of data per station)

---

### pcp.cli, tmp.cli, slr.cli, hmd.cli, wnd.cli (Climate Data File Lists)

**Purpose**: Lists the actual time series data files

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: `filename` → actual .pcp, .tmp, etc. data files

**Schema**:
| Column | Type | Description | FK Reference |
|--------|------|-------------|--------------|
| name | string | Reference name (PK) | - |
| filename | string | Actual data file | Data file |

---

### atmo.cli (Atmospheric Deposition)

**Purpose**: Atmospheric deposition data configuration

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

---

## 3. Spatial Object Files

### hru-data.hru (Hydrologic Response Unit Data)

**Purpose**: Defines HRUs and links to property files

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `id`, `name`

**Foreign Keys**:
| Column | References | Target PK |
|--------|-----------|-----------|
| topo | topography.hyd | name |
| hydro | hydrology.hyd | name |
| soil | soils.sol | name |
| lu_mgt | landuse.lum | name |
| soil_plant_init | soil_plant.ini | name |
| snow | snow.sno | name |
| field | field.fld | name |

**Null/Sentinel Values**: "null", blank = use default

**Schema**:
| Column | Type | Description | FK Reference |
|--------|------|-------------|--------------|
| id | integer | HRU ID (PK) | - |
| name | string | HRU name (PK) | - |
| topo | string | Topography file pointer | topography.hyd:name |
| hydro | string | Hydrology file pointer | hydrology.hyd:name |
| soil | string | Soil file pointer | soils.sol:name |
| lu_mgt | string | Land use/management pointer | landuse.lum:name |
| soil_plant_init | string | Soil-plant init pointer | soil_plant.ini:name |
| surf_stor | string | Surface storage pointer | N/A |
| snow | string | Snow parameters pointer | snow.sno:name |
| field | string | Field characteristics pointer | field.fld:name |

---

### hru-lte.hru (HRU Lite)

**Purpose**: Simplified HRU definition with parameters directly included

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `id`, `name`

**Foreign Keys**: None (self-contained)

**Schema**: Contains ~35 columns with HRU parameters

---

### rout_unit.rtu (Routing Units)

**Purpose**: Defines routing units

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `id`, `name`

**Foreign Keys**:
| Column | References | Target PK |
|--------|-----------|-----------|
| define | rout_unit.def | name |
| topo | topography.hyd | name |
| field | field.fld | name |

**Null/Sentinel Values**: "null" = not defined

**Schema**:
| Column | Type | Description | FK Reference |
|--------|------|-------------|--------------|
| id | integer | Routing unit ID (PK) | - |
| name | string | Routing unit name (PK) | - |
| define | string | Definition file pointer | rout_unit.def:name |
| topo | string | Topography pointer | topography.hyd:name |
| field | string | Field pointer | field.fld:name |

---

### rout_unit.def (Routing Unit Definition)

**Purpose**: Defines elements within routing units

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `id`, `name`

**Foreign Keys**:
| Column | References | Target PK |
|--------|-----------|-----------|
| elements | rout_unit.ele | name |

**Schema**:
| Column | Type | Description | FK Reference |
|--------|------|-------------|--------------|
| id | integer | Definition ID (PK) | - |
| name | string | Definition name (PK) | - |
| elem_tot | integer | Total number of elements | - |
| elements | string | Elements file pointer | rout_unit.ele:name |

---

### rout_unit.ele (Routing Unit Elements)

**Purpose**: Lists objects that make up routing units

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `id`, `name`

**Foreign Keys**:
| Column | References | Target PK |
|--------|-----------|-----------|
| obj_typ + obj_id | Various object files | id in respective file |

**Schema**:
| Column | Type | Description | FK Reference |
|--------|------|-------------|--------------|
| id | integer | Element ID (PK) | - |
| name | string | Element name (PK) | - |
| obj_typ | string | Object type (hru, cha, etc.) | Object type |
| obj_id | integer | Object ID | Object file:id |

---

### ls_unit.def, ls_unit.ele (Landscape Units)

**Purpose**: Similar to routing units but for landscape organization

**File Format**: Same as rout_unit.def/ele

**Primary Key**: `id`, `name`

**Foreign Keys**: Same pattern as routing units

---

## 4. Land Property Files

### soils.sol (Soil Properties)

**Purpose**: Soil property database

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3
- Multi-line format: First line has soil name + layer count, following lines have layer data

**Primary Key**: `name`

**Foreign Keys**: None (database/lookup table)

**Null/Sentinel Values**: 0 may indicate no data

**Schema**:
| Column | Type | Description |
|--------|------|-------------|
| name | string | Soil name (PK) |
| layers | integer | Number of soil layers |
| hyd_grp | string | Hydrologic group |
| dp_tot | real | Total soil depth (mm) |
| anion_excl | real | Anion exclusion fraction |
| perc_crk | real | Crack volume fraction |
| (per layer) texture | string | Soil texture |
| (per layer) dp | real | Layer depth |
| (per layer) bd | real | Bulk density |
| (per layer) awc | real | Available water capacity |
| (per layer) soil_k | real | Saturated hydraulic conductivity |
| (per layer) carbon | real | Organic carbon content |
| (per layer) clay | real | Clay fraction |
| (per layer) silt | real | Silt fraction |
| (per layer) sand | real | Sand fraction |
| (per layer) rock | real | Rock fraction |

---

### nutrients.sol (Soil Nutrients)

**Purpose**: Initial nutrient content in soils

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

**Schema**:
| Column | Type | Description |
|--------|------|-------------|
| name | string | Nutrient profile name (PK) |
| exp_co | real | Exponential coefficient |
| lab_p | real | Labile phosphorus |
| nitrate | real | Nitrate concentration |
| fr_hum_act | real | Fraction of active humic pool |
| hum_c_n | real | Humic C:N ratio |
| hum_c_p | real | Humic C:P ratio |

---

### topography.hyd (Topography)

**Purpose**: Topographic parameters

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

**Schema**:
| Column | Type | Description |
|--------|------|-------------|
| name | string | Topography name (PK) |
| slp | real | Average slope (m/m) |
| slp_len | real | Slope length (m) |
| lat_len | real | Lateral length (m) |
| depos | real | Deposition coefficient |

---

### hydrology.hyd (Hydrology Parameters)

**Purpose**: Hydrologic process parameters

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

**Schema**: Contains ~15 hydrologic parameters (lat_time, lat_sed, can_max, esco, epco, etc.)

---

### snow.sno (Snow Parameters)

**Purpose**: Snow accumulation/melt parameters

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

---

### field.fld (Field Characteristics)

**Purpose**: Field dimensions

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

**Schema**:
| Column | Type | Description |
|--------|------|-------------|
| name | string | Field name (PK) |
| len | real | Field length (m) |
| wd | real | Field width (m) |

---

## 5. Land Use & Management Files

### landuse.lum (Land Use Management)

**Purpose**: Land use types and management references

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**:
| Column | References | Target PK |
|--------|-----------|-----------|
| plnt_com | plant.ini | name |
| mgt | management.sch | name |
| cn2 | cntable.lum | name |
| cons_prac | cons_practice.lum | name |
| ov_mann | ovn_table.lum | name |
| tile | tiledrain.str | name |
| sep | septic.str | name |
| vfs | filterstrip.str | name |
| grww | grassedww.str | name |
| bmp | bmpuser.str | name |
| urban | urban.urb | name |

**Null/Sentinel Values**: "null", blank = not used

**Schema**:
| Column | Type | Description | FK Reference |
|--------|------|-------------|--------------|
| name | string | Land use name (PK) | - |
| cal_grp | string | Calibration group | - |
| plnt_com | string | Plant community pointer | plant.ini:name |
| mgt | string | Management schedule pointer | management.sch:name |
| cn2 | string | Curve number table pointer | cntable.lum:name |
| cons_prac | string | Conservation practice pointer | cons_practice.lum:name |
| urban | string | Urban characteristics pointer | urban.urb:name |
| urb_ro | string | Urban runoff model | - |
| ov_mann | string | Overland Manning's n pointer | ovn_table.lum:name |
| tile | string | Tile drainage pointer | tiledrain.str:name |
| sep | string | Septic system pointer | septic.str:name |
| vfs | string | Filter strip pointer | filterstrip.str:name |
| grww | string | Grassed waterway pointer | grassedww.str:name |
| bmp | string | BMP pointer | bmpuser.str:name |

---

### plant.ini (Plant Community Initialization)

**Purpose**: Initial plant community state

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**:
| Column | References | Target PK |
|--------|-----------|-----------|
| plnt_name | plants.plt | name |

**Schema**:
| Column | Type | Description | FK Reference |
|--------|------|-------------|--------------|
| name | string | Plant community name (PK) | - |
| plnt_cnt | integer | Number of plant types | - |
| rot_yr_ini | integer | Initial rotation year | - |
| plnt_name | string | Plant species name | plants.plt:name |
| lc_status | string | Land cover status | - |
| lai_init | real | Initial LAI | - |
| bm_init | real | Initial biomass | - |
| phu_init | real | Initial PHU | - |
| plnt_pop | real | Plant population | - |
| yrs_init | integer | Years initialized | - |
| rsd_init | real | Initial residue | - |

---

### management.sch (Management Schedule)

**Purpose**: Scheduled management operations

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**:
| Column | References | Target PK |
|--------|-----------|-----------|
| op_data1 (when op_typ=plant) | plants.plt | name |
| op_data1 (when op_typ=harv) | harv.ops | name |
| op_data1 (when op_typ=till) | tillage.til | name |
| op_data1 (when op_typ=fert) | fertilizer.frt | name |
| op_data1 (when op_typ=pest) | pesticide.pes | name |
| op_data1 (when op_typ=irr) | irr.ops | name |
| op_data1 (when op_typ=graze) | graze.ops | name |

**Null/Sentinel Values**: "null" = no operation

**Schema**:
| Column | Type | Description | FK Reference |
|--------|------|-------------|--------------|
| name | string | Schedule name (PK) | - |
| op_typ | string | Operation type (plant, harv, till, fert, pest, irr, graze) | - |
| month | integer | Month of operation | - |
| day | integer | Day of operation | - |
| hu_sch | real | Heat unit schedule | - |
| op_data1 | string | Operation-specific data (often FK) | Various operation files |
| op_data2 | real | Additional operation data | - |
| op_data3 | real | Additional operation data | - |

---

### cntable.lum (Curve Number Table)

**Purpose**: Curve numbers by hydrologic group

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

**Schema**:
| Column | Type | Description |
|--------|------|-------------|
| name | string | CN table name (PK) |
| cn_a | integer | Curve number for group A |
| cn_b | integer | Curve number for group B |
| cn_c | integer | Curve number for group C |
| cn_d | integer | Curve number for group D |

---

### cons_practice.lum (Conservation Practices)

**Purpose**: Conservation practice factors

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

---

### ovn_table.lum (Overland Manning's n)

**Purpose**: Manning's n values for overland flow

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

---

### lum.dtl (Land Use Decision Table)

**Purpose**: Decision table for land use management

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3
- Multi-line format with conditions and actions

**Primary Key**: Composite (var + condition)

**Foreign Keys**: References vary by action type

---

### scen_lu.dtl (Land Use Scenario)

**Purpose**: Land use change scenarios

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: Row number

**Foreign Keys**: References landuse.lum

---

## 6. Management Operations Files

### harv.ops (Harvest Operations)

**Purpose**: Harvest operation definitions

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

**Schema**:
| Column | Type | Description |
|--------|------|-------------|
| name | string | Harvest operation name (PK) |
| harv_typ | string | Harvest type |
| harv_idx | real | Harvest index |
| harv_eff | real | Harvest efficiency |
| harv_bm_min | real | Minimum biomass to harvest |

---

### graze.ops (Grazing Operations)

**Purpose**: Grazing operation definitions

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**:
| Column | References | Target PK |
|--------|-----------|-----------|
| fertname | fertilizer.frt | name |

**Schema**:
| Column | Type | Description | FK Reference |
|--------|------|-------------|--------------|
| name | string | Graze operation name (PK) | - |
| fertname | string | Manure fertilizer type | fertilizer.frt:name |
| bm_eat | real | Biomass eaten fraction | - |
| bm_tramp | real | Biomass trampled fraction | - |
| man_amt | real | Manure amount | - |
| grz_bm_min | real | Minimum biomass for grazing | - |

---

### irr.ops (Irrigation Operations)

**Purpose**: Irrigation operation definitions

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

---

### chem_app.ops (Chemical Application)

**Purpose**: Chemical/fertilizer/pesticide application operations

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

---

### fire.ops (Fire/Burning Operations)

**Purpose**: Fire operation definitions

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

---

### sweep.ops (Street Sweeping)

**Purpose**: Urban street sweeping operations

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

---

## 7. Structural Practice Files

### tiledrain.str (Tile Drainage)

**Purpose**: Tile drainage system parameters

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

**Schema**:
| Column | Type | Description |
|--------|------|-------------|
| name | string | Tile drain name (PK) |
| dp | real | Drain depth (mm) |
| t_fc | real | Time to drain to field capacity (hrs) |
| lag | real | Lag time (hrs) |
| rad | real | Drain tile radius (mm) |
| dist | real | Distance between drains (m) |
| drain | real | Drainage coefficient (mm/day) |
| pump | integer | Pump flag (0=gravity, 1=pump) |
| lat_ksat | real | Lateral saturated hydraulic conductivity |

---

### filterstrip.str (Filter Strips)

**Purpose**: Filter strip parameters

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

---

### grassedww.str (Grassed Waterways)

**Purpose**: Grassed waterway parameters

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

---

### bmpuser.str (Best Management Practices)

**Purpose**: User-defined BMP efficiency factors

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

**Schema**:
| Column | Type | Description |
|--------|------|-------------|
| name | string | BMP name (PK) |
| sed_eff | real | Sediment removal efficiency |
| ptlp_eff | real | Particulate P removal efficiency |
| solp_eff | real | Soluble P removal efficiency |
| ptln_eff | real | Particulate N removal efficiency |
| soln_eff | real | Soluble N removal efficiency |
| bact_eff | real | Bacteria removal efficiency |

---

### septic.str (Septic Systems)

**Purpose**: Septic system configuration and biozone parameters

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

**Schema**: Contains ~25 parameters for septic system modeling

---

## 8. Database/Lookup Files

### plants.plt (Plant Database)

**Purpose**: Plant species properties database

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None (terminal lookup table)

**Null/Sentinel Values**: 0 = not applicable/default

**Schema**: Contains ~50 plant growth parameters (plnt_typ, days_mat, bm_e, harv_idx, lai_pot, etc.)

---

### fertilizer.frt (Fertilizer Database)

**Purpose**: Fertilizer composition database

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None (terminal lookup table)

**Schema**:
| Column | Type | Description |
|--------|------|-------------|
| name | string | Fertilizer name (PK) |
| min_n | real | Mineral N content (kg N/kg) |
| min_p | real | Mineral P content (kg P/kg) |
| org_n | real | Organic N content (kg N/kg) |
| org_p | real | Organic P content (kg P/kg) |
| nh3_n | real | Ammonia N content (kg N/kg) |

---

### pesticide.pes (Pesticide Database)

**Purpose**: Pesticide properties database

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None (terminal lookup table)

**Schema**: Contains ~15 pesticide fate/transport parameters (soil_ads, frac_wash, hl_foliage, hl_soil, solub, etc.)

---

### tillage.til (Tillage Database)

**Purpose**: Tillage operation effects database

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None (terminal lookup table)

**Schema**:
| Column | Type | Description |
|--------|------|-------------|
| name | string | Tillage name (PK) |
| mix_eff | real | Mixing efficiency |
| mix_dp | real | Mixing depth (mm) |

---

### urban.urb (Urban Characteristics)

**Purpose**: Urban area characteristics database

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None (terminal lookup table)

**Schema**: Contains ~10 urban parameters (frac_imp, frac_dc_imp, curb_den, urb_wash, etc.)

---

### septic.sep (Septic Effluent)

**Purpose**: Septic system effluent characteristics

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None (terminal lookup table)

**Schema**:
| Column | Type | Description |
|--------|------|-------------|
| name | string | Septic type name (PK) |
| q_rate | real | Flow rate (m3/day) |
| bod | real | BOD concentration (mg/L) |
| tss | real | TSS concentration (mg/L) |
| nh4_n | real | Ammonium N (mg/L) |
| no3_n | real | Nitrate N (mg/L) |
| no2_n | real | Nitrite N (mg/L) |
| org_n | real | Organic N (mg/L) |
| min_p | real | Mineral P (mg/L) |
| org_p | real | Organic P (mg/L) |
| fcoli | real | Fecal coliform (cfu/100mL) |

---

## 9. Water Body Files

### aquifer.aqu (Aquifer Definition)

**Purpose**: Defines aquifers and links to initialization

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `id`, `name`

**Foreign Keys**:
| Column | References | Target PK |
|--------|-----------|-----------|
| aqu_init | initial.aqu | name |

**Null/Sentinel Values**: "null" = no initialization

**Schema**:
| Column | Type | Description | FK Reference |
|--------|------|-------------|--------------|
| id | integer | Aquifer ID (PK) | - |
| name | string | Aquifer name (PK) | - |
| aqu_init | string | Initialization file pointer | initial.aqu:name |
| gw_flo | real | Initial groundwater flow (mm) | - |
| dep_bot | real | Depth to aquifer bottom (m) | - |
| dep_wt | real | Depth to water table (m) | - |
| no3_n | real | NO3-N concentration (ppm) | - |
| sol_p | real | Mineral P concentration (mg/L) | - |
| carbon | real | Organic carbon (%) | - |
| flo_dist | real | Flow distribution factor | - |
| flo_max | real | Maximum flow (mm/day) | - |
| alpha_bf | real | Baseflow alpha factor | - |
| revap | real | Revap coefficient | - |
| rchg_dp | real | Deep recharge fraction | - |
| spec_yld | real | Specific yield | - |
| hl_no3n | real | NO3-N half-life (days) | - |
| flo_min | real | Minimum flow (mm/day) | - |
| revap_min | real | Minimum revap depth (m) | - |

---

### initial.aqu (Aquifer Initialization)

**Purpose**: Initial conditions for aquifers

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**:
| Column | References | Target PK |
|--------|-----------|-----------|
| org_min | om_water.ini | name |
| pest | pest_water.ini | name |
| path | path_water.ini | name |
| hmet | hmet_water.ini | name |
| salt | salt_water.ini | name |

**Null/Sentinel Values**: "null", blank = no constituent

**Schema**:
| Column | Type | Description | FK Reference |
|--------|------|-------------|--------------|
| name | string | Initialization name (PK) | - |
| org_min | string | Organic-mineral init pointer | om_water.ini:name |
| pest | string | Pesticide init pointer | pest_water.ini:name |
| path | string | Pathogen init pointer | path_water.ini:name |
| hmet | string | Heavy metal init pointer | hmet_water.ini:name |
| salt | string | Salt init pointer | salt_water.ini:name |

---

### channel.cha (Channel Definition)

**Purpose**: Defines stream/river channels

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `id`, `name`

**Foreign Keys**:
| Column | References | Target PK |
|--------|-----------|-----------|
| init | initial.cha | name |
| hyd | hydrology.cha | name |
| sed | sediment.cha | name |
| nut | nutrients.cha | name |

**Null/Sentinel Values**: "null" = not defined

**Schema**:
| Column | Type | Description | FK Reference |
|--------|------|-------------|--------------|
| id | integer | Channel ID (PK) | - |
| name | string | Channel name (PK) | - |
| init | string | Initialization pointer | initial.cha:name |
| hyd | string | Hydrology pointer | hydrology.cha:name |
| sed | string | Sediment pointer | sediment.cha:name |
| nut | string | Nutrient pointer | nutrients.cha:name |

---

### initial.cha (Channel Initialization)

**Purpose**: Initial conditions for channels

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**:
| Column | References | Target PK |
|--------|-----------|-----------|
| org_min | om_water.ini | name |
| pest | pest_water.ini | name |
| path | path_water.ini | name |
| hmet | hmet_water.ini | name |
| salt | salt_water.ini | name |

**Schema**: Same as initial.aqu

---

### hydrology.cha (Channel Hydrology)

**Purpose**: Channel hydraulic parameters

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

**Schema**: Contains ~15 hydraulic parameters (order, width, depth, slope, manning's n, etc.)

---

### sediment.cha (Channel Sediment)

**Purpose**: Channel sediment transport parameters

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

---

### nutrients.cha (Channel Nutrients)

**Purpose**: In-stream nutrient process parameters

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

**Schema**: Contains ~40 nutrient cycling parameters

---

### reservoir.res (Reservoir Definition)

**Purpose**: Defines reservoirs/ponds

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `id`, `name`

**Foreign Keys**:
| Column | References | Target PK |
|--------|-----------|-----------|
| init | initial.res | name |
| hyd | hydrology.res | name |
| rel | weir.res or res_rel.dtl | name |
| sed | sediment.res | name |
| nut | nutrients.res | name |

**Null/Sentinel Values**: "null" = not defined

**Schema**:
| Column | Type | Description | FK Reference |
|--------|------|-------------|--------------|
| id | integer | Reservoir ID (PK) | - |
| name | string | Reservoir name (PK) | - |
| init | string | Initialization pointer | initial.res:name |
| hyd | string | Hydrology pointer | hydrology.res:name |
| rel | string | Release structure pointer | weir.res:name or res_rel.dtl |
| sed | string | Sediment pointer | sediment.res:name |
| nut | string | Nutrient pointer | nutrients.res:name |

---

### initial.res (Reservoir Initialization)

**Purpose**: Initial conditions for reservoirs

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**:
| Column | References | Target PK |
|--------|-----------|-----------|
| org_min | om_water.ini | name |
| pest | pest_water.ini | name |
| salt | salt_water.ini | name |

**Schema**: Similar to initial.aqu

---

### hydrology.res (Reservoir Hydrology)

**Purpose**: Reservoir hydraulic parameters

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

---

### sediment.res (Reservoir Sediment)

**Purpose**: Reservoir sediment parameters

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

---

### nutrients.res (Reservoir Nutrients)

**Purpose**: Reservoir nutrient parameters

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

---

### weir.res (Weir/Outlet Structure)

**Purpose**: Weir outlet structure parameters

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

---

### res_rel.dtl (Reservoir Release Decision Table)

**Purpose**: Decision table for reservoir releases

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3
- Multi-line format with conditions and actions

**Primary Key**: Composite (condition set)

**Foreign Keys**: None

---

### wetland.wet (Wetland Definition)

**Purpose**: Defines wetlands

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `id`, `name`

**Foreign Keys**: Similar to reservoir.res (init, hyd, rel, sed, nut pointers)

**Schema**: Similar to reservoir.res

---

### hydrology.wet (Wetland Hydrology)

**Purpose**: Wetland hydraulic parameters

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

---

## 10. Initialization/Constituent Files

### om_water.ini (Organic-Mineral in Water)

**Purpose**: Initial organic matter and mineral concentrations in water bodies

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None (terminal initialization data)

**Null/Sentinel Values**: 0 = no concentration

**Schema**:
| Column | Type | Description |
|--------|------|-------------|
| name | string | OM initialization name (PK) |
| vol | real | Initial volume (m3) |
| sed | real | Sediment concentration (mg/L) |
| part_n | real | Particulate N (mg/L) |
| part_p | real | Particulate P (mg/L) |
| no3 | real | Nitrate concentration (mg/L) |
| solp | real | Soluble P concentration (mg/L) |
| chl_a | real | Chlorophyll a (μg/L) |
| nh3 | real | Ammonia concentration (mg/L) |
| no2 | real | Nitrite concentration (mg/L) |
| cbn_bod | real | Carbonaceous BOD (mg/L) |
| dis_ox | real | Dissolved oxygen (mg/L) |
| sand | real | Sand concentration (mg/L) |
| silt | real | Silt concentration (mg/L) |
| clay | real | Clay concentration (mg/L) |
| sm_ag | real | Small aggregate concentration (mg/L) |
| l_ag | real | Large aggregate concentration (mg/L) |
| gvl | real | Gravel concentration (mg/L) |
| tmp | real | Temperature (°C) |

---

### pest_water.ini (Pesticide in Water)

**Purpose**: Initial pesticide concentrations in water bodies

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None (terminal initialization data)

**Null/Sentinel Values**: 0 = no pesticide

**Schema**:
| Column | Type | Description |
|--------|------|-------------|
| name | string | Pesticide init name (PK) |
| (per pesticide) name | string | Pesticide name |
| (per pesticide) water | real | Concentration in water (mg/L) |
| (per pesticide) benthic | real | Concentration in sediment (mg/kg) |

---

### pest_hru.ini (Pesticide on HRU)

**Purpose**: Initial pesticide on land

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

---

### salt_water.ini (Salt in Water)

**Purpose**: Initial salt concentrations in water bodies

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None (terminal initialization data)

**Null/Sentinel Values**: 0 = no salt

---

### salt_hru.ini (Salt on HRU)

**Purpose**: Initial salt on land

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

---

### soil_plant.ini (Soil-Plant Initialization)

**Purpose**: Initial soil and plant conditions for HRUs

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**:
| Column | References | Target PK |
|--------|-----------|-----------|
| nutrients | nutrients.sol | name |
| pest | pest_hru.ini | name |
| salt | salt_hru.ini | name |

**Schema**:
| Column | Type | Description | FK Reference |
|--------|------|-------------|--------------|
| name | string | Initialization name (PK) | - |
| sw_frac | real | Initial soil water fraction | - |
| nutrients | string | Soil nutrients pointer | nutrients.sol:name |
| pest | string | Pesticide pointer | pest_hru.ini:name |
| salt | string | Salt pointer | salt_hru.ini:name |

---

### path_water.ini (Pathogen in Water)

**Purpose**: Initial pathogen concentrations

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

---

### hmet_water.ini (Heavy Metals in Water)

**Purpose**: Initial heavy metal concentrations

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

---

## 11. Connectivity Files

### hru.con (HRU Connectivity)

**Purpose**: Connects HRUs to weather stations, aquifers, and outlet objects

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `id`

**Foreign Keys**:
| Column | References | Target PK |
|--------|-----------|-----------|
| name (optional) | hru-data.hru | name |
| wst | weather-sta.cli | name |
| cst | constituents.cs | name |
| aqu | aquifer.aqu | id |
| obj_typ + obj_id | Various object files | id |

**Null/Sentinel Values**: 0 = no connection, "null" = not connected

**Schema**:
| Column | Type | Description | FK Reference |
|--------|------|-------------|--------------|
| id | integer | Connection ID (PK) | - |
| name | string | HRU name (optional FK) | hru-data.hru:name |
| gis_id | integer | GIS identifier | - |
| area | real | Area (ha) | - |
| lat | real | Latitude | - |
| lon | real | Longitude | - |
| elev | real | Elevation (m) | - |
| hru | integer | HRU object number | hru-data.hru:id |
| wst | string | Weather station | weather-sta.cli:name |
| cst | string | Constituents | constituents.cs:name |
| ovfl | integer | Overflow land object | - |
| rule | string | Decision table | - |
| out_tot | integer | Number of outlets | - |
| obj_typ | string | Outlet object type (cha, aqu, res, etc.) | Object type |
| obj_id | integer | Outlet object ID | Object file:id |
| hyd_typ | string | Hydrograph type | - |
| frac | real | Flow fraction | - |

---

### aquifer.con (Aquifer Connectivity)

**Purpose**: Connects aquifers to HRUs and channels

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `id`

**Foreign Keys**:
| Column | References | Target PK |
|--------|-----------|-----------|
| aqu (optional) | aquifer.aqu | id |
| obj_typ + obj_id | Various object files | id |

**Schema**: Similar to hru.con

---

### channel.con (Channel Connectivity)

**Purpose**: Connects channels to each other and outlets

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `id`

**Foreign Keys**:
| Column | References | Target PK |
|--------|-----------|-----------|
| cha (optional) | channel.cha | id |
| obj_typ + obj_id | Various object files | id |

**Schema**: Similar to hru.con

---

### reservoir.con (Reservoir Connectivity)

**Purpose**: Connects reservoirs to inlet/outlet objects

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `id`

**Foreign Keys**:
| Column | References | Target PK |
|--------|-----------|-----------|
| res (optional) | reservoir.res | id |
| obj_typ + obj_id | Various object files | id |

**Schema**: Similar to hru.con

---

### wetland.con (Wetland Connectivity)

**Purpose**: Connects wetlands to inlet/outlet objects

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `id`

**Foreign Keys**: Similar to reservoir.con

---

### recall.con (Recall Point Connectivity)

**Purpose**: Connects recall/point source objects

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `id`

**Foreign Keys**:
| Column | References | Target PK |
|--------|-----------|-----------|
| rec (optional) | recall.rec | id |
| obj_typ + obj_id | Various object files | id |

---

### aqu_cha.lin (Aquifer-Channel Direct Links)

**Purpose**: Direct connections between aquifers and channels (alternative to aquifer.con)

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: Row number

**Foreign Keys**:
| Column | References | Target PK |
|--------|-----------|-----------|
| aqu_id | aquifer.aqu | id |
| cha_id | channel.cha | id |

**Schema**:
| Column | Type | Description | FK Reference |
|--------|------|-------------|--------------|
| aqu_id | integer | Aquifer ID | aquifer.aqu:id |
| cha_id | integer | Channel ID | channel.cha:id |
| frac | real | Flow fraction | - |

---

### chan_surf.lin (Channel-Surface Direct Links)

**Purpose**: Direct connections between channels and surface objects

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: Row number

**Foreign Keys**:
| Column | References | Target PK |
|--------|-----------|-----------|
| cha_id | channel.cha | id |
| obj_typ + obj_id | Various object files | id |

---

### flo_con.dtl (Flow Connection Details)

**Purpose**: Detailed flow routing connections with decision logic

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: Row number

**Foreign Keys**: obj_typ + obj_id references

---

## 12. Point Source & Inlet Files

### recall.rec (Recall/Point Source Definition)

**Purpose**: Defines point sources and inlets

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `id`

**Foreign Keys**:
| Column | References | Target PK |
|--------|-----------|-----------|
| file | Time series data files | filename |

**Schema**:
| Column | Type | Description | FK Reference |
|--------|------|-------------|--------------|
| id | integer | Recall point ID (PK) | - |
| rec_typ | string | Recall type (point source, inlet, etc.) | - |
| file | string | Time series data file | Data file |

---

### constituents.cs (Constituents)

**Purpose**: Constituent sets for water quality tracking

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: `name`

**Foreign Keys**: None

---

## 13. Calibration Files

### calibration.cal (Calibration Definition)

**Purpose**: Defines calibration parameters and objects

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: Row number

**Foreign Keys**: obj_typ + obj_id references

---

### cal_parms.cal (Calibration Parameters)

**Purpose**: List of parameters to calibrate

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: Row number

**Foreign Keys**: None

---

### codes.sft (Soft Calibration Codes)

**Purpose**: Options for soft calibration

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: None (configuration)

**Foreign Keys**: None

---

### water_balance.sft (Water Balance Soft Data)

**Purpose**: Observed water balance targets

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: obj_typ + obj_id

**Foreign Keys**: obj_typ + obj_id references

---

### wb_parms.sft (Water Balance Parameters)

**Purpose**: Parameters for water balance calibration

**File Format**:
- Title line: Line 1
- Header line: Line 2
- Data starts: Line 3

**Primary Key**: Parameter name

**Foreign Keys**: None

---

## General File Format Rules

### Standard SWAT+ File Structure

Most SWAT+ input files follow this pattern:

```
Line 1: Title/description line (ignored by model)
Line 2: Column headers
Line 3+: Data rows
```

### Common Patterns

1. **Metadata Line**: Line 1 is always descriptive text
2. **Header Line**: Line 2 contains column names
3. **Data Start**: Line 3 begins data rows
4. **Multi-line Records**: Some files (soils.sol, plants.plt in plant.ini) have records spanning multiple lines
5. **Decision Tables**: Files ending in .dtl have condition-action pairs across multiple lines

### Null/Sentinel Value Handling

| Value | Meaning | Context |
|-------|---------|---------|
| "null" | No reference | Foreign key fields |
| blank/empty | No reference | String foreign keys |
| 0 | No reference OR default | Integer foreign keys, flags |
| 0.0 | Default value | Numeric parameters |
| -999 | Missing data | Some numeric fields |

### Special Considerations

1. **Case Sensitivity**: File names and pointers are case-insensitive in SWAT+ but recommend consistent casing
2. **Whitespace**: Tab or space delimited; multiple spaces treated as single delimiter
3. **Comments**: Lines starting with `!` are comments (rare in input files)
4. **Name Matching**: Foreign key lookups match on name field (string comparison)
5. **ID Matching**: Integer ID lookups require exact match

---

## Quick Reference: File Categories

### Terminal Files (No FKs Out)
- plants.plt
- fertilizer.frt
- pesticide.pes
- tillage.til
- urban.urb
- septic.sep
- om_water.ini
- pest_water.ini
- salt_water.ini
- nutrients.sol
- topography.hyd
- hydrology.hyd
- snow.sno
- field.fld
- cntable.lum
- cons_practice.lum
- ovn_table.lum
- All .ops files (harv, graze, irr, etc.)
- All .str files (tiledrain, filterstrip, etc.)
- hydrology.cha/res/wet
- sediment.cha/res
- nutrients.cha/res

### Hub Files (Many FKs Out)
- hru-data.hru (7+ FKs)
- landuse.lum (8+ FKs)
- weather-sta.cli (7+ FKs)
- reservoir.res (4-5 FKs)
- channel.cha (4 FKs)
- aquifer.aqu (1 FK but critical)
- initial.aqu/res/cha (5 FKs each)

### Connectivity Files (Link Objects)
- hru.con
- aquifer.con
- channel.con
- reservoir.con
- wetland.con
- recall.con
- aqu_cha.lin
- chan_surf.lin
- flo_con.dtl

### Configuration Files (Global Settings)
- file.cio
- codes.bsn
- parameters.bsn
- object.cnt
- time.sim
- print.prt
- object.prt

---

## Extension Implementation Notes

### Index Building Strategy

1. **Parse Order**:
   - Start with terminal files (databases, lookups)
   - Then property files (soils, hydrology, etc.)
   - Then object files (HRUs, channels, etc.)
   - Then connectivity files
   - Finally configuration files

2. **Primary Key Extraction**:
   - Most files: `id` and/or `name` column
   - Connectivity files: `id` only
   - Configuration files: may not have PK

3. **Foreign Key Resolution**:
   - String FKs: Look up by name in target file
   - Integer FKs: Look up by id in target file
   - Composite FKs: obj_typ + obj_id requires dynamic lookup based on obj_typ

4. **Null Handling**:
   - Check for "null", blank, empty string
   - Context-dependent: 0 may be null or valid value
   - Provide configuration for null values per file/column

5. **Line Range Tracking**:
   - Store (file, start_line, end_line) for each record
   - Critical for multi-line records (soils, decision tables)
   - Enables Peek and Go to Definition features

6. **Diagnostic Generation**:
   - Unresolved FK: value present but target not found
   - Invalid FK: value doesn't match type (e.g., non-integer where integer expected)
   - Missing required FK: blank where required
   - Circular reference: follow FK chain back to origin

### Suggested Index Schema

```typescript
interface FileRecord {
  file: string;           // Source file path
  lineStart: number;      // Starting line (1-based)
  lineEnd: number;        // Ending line (inclusive)
  primaryKey: {           // May have multiple PK columns
    [column: string]: string | number;
  };
  foreignKeys: {
    column: string;
    value: string | number;
    targetFile: string;
    targetColumn: string;
    resolved: boolean;    // Whether FK resolves to existing record
  }[];
}

interface FileSchema {
  file: string;
  titleLine: number;      // Usually 1
  headerLine: number;     // Usually 2
  dataStartLine: number;  // Usually 3
  columns: {
    name: string;
    type: 'string' | 'integer' | 'real';
    isPrimaryKey: boolean;
    foreignKey?: {
      targetFile: string;
      targetColumn: string;
    };
  }[];
  nullValues: string[];   // Values to treat as null
  multilineRecord: boolean; // Whether records span multiple lines
}
```

---

## Document Version

- **Version**: 1.0
- **Date**: 2026-01-02
- **Based on**: GitBook dependency analysis of 1,439 documentation files
- **Purpose**: VSCode extension index building for SWAT+ TxtInOut files

For questions or additions, refer to the source GitBook documentation or the dependency analysis files in this repository.
