# SWAT+ Input Files Structure

This document provides a comprehensive overview of all SWAT+ input files, including:
- **Column Order**: The sequential position of each field in the file
- **Field Name**: The name of the column/field
- **Description**: Brief description or notes about the field (if available)
- **Type**: Data type (integer, real, string)
- **Unit**: The unit of measurement for the field
- **Default**: Default value (if applicable)
- **Range**: Valid range of values (if applicable)
- **PK**: Primary Key indicator (✓ if this field is a primary key)
- **FK**: Foreign Key indicator (✓ if this field references another table)
- **Pointer**: File Pointer indicator (✓ if this field points to another file)
- **Points To**: The target file name for pointers/FK fields
- **Referenced By**: Which field/file references this PK field
- **Metadata Structure**: Indicates if file follows standard format (Line 1: Title, Line 2: Header, Line 3+: Data) or has non-standard structure

## Files with Special Structures

Some files have a multi-row or multi-part structure that differs from the standard single-row-per-record format. These files are marked with **⚠️ SPECIAL STRUCTURE** and include:

- **atmo.cli** ⚠️
- **weather-wgn.cli** ⚠️
- **lum.dtl** ⚠️
- **management.sch** ⚠️
- **plant.ini** ⚠️
- **soils.sol** ⚠️
- **water_allocation.wro** ⚠️

## Table of Contents

- [Aquifers](#aquifers)
- [Basin 1](#basin-1)
- [Calibration](#calibration)
- [Channels](#channels)
- [Climate](#climate)
- [Connectivity](#connectivity)
- [Constituents](#constituents)
- [Databases](#databases)
- [Hydrologic Response Units](#hydrologic-response-units)
- [Hydrology](#hydrology)
- [Landscape Units](#landscape-units)
- [Landuse And Management](#landuse-and-management)
- [Management Practices](#management-practices)
- [Nutrient Initialization](#nutrient-initialization)
- [Point Sources And Inlets](#point-sources-and-inlets)
- [Reservoirs](#reservoirs)
- [Routing Units](#routing-units)
- [Simulation Settings](#simulation-settings)
- [Soils](#soils)
- [Structural Practices](#structural-practices)
- [Water Allocation](#water-allocation)
- [Wetlands](#wetlands)

---

## Aquifers

### Aquifers

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

*No column information available.*

### aquifer.aqu
**Description:** This file contains the general physical and chemical aquifer properties.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | id | ID of the aquifer | integer | n/a | N/A | N/A | ✓ |  |  |  | aqu in aquifer.con |
| 2 | name | Name of the aquifer | string | n/a | n/a | n/a |  |  |  |  |  |
| 3 | aqu_init | Pointer to the aquifer initialization file | string | n/a | n/a | n/a |  | ✓ | ✓ | initial.aqu |  |
| 4 | gw_flo | Initial groundwater flow | real | mm | 0.05 | 0-2 |  |  |  |  |  |
| 5 | dep_bot | Depth from mid-slope surface to bottom of aquifer | real | m | 10.0 | 0-10 |  |  |  |  |  |
| 6 | dep_wt | Depth from mid-slope surface to initial water table | real | m | 10.0 | 0-10 |  |  |  |  |  |
| 7 | no3_n | NO3-N concentration in aquifer | real | ppm NO3-N | 0 | 0-1000 |  |  |  |  |  |
| 8 | sol_p | Mineral P concentration in aquifer | real | mg P/L | 0 | 0-1000 |  |  |  |  |  |
| 9 | carbon | Organic carbon in aquifer | real | percent | 0.50 | 0-15 |  |  |  |  |  |
| 10 | flo_dist | Average flow distance to stream or object | real | m | 50.0 | 0-1000 |  |  |  |  |  |
| 11 | flo_max | Baseflow rate at which all streams linked to an aquifer receive groundwater flow | real | mm | 1.0 | 0-2 |  |  |  |  |  |
| 12 | alpha_bf | Alpha factor for groundwater recession curve | real | 1/days | 0.05 | 0-1 |  |  |  |  |  |
| 13 | revap | Groundwater revap coefficient | real | fraction | 0 | 0-1 |  |  |  |  |  |
| 14 | rchg_dp | Recharge to deep aquifer | real | fraction | 0 | 0-1 |  |  |  |  |  |
| 15 | spec_yld | Specific yield of the  aquifer | real | m^3/m^3 | 0 | 0-0.40 |  |  |  |  |  |
| 16 | hl_no3 | Half-life of NO3-N in the aquifer | real | days | 0 | 0-200 |  |  |  |  |  |
| 17 | flo_min | Threshold depth from surface to water table for groundwater flow to occur | real | m | 3 | 0-10 |  |  |  |  |  |
| 18 | revap_min | Threshold depth from surface to water table for revap to occur | real | m | 5 | 0-10 |  |  |  |  |  |

### initial.aqu
**Description:** >-

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the aquifer initialization record | string | N/A | N/A | N/A | ✓ |  |  |  | aqu_init in aquifer.aqu |
| 2 | org_min | Pointer to the organic-mineral initialization file | string | N/A | N/A | N/A |  | ✓ | ✓ | om_water.ini |  |
| 3 | pest | Pointer to the pesticide initialization file | string | N/A | N/A | N/A |  | ✓ | ✓ | pest_water.ini |  |
| 4 | path | Currently not used | string | N/A | N/A | N/A |  |  | ✓ |  |  |
| 5 | hmet | Currently not used | string | N/A | N/A | N/A |  |  | ✓ |  |  |
| 6 | salt | Pointer to the salt initialization file | string | N/A | N/A | N/A |  |  | ✓ |  |  |

## Basin 1

### Basin

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

*No column information available.*

### codes.bsn
**Description:** This file contains control codes for the simulation of basin-level processes.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | pet_file | Currently not used | string | N/A | N/A | N/A |  |  |  |  |  |
| 2 | wq_file | Currently not used | string | N/A | N/A | N/A |  |  |  |  |  |
| 3 | pet | Potential Evapotranspiration (PET) method | integer | N/A | N/A | N/A |  |  |  |  |  |
| 4 | event | Currently not used | integer | N/A | N/A | N/A |  |  |  |  |  |
| 5 | crack | Crack flow | integer | N/A | N/A | N/A |  |  |  |  |  |
| 6 | swift_out | Writing of input file for SWIFT | integer | N/A | N/A | N/A |  |  |  |  |  |
| 7 | sed_det | Currently not used | integer | N/A | N/A | N/A |  |  |  |  |  |
| 8 | rte_cha | Channel routing | integer | N/A | N/A | N/A |  |  |  |  |  |
| 9 | deg_cha | Currently not used | integer | N/A | N/A | N/A |  |  |  |  |  |
| 10 | wq_cha | Currently not used | integer | N/A | N/A | N/A |  |  |  |  |  |
| 11 | nostress | Turning off of plant stress | integer | N/A | N/A | N/A |  |  |  |  |  |
| 12 | cn | Currently not used | integer | N/A | N/A | N/A |  |  |  |  |  |
| 13 | c_fact | Currently not used | integer | N/A | N/A | N/A |  |  |  |  |  |
| 14 | carbon | Carbon routine | integer | N/A | N/A | N/A |  |  |  |  |  |
| 15 | lapse | Precipitation and temperature lapse rate control | integer | N/A | N/A | N/A |  |  |  |  |  |
| 16 | uhyd | Unit Hydrograph method | integer | N/A | N/A | N/A |  |  |  |  |  |
| 17 | sed_cha | Currently not used | integer | N/A | N/A | N/A |  |  |  |  |  |
| 18 | tiledrain | Tile drainage equation code | integer | N/A | N/A | N/A |  |  |  |  |  |
| 19 | wtable | Water table depth algorithms | integer | N/A | N/A | N/A |  |  |  |  |  |
| 20 | soil_p | Soil phosphorus model | integer | N/A | N/A | N/A |  |  |  |  |  |
| 21 | gampt | Surface runoff method | integer | N/A | N/A | N/A |  |  |  |  |  |
| 22 | atmo_dep | Currently not used | string | N/A | N/A | N/A |  |  |  |  |  |
| 23 | stor_max | Currently not used | integer | N/A | N/A | N/A |  |  |  |  |  |
| 24 | qual2e | Instream nutrient routing method | integer | N/A | N/A | N/A |  |  |  |  |  |
| 25 | gwflow | Flood routing | integer | N/A | N/A | N/A |  |  |  |  |  |

### parameters.bsn
**Description:** This file contains basin-level parameters.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | lai_noevap | Currently not used | real |  |  |  |  |  |  |  |  |
| 2 | sw_init | Initial soil water storage expressed as a fraction of field capacity water content | real |  | 0 | 0-1 |  |  |  |  |  |
| 3 | surq_lag | Surface runoff lag coefficient | real |  | 4 | 1-24 |  |  |  |  |  |
| 4 | adj_pkrt | Peak rate adjustment factor for sediment routing in the subbasin (tributary channels) | real |  | 1 | 0.5-2 |  |  |  |  |  |
| 5 | prf | Peak rate adjustment factor for sediment routing in the main channel | real |  | 1 | 0-2 |  |  |  |  |  |
| 6 | lin_sed | Currently not used | real |  |  |  |  |  |  |  |  |
| 7 | exp_sed | Currently not used | real |  |  |  |  |  |  |  |  |
| 8 | orgn_min | Rate factor for humus mineralization of active organic nutrients (N and P) | real |  | 0.0003 | 0.001-0.003 |  |  |  |  |  |
| 9 | n_uptake | Nitrogen uptake distribution parameter | real |  | 20 | 0-100 |  |  |  |  |  |
| 10 | p_uptake | Phosphorus uptake distribution parameter | real |  | 20 | 0-100 |  |  |  |  |  |
| 11 | n_perc | Nitrate percolation coefficient | real |  | 0.2 | 0-1 |  |  |  |  |  |
| 12 | p_perc | Phosphorus percolation coefficient | real | 10m^3/M | 10 | 10-17.5 |  |  |  |  |  |
| 13 | p_soil | Phosphorus soil partitioning coefficient | real | m^3/Mg | 175 | 100-200 |  |  |  |  |  |
| 14 | p_avail | Phosphorus availability index | real |  | 0.4 | 0.01-0.7 |  |  |  |  |  |
| 15 | rsd_decomp | Residue decomposition coefficient | real |  | 0.05 | 0.02-0.1 |  |  |  |  |  |
| 16 | pest_perc | Pesticide percolation coefficient | real |  | 0.5 | 0-1 |  |  |  |  |  |
| 17 | msk_co1 | Coefficient to control the impact of the storage time constant for normal flow on the overall storage time constant for the channel | real |  | 0.75 | 0-10 |  |  |  |  |  |
| 18 | msk_co2 | Coefficient to control the impact of the storage time constant for low flow on the overall storage time constant for the channel | real |  | 0.25 | 0-10 |  |  |  |  |  |
| 19 | msk_x | Weighting factor control relative importance of inflow rate and outflow rate in determining storage on reach | real |  | 0.2 | 0-0.3 |  |  |  |  |  |
| 20 | nperco_lchtile | Nitrogen concentration coefficient for tile flow and leaching from bottom layer | real |  | 0 | 0-1 |  |  |  |  |  |
| 21 | evap_adj | Reach evaporation adjustment factor | real |  | 0.6 | 0.5-1 |  |  |  |  |  |
| 22 | scoef | Currently not used | real |  |  |  |  |  |  |  |  |
| 23 | denit_exp | Denitrification exponential rate coefficient | real |  | 1.4 | 0-3 |  |  |  |  |  |
| 24 | denit_frac | Denitrification threshold water content | real |  | 1.3 | 0-1 |  |  |  |  |  |
| 25 | man_bact | Currently not used | real |  |  |  |  |  |  |  |  |
| 26 | adj_uhyd | Adjustment factor for subdaily unit hydrograph basetime | real |  | 0 | 0-1 |  |  |  |  |  |
| 27 | cn_froz | Parameter for frozen soil adjustment on infiltration/runoff | real |  | 0.000862 | 0-0 |  |  |  |  |  |
| 28 | dorm_hr | Time threshold used to define dormancy | real | hrs | 0 | 0-24 |  |  |  |  |  |
| 29 | plaps | Precipitation lapse rate | real | mm/km |  |  |  |  |  |  |  |
| 30 | tlaps | Temperature lapse rate | real | deg C/km |  |  |  |  |  |  |  |
| 31 | n_fix_max | Maximum daily nitrogen fixation | real | kg/ha | 20 | 1-20 |  |  |  |  |  |
| 32 | rsd_decay | Minimum daily residue decay | real | fraction | 0.01 | 0-0.05 |  |  |  |  |  |
| 33 | rsd_cover | Currently not used | real |  |  |  |  |  |  |  |  |
| 34 | urb_init_abst | Maximum initial abstraction for urban areas | real |  | 5 | 0-10 |  |  |  |  |  |
| 35 | petco_pmpt | Currently not used | real |  |  |  |  |  |  |  |  |
| 36 | uhyd_alpha | Alpha coefficient for gamma function unit hydrograph | real |  | 5 | 0.5-10 |  |  |  |  |  |
| 37 | splash | Splash erosion coefficient | real |  | 1 | 0.9-3.1 |  |  |  |  |  |
| 38 | rill | Rill erosion coefficient | real |  | 0.7 | 0.5-2 |  |  |  |  |  |
| 39 | surq_exp | Exponential coefficient for overland flow | real |  | 1.2 | 1-3 |  |  |  |  |  |
| 40 | cov_mgt | Scaling parameter for cover and management factor for overland flow erosion | real |  | 0.03 | 0.001-0.45 |  |  |  |  |  |
| 41 | cha_d50 | Currently not used | real |  |  |  |  |  |  |  |  |
| 42 | co2 | CO2 concentration at start of simulation | real | ppm | 1.57 | 1-5 |  |  |  |  |  |
| 43 | day_lag_max | Currently not used | real |  |  |  |  |  |  |  |  |
| 44 | igen | Currently not used | integer |  |  |  |  |  |  |  |  |

## Calibration

### Calibration

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

*No column information available.*

## Channels

### Channels

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

*No column information available.*

### channel-lte.cha
**Description:** >-

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | id | ID of the channel | integer | N/A | N/A | N/A | ✓ |  |  |  | lcha in chandeg.con |
| 2 | name | Name of the channel | string | N/A | N/A | N/A |  |  |  |  |  |
| 3 | ini | Pointer to the channel initialization file | string | N/A | N/A | N/A |  | ✓ | ✓ | initial.cha |  |
| 4 | hyd | Pointer to the channel hydrology and sediment file | string | N/A | N/A | N/A |  | ✓ | ✓ | hyd-sed-lte.cha |  |
| 5 | sed | Currently not used | string | N/A | N/A | N/A |  |  |  |  |  |
| 6 | nut | Pointer to the channel nutrient file | string | N/A | N/A | N/A |  | ✓ | ✓ | nutrients.cha |  |

### hyd-sed-lte.cha
**Description:** This file controls the channel hydrology and sediment properties.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the channel hydrology and sediment record | string | n/a | n/a | n/a | ✓ |  |  |  | hyd in channel-lte.cha |
| 2 | wd | Channel width | real | m | calculated by QSWAT+ | N/A |  |  |  |  |  |
| 3 | dp | Channel depth | real | m | calculated by QSWAT+ | N/A |  |  |  |  |  |
| 4 | slp | Channel slope | real | m/m | calculated by QSWAT+ | N/A |  |  |  |  |  |
| 5 | len | Channel length | real | km | calculated by QSWAT+ | N/A |  |  |  |  |  |
| 6 | mann | Channel Manning's n | real | none | 0.05 | N/A |  |  |  |  |  |
| 7 | k | Effective hydraulic conductivity of the channel alluvium | real | mm/h | 1.0 | N/A |  |  |  |  |  |
| 8 | erod_fact | Channel erodibility factor | real | none | 0.01 | N/A |  |  |  |  |  |
| 9 | cov_fact | Channel cover factor | real | none | 0.01 | 0-1 |  |  |  |  |  |
| 10 | sinu | Channel sinuosity | real | none | 6.0 | N/A |  |  |  |  |  |
| 11 | eq_slp | Equilibrium channel slope | real | m/m | 0 | N/A |  |  |  |  |  |
| 12 | d50 | Channel median sediment size | real | mm | 12.0 | N/A |  |  |  |  |  |
| 13 | clay | Clay content of channel bank and bed | real | % | 50.00 | 0-100 |  |  |  |  |  |
| 14 | carbon | Carbon content of channel bank and bed | real | % | 0 | 0-100 |  |  |  |  |  |
| 15 | dry_bd | Dry bulk density of the channel | real | t/m3 | 0 | N/A |  |  |  |  |  |
| 16 | side_slp | Channel side slope | real | m | 0.50 | N/A |  |  |  |  |  |
| 17 | bed_load | Percent of sediment entering the channel that is bed material | real | m | 0.50 | N/A |  |  |  |  |  |
| 18 | fps | Floodplain slope | real | m/m | 10.0 | N/A |  |  |  |  |  |
| 19 | fpn | Floodplain Manning's n | real | none | N/A | N/A |  |  |  |  |  |
| 20 | n_conc | Nitrogen concentration in channel bank | real | mg/kg | 0.10 | N/A |  |  |  |  |  |
| 21 | p_conc | Phosphorus concentration in channel bank | real | mg/kg | 0.30 | N/A |  |  |  |  |  |
| 22 | p_bio | Fraction of phosphorus in bank that is bioavailable | real | fraction | 0.30 | N/A |  |  |  |  |  |

### initial.cha
**Description:** >-

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the channel initialization record | string | N/A | N/A | N/A | ✓ |  |  |  | ini in channel-lte.cha |
| 2 | org_min | Pointer to the organic-mineral initialization file | string | N/A | N/A | N/A |  | ✓ | ✓ | om_water.ini |  |
| 3 | pest | Pointer to the pesticide initialization file | string | N/A | N/A | N/A |  | ✓ | ✓ | pest_water.ini |  |
| 4 | path | Currently not used | string | N/A | N/A | N/A |  |  | ✓ |  |  |
| 5 | hmet | Currently not used | string | N/A | N/A | N/A |  |  | ✓ |  |  |
| 6 | salt | Pointer to the salt initialization file | string | N/A | N/A | N/A |  |  | ✓ |  |  |

### nutrients.cha
**Description:** This file controls the channel nutrient properties.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the channel nutrient record | string | n/a | n/a | n/a | ✓ |  |  |  | nut in channel-lte.cha |
| 2 | plt_n | Channel organic N concentration | real | ppm | 0.0 | 0.0-100.0 |  |  |  |  |  |
| 3 | plt_p | Channel organic P concentration | real | ppm | 0.0 | 0.0-100.0 |  |  |  |  |  |
| 4 | alg_stl | Local algal settling rate in the channel at 20ºC | real | m/day or m/hr | 1.0 | 0.15-1.82 |  |  |  |  |  |
| 5 | ben_disp | Benthic source rate for dissolved P in the channel at 20ºC | real | mg P/m2\*day or mg P/m2\*hr | 0.05 | 0.001-0.10 |  |  |  |  |  |
| 6 | ben_nh3n | Benthic source rate for NH3-N in the channel at 20ºC | real | mg N/m2\*day or mg N/m2\*hr | 0.50 | 0.0-1.0 |  |  |  |  |  |
| 7 | ptln_stl | Organic N settling rate in the channel at 20ºC | real | 1/day or 1/hr | 0.05 | 0.001-0.1 |  |  |  |  |  |
| 8 | ptlp_stl | Organic P settling rate in the channel at 20ºC | real | 1/day or 1/hr | 0.05 | 0.001-0.10 |  |  |  |  |  |
| 9 | cst_stl | Arbitrary non-conservative constituent settling rate in the channel at 20ºC | real | 1/day | 2.50 | 0.01-10.0 |  |  |  |  |  |
| 10 | ben_cst | Benthic source rate for arbitrary non-conservative constituents in the channel at 20ºC | real | mg /m^2\*day | 2.50 | 0.01-10.0 |  |  |  |  |  |
| 11 | cbn_bod_co | Carbonaceous biological oxygen demand deoxygenation rate in the channel at 20ºC | real | 1/day or 1/hr | 1.71 | 0.02-3.40 |  |  |  |  |  |
| 12 | air_rt | Reaeration rate in accordance with Fickian diffusion in the channel at 20ºC | real | 1/day or 1/hr | 50.0 | 0.0-100.0 |  |  |  |  |  |
| 13 | cbn_bod___stl | Rate of loss of CBOD due to settling in the channel at 20ºC | real | 1/day or 1/hr | 0.36 | -0.36-0.36 |  |  |  |  |  |
| 14 | ben_bod | Sediment oxygen demand rate in the channel at 20ºC | real | mg O2/m2\*day or mg O2/m2\*hr | 2.0 | 0.0-100.0 |  |  |  |  |  |
| 15 | bact_die | Coliform die-off rate in the channel at 20ºC | real | 1/day | 2.0 | 0.05-4.0 |  |  |  |  |  |
| 16 | cst_decay | Decay rate for arbitrary non-conservative constituents in the channel at 20ºC | real | 1/day | 1.71 | 0.0-10.0 |  |  |  |  |  |
| 17 | nh3n_no2n | Biological oxidation rate of NH3 to NO2 in the channel at 20ºC in well-aerated conditions | real | 1/day or 1/hr | 0.55 | 0.10-1.0 |  |  |  |  |  |
| 18 | no2n_no3n | Biological oxidation rate of NO2 to NO3 in the channel at 20ºC in well-aerated conditions | real | 1/day or 1/hr | 1.10 | 0.20-2.0 |  |  |  |  |  |
| 19 | ptln_nh3n | Hydrolysis rate of organic N to ammonia in the channel at 20ºC | real | 1/day or 1/hr | 0.21 | 0.20-0.40 |  |  |  |  |  |
| 20 | ptlp_solp | Mineralization rate of organic P to dissolved P in the channel at 20ºC | real | 1/day or 1/hr | 0.35 | 0.01-0.70 |  |  |  |  |  |
| 21 | q2e_lt | Qual2E light averaging option | integer | n/a | 2 | 1-4 |  |  |  |  |  |
| 22 | q2e_alg | Qual2E option for calculating the local specific growth rate of algae | integer | n/a | 2 | 1-3 |  |  |  |  |  |
| 23 | chla_alg | Ratio of chlorophyll-a to algal biomass | real | μg chla/mg alg | 50.0 | 10.0-100.0 |  |  |  |  |  |
| 24 | alg_n | Fraction of algal biomass that is N | real | mg N/mg alg | 0.08 | 0.07-0.09 |  |  |  |  |  |
| 25 | alg_p | Fraction of algal biomass that is P | real | mg P/mg alg | 0.02 | 0.01-0.02 |  |  |  |  |  |
| 26 | alg_o2_prod | Oxygen production rate per unit of algal photosynthesis | real | mg O2/mg alg | 1.60 | 1.40-1.80 |  |  |  |  |  |
| 27 | alg_o2_resp | Oxygen uptake rate per unit of algae respiration | real | mg O2/mg alg | 2.0 | 1.60-2.30 |  |  |  |  |  |
| 28 | o2_nh3n | Oxygen uptake rate per unit of NH3-N oxidation | real | mg O2/mg N | 3.50 | 3.00-4.00 |  |  |  |  |  |
| 29 | o2_no2n | Oxygen uptake rate per unit of NO2-N oxidation | real | mg O2/mg N | 1.07 | 1.00-1.40 |  |  |  |  |  |
| 30 | alg_grow | Maximum specific algal growth rate at 20ºC | real | 1/day | 2.0 | 1.00-3.00 |  |  |  |  |  |
| 31 | alg_resp | Algal respiration rate at 20ºC | real | 1/day or 1/hr | 2.50 | 0.05-5.0 |  |  |  |  |  |
| 32 | slr_act | Fraction of solar radiation computed in the temperature heat balance that is photosynthetically active | real | fraction | 0.30 | 0.0-1.0 |  |  |  |  |  |
| 33 | lt_co | Half-saturation coefficient for light | real | MJ/(m^2\*hr) | 0.75 | 0.223-1.135 |  |  |  |  |  |
| 34 | const_n | Michaelis-Menton half-saturation constant for N | real | mg N/L | 0.02 | 0.01-0.30 |  |  |  |  |  |
| 35 | const_p | Michaelis-Menton half saturation constant for P | real | mg P/L | 0.03 | 0.001-0.05 |  |  |  |  |  |
| 36 | lt_nonalg | Non-algal portion of the light extinction coefficient | real | 1/m | 1.0 | 0.0-10.0 |  |  |  |  |  |
| 37 | alg_shd_l | Linear algal self-shading coefficient | real | 1/(m\*ug chla/L) | 0.03 | 0.006-0.065 |  |  |  |  |  |
| 38 | alg_shd_nl | Nonlinear algal self-shading coefficient | real | (1/m)(ug chla/L)^(-2/3) | 0.05 | 0.0-1.0 |  |  |  |  |  |
| 39 | nh3_pref | Algal preference factor for ammonia | real | none | 0.50 | 0.0-1.0 |  |  |  |  |  |

## Climate

### Climate

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

*No column information available.*

### atmo.cli
**⚠️ SPECIAL STRUCTURE**

**Description:** This file contains observed atmospheric deposition data.

**Special Structure:** The structure of the file **atmo.cli** varies slightly depending on the time step of the data. As in all SWAT+ input files, the first line is reserved for user comments.

**Metadata Structure:** Non-standard - first line is reserved for user comments. The second line contains the column headers for the third line, which lists basic information about the atmospheric deposition stations.

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | num_sta | Number of stations included in the file | integer | N/A | N/A | N/A |  |  |  |  |  |
| 2 | timestep | Time step of the atmospheric deposition data | integer | N/A | N/A | N/A |  |  |  |  |  |
| 3 | mo_init | First month data is available for (0 for yearly and average annual data) | integer | N/A | N/A | N/A |  |  |  |  |  |
| 4 | yr_init | First year data is available for (0 for average annual data) | integer | N/A | N/A | N/A |  |  |  |  |  |
| 5 | num_aa | Number of months or years data is available for | integer | N/A | N/A | N/A |  |  |  |  |  |

### weather-sta.cli
**Description:** This file lists the weather stations defined for a SWAT+ setup.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the weather station | string | N/A | N/A | N/A | ✓ |  |  |  | wst in 'object'.con |
| 2 | wgn | Name of the weather generator station | string | N/A | N/A | N/A | ✓ | ✓ |  | weather-wgn.cli |  |
| 3 | pcp | Name of the precipitation station | string | N/A | N/A | N/A |  | ✓ |  | pcp.cli |  |
| 4 | tmp | Name of the temperature station | string | N/A | N/A | N/A |  | ✓ |  | tmp.cli |  |
| 5 | slr | Name of the solar radiation station | string | N/A | N/A | N/A |  | ✓ |  | slr.cli |  |
| 6 | hmd | Name of the relative humidity station | string | N/A | N/A | N/A |  | ✓ |  | hmd.cli |  |
| 7 | wnd | Name of the wind speed station | string | N/A | N/A | N/A |  | ✓ |  | wnd.cli |  |
| 8 | wnd_dir | Name of the wind direction station (currently not used) | string | N/A | N/A | N/A |  |  |  |  |  |
| 9 | atmo_dep | Name of the atmospheric deposition station | string | N/A | N/A | N/A |  | ✓ |  |  |  |
| 10 | pet | Name of the PET station | string | N/A | N/A | N/A |  |  |  |  |  |

### weather-wgn.cli
**⚠️ SPECIAL STRUCTURE**

**Description:** This file contains weather generator data to be used for a SWAT+ setup.

**Special Structure:** For each weather generator station, there will be one line specifying the name of the station, its latitude, longitude, and elevation, and the number of years of maximum monthly 0.5 h rainfall data used to define values for pcp\_hhr. There are no headers for this line.

**Metadata Structure:** Non-standard - second line for each weather generator station contains the headers for the following 12 lines, which list the weather generator data for each month of the year. An overview of the weather generator data variables is given in the second table below.

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of weather generator station | string | n/a | N/A | N/A | ✓ |  |  |  | wgn in weather-sta.cli |
| 2 | latitude | Latitude of weather generator station | real | decimal degrees | N/A | N/A |  |  |  |  |  |
| 3 | longitude | Longitude of weather generator station | real | decimal degrees | N/A | N/A |  |  |  |  |  |
| 4 | elevation | Elevation of weather generator station | real | m | N/A | N/A |  |  |  |  |  |
| 5 | yrs_pcp | Number of years of maximum monthly 0.5 h rainfall data used to define values for pcp_hhr | integer | years | N/A | N/A |  |  |  |  |  |

## Connectivity

### Connectivity

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

*No column information available.*

### aquifer.con
**Description:** This file defines the aquifer connectivity.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | id | Unique ID of the aquifer | integer | n/a | n/a | n/a |  |  |  |  |  |
| 2 | name | Name of the aquifer | string | n/a | n/a | n/a |  |  |  |  |  |
| 3 | gis_id | Aquifer number in GIS | integer | n/a | n/a | n/a |  |  |  |  |  |
| 4 | area | Area of the aquifer | real | ha | n/a | n/a |  |  |  |  |  |
| 5 | lat | Latitude of the aquifer | real | dec degrees | n/a | -90.0-90.0 |  |  |  |  |  |
| 6 | lon | Longitude of the aquifer | real | dec degrees | n/a | -180.0-180.0 |  |  |  |  |  |
| 7 | elev | Elevation of the aquifer | real | m | 100.0 | 0-7000 |  |  |  |  |  |
| 8 | aqu | Pointer to the aquifer data file | integer | n/a | n/a | n/a |  |  | ✓ |  |  |
| 9 | wst | Pointer to the weather stations file | string | n/a | n/a | n/a |  |  | ✓ |  |  |
| 10 | cst | Pointer to the constituent file | integer | n/a | n/a | n/a |  |  | ✓ |  |  |
| 11 | ovfl | Pointer to the overbank flooding file | integer | n/a | n/a | n/a |  |  | ✓ |  |  |
| 12 | rule | Pointer to the decision table for hydrograph fractions | integer | frac | 0 | 0-1 |  |  | ✓ |  |  |
| 13 | out_tot | Total number of outgoing hydrographs | integer | n/a | 1 | 12 |  |  |  |  |  |
| 14 | obj_typ | Type of the receiving object | string | n/a | n/a | n/a |  |  |  |  |  |
| 15 | obj_id | ID of the receiving object | integer | n/a | n/a | n/a |  |  |  |  |  |
| 16 | hyd_typ | Type of hydrograph that is sent to the receiving object | string | n/a | n/a | n/a |  |  |  |  |  |
| 17 | frac | Fraction of hydrograph sent to the receiving object | integer | frac | n/a | 0-1 |  |  |  |  |  |

### chandeg.con
**Description:** This file defines the channel connectivity.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | id | Unique ID of the channel | integer | n/a | n/a | n/a |  |  |  |  |  |
| 2 | name | Name of the channel | string | n/a | n/a | n/a |  |  |  |  |  |
| 3 | gis_id | Channel number in GIS | integer | n/a | n/a | n/a |  |  |  |  |  |
| 4 | area | Area of the channel | real | ha | n/a | n/a |  |  |  |  |  |
| 5 | lat | Latitude of the channel | real | dec degrees | n/a | -90.0-90.0 |  |  |  |  |  |
| 6 | lon | Longitude of the channel | real | dec degrees | n/a | -180.0-180.0 |  |  |  |  |  |
| 7 | elev | Elevation of the channel | real | m | 100.0 | 0-7000 |  |  |  |  |  |
| 8 | lcha | Pointer to the channel data file | integer | n/a | n/a | n/a |  |  | ✓ |  |  |
| 9 | wst | Pointer to the weather stations file | string | n/a | n/a | n/a |  |  | ✓ |  |  |
| 10 | cst | Pointer to the constituent file | integer | n/a | n/a | n/a |  |  | ✓ |  |  |
| 11 | ovfl | Pointer to the overbank flooding file | integer | n/a | n/a | n/a |  |  | ✓ |  |  |
| 12 | rule | Pointer to the decision table for hydrograph fractions | integer | frac | 0 | 0-1 |  |  | ✓ |  |  |
| 13 | out_tot | Total number of outgoing hydrographs | integer | n/a | 1 | 12 |  |  |  |  |  |
| 14 | obj_typ | Type of receiving object | string | n/a | n/a | n/a |  |  |  |  |  |
| 15 | obj_id | ID of the receiving object | integer | n/a | n/a | n/a |  |  |  |  |  |
| 16 | hyd_typ | Type of hydrograph that is sent to the receiving object | string | n/a | n/a | n/a |  |  |  |  |  |
| 17 | frac | Fraction of hydrograph sent to the receiving object | integer | frac | n/a | 0-1 |  |  |  |  |  |

### hru.con
**Description:** This file defines the connectivity of spatial objects.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | id | Unique ID of the object | integer | n/a | n/a | n/a | ✓ |  |  |  |  |
| 2 | name | Name of the object | string | n/a | n/a | n/a |  |  |  |  |  |
| 3 | gis_id | Object number in QSWAT+ | integer | n/a | n/a | n/a |  |  |  |  |  |
| 4 | area | Area of the object | real | ha | n/a | n/a |  |  |  |  |  |
| 5 | lat | Latitude of the object | real | dec degrees | n/a | -90.0-90.0 |  |  |  |  |  |
| 6 | lon | Longitude of the object | real | dec degrees | n/a | -180.0-180.0 |  |  |  |  |  |
| 7 | elev | Elevation of the object | real | m | 100.0 | 0-7000 |  |  |  |  |  |
| 8 | hru | Pointer to the object data file | integer | n/a | n/a | n/a |  | ✓ | ✓ |  |  |
| 9 | wst | Pointer to the weather station file | string | n/a | n/a | n/a |  | ✓ | ✓ | weather-sta.cli |  |
| 10 | cst | Currently not used | integer | n/a | n/a | n/a |  |  | ✓ |  |  |
| 11 | ovfl | Currently not used | integer | n/a | n/a | n/a |  |  | ✓ |  |  |
| 12 | rule | Currently not used | integer | n/a | 0 | 0-1 |  |  | ✓ |  |  |
| 13 | out_tot | Total number of outgoing hydrographs | integer | n/a | 1 | 12 |  |  |  |  |  |
| 14 | obj_typ | Type of the receiving object | string | n/a | n/a | n/a |  |  |  |  |  |
| 15 | obj_id | ID of the receiving object | integer | n/a | n/a | n/a |  | ✓ |  |  |  |
| 16 | hyd_typ | Type of hydrograph that is sent to the receiving object | string | n/a | n/a | n/a |  |  |  |  |  |
| 17 | frac | Fraction of hydrograph sent to the receiving object | integer | fraction | n/a | 0-1 |  |  |  |  |  |

### recall.con
**Description:** This file defines the recall connectivity.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | id | Unique ID of the recall | integer | n/a | n/a | n/a |  |  |  |  |  |
| 2 | name | Name of the recall | string | n/a | n/a | n/a |  |  |  |  |  |
| 3 | gis_id | Recall number in GIS | integer | n/a | n/a | n/a |  |  |  |  |  |
| 4 | area | Area of the recall | real | ha | n/a | n/a |  |  |  |  |  |
| 5 | lat | Latitude of the recall | real | dec degrees | n/a | -90.0-90.0 |  |  |  |  |  |
| 6 | lon | Longitude of the recall | real | dec degrees | n/a | -180.0-180.0 |  |  |  |  |  |
| 7 | elev | Elevation of the recall | real | m | 100.0 | 0-7000 |  |  |  |  |  |
| 8 | rec | Pointer to the recall data file | integer | n/a | n/a | n/a |  |  | ✓ |  |  |
| 9 | wst | Pointer to the weather stations file | string | n/a | n/a | n/a |  |  | ✓ |  |  |
| 10 | cst | Pointer to the constituent file | integer | n/a | n/a | n/a |  |  | ✓ |  |  |
| 11 | ovfl | Pointer to the overbank flooding file | integer | n/a | n/a | n/a |  |  | ✓ |  |  |
| 12 | rule | Pointer to the decision table for hydrograph fractions | integer | frac | 0 | 0-1 |  |  | ✓ |  |  |
| 13 | out_tot | Total number of outgoing hydrographs | integer | n/a | 1 | 12 |  |  |  |  |  |
| 14 | obj_typ | Type of receiving object | string | n/a | n/a | n/a |  |  |  |  |  |
| 15 | obj_id | Number of receiving objects | integer | n/a | n/a | n/a |  |  |  |  |  |
| 16 | hyd_typ | Type of hydrograph that is sent to the receiving object | string | n/a | n/a | n/a |  |  |  |  |  |
| 17 | frac | Fraction of hydrograph sent to the receiving object | integer | frac | n/a | 0-1 |  |  |  |  |  |

### reservoir.con
**Description:** This file defines the reservoir connectivity.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | id | Unique ID of the reservoir | integer | n/a | n/a | n/a |  |  |  |  |  |
| 2 | name | Name of the reservoir | string | n/a | n/a | n/a |  |  |  |  |  |
| 3 | gis_id | Reservoir number in GIS | integer | n/a | n/a | n/a |  |  |  |  |  |
| 4 | area | Area of the reservoir | real | ha | n/a | n/a |  |  |  |  |  |
| 5 | lat | Latitude of the reservoir | real | dec degrees | n/a | -90.0-90.0 |  |  |  |  |  |
| 6 | lon | Longitude of the reservoir | real | dec degrees | n/a | -180.0-180.0 |  |  |  |  |  |
| 7 | elev | Elevation of the reservoir | real | m | 100.0 | 0-7000 |  |  |  |  |  |
| 8 | res | Pointer to the reservoir data file | integer | n/a | n/a | n/a |  |  | ✓ |  |  |
| 9 | wst | Pointer to the weather stations file | string | n/a | n/a | n/a |  |  | ✓ |  |  |
| 10 | cst | Pointer to the constituent file | integer | n/a | n/a | n/a |  |  | ✓ |  |  |
| 11 | ovfl | Pointer to the overbank flooding file | integer | n/a | n/a | n/a |  |  | ✓ |  |  |
| 12 | rule | Pointer to the decision table for hydrograph fractions | integer | frac | 0 | 0-1 |  |  | ✓ |  |  |
| 13 | out_tot | Total number of outgoing hydrographs | integer | n/a | 1 | 12 |  |  |  |  |  |
| 14 | obj_typ | Type of the receiving object | string | n/a | n/a | n/a |  |  |  |  |  |
| 15 | obj_id | ID of the of receiving object | integer | n/a | n/a | n/a |  |  |  |  |  |
| 16 | hyd_typ | Type of hydrograph that is sent to the receiving object | string | n/a | n/a | n/a |  |  |  |  |  |
| 17 | frac | Fraction of hydrograph sent to the receiving object | integer | frac | n/a | 0-1 |  |  |  |  |  |

### rout_unit.con
**Description:** This file defines the routing unit connectivity.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | id | Unique ID of the routing unit | integer | n/a | n/a | n/a |  |  |  |  |  |
| 2 | name | Name of the routing unit | string | n/a | n/a | n/a |  |  |  |  |  |
| 3 | gis_id | Routing unit number in GIS | integer | n/a | n/a | n/a |  |  |  |  |  |
| 4 | area | Area of the routing unit | real | ha | n/a | n/a |  |  |  |  |  |
| 5 | lat | Latitude of the routing unit | real | dec degrees | n/a | -90.0-90.0 |  |  |  |  |  |
| 6 | lon | Longitude of the routing unit | real | dec degrees | n/a | -180.0-180.0 |  |  |  |  |  |
| 7 | elev | Elevation of the routing unit | real | m | 100.0 | 0-7000 |  |  |  |  |  |
| 8 | ru | Pointer to the routing unit data file | integer | n/a | n/a | n/a |  |  | ✓ |  |  |
| 9 | wst | Pointer to the weather stations file | string | n/a | n/a | n/a |  |  | ✓ |  |  |
| 10 | cst | Pointer to the constituent file | integer | n/a | n/a | n/a |  |  | ✓ |  |  |
| 11 | ovfl | Pointer to the overbank flooding file | integer | n/a | n/a | n/a |  |  | ✓ |  |  |
| 12 | rule | Pointer to the decision table for hydrograph fractions | integer | frac | 0 | 0-1 |  |  | ✓ |  |  |
| 13 | out_tot | Total number of outgoing hydrographs | integer | n/a | 1 | 1-12 |  |  |  |  |  |
| 14 | obj_typ | Type of the receiving object | string | n/a | n/a | n/a |  |  |  |  |  |
| 15 | obj_id | ID of the receiving object | integer | n/a | n/a | n/a |  |  |  |  |  |
| 16 | hyd_typ | Type of hydrograph that is sent to the receiving object | string | n/a | n/a | n/a |  |  |  |  |  |
| 17 | frac | Fraction of hydrograph sent to the receiving object | integer | frac | n/a | 0-1 |  |  |  |  |  |

## Constituents

### Constituents

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

*No column information available.*

### om_water.ini

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of initial soil plant | string | n/a | n/a | n/a |  |  |  |  |  |
| 2 | vol | Volume of water | real | m^3 | 0 | N/A |  |  |  |  |  |
| 3 | sed | Sediment | real | metric tons | 0 | N/A |  |  |  |  |  |
| 4 | part_n | Organic N | real | kg N | 0 | N/A |  |  |  |  |  |
| 5 | part_p | Organic P | real | kg P | 0 | N/A |  |  |  |  |  |
| 6 | no3 | NO3-N | real | kg N | 0 | N/A |  |  |  |  |  |
| 7 | solp | Mineral (soluble P) | real | kg P | 0 | N/A |  |  |  |  |  |
| 8 | chl_a | Chlorophyll-a | real | kg | 0 | N/A |  |  |  |  |  |
| 9 | nh3 | NH3 | real | kg N | 0 | N/A |  |  |  |  |  |
| 10 | no2 | NO2 | real | kg N | 0 | N/A |  |  |  |  |  |
| 11 | cbn_bod | Carbonaceous biological oxygen demand | real | kg | 0 | N/A |  |  |  |  |  |
| 12 | dis_ox | Dissolved oxygen | real | kg | 0 | N/A |  |  |  |  |  |
| 13 | sand | Detached sand | real | tons | 0 | N/A |  |  |  |  |  |
| 14 | silt | Detached silt | real | tons | 0 | N/A |  |  |  |  |  |
| 15 | clay | Detached clay | real | tons | 0 | N/A |  |  |  |  |  |
| 16 | sm_ag | Detached small aggregates | real | tons | 0 | N/A |  |  |  |  |  |
| 17 | l_ag | Detached large aggregates | real | tons | 0 | N/A |  |  |  |  |  |
| 18 | gvl | Gravel | real | tons | 0 | N/A |  |  |  |  |  |
| 19 | tmp | Temperature | real | degrees c | 0 | N/A |  |  |  |  |  |

### soil_plant.ini

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of initial soil plant | string | n/a | n/a | n/a |  |  |  |  |  |
| 2 | sw_frac | Fraction of soil water | real | n/a | 0-1 | N/A |  |  |  |  |  |
| 3 | nut | Filename points to the name column in the nutrients.sol file.  If not used in the model, enter 'null'. | string | n/a | n/a | n/a |  |  |  |  |  |
| 4 | pest | Filename points to the name column in the pest_hru.ini file.  If not used in the model, enter 'null'. | string | n/a | n/a | n/a |  |  |  |  |  |
| 5 | path | Filename points to the name column in the path_hru.ini file.  If not used in the model, enter 'null'. | string | n/a | n/a | n/a |  |  |  |  |  |
| 6 | salt | Filename points to the name column in the salt_hru.ini file.  If not used in the model, enter 'null'. | string | n/a | n/a | n/a |  |  |  |  |  |
| 7 | hmet | Filename points to the name column in the hmet_hru.ini file.  If not used in the model, enter 'null'. | string | n/a | n/a | n/a |  |  |  |  |  |

## Databases

### Databases

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

*No column information available.*

### fertilizer.frt
**Description:** >-

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the fertilizer record | string | n/a | n/a | n/a | ✓ |  |  |  |  |
| 2 | min_n | Fraction of fertilizer that is mineral N (NO3+NH3) | real | fraction | 1.0 | 0.0-1.0 |  |  |  |  |  |
| 3 | min_p | Fraction of fertilizer that is mineral P | real | fraction | 0.0 | 0.0-1.0 |  |  |  |  |  |
| 4 | org_n | Fraction of fertilizer that is organic N | real | fraction | 0.0 | 0.0-1.0 |  |  |  |  |  |
| 5 | org_p | Fraction of fertilizer that is organic P | real | fraction | 0.0 | 0.0-1.0 |  |  |  |  |  |
| 6 | nh3_n | Fraction of mineral N content of fertilizer that is NH3 | real | fraction | 0.0 | 0.0-1.0 |  |  |  |  |  |

### pesticide.pes
**Description:** >-

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the pesticide record | string | n/a | n/a | n/a | ✓ |  |  |  |  |
| 2 | soil_ads | Soil adsorption coefficient normalized for soil organic carbon content | real | (mg/kg)/(mg/L) | 0.0 | 1.0-999999999.0 |  |  |  |  |  |
| 3 | frac_wash | Fraction of pesticide on foliage that is washed off by rainfall event | real | fraction | 0.0 | 0.0-1.0 |  |  |  |  |  |
| 4 | hl_foliage | Half-life of the pesticide on the foliage | real | days | 0.0 | 0.0-10000.0 |  |  |  |  |  |
| 5 | hl_soil | Half-life of the pesticide in the soil | real | days | 0.0 | 0.0-100000.0 |  |  |  |  |  |
| 6 | solub | Solubility of the pesticide in water | real | mg/L (ppm) | 0.0 | N/A |  |  |  |  |  |
| 7 | aq_reac | Aquatic pesticide reaction coefficient | real | 1/day | 0.0 | N/A |  |  |  |  |  |
| 8 | aq_volat | Aquatic volatilization coefficient | real | m/day | 0.0 | N/A |  |  |  |  |  |
| 9 | mol_wt | Molecular weight to calculate mixing velocity | real | g/mol | 0.0 | N/A |  |  |  |  |  |
| 10 | aq_resus | Aquatic resuspension velocity for pesticide sorbed to sediment | real | m/day | 0.0 | N/A |  |  |  |  |  |
| 11 | aq_settle | Aquatic settling velocity for pesticide sorbed to sediment | real | m/day | 0.0 | N/A |  |  |  |  |  |
| 12 | ben_act_dep | Depth of the active benthic layer | real | m/day | 0.0 | N/A |  |  |  |  |  |
| 13 | ben_bury | Burial velocity in the benthic sediment | real | m/day | 0.0 | N/A |  |  |  |  |  |
| 14 | ben_reac | Reaction coefficient in the benthic sediment | real | 1/day | 0.0 | N/A |  |  |  |  |  |

### plants.plt
**Description:** >-

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the plant/landcover | ​string | ​n/a | n/a | n/a |  |  |  |  |  |
| 2 | plnt_typ | Plant/landcover type | ​string | n/a | n/a | n/a |  |  |  |  |  |
| 3 | gro_trig | Phenology trigger | string | n/a | n/a | n/a |  |  |  |  |  |
| 4 | nfix_co | Nitrogen fixation coefficient | real​ | none | 0.0 | n/a |  |  |  |  |  |
| 5 | days_mat | Days to maturity | real | days | 110.0 | 0.0-300.0 |  |  |  |  |  |
| 6 | bm_e | Biomass-energy ratio | real | (kg/ha/(MJ/m^2) | 15.0 | 10.0-90.0 |  |  |  |  |  |
| 7 | harv_idx | Harvest index for optimal growth conditions | real | (kg/ha)/(kg/ha) | 0.76 | 0.01-1.25 |  |  |  |  |  |
| 8 | lai_pot | Maximum potential leaf area index | real | none | 5.0 | 0.50-10.0 |  |  |  |  |  |
| 9 | frac_hu1 | Fraction of the growing season heat units corresponding to the 1st point on optimal leaf area development curve | real | fraction | 0.05 | 0.0-1.0 |  |  |  |  |  |
| 10 | lai_max1 | Fraction of the maximum leaf area index corresponding to the 1st point on optimal leaf area development curve | real | fraction | 0.05 | 0.0-1.0 |  |  |  |  |  |
| 11 | frac_hu2 | Fraction of the growing season heat units corresponding to the 2nd point on optimal leaf area development curve | real | fraction | 0.40 | 0.0-1.0 |  |  |  |  |  |
| 12 | lai_max2 | Fraction of the maximum leaf area index corresponding to the 2nd point on optimal leaf area development curve | real | fraction | 0.95 | 0.0-1.0 |  |  |  |  |  |
| 13 | hu_lai_decl | Fraction of growing season when leaf area begins to decline | real | fraction | 0.99 | 0.2-1.0 |  |  |  |  |  |
| 14 | dlai_rate | Exponent that governs the LAI decline rate | real | n/a | 1.0 |  |  |  |  |  |  |
| 15 | can_ht_max | Maximum canopy height | real | m | 6.0 | 0.1-20.0 |  |  |  |  |  |
| 16 | rt_dp_max | Maximum rooting depth | real | m | 3.50 | 0.0-3.0 |  |  |  |  |  |
| 17 | tmp_opt | Optimal temperature for plant growth | real | deg c | 30.0 | 11.0-38.0 |  |  |  |  |  |
| 18 | tmp_base | Minimum temperature for plant growth | real | deg c | 10.0 | 0.0-18.0 |  |  |  |  |  |
| 19 | frac_n_yld | Normal fraction of N in yield | real | kg N/kg yield | 0.0015 | 0.0015-0.075 |  |  |  |  |  |
| 20 | frac_p_yld | Normal fraction of P in yield | real | kg P/kg yield | 0.0003 | 0.0015-0.0075 |  |  |  |  |  |
| 21 | frac_n_em | Normal fraction of N in plant biomass at emergence | real | kg N/kg biomass | 0.006 | 0.004-0.07 |  |  |  |  |  |
| 22 | frac_n_50 | Normal fraction of N in plant biomass at 50% maturity | real | kg N/kg biomass | 0.002 | 0.002-0.05 |  |  |  |  |  |
| 23 | frac_n_mat | Normal fraction of N in plant biomass at maturity | real | kg N/kg biomass | 0.0015 | 0.001-0.27 |  |  |  |  |  |
| 24 | frac_p_em | Normal fraction pf P in plant biomass at emergence | real | kg P/kg biomass | 0.0007 | 0.0005-0.01 |  |  |  |  |  |
| 25 | frac_p_50 | Normal fraction of P in plant at 50% maturity | real | kg P/kg biomass | 0.0004 | 0.0002-0.007 |  |  |  |  |  |
| 26 | frac_p_mat | Normal fraction of P in plant at maturity | real | kg P/kg biomass | 0.0003 | 0.0003-0.0004 |  |  |  |  |  |
| 27 | harv_idx_ws | Harvest index that represents the lowest harvest index expected due to water stress | real | (kg/ha)/(kg/ha) | 0.01 | -0.2-1.1 |  |  |  |  |  |
| 28 | usle_c_min | Minimum value of the USLE C factor for water erosion | real | none | 0.001 | 0.001-0.50 |  |  |  |  |  |
| 29 | stcon_max | Maximum stomatal conductance | real | m/s | 0.002 | 0.0-0.50 |  |  |  |  |  |
| 30 | vpd | Vapor pressure deficit corresponding to the 2nd point on the stomatal conductance curve | real | kPa | 4.0 | 1.5-6.0 |  |  |  |  |  |
| 31 | frac_stcon | Fraction of maximum stomatal conductance corresponding to the 2nd point on the stomatal conductance curve | real | fraction | 0.75 | 0.0-1.0 |  |  |  |  |  |
| 32 | ru_vpd | Rate of decline in radiation use efficiency per unit increase in vapor pressure deficit | real | none | 8.0 | 0.0-50.0 |  |  |  |  |  |
| 33 | co2_hi | Elevated CO2 atmospheric concentration corresponding the 2nd point on the radiation use efficiency curve | real | μL CO2/L air | 660.0 | 300.0-1000.0 |  |  |  |  |  |
| 34 | bm_e_hi | Biomass-energy ratio corresponding to the 2nd point on the radiation use efficiency curve | real | (kg/ha)/(MJ/m^2) | 16.0 | 5.0-100.0 |  |  |  |  |  |
| 35 | plnt_decomp | Plant residue decomposition coefficient | real | none | 0.05 | 0.01-0.099 |  |  |  |  |  |
| 36 | lai_min | Minimum LAI during  dormant period | real | m^2/m^2 | 0.75 | 0.00-0.99 |  |  |  |  |  |
| 37 | bm_tree_acc | Fraction of biomass accumulated each year | real | fraction | 0.30 | 0.0-1.0 |  |  |  |  |  |
| 38 | yrs_mat | Years to maturity | integer | years | 10 | 0-100 |  |  |  |  |  |
| 39 | bm_tree_max | Maximum forest biomass | real | metric tons/ha | 1000.0 | 0.0-5000.0 |  |  |  |  |  |
| 40 | ext_co | Light extinction coefficient | real | none | 0.65 | 0.0-2.0 |  |  |  |  |  |
| 41 | leaf_tov_min | Perennial leaf turnover rate with minimum stress | real |  | 12.0 |  |  |  |  |  |  |
| 42 | leaf_tov_max | Perennial leaf turnover rate with maximum stress | real |  | 3.0 |  |  |  |  |  |  |
| 43 | bm_dieoff | Above-ground biomass that dies off at dormancy | real | fraction | 1.0 | 0.0-1.0 |  |  |  |  |  |
| 44 | rt_st_beg | Root to shoot ratio at the beginning of the growing season | real | fraction | 0. |  |  |  |  |  |  |
| 45 | rt_st_end | Root to shoot ratio at the end of the growing season | real | fraction | 0. |  |  |  |  |  |  |
| 46 | plnt_pop1 | Plant population corresponding to the 1st point on the population LAI curve | real | plants/m^2 | 0. |  |  |  |  |  |  |
| 47 | frac_lai1 | Fraction of the maximum leaf area index corresponding to the 1st point on the leaf area development curve | real | fraction | 0. | 0.0-1.0 |  |  |  |  |  |
| 48 | plnt_pop2 | Plant population corresponding to the 2nd point on the population LAI curve | real | plants/m^2 | 0.0 |  |  |  |  |  |  |
| 49 | frac_lai2 | Fraction of the maximum leaf area index corresponding to the 2nd point on the leaf area development curve | real | fraction | 0.0 | 0.0-1.0 |  |  |  |  |  |
| 50 | frac_sw_gro | Fraction of field capacity to initiate growth of tropical plants during monsoon season | real | fraction | 0.5 | 0.0-1.0 |  |  |  |  |  |
| 51 | aeration | Aeration stress factor | real |  | 0.0 |  |  |  |  |  |  |
| 52 | rsd_pctcov | Residue factor for percent cover equation | real |  | 0.0 |  |  |  |  |  |  |
| 53 | rsd_covfac | Residue factor for surface cover (C factor) equation | real |  | 0.0 |  |  |  |  |  |  |

### septic.sep
**Description:** >-

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the septic record | string | ​n/a | ​n/a | n/a | ✓ |  |  |  | typ in septic.str |
| 2 | q_rate | Flow rate of the septic tank effluent | ​real | m^3/d | 0.0 | 0.0-1.0 |  |  |  |  |  |
| 3 | bod | ​7-day Biological Oxygen Demand of the septic tank effluent | ​real | mg/l | ​0.0 | 0.0-300.0 |  |  |  |  |  |
| 4 | tss | Total suspended solids in the septic tank effluent | ​real | ​mg/l | ​0.0 | 0.0-300.0 |  |  |  |  |  |
| 5 | nh4_n | ​Ammonium nitrogen in the septic tank effluent | ​real | ​mg/l | ​0.0 | ​ |  |  |  |  |  |
| 6 | no3_n | ​Nitrate nitrogen in the septic tank effluent | ​real | ​mg/l | 0.0 | N/A |  |  |  |  |  |
| 7 | no2_n | Nitrite nitrogen in the septic tank effluent | real | mg/l | 0.0 | N/A |  |  |  |  |  |
| 8 | org_n | Organic nitrogen in the septic tank effluent | real | mg/l | 0.0 | N/A |  |  |  |  |  |
| 9 | min_p | Mineral phosphorus in the septic tank effluent | real | mg/l | 0.0 | N/A |  |  |  |  |  |
| 10 | org_p | Organic phosphorus in the septic tank effluent | real | mg/l | 0.0 | N/A |  |  |  |  |  |
| 11 | fcoli | Number of fecal coliform in the septic tank effluent | real | mg/l | 0.0 | N/A |  |  |  |  |  |

### tillage.til
**Description:** >-

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the tillage record | string | n/a | n/a | n/a | ✓ |  |  |  |  |
| 2 | mix_eff | Mixing efficiency of the tillage operation | real | fraction | 0.0 | 0.0-1.0 |  |  |  |  |  |
| 3 | mix_dp | Depth of mixing caused by the tillage operation | real | mm | 0.0 | 0.0-750.0 |  |  |  |  |  |
| 4 | rough | Currently not used | real | N/A | N/A | N/A |  |  |  |  |  |
| 5 | ridge_ht | Currently not used | real | N/A | N/A | N/A |  |  |  |  |  |
| 6 | ridge_sp | Currently not used | real | N/A | N/A | N/A |  |  |  |  |  |

### urban.urb
**Description:** >-

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the urban land type | string | n/a | n/a | n/a | ✓ |  |  |  | urban in landuse.lum |
| 2 | frac_imp | Fraction of total impervious area in urban land type | real | fraction | 0.05 | 0.0-1.0 |  |  |  |  |  |
| 3 | frac_dc_imp | Fraction of directly connected impervious area in urban land type | real | fraction | 0.05 | 0.0-1.0 |  |  |  |  |  |
| 4 | curb_den | Curb length density | real | km/ha | 0.0 | 0.0-1.0 |  |  |  |  |  |
| 5 | urb_wash | Wash-off coefficient for removal of constituents from impervious surfaces | real | 1/mm | 0.0 | 0.0-1.0 |  |  |  |  |  |
| 6 | dirt_max | Maximum amount of solids allowed to build up on impervious surfaces | real | kg/curb km | 1000.0 | 0.0-2000.0 |  |  |  |  |  |
| 7 | t_halfmax | Time for amount of solids on impervious areas to build up to 1/2 of maximum level | real | days | 1.0 | 0.0-100.0 |  |  |  |  |  |
| 8 | conc_totn | Concentration of total N in suspended solid load from impervious areas | real | mg/kg | 0.0 | 0.0-1000.0 |  |  |  |  |  |
| 9 | conc_totp | Concentration of total P in suspended solid load from impervious areas | real | mg/kg | 0.0 | 0.0-1000.0 |  |  |  |  |  |
| 10 | conc_no3n | Concentration of NO3-N in suspended solid load from impervious areas | real | mg/kg | 0.0 | 0.0-50.0 |  |  |  |  |  |
| 11 | urb_cn | Moisture condition II curve number for impervious areas | real | none | 0.0 | 30.0-100.0 |  |  |  |  |  |

## Hydrologic Response Units

### hru-data.hru
**Description:** This file contains pointers to several files that specify the HRU properties.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | id | ID of the HRU | integer | N/A | N/A | N/A | ✓ |  |  |  | hru in hru.con |
| 2 | name | Name the of HRU | string | N/A | N/A | N/A |  |  |  |  |  |
| 3 | topo | Pointer to the topography file | string | N/A | N/A | N/A |  | ✓ | ✓ | topography.hyd |  |
| 4 | hydro | Pointer to the hydrology file | string | N/A | N/A | N/A |  | ✓ | ✓ | hydrology.hyd |  |
| 5 | soil | Pointer to the soil file | string | N/A | N/A | N/A |  | ✓ | ✓ | soils.sol |  |
| 6 | lu_mgt | Pointer to the land use and management file | string | N/A | N/A | N/A |  | ✓ | ✓ | landuse.lum |  |
| 7 | soil_plant_init | Pointer to the soil and plant initialization file | string | N/A | N/A | N/A |  |  | ✓ |  |  |
| 8 | surf_stor | Pointer to the wetland file | string | N/A | N/A | N/A |  | ✓ | ✓ | wetland.wet |  |
| 9 | snow | Pointer to the snow file | string | N/A | N/A | N/A |  | ✓ | ✓ | snow.sno |  |
| 10 | field | Pointer to the field file | string | N/A | N/A | N/A |  | ✓ | ✓ | field.fld |  |

### hru-lte.hru

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | id | ID of the HRU-lte | integer | n/a | N/A | N/A | ✓ |  |  |  | hlt in hru-lte.con |
| 2 | name | Name of HRU-lte | string | n/a | n/a | n/a |  |  |  |  |  |
| 3 | area | HRU-lte drainage area | real | km^2 | 0.0 | N/A |  |  |  |  |  |
| 4 | cn2 | Condition II Curve Number | real | none | 80.0 | N/A |  |  |  |  |  |
| 5 | cn3_swf | Soil water factor for CN3 | real | none | 1.0 | N/A |  |  |  |  |  |
| 6 | t_conc | Time of concentration | real | min | 26.0 | N/A |  |  |  |  |  |
| 7 | soil_dp | Soil profile depth | real | mm | 1500.0 | N/A |  |  |  |  |  |
| 8 | perco_co | Soil percolation coefficient | real | none | 0.0 | 0.0-6000.0 |  |  |  |  |  |
| 9 | slp | Land surface slope | real | m/m | 0.04 | 0.0-0.60 |  |  |  |  |  |
| 10 | slp_len | Land surface slope length | real | m | 64.20 | N/A |  |  |  |  |  |
| 11 | et_co | ET coefficient | real | none | N/A | N/A |  |  |  |  |  |
| 12 | aqu_sp_yld | Specific yield of the shallow aquifer | real | mm | 0.05 | N/A |  |  |  |  |  |
| 13 | alpha_bf | Baseflow alpha factor | real | 0.05 | N/A | N/A |  |  |  |  |  |
| 14 | revap | Revap coefficient | real | none | 0.0 | N/A |  |  |  |  |  |
| 15 | rchg_dp | Percolation coefficient from shallow to deep aquifer | real | none | 0.01 | N/A |  |  |  |  |  |
| 16 | sw_init | Initial soil water (fraction of available water capacity) | real | fraction | 0.50 | 0.0-1.0 |  |  |  |  |  |
| 17 | aqu_init | Initial shallow aquifer storage | real | mm | 3.00 | N/A |  |  |  |  |  |
| 18 | aqu_sh_flo | Initial shallow aquifer flow | real | mm | 0.0 | N/A |  |  |  |  |  |
| 19 | aqu_dp_flo | Initial deep aquifer flow | real | mm | 300.0 | N/A |  |  |  |  |  |
| 20 | snow_h20 | Initial snow water equivalent | real | mm | 0.0 | N/A |  |  |  |  |  |
| 21 | lat | Latitude | real | 31.60 | N/A | N/A |  |  |  |  |  |
| 22 | soil_text | Soil texture | string | n/a | n/a | n/a |  |  |  |  |  |
| 23 | trop_flag | Tropical flag | string | n/a | non_trop | n/a |  |  |  |  |  |
| 24 | grow_start | Start of growing season for non-tropical/start of monsoon initialization period for tropical | string | n/a | n/a | n/a |  |  |  |  |  |
| 25 | grow_end | End of growing season for non-tropical/start of monsoon initialization period for tropical | string | n/a | n/a | n/a |  |  |  |  |  |
| 26 | plnt_typ | Plant type | string | n/a | agrl | n/a |  |  |  |  |  |
| 27 | stress | Plant stress | real | fraction | 1 | 0.0-1.0 |  |  |  |  |  |
| 28 | pet_flag | Potential ET method | string | n/a | harg | n/a |  |  |  |  |  |
| 29 | irr_flag | Irrigation code | string | n/a | no_irr | n/a |  |  |  |  |  |
| 30 | irr_src | Irrigation source | string | n/a | outside_bsn | n/a |  |  |  |  |  |
| 31 | t_drain | Design subsurface tile drain time | real | hr | 0.0 | N/A |  |  |  |  |  |
| 32 | usle_k | USLE soil erodibility factor K | real | n/a | 0.32 | N/A |  |  |  |  |  |
| 33 | usle_c | USLE cover factor C | real | n/a | 0.20 | N/A |  |  |  |  |  |
| 34 | usle_p | USLE support practice factor P | real | n/a | 0.80 | N/A |  |  |  |  |  |
| 35 | usle_ls | USLE slope length and slope factor LS | real | n/a | 0.53 | N/A |  |  |  |  |  |

### hydrologic-response-units

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

*No column information available.*

## Hydrology

### Hydrology

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

*No column information available.*

### field.fld
**Description:** This file specifies the properties of representative fields.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the field | string | n/a | n/a | n/a | ✓ |  |  |  | field in hru-data.hru |
| 2 | len | Length of the field | real | m | 500.0 | N/A |  |  |  |  |  |
| 3 | wd | Width of the field | real | m | 100.0 | N/A |  |  |  |  |  |
| 4 | ang | Currently not used | real | N/A | N/A | N/A |  |  |  |  |  |

### hydrology.hyd
**Description:** This file defines the hydrological characteristics of the HRUs

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the hydrology record | string | n/a | n/a | n/a | ✓ |  |  |  | hydro in hru-data.hru |
| 2 | lat_time | Lateral flow travel time | real | days | 0 | 0-180 |  |  |  |  |  |
| 3 | lat_sed | Sediment concentration in lateral and groundwater flow | real | mg/L | 0 | 0-5000 |  |  |  |  |  |
| 4 | can_max | Maximum canopy storage | real | mm | 1 | 0-100 |  |  |  |  |  |
| 5 | esco | Soil evaporation compensation factor | real | none | 0.5 | 0.01-1 |  |  |  |  |  |
| 6 | epco | Plant uptake compensation factor | real | none | 0 | 0.01-1 |  |  |  |  |  |
| 7 | orgn_enrich | Organic nitrogen enrichment ratio for loading with sediment | real | none | 0 | 0-1 |  |  |  |  |  |
| 8 | orgp_enrich | Phosphorus enrichment ratio for loading with sediment | real | none | 0 | 0-1 |  |  |  |  |  |
| 9 | cn3_swf | Soil water adjustment factor for CN3 | real | none | 0-1 | N/A |  |  |  |  |  |
| 10 | bio_mix | Biological mixing efficiency | real | 0.2 | N/A | N/A |  |  |  |  |  |
| 11 | perco | Percolation coefficient | real | none | 0-1 | N/A |  |  |  |  |  |
| 12 | lat_orgn | Organic nitrogen concentration in lateral flow | real | mg/L | 0-200 | N/A |  |  |  |  |  |
| 13 | lat_orgp | Organic phosphorus concentration in lateral flow | real | mg/L | 0-200 | N/A |  |  |  |  |  |
| 14 | pet_co | Linear adjustment factor for PET equations | real | none | 1 | 0.8-1.2 |  |  |  |  |  |
| 15 | latq_co | Lateral flow coefficient | real | none | 0-1 | N/A |  |  |  |  |  |

### snow.sno
**Description:** This file controls the simulation of snowfall and snowmelt processes.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the snow record | string | n/a | n/a | n/a | ✓ |  |  |  | snow in hru-data.hru |
| 2 | fall_tmp | Snowfall temperature | real | ºC | 1 | -5 - 5 |  |  |  |  |  |
| 3 | melt_tmp | Snow melt base temperature | real | ºC | 0.5 | -5 - 5 |  |  |  |  |  |
| 4 | melt_max | Melt factor for snow on June 21 | real | mm H2O/day-ºC | 0.0 | 0.0-10.0 |  |  |  |  |  |
| 5 | melt_min | Melt factor for snow on December 21 | real | mm H2O/day-ºC | 0.0 | 0.0-10.0 |  |  |  |  |  |
| 6 | tmp_lag | Snowpack temperature lag factor | real | none | 1 | 0.01-1 |  |  |  |  |  |
| 7 | snow_h2o | Minimum snow water content | real | mm | 0.0 | 0.0-500.0 |  |  |  |  |  |
| 8 | cov50 | Fraction of snow | real | fraction | 0.50 | 0.0-1.0 |  |  |  |  |  |
| 9 | snow_init | Initial snow water content at start of simulation | real | mm | 0.0 | 0.0-0.50 |  |  |  |  |  |

### topography.hyd
**Description:** >-

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the topography record | string | n/a | n/a | n/a | ✓ |  |  |  | topo in hru-data.hru |
| 2 | slp | Average slope steepness | real | m/m | 0.02 | N/A |  |  |  |  |  |
| 3 | slp_len | Average slope length | real | m | 50.0 | N/A |  |  |  |  |  |
| 4 | lat_len | Average slope length for lateral subsurface flow | real | m | 50.0 | N/A |  |  |  |  |  |
| 5 | dist_cha | Currently not used | real | N/A | N/A | N/A |  |  |  |  |  |
| 6 | depos | Deposition coefficient | integer | 1 | N/A | N/A |  |  |  |  |  |

## Landscape Units

### landscape-units

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

*No column information available.*

### ls_unit.def
**Description:** >-

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | id | ID of the Landscape Unit | int | N/A | N/A | N/A |  |  |  |  |  |
| 2 | name | Name of the Landscape Unit | text | N/A | N/A | N/A |  |  |  |  |  |
| 3 | elem_tot | Number of columns to read for list of elements in the Landscape Unit | int | N/A | N/A | N/A |  |  |  |  |  |
| 4 | elements | First column listing elements in the Landscape Unit | int | N/A | N/A | N/A |  |  |  |  |  |

### ls_unit.ele
**Description:** This file lists the HRUs that are elements in a Landscape Unit.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | id | ID of the element | integer | N/A | N/A | N/A | ✓ |  |  |  | elements in ls_unit.def |
| 2 | name | Name of the element | string | N/A | N/A | N/A |  |  |  |  |  |
| 3 | obj_typ | Object type of the element | string | N/A | N/A | N/A |  |  |  |  |  |
| 4 | obj_typ_no | Object ID of the element | integer | N/A | N/A | N/A |  | ✓ |  |  |  |
| 5 | bsn_frac | Fraction of basin area assigned to this object | real | N/A | N/A | N/A |  |  |  |  |  |
| 6 | lsu_frac | Fraction of Landscape Unit area assigned to this object | real | N/A | N/A | N/A |  |  |  |  |  |

## Landuse And Management

### cntable.lum
**Description:** This file lists typical Curve Number values for different land use types.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Curve Number class name | string | n/a | n/a | n/a | ✓ |  |  |  | cn2 in landuse.lum |
| 2 | cn_a | Curve Number for Hydrologic Soil Group A | real | none | Varies by land use | 30.0-100.0 |  |  |  |  |  |
| 3 | cn_b | Curve Number for Hydrologic Soil Group B | real | none | Varies by land use | 30.0-100.0 |  |  |  |  |  |
| 4 | cn_c | Curve Number for Hydrologic Soil Group C | real | none | Varies by land use | 30.0-100.0 |  |  |  |  |  |
| 5 | cn_d | Curve Number for Hydrologic Soil Group D | real | none | Varies by land use | 30.0-100.0 |  |  |  |  |  |

### cons_practice.lum
**Description:** >-

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the conservation practice | string | ​n/a | n/a | n/a | ✓ |  |  |  | cons_prac in landuse.lum |
| 2 | usle_p | USLE P factor | ​real | none | 1.0 | 0.0-1.0 |  |  |  |  |  |
| 3 | slp_len_max | Maximum slope length | real | m | 1.0 | N/A |  |  |  |  |  |

### landuse-and-management

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

*No column information available.*

### landuse.lum
**Description:** >-

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the land use and management record | string | N/A | N/A | N/A | ✓ |  |  |  | lu_mgt in hru-data.hru |
| 2 | cal_grp | Calibration group | string | N/A | N/A | N/A |  |  |  |  |  |
| 3 | plnt_com | Pointer to the plant community file | string | N/A | N/A | N/A |  | ✓ | ✓ | plant.ini |  |
| 4 | mgt | Pointer to the management schedule file | string | N/A | N/A | N/A |  | ✓ | ✓ | management.sch |  |
| 5 | cn2 | Pointer to the Curve Number database | string | N/A | N/A | N/A |  | ✓ | ✓ | cntable.lum |  |
| 6 | cons_prac | Pointer to the conservation practice database | string | N/A | N/A | N/A |  | ✓ | ✓ | cons_practice.lum |  |
| 7 | urban | Pointer to the urban database | string | N/A | N/A | N/A |  |  | ✓ |  |  |
| 8 | urb_ro | Urban runoff simulation option | string | N/A | N/A | N/A |  | ✓ | ✓ | urban.urb |  |
| 9 | ov_mann | Pointer to the overland Manning's n database | string | N/A | N/A | N/A |  | ✓ | ✓ |  |  |
| 10 | tile | Pointer to the tile drain file | string | N/A | N/A | N/A |  | ✓ | ✓ | tiledrain.str |  |
| 11 | sep | Pointer to the septic file | string | N/A | N/A | N/A |  | ✓ | ✓ | septic.str |  |
| 12 | vfs | Pointer to the filter strip file | string | N/A | N/A | N/A |  | ✓ | ✓ | filterstrip.str |  |
| 13 | grww | Pointer to the grassed waterway file | string | N/A | N/A | N/A |  | ✓ | ✓ | grassedww.str |  |
| 14 | bmp | Pointer to the user BMP file | string | N/A | N/A | N/A |  | ✓ | ✓ | bmpuser.str |  |

### lum.dtl
**⚠️ SPECIAL STRUCTURE**

**Description:** This file contains land use and management decision tables.

**Metadata Structure:** Non-standard - first line is reserved for a title. The second line in the file specifies the total number of decision tables included in the file.

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the decision table | string | N/A | N/A | N/A |  |  |  |  |  |
| 2 | conds | Number of conditions | integer | N/A | N/A | N/A |  |  |  |  |  |
| 3 | alts | Number of alternatives | integer | N/A | N/A | N/A |  |  |  |  |  |
| 4 | acts | Number of actions | integer | N/A | N/A | N/A |  |  |  |  |  |

### management.sch
**⚠️ SPECIAL STRUCTURE**

**Description:** This file is used to schedule management operations.

**Special Structure:** The structure of the **management.sch** file is different than that of most other SWAT+ input files. The first line for each management schedule specifies the name of the schedule and the number of scheduled and/or automatic operations.

**Metadata Structure:** Non-standard - first line for each management schedule specifies the name of the schedule and the number of scheduled and/or automatic operations. When using scheduled operations, it is followed by one line per operation listing operation-specific data.

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the management schedule | string | N/A | N/A | N/A | ✓ |  |  |  | mgt in landuse.lum |
| 2 | numb_ops | Number of scheduled management operations | integer | N/A | N/A | N/A |  |  |  |  |  |
| 3 | numb_auto | Number of automatic operations | integer | N/A | N/A | N/A |  |  |  |  |  |
| 4 | op_typ | Type of management operation | string | N/A | N/A | N/A |  |  |  |  |  |
| 5 | mon | Month operation is scheduled for | integer | N/A | N/A | N/A |  |  |  |  |  |
| 6 | day | Day operation is scheduled for | integer | N/A | N/A | N/A |  |  |  |  |  |
| 7 | hu_sch | Currently not used | real | N/A | N/A | N/A |  |  |  |  |  |
| 8 | op_data1 | Operation data 1 | string | N/A | N/A | N/A |  |  |  |  |  |
| 9 | op_data2 | Operation data 2 | string | N/A | N/A | N/A |  |  |  |  |  |
| 10 | op_data3 | Operation data 3 | real | N/A | N/A | N/A |  |  |  |  |  |

### ovn_table.lum
**Description:** >-

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name_ovn | Overland flow Manning's n class name | string | n/a | n/a | n/a | ✓ |  |  |  | ov_mann in landuse.lum |
| 2 | ovn_mean | Mean overland flow Manning’s n value | real | n/a | 0.5 | N/A |  |  |  |  |  |
| 3 | ovn_min | Minimum overland flow Manning’s n value | real | n/a | 0.5 | N/A |  |  |  |  |  |
| 4 | ovn_max | Maximum overland flow Manning’s n value | real | n/a | 0.5 | N/A |  |  |  |  |  |

### plant.ini
**⚠️ SPECIAL STRUCTURE**

**Description:** This file stores information about the plants growing in a plant community.

**Special Structure:** The structure of the file **plant.ini** is different than that of most other SWAT+ input files. The first line for each plant community specifies how many plants there are in the community and what the initial year of the rotation is.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Plant community name | string | n/a | n/a | n/a | ✓ |  |  |  | plnt_com in landuse.lum |
| 2 | plnt_cnt | Number of plants in the community | integer | n/a | N/A | N/A |  |  |  |  |  |
| 3 | rot_yr_ini | Initial rotation year | integer | n/a | N/A | N/A |  |  |  |  |  |
| 4 | plnt_name | Plant name as in plant database | string | n/a | n/a | N/A | ✓ | ✓ |  | plants.plt |  |
| 5 | lc_status | Land cover status at start of simulation | string | n/a | n/a | N/A |  |  |  |  |  |
| 6 | lai_init | Initial Leaf Area Index | real | m^2/m^2 | 0.0 | 0.0-8.0 |  |  |  |  |  |
| 7 | bm_init | Initial plant biomass | real | kg/ha | 0.0 | 0.0-1000.0 |  |  |  |  |  |
| 8 | phu_init | Initial fraction of plant heat units accumulated | real | fraction | 0.0 | 0.0-100.0 |  |  |  |  |  |
| 9 | plnt_pop | Plant population | real | n/a | 0.0 | N/A |  |  |  |  |  |
| 10 | yrs_init | Age of plant at start of simulation | real | years | 0.0 | N/A |  |  |  |  |  |
| 11 | rsd_init | Initial residue cover | real | kg/ha | 10000.00 | 0.0-10000.0 |  |  |  |  |  |

## Management Practices

### chem_app.ops
**Description:** >-

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Chemical application name | string | n/a | n/a | n/a | ✓ |  |  |  |  |
| 2 | chem_form | Currently not used | string | N/A | N/A | N/A |  |  |  |  |  |
| 3 | app_typ | Currently not used | string | N/A | N/A | N/A |  |  |  |  |  |
| 4 | app_eff | Application efficiency | real | 0. | N/A | N/A |  |  |  |  |  |
| 5 | foliar_eff | Currently not used | real | N/A | N/A | N/A |  |  |  |  |  |
| 6 | inject_dp | Injection depth | real | mm | 0. | N/A |  |  |  |  |  |
| 7 | surf_frac | Surface fraction | real | 0. | N/A | N/A |  |  |  |  |  |
| 8 | drift_pot | Currently not used | real | N/A | N/A | N/A |  |  |  |  |  |
| 9 | aerial_unif | Currently not used | real | N/A | N/A | N/A |  |  |  |  |  |

### fire.ops
**Description:** This file contains pre-defined burning/fire operations.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | ​Fire operation name | ​string | n/a | n/a | n/a | ✓ |  |  |  |  |
| 2 | chg_cn2 | Change in SCS Curve Number II value | real | ​n/a | ​0.0 | ​n/a |  |  |  |  |  |
| 3 | frac_burn | ​Fraction burned | real | ​fraction | ​0.0 | 0.0-100.0​ |  |  |  |  |  |

### graze.ops
**Description:** This file contains pre-defined grazing operations.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Grazing operation name | string | n/a | n/a | n/a | ✓ |  |  |  |  |
| 2 | fertname | Fertilizer database name for manure deposited during grazing | string | n/a | n/a | n/a |  |  |  |  |  |
| 3 | bm_eat | Dry weight of biomass removed by grazing daily | real | (kg/ha)/day | 0.0 | 0.0-500.0 |  |  |  |  |  |
| 4 | bm_tramp | Dry weight of biomass removed by trampling daily | real | (kg/ha)/day | 0.0 | 0.0-500.0 |  |  |  |  |  |
| 5 | man_amt | Dry weight of manure deposited daily | real | (kg/ha)/day | 0.0 | 0.0-500.0 |  |  |  |  |  |
| 6 | grz_bm_min | Minimum plant biomass for grazing to occur | real | kg/ha | 0.0 | 0.0-5000.0 |  |  |  |  |  |

### harv.ops
**Description:** This file contains pre-defined harvest operations.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Harvest operation name | string | n/a | ​n/a | ​n/a | ✓ |  |  |  |  |
| 2 | harv_typ | Harvest type | ​string | ​n/a | n/a | ​n/a |  |  |  |  |  |
| 3 | harv_idx | Harvest index target specified at harvest | ​real | ​fraction | ​0.0 | 0.0-1.0 |  |  |  |  |  |
| 4 | harv_eff | ​Harvest efficiency | ​real | fraction | ​0.0 | ​0.0-1.0 |  |  |  |  |  |
| 5 | harv_bm_min | ​Minimum biomass to allow harvest | ​real | ​kg/ha | ​0.0 | ​ |  |  |  |  |  |

### irr.ops
**Description:** This file contains pre-defined irrigation operations.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | ​Irrigation operation name | ​string | ​n/a | ​n/a | ​n/a | ✓ |  |  |  |  |
| 2 | irr_eff | ​Irrigation in-field efficiency | real | ​n/a | 0.0 | ​0.0-1.0 |  |  |  |  |  |
| 3 | surq_rto | ​Surface runoff ratio | ​real | fraction | ​0.0 | 0.0-100.0 |  |  |  |  |  |
| 4 | irr_amt | ​Irrigation application amount | real | mm | ​0.0 | ​0.0-1.0 |  |  |  |  |  |
| 5 | irr_dep | ​Depth of application for subsurface irrigation | ​real | mm | ​0.0 | ​ |  |  |  |  |  |
| 6 | irr_salt | ​Concentration of total salt in irrigation water | ​real | ​mg/kg | ​0.0 | ​ |  |  |  |  |  |
| 7 | irr_no3n | Concentration of total nitrate in irrigation water | real | mg/kg | 0.0 | N/A |  |  |  |  |  |
| 8 | irr_po4 | Concentration of phosphate in irrigation water | real | mg/kg | 0.0 | N/A |  |  |  |  |  |

### management-practices

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

*No column information available.*

### sweep.ops
**Description:** This file contains pre-defined street sweeping operations.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Street sweeping operation name | string | n/a | n/a | n/a | ✓ |  |  |  |  |
| 2 | swp_eff | Removal efficiency of sweeping operation | real | fraction | 0.0 | 0.0-1.0 |  |  |  |  |  |
| 3 | frac_curb | Fraction of the curb length that is sweepable | real | fraction | 0.0 | 0.0-1.0 |  |  |  |  |  |

## Nutrient Initialization

### nutrient-initialization

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

*No column information available.*

### om_water.ini

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of water and nutrient initialization | string | n/a | n/a | n/a |  |  |  |  |  |
| 2 | vol | Volume of water | real | m^3 | 0 | N/A |  |  |  |  |  |
| 3 | sed | Sediment | real | metric tons | 0 | N/A |  |  |  |  |  |
| 4 | part_n | Organic N | real | kg N | 0 | N/A |  |  |  |  |  |
| 5 | part_p | Organic P | real | kg P | 0 | N/A |  |  |  |  |  |
| 6 | no3 | NO3-N | real | kg N | 0 | N/A |  |  |  |  |  |
| 7 | solp | Mineral (soluble P) | real | kg P | 0 | N/A |  |  |  |  |  |
| 8 | chl_a | Chlorophyll-a | real | kg | 0 | N/A |  |  |  |  |  |
| 9 | nh3 | NH3 | real | kg N | 0 | N/A |  |  |  |  |  |
| 10 | no2 | NO2 | real | kg N | 0 | N/A |  |  |  |  |  |
| 11 | cbn_bod | Carbonaceous biological oxygen demand | real | kg | 0 | N/A |  |  |  |  |  |
| 12 | dis_ox | Dissolved oxygen | real | kg | 0 | N/A |  |  |  |  |  |
| 13 | sand | Detached sand | real | tons | 0 | N/A |  |  |  |  |  |
| 14 | silt | Detached silt | real | tons | 0 | N/A |  |  |  |  |  |
| 15 | clay | Detached clay | real | tons | 0 | N/A |  |  |  |  |  |
| 16 | sm_ag | Detached small aggregates | real | tons | 0 | N/A |  |  |  |  |  |
| 17 | l_ag | Detached large aggregates | real | tons | 0 | N/A |  |  |  |  |  |
| 18 | gvl | Gravel | real | tons | 0 | N/A |  |  |  |  |  |
| 19 | tmp | Temperature | real | deg C | 0 | N/A |  |  |  |  |  |

## Point Sources And Inlets

### point-sources-and-inlets

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

*No column information available.*

### recall.rec

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

*No column information available.*

## Reservoirs

### hydrology.res
**Description:** This file contains the reservoir hydrology parameters.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the reservoir hydrology record | string | n/a | n/a | n/a | ✓ | ✓ |  |  |  |
| 2 | yr_op | The year of the simulation that the reservoir becomes operational | integer | n/a | 1 | 1-9999 |  |  |  |  |  |
| 3 | mon_op | The month of the simulation that the reservoir becomes operational | integer | n/a | 1 | 1-12 |  |  |  |  |  |
| 4 | area_ps | Reservoir surface area when reservoir is filled to principal spillway | real | ha | 1500.0 | 1-3000.0 |  |  |  |  |  |
| 5 | vol_ps | Volume of water needed to fill the reservoir to principal spillway | real | ha-m | 1500.0 | 15.0-3000.0 |  |  |  |  |  |
| 6 | area_es | Reservoir surface area when reservoir is filled to emergency spillway | real | ha | 500.0 | 1.0-1000.0 |  |  |  |  |  |
| 7 | vol_es | Volume of water needed to fill the reservoir to emergency spillway | real | ha-m | 55.0 | 10.0-100.0 |  |  |  |  |  |
| 8 | k | Hydraulic conductivity of the reservoir bottom | real | mm/hr | 0.0 | 0.0-1.0 |  |  |  |  |  |
| 9 | evap_co | Reservoir evaporation coefficient | real | n/a | 0.60 | 0.0-1.0 |  |  |  |  |  |
| 10 | shp_co1 | Shape coefficient 1 for reservoirs | real | n/a | 0.0 | N/A |  |  |  |  |  |
| 11 | shp_co2 | Shape coefficient 2 for reservoirs | real | n/a | 0.0 | N/A |  |  |  |  |  |

### initial.res
**Description:** >-

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name​ | Name of the reservoir and wetland initialization record | string | N/A | N/A | N/A |  |  |  |  |  |
| 2 | org_min​ | Pointer to the organic-mineral initialization file | string | N/A | N/A | N/A |  |  | ✓ |  |  |
| 3 | pest​ | Pointer to the pesticide initialization file | string | N/A | N/A | N/A |  |  | ✓ |  |  |
| 4 | path​ | Currently not used | string | N/A | N/A | N/A |  |  |  |  |  |
| 5 | hmet​ | Currently not used | string | N/A | N/A | N/A |  |  |  |  |  |
| 6 | salt​ | Pointer to the salt initialization file | string | N/A | N/A | N/A |  |  | ✓ |  |  |

### nutrients.res
**Description:** This file contains the reservoir and wetland nutrient parameters.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the reservoir and wetland nutrient record | string | n/a | n/a | n/a |  |  |  |  |  |
| 2 | mid_start | Beginning month of the mid-year nutrient settling period | integer | n/a | 5 | 0-12 |  |  |  |  |  |
| 3 | mid_end | Ending month of the mid-year nutrient settling period | integer | n/a | 10 | 0-12 |  |  |  |  |  |
| 4 | mid_n_stl | Nitrogen settling rate during the mid-year nutrient settling period | real | m/day | 5.50 | 1.0-15.0 |  |  |  |  |  |
| 5 | n_stl | Nitrogen settling rate outside the mid-year nutrient settling period | real | m/day | 5.50 | 1.0-15.0 |  |  |  |  |  |
| 6 | mid_p_stl | Phosphorus settling rate during the mid-year nutrient settling period | real | m/day | 10.0 | 2.0-20.0 |  |  |  |  |  |
| 7 | p_stl | Phosphorus settling rate outside the mid-year nutrient settling period | real | m/day | 10.0 | 2.0-20.0 |  |  |  |  |  |
| 8 | chla_co | Chlorophyll-a production coefficient for the reservoir | real | n/a | 1.0 | 0.0-1.0 |  |  |  |  |  |
| 9 | secchi_co | Water clarity coefficient for the reservoir | real | n/a | 1.0 | 0.50-2.0 |  |  |  |  |  |
| 10 | theta_n | Temperature adjustment for nitrogen loss (settling) | real | n/a | 1.0 | N/A |  |  |  |  |  |
| 11 | theta_p | Temperature adjustment for phosphorus loss (settling) | real | n/a | 1.0 | N/A |  |  |  |  |  |
| 12 | n_min_stl | Minimum nitrogen concentration for settling | real | ppm | 0.10 | N/A |  |  |  |  |  |
| 13 | p_min_stl | Minimum phosphorus concentration for settling | real | ppm | 0.01 | N/A |  |  |  |  |  |

### res_rel.dtl
**Description:** This file is used to control reservoir release operations.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

*No column information available.*

### reservoir.res
**Description:** >-

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | id | ID of the reservoir | integer | N/A | N/A | N/A | ✓ | ✓ |  |  |  |
| 2 | name | Name of the reservoir | string | N/A | N/A | N/A |  |  |  |  |  |
| 3 | init​ | Pointer to the reservoir and wetland initialization file | string | N/A | N/A | N/A |  |  | ✓ |  |  |
| 4 | hyd​ | Pointer to the reservoir hydrology file | string | N/A | N/A | N/A |  |  | ✓ |  |  |
| 5 | rel​ | Pointer to the reservoir and wetland release decision table file | string | N/A | N/A | N/A |  |  | ✓ |  |  |
| 6 | sed​ | Pointer to the reservoir and wetland sediment file | string | N/A | N/A | N/A |  |  | ✓ |  |  |
| 7 | nut​ | Pointer to the reservoir and wetland nutrient file | string | N/A | N/A | N/A |  |  | ✓ |  |  |

### reservoirs

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

*No column information available.*

### sediment.res
**Description:** This file contains the reservoir and wetland sediment parameters.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the reservoir and wetland sediment record | string | n/a | n/a | n/a | ✓ | ✓ |  |  |  |
| 2 | nsed | Normal amount of sediment in the reservoir | real | kg/L | 1.0 | 1.0-5000.0 |  |  |  |  |  |
| 3 | d50 | Median particle size of suspended and benthic sediment | real | μm | 10.0 | N/A |  |  |  |  |  |
| 4 | carbon | Organic carbon in suspended and benthic sediment | real | % | N/A | N/A |  |  |  |  |  |
| 5 | bd | Bulk density of benthic sediment | real | t/m^3 | N/A | N/A |  |  |  |  |  |
| 6 | sed_stl | Sediment settling rate | real | n/a | 1.0 | N/A |  |  |  |  |  |
| 7 | stl_vel | Sediment settling velocity | real | m/d | 1.0 | N/A |  |  |  |  |  |

### weir.res
**Description:** This file contains the reservoir weir parameters.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the reservoir weir record | string | n/a | n/a | n/a | ✓ | ✓ |  |  |  |
| 2 | numb_steps | Number of time steps in day for weir routing | integer | n/a | 24 | 1-24 |  |  |  |  |  |
| 3 | disch_co | Weir discharge coefficient | real | n/a | 1.0 | N/A |  |  |  |  |  |
| 4 | energy_co | Energy coefficient | real | m^1/2 d^-1 | 150000.0 | 147000.0-153000.0 |  |  |  |  |  |
| 5 | weir_wd | Width of weir | real | m | 2.0 | N/A |  |  |  |  |  |
| 6 | vel_co | Velocity exponent coefficient for bedding material | real | n/a | 1.75 | N/A |  |  |  |  |  |
| 7 | dp_co | Depth exponent coefficient for bedding material | real | n/a | 1.0 | N/A |  |  |  |  |  |

## Routing Units

### routing-units

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

*No column information available.*

### untitled
**Description:** >-

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | id | ID of the Routing Unit | integer | N/A | N/A | N/A | ✓ |  |  |  | rtu in rout_unit.con |
| 2 | name | Name of the Routing Unit | string | N/A | N/A | N/A |  |  |  |  |  |
| 3 | define | Pointer to the Routing Unit definition file | string | N/A | N/A | N/A |  | ✓ | ✓ | rout_unit.def |  |
| 4 | dlr | Delivery ratio | real | N/A | N/A | N/A |  |  |  |  |  |
| 5 | topo | Pointer to the topography file | string | N/A | N/A | N/A |  | ✓ | ✓ | topography.hyd |  |
| 6 | field | Pointer to the field file | string | N/A | N/A | N/A |  | ✓ | ✓ | field.fld |  |

### untitled-1
**Description:** This file specifies which elements a Routing Unit contains.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | id | ID of the Routing Unit | integer | N/A | N/A | N/A | ✓ |  |  |  | define in rout_unit.rtu |
| 2 | name | Name of the Routing Unit | string | N/A | N/A | N/A |  |  |  |  |  |
| 3 | elem_tot | Number of columns to read for list of elements in the Routing Unit | integer | N/A | N/A | N/A |  |  |  |  |  |
| 4 | elements | First column listing elements in the Routing Unit | integer | N/A | N/A | N/A |  |  |  |  |  |

### untitled-2
**Description:** This file lists all elements that are part of a Routing Unit.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | id | ID of the element | integer | N/A | N/A | N/A |  | ✓ |  |  |  |
| 2 | name | Name of the element | string | N/A | N/A | N/A |  |  |  |  |  |
| 3 | obj_typ | Object type of the element | string | N/A | N/A | N/A |  |  |  |  |  |
| 4 | obj_id | Object ID of the element | integer | N/A | N/A | N/A |  | ✓ |  |  |  |
| 5 | frac | Fraction of Routing Unit area assigned to the element | real | N/A | N/A | N/A |  |  |  |  |  |
| 6 | dlr | Currently not used | real | N/A | N/A | N/A |  |  |  |  |  |

## Simulation Settings

### object.prt
**Description:** >-

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | id | ID of the object print record | integer | N/A | N/A | N/A |  |  |  |  |  |
| 2 | obj_typ | Type of object to print output for | string | N/A | N/A | N/A |  |  |  |  |  |
| 3 | obj_typ_no | Number of the object to print output for | integer | N/A | N/A | N/A |  |  |  |  |  |
| 4 | hyd_typ | Type of hydrograph to print | string | N/A | N/A | N/A |  |  |  |  |  |
| 5 | filename | User-defined name of output file | string | N/A | N/A | N/A |  |  |  |  |  |

### print.prt
**Description:** This file controls which output files will be printed during the simulation.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | nyskip | Number of years at the beginning of the simulation to not print output | integer | N/A | N/A | N/A |  |  |  |  |  |
| 2 | day_start | Julian day to start printing output (for daily printing only) | integer | N/A | N/A | N/A |  |  |  |  |  |
| 3 | yrc_start | Calendar year to start printing output | integer | N/A | N/A | N/A |  |  |  |  |  |
| 4 | day_end | Julian day to stop printing output (for daily printing only) | integer | N/A | N/A | N/A |  |  |  |  |  |
| 5 | yrc_end | Calendar year to stop printing output | integer | N/A | N/A | N/A |  |  |  |  |  |
| 6 | interval | Print interval within the period | integer | N/A | N/A | N/A |  |  |  |  |  |
| 7 | aa_int_cnt | Number of print intervals for average annual output | integer | N/A | N/A | N/A |  |  |  |  |  |
| 8 | csvout | Code for printing output in CSV format (y=yes, n=no) | string | N/A | N/A | N/A |  |  |  |  |  |
| 9 | dbout | Code for printing output in DB format (y=yes, n=no) | string | N/A | N/A | N/A |  |  |  |  |  |
| 10 | cdfout | Code for printing output in Net-CDF format (y=yes, n=no) | string | N/A | N/A | N/A |  |  |  |  |  |
| 11 | crop_yld | Code for printing yearly and average annual crop yields (y=yes, n=no) | string | N/A | N/A | N/A |  |  |  |  |  |
| 12 | mgtout | Code for printing management output (y=yes, n=no) | string | N/A | N/A | N/A |  |  |  |  |  |
| 13 | hydcon | Code for printing hydrograph connection output (y=yes, n=no) | string | N/A | N/A | N/A |  |  |  |  |  |
| 14 | fdcout | Code for printing flow duration curve output (y=yes, n=no) | string | N/A | N/A | N/A |  |  |  |  |  |
| 15 | object | Objects that output can be printed for at different time steps | string | N/A | N/A | N/A |  |  |  |  |  |
| 16 | daily | Code for printing daily output (y=yes, n=no) | string | N/A | N/A | N/A |  |  |  |  |  |
| 17 | monthly | Code for printing monthly output (y=yes, n=no) | string | N/A | N/A | N/A |  |  |  |  |  |
| 18 | yearly | Code for printing yearly output (y=yes, n=no) | string | N/A | N/A | N/A |  |  |  |  |  |
| 19 | avann | Code for printing average annual output (y=yes, n=no) | string | N/A | N/A | N/A |  |  |  |  |  |

### simulation-settings

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

*No column information available.*

### time.sim
**Description:** This file controls the simulation time period and time step.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | day_start | Beginning day of the simulation | integer | N/A | N/A | N/A |  |  |  |  |  |
| 2 | yrc_start | Beginning year of the simulation | integer | N/A | N/A | N/A |  |  |  |  |  |
| 3 | day_end | Ending day of the simulation | integer | N/A | N/A | N/A |  |  |  |  |  |
| 4 | yrc_end | Ending year of the simulation | integer | N/A | N/A | N/A |  |  |  |  |  |
| 5 | step | Time step of the simulation | integer | N/A | N/A | N/A |  |  |  |  |  |

## Soils

### Soils

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

*No column information available.*

### nutrients.sol
**Description:** This file specifies the initial soil nutrient contents.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the soil nutrient record | string | N/A | N/A | N/A | ✓ |  |  |  | nutrients in soil_plant.ini |
| 2 | exp_co | Depth coefficient to adjust nutrient concentrations for depth | real | N/A | N/A | N/A |  |  |  |  |  |
| 3 | lab_p | Labile P in soil surface | real | N/A | N/A | N/A |  |  |  |  |  |
| 4 | nitrate | Nitrate N in soil surface | real | N/A | N/A | N/A |  |  |  |  |  |
| 5 | fr_hum_act | Fraction of soil humus that is active | real | N/A | N/A | N/A |  |  |  |  |  |
| 6 | hum_c_n | Humus C:N ratio | real | N/A | N/A | N/A |  |  |  |  |  |
| 7 | hum_c_p | Humus C:P ratio | real | N/A | N/A | N/A |  |  |  |  |  |
| 8 | inorgp | Currently not used | real | N/A | N/A | N/A |  |  |  |  |  |
| 9 | watersol_p | Currently not used | real | N/A | N/A | N/A |  |  |  |  |  |
| 10 | h3a_p | Currently not used | real | N/A | N/A | N/A |  |  |  |  |  |
| 11 | mehlich_p | Currently not used | real | N/A | N/A | N/A |  |  |  |  |  |
| 12 | bray_strong_p | Currently not used | real | N/A | N/A | N/A |  |  |  |  |  |

### soil_plant.ini
**Description:** >-

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the soil and plant initialization | string | N/A | N/A | N/A | ✓ |  |  |  | soil_plant_init in hru-data.hru |
| 2 | sw_frac | Soil water fraction at the beginning of the simulation | real | N/A | N/A | N/A |  |  |  |  |  |
| 3 | nutrients | Pointer to the nutrient initialization file | string | N/A | N/A | N/A |  | ✓ | ✓ | nutrients.sol |  |
| 4 | pest | Pointer to the pesticide initialization file | string | N/A | N/A | N/A |  | ✓ | ✓ |  |  |
| 5 | path | Currently not used | string | N/A | N/A | N/A |  |  |  |  |  |
| 6 | hmet | Currently not used | string | N/A | N/A | N/A |  |  |  |  |  |
| 7 | salt | Pointer to the salt initialization file | string | N/A | N/A | N/A |  |  | ✓ |  |  |

### soils-lte.sol
**Description:** This file contains the soil properties of HRU-ltes.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the soil | string | n/a | N/A | N/A |  |  |  |  |  |
| 2 | awc | Available water capacity of the soil | real | mm/mm | N/A | N/A |  |  |  |  |  |
| 3 | por | Porosity of the soil | real | mm/mm | N/A | N/A |  |  |  |  |  |
| 4 | scon | Saturated hydraulic conductivity of the soil | real | mm/hr | N/A | N/A |  |  |  |  |  |

### soils.sol
**⚠️ SPECIAL STRUCTURE**

**Description:** This file contains the physical soil properties.

**Special Structure:** The structure of the file **soils.sol** is different than that of most other SWAT+ input files. Depending on the number of soil layers, the file contains two to ten lines per soil.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the soil | string | n/a | N/A | N/A | ✓ |  |  |  | soil in hru-data.hru |
| 2 | nly | Number of layers in the soil | integer | none | N/A | N/A |  |  |  |  |  |
| 3 | hyd_grp | Hydrologic soil group of the soil | string | n/a | N/A | N/A |  |  |  |  |  |
| 4 | dp_tot | Maximum rooting depth | real | mm | N/A | N/A |  |  |  |  |  |
| 5 | anion_excl | Fraction of porosity (void space) from which anions are excluded | real | fraction | N/A | N/A |  |  |  |  |  |
| 6 | perc_crk | Potential or maximum crack volume of the soil profile expressed as a fraction of the total soil volume | real | N/A | N/A | N/A |  |  |  |  |  |
| 7 | texture | Texture of the soil | string | n/a | N/A | N/A |  |  |  |  |  |
| 8 | --------------------- | ----------------------------------------------------------- | ---- | ---- | ------- | ----- |  |  |  |  |  |
| 9 | dp | Depth from the soil surface to the bottom of the soil layer | real | N/A | N/A | N/A |  |  |  |  |  |
| 10 | bd | Moist bulk density of the soil layer | real | N/A | N/A | N/A |  |  |  |  |  |
| 11 | awc | Available water capacity of the soil layer | real | N/A | N/A | N/A |  |  |  |  |  |
| 12 | soil_k | Saturated hydraulic conductivity of the soil layer | real | N/A | N/A | N/A |  |  |  |  |  |
| 13 | carbon | Organic carbon content of the soil layer | real | N/A | N/A | N/A |  |  |  |  |  |
| 14 | clay | Clay content of the soil layer | real | N/A | N/A | N/A |  |  |  |  |  |
| 15 | silt | Silt content of the soil layer | real | N/A | N/A | N/A |  |  |  |  |  |
| 16 | sand | Sand content of the soil layer | real | N/A | N/A | N/A |  |  |  |  |  |
| 17 | rock | Rock fragment content of the soil layer | real | N/A | N/A | N/A |  |  |  |  |  |
| 18 | alb | Moist soil albedo of the top layer | real | N/A | N/A | N/A |  |  |  |  |  |
| 19 | usle_k | USLE equation soil erodibility (K) factor of the top layer | real | N/A | N/A | N/A |  |  |  |  |  |
| 20 | ec | Electrical conductivity of the soil layer | real | N/A | N/A | N/A |  |  |  |  |  |
| 21 | caco3 | Calcium carbonate (CaCO3) content of the soil layer | real | N/A | N/A | N/A |  |  |  |  |  |
| 22 | ph | pH value of the soil layer | real | N/A | N/A | N/A |  |  |  |  |  |

## Structural Practices

### bmpuser.str
**Description:** This file contains the user Best Management Practice parameters.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | ​Name of BMP record | string | n/a | n/a | n/a | ✓ |  |  |  | bmp in landuse.lum |
| 2 | flag_bmp | Currently not used | integer | N/A | N/A | N/A |  |  |  |  |  |
| 3 | sed_eff | Sediment removal by BMP | real | percent | 2.0 | 0.0-100.0 |  |  |  |  |  |
| 4 | ptlp_eff | ​Particulate P removal by BMP | real | percent | 2.0 | 0.0-100.0 |  |  |  |  |  |
| 5 | solp_eff | ​Soluble P removal by BMP | real | percent | 2.0 | 0.0-100.0 |  |  |  |  |  |
| 6 | ptln_eff | Particulate N removal by BMP | real | percent | 2.0 | 0.0-100.0 |  |  |  |  |  |
| 7 | soln_eff | Soluble N removal by BMP | real | percent | 2.0 | 0.0-100.0 |  |  |  |  |  |
| 8 | bact_eff | Bacteria removal by BMP | real | percent | 2.0 | 0.0-100.0 |  |  |  |  |  |

### filterstrip.str
**Description:** This file contains the filter strip parameters.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of filter strip record | ​string | ​n/a | n/a | n/a | ✓ |  |  |  | vfs in landuse.lum |
| 2 | flag_fs | Currently not used | integer | N/A | N/A | N/A |  |  |  |  |  |
| 3 | fld_vfs | ​Ratio of field area to filter strip area | real | ratio | 10.0 | 0.0-300.0 |  |  |  |  |  |
| 4 | con_vfs | ​Fraction of flow entering the most concentrated 10% of the filter strip | real | fraction | 0.50 | 0.25-0.75 |  |  |  |  |  |
| 5 | cha_q | ​Fraction of fully channelized flow | real | % | 90.0 | 0.0-100.0 |  |  |  |  |  |

### grassedww.str
**Description:** This file contains the grassed waterway parameters.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the grassed waterway record | string | n/a | n/a | n/a | ✓ |  |  |  | grww in landuse.lum |
| 2 | flag_grww | ​Currently not used | integer | N/A | N/A | N/A |  |  |  |  |  |
| 3 | mann | Manning's n for grassed waterway | real | n/a | 0.10 | 0.001-0.50 |  |  |  |  |  |
| 4 | sed_co | Sediment transport coefficient | real | n/a | 0.01 | 0.0-1.0 |  |  |  |  |  |
| 5 | dp | Depth of grassed waterway | real | m | 10.0 | 0.0-10.0 |  |  |  |  |  |
| 6 | wd | Width of grassed waterway | real | m | 1000.0 | 0.0-1000.0 |  |  |  |  |  |
| 7 | len | Length of grassed waterway | real | km | 10000.0 | 0.0-10000.0 |  |  |  |  |  |
| 8 | slp | Slope of grassed waterway | real | m/m | 1.0 | 0.0-1.0 |  |  |  |  |  |

### septic.str
**Description:** This file contains the septic system parameters.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of septic system record | string | n/a | n/a | n/a | ✓ |  |  |  | sep in landuse.lum |
| 2 | typ | Septic system type | integer | n/a | 0 | N/A |  | ✓ |  | septic.sep |  |
| 3 | yr | ​Year the septic system became operational | integer | n/a | 0 | N/A |  |  |  |  |  |
| 4 | operation | ​Septic system operation flag | integer | n/a | 0 | 0-2 |  |  |  |  |  |
| 5 | residents | ​Number of permanent residents in the house | real | n/a | 1 | 1.0-12.0 |  |  |  |  |  |
| 6 | area | ​Average area of drainfield of individual septic systems | real | m^2 | 1 | N/A |  |  |  |  |  |
| 7 | t_fail | Time until failing systems gets fixed | integer | days | 0 | 0-150 |  |  |  |  |  |
| 8 | dp_bioz | Depth to the top of the biozone layer from the ground surface | real | mm | 1 | N/A |  |  |  |  |  |
| 9 | thk_bioz | Thickness of biozone layer | real | mm | 1 | N/A |  |  |  |  |  |
| 10 | cha_dist | Distance from septic system to the stream | real | km | 2 | N/A |  |  |  |  |  |
| 11 | sep_dens | Number of septic systems per square kilometer | real | n/a | 2 | N/A |  |  |  |  |  |
| 12 | bm_dens | Density of biomass | real | kg/m^3 | 1 | N/A |  |  |  |  |  |
| 13 | bod_decay | BOD decay rate coefficient | real | m^3/day | 2 | N/A |  |  |  |  |  |
| 14 | bod_conv | Conversion factor representing the proportion of mass bacterial growth and mass BOD degraded in the septic | real | n/a | 2 | N/A |  |  |  |  |  |
| 15 | fc_lin | Linear coefficient for calculation of field capacity in the biozone | real | n/a | 1 | N/A |  |  |  |  |  |
| 16 | fc_exp | Exponential coefficient for calculation of field capacity in the biozone | real | n/a | 2 | N/A |  |  |  |  |  |
| 17 | fecal_delay | Fecal coliform bacteria decay rate coefficient | real | m^3/day | 2 | N/A |  |  |  |  |  |
| 18 | tds_conv | Conversion factor for plaque from TDS | real | n/a | 2 | N/A |  |  |  |  |  |
| 19 | mort | Mortality rate coefficient | real | n/a | 2 | N/A |  |  |  |  |  |
| 20 | resp | Respiration rate coefficient | real | n/a | 3 | N/A |  |  |  |  |  |
| 21 | slough1 | Linear coefficient for calculating the rate of biomass sloughing | real | n/a | 2 | N/A |  |  |  |  |  |
| 22 | slough2 | Exponential coefficient for calculating the rate of biomass sloughing | real | n/a | 2 | N/A |  |  |  |  |  |
| 23 | nit | Nitrification rate coefficient | real | n/a | 2 | N/A |  |  |  |  |  |
| 24 | denit | Denitrification rate coefficient | real | n/a | 3 | N/A |  |  |  |  |  |
| 25 | p_sorp | Linear P sorption distribution coefficient | real | L/kg | 1 | N/A |  |  |  |  |  |
| 26 | p_sorp_max | Maximum P sorption capacity | real | mg P/kg soil | 1 | N/A |  |  |  |  |  |
| 27 | solp_slp | Slope of the linear effluent soluble P equation | real | n/a | 3 | N/A |  |  |  |  |  |
| 28 | solp_int | Intercept of the linear effluent soluble P equation | real | n/a | 3 | N/A |  |  |  |  |  |

### structural-practices

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

*No column information available.*

### tiledrain.str
**Description:** This file contains the tile drainage parameters.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the tiledrain record | ​string | n/a | n/a | n/a | ✓ |  |  |  | tile in landuse.lum |
| 2 | dp | ​Depth of drain tube from the soil surface | ​real | ​mm | ​1000.0 | ​0.0-6000.0 |  |  |  |  |  |
| 3 | t_fc | Time to drain soil to field capacity | real | ​hours | ​48.00 | ​0.0-100.0 |  |  |  |  |  |
| 4 | lag | ​Drain tile lag time | ​real | ​hours | ​24.00 | ​0.0-100.0 |  |  |  |  |  |
| 5 | rad | ​Effective radius of drains | real | ​mm | 30.0 | 3.0-40.0 |  |  |  |  |  |
| 6 | dist | ​Distance between two drain tubes or tiles | real | m | 5.0 | ​5.0-100.0 |  |  |  |  |  |
| 7 | drain | Drainage coefficient | real | mm/day | 10.0 | 10.0-51.0 |  |  |  |  |  |
| 8 | pump | Pump capacity | real | mm/hr | 1.0 | 0.0-10.0 |  |  |  |  |  |
| 9 | lat_ksat | Multiplication factor to determine lateral saturated hydraulic conductivity | real | none | 1.0 | 0.01-4.00 |  |  |  |  |  |

## Water Allocation

### water-allocation

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

*No column information available.*

### water_allocation.wro
**⚠️ SPECIAL STRUCTURE**

**Description:** This file contains water allocation tables.

**Metadata Structure:** Non-standard - first line is reserved for a title. The second line in the file specifies the total number of water allocation tables included in the file.

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the water allocation table | string | N/A | N/A | N/A |  |  |  |  |  |
| 2 | rule_typ | Rule type to allocate water | string | N/A | N/A | N/A |  |  |  |  |  |
| 3 | src_obs | Number of source objects | integer | N/A | N/A | N/A |  |  |  |  |  |
| 4 | dmd_obs | Number of demand objects | integer | N/A | N/A | N/A |  |  |  |  |  |
| 5 | cha_ob | Channel as source object | string | N/A | N/A | N/A |  |  |  |  |  |

## Wetlands

### Wetlands

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

*No column information available.*

### hydrology.wet
**Description:** This file contains the wetland hydrology parameters.

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | name | Name of the wetland hydrology record | string | n/a | n/a | n/a | ✓ |  |  |  | hyd in wetland.wet |
| 2 | hru_ps | Fraction of HRU area at principal spillway (when surface inlet riser flow starts) | real | frac | 0 | N/A |  |  |  |  |  |
| 3 | dp_ps | Average depth of water at principal spillway | real | mm | 0 | N/A |  |  |  |  |  |
| 4 | hru_es | Fraction of HRU area at emergency spillway (when starts to spill into ditch) | real | frac | 0 | N/A |  |  |  |  |  |
| 5 | dp_es | Average depth of water at emergency spillway | real | mm | 0 | N/A |  |  |  |  |  |
| 6 | k | Hydraulic conductivity of the wetland bottom | real | mm/hr | 0.01 | N/A |  |  |  |  |  |
| 7 | evap | Wetland evaporation coefficient | real | n/a | 0.70 | N/A |  |  |  |  |  |
| 8 | vol_area_co | Volume surface area coefficient for HRU impoundment | real | n/a | 1.0 | N/A |  |  |  |  |  |
| 9 | vol_dp_a | Volume depth coefficient for HRU impoundment | real | n/a | 1.0 | N/A |  |  |  |  |  |
| 10 | vol_dp_b | Volume depth coefficient for HRU impoundment | real | n/a | 1.0 | N/A |  |  |  |  |  |
| 11 | hru_frac | Fraction of HRU that drains into wetland | real | fraction | 0.5 | N/A |  |  |  |  |  |

### wetland.wet
**Description:** >-

**Metadata Structure:** Standard (Line 1: Title, Line 2: Header, Line 3+: Data)

| Column Order | Field | Description | Type | Unit | Default | Range | PK | FK | Pointer | Points To | Referenced By |
|--------------|-------|-------------|------|------|---------|-------|----|----|---------|-----------|---------------|
| 1 | id | ID of the wetland | integer | N/A | N/A | N/A |  |  |  |  |  |
| 2 | name | Name of the wetland | string | N/A | N/A | N/A | ✓ |  |  |  | surf_stor in hru-data.hru |
| 3 | init​ | Pointer to the reservoir and wetland initialization file | string | N/A | N/A | N/A |  |  | ✓ |  |  |
| 4 | hyd​ | Pointer to the wetland hydrology file | string | N/A | N/A | N/A |  |  | ✓ |  |  |
| 5 | rel | Pointer to the reservoir and wetland release decision table file | string | N/A | N/A | N/A |  | ✓ | ✓ | res_rel.dtl |  |
| 6 | sed | Pointer to the reservoir and wetland sediment file | string | N/A | N/A | N/A |  | ✓ | ✓ | sediment.res |  |
| 7 | nut | Pointer to the reservoir and wetland nutrient file | string | N/A | N/A | N/A |  | ✓ | ✓ | nutrients.res |  |

---

## Documentation Statistics

- **Total Input Files Documented**: 95
- **Total Fields/Columns**: 741+
- **Primary Keys**: 44 fields
- **Foreign Keys**: ~115 references
- **File Pointers**: ~57 pointers
- **Files with Special Structures**: 7
- **Files with Non-Standard Metadata**: 5

## Legend

- **✓** in PK column: This field is a Primary Key (unique identifier for records in this file)
- **✓** in FK column: This field is a Foreign Key (references a primary key in another file)
- **✓** in Pointer column: This field contains a pointer/reference to another file
- **Points To**: Shows the target file name that this pointer/FK references (e.g., `initial.aqu`, `field.fld`)
- **Referenced By**: Shows which field and file reference this PK (e.g., `aqu in aquifer.con`)
- **⚠️ SPECIAL STRUCTURE**: Indicates files with multi-row or multi-part structures that differ from standard format
- **Metadata Structure**: Indicates whether file follows standard SWAT+ format (Line 1: Title, Line 2: Header, Line 3+: Data)

## Notes

- All SWAT+ input files are free format and space delimited
- **Standard metadata format**: Line 1 = title, Line 2 = header, Line 3+ = data
- The first line in each input file is reserved for a title
- The second line in all SWAT+ input files (except file.cio) is reserved for the header
- Some fields may serve multiple purposes (e.g., both FK and Pointer)
- Column descriptions are extracted from the individual field documentation when available
- Reference information (Points To, Referenced By) is extracted from individual field documentation files
- **Important distinction**:
  - **Special Structure** = How DATA records are organized (e.g., multiple rows per record, multi-part tables)
  - **Metadata Structure** = Whether file follows standard Line 1: Title, Line 2: Header format
  - A file can have special data structure but standard metadata (e.g., soils.sol has multiple lines per soil record, but still has title on line 1 and headers on line 2)
- Files marked with ⚠️ have special structures (e.g., multiple rows per record, multi-part tables)
- Files with non-standard metadata may have additional headers, no headers for some lines, or varying structure

---

*This documentation was automatically generated by parsing all README.md files in the swat+-input-files directory.*
