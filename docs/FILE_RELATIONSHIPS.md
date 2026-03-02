# File Dependency Summary Table

## Key Input File Relationships

| Source File | Foreign Key Field | Target File | Description |
|------------|-------------------|-------------|-------------|
| aquifer.aqu | aqu_init | initial.aqu | Aquifer initialization data |
| initial.aqu | org_min | om_water.ini | Organic-mineral initialization |
| initial.aqu | pest | pest_water.ini | Pesticide initialization |
| initial.aqu | salt | salt_water.ini | Salt initialization |
| hru-data.hru | topo | topography.hyd | Topography parameters |
| hru-data.hru | hydro | hydrology.hyd | Hydrology parameters |
| hru-data.hru | soil | soils.sol | Soil properties |
| hru-data.hru | lu_mgt | landuse.lum | Land use and management |
| hru-data.hru | soil_plant_init | soil_plant.ini | Soil-plant initialization |
| hru-data.hru | snow | snow.sno | Snow parameters |
| hru-data.hru | field | field.fld | Field characteristics |
| landuse.lum | plnt_com | plant.ini | Plant community data |
| landuse.lum | mgt | management.sch | Management schedule |
| landuse.lum | cn2 | cntable.lum | Curve number table |
| landuse.lum | cons_prac | cons_practice.lum | Conservation practices |
| landuse.lum | ov_mann | ovn_table.lum | Overland Manning's n |
| landuse.lum | tile | tiledrain.str | Tile drainage |
| landuse.lum | sep | septic.str | Septic systems |
| landuse.lum | vfs | filterstrip.str | Filter strips |
| landuse.lum | grww | grassedww.str | Grassed waterways |
| landuse.lum | bmp | bmpuser.str | Best management practices |
| reservoir.res | init | initial.res | Reservoir initialization |
| reservoir.res | hyd | hydrology.res | Reservoir hydrology |
| reservoir.res | sed | sediment.res | Reservoir sediment |
| reservoir.res | nut | nutrients.res | Reservoir nutrients |
| wetland.wet | init | initial.wet | Wetland initialization |
| wetland.wet | hyd | hydrology.wet | Wetland hydrology |
| channel.cha | init | initial.cha | Channel initialization |
| channel.cha | hyd | hydrology.cha | Channel hydrology |
| channel.cha | sed | sediment.cha | Channel sediment |
| channel.cha | nut | nutrients.cha | Channel nutrients |
| weather-sta.cli | wgn | weather-wgn.cli | Weather generator parameters |
| weather-sta.cli | pcp | pcp.cli | Precipitation data |
| weather-sta.cli | tmp | tmp.cli | Temperature data |
| weather-sta.cli | slr | slr.cli | Solar radiation data |
| weather-sta.cli | hmd | hmd.cli | Humidity data |
| weather-sta.cli | wnd | wnd.cli | Wind speed data |
| weather-sta.cli | atmo_dep | atmo.cli | Atmospheric deposition |
| rout_unit.rtu | define | rout_unit.def | Routing unit definition |
| rout_unit.def | elements | rout_unit.ele | Routing unit elements |
| soils.sol | - | nutrients.sol | Soil nutrient properties |
| soil_plant.ini | nutrients | nutrients.sol | Nutrient initialization |

## Connectivity Files

| File | Purpose | References |
|------|---------|------------|
| hru.con | HRU connectivity | Links HRUs to weather stations, aquifers, channels |
| aquifer.con | Aquifer connectivity | Links aquifers to HRUs and channels |
| channel.con | Channel connectivity | Links channels to other channels and outlets |
| reservoir.con | Reservoir connectivity | Links reservoirs to upstream/downstream objects |
| rout_unit.con | Routing unit connectivity | Links routing units to subbasins |
| aqu_cha.lin | Aquifer-channel links | Direct connections between aquifers and channels |
| chan_surf.lin | Channel-surface links | Connections between channels and surface objects |
| flo_con.dtl | Flow connection details | Detailed flow routing connections |

## Master Configuration

| File | Purpose | Contains |
|------|---------|----------|
| file.cio | Master input file | References all other input files |
| codes.bsn | Basin codes | Simulation option codes |
| parameters.bsn | Basin parameters | Basin-level parameters |
| object.cnt | Object counts | Number of each object type |
| time.sim | Simulation time | Start/end dates, timestep |
| print.prt | Print control | Output printing options |
| object.prt | Object print | Specific objects to print |

## Database Files

| File | Purpose | Referenced By |
|------|---------|---------------|
| plants.plt | Plant database | plant.ini via plnt_name |
| fertilizer.frt | Fertilizer database | management.sch via fertilizer operations |
| pesticide.pes | Pesticide database | management.sch via pesticide operations |
| tillage.til | Tillage database | management.sch via tillage operations |
| urban.urb | Urban characteristics | landuse.lum via urban field |
| septic.sep | Septic effluent | septic.str via database lookup |
