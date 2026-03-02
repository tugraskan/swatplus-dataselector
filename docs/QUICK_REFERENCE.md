# Quick Reference: SWAT+ File Dependency Diagram

## Master File Hierarchy

```
file.cio (MASTER)
    |
    +-- Simulation Control
    |   +-- object.cnt
    |   +-- time.sim
    |   +-- print.prt
    |   +-- object.prt
    |
    +-- Climate
    |   +-- weather-sta.cli
    |   |   +-- wgn --> weather-wgn.cli
    |   |   +-- pcp --> pcp.cli --> *.pcp
    |   |   +-- tmp --> tmp.cli --> *.tmp
    |   |   +-- slr --> slr.cli --> *.slr
    |   |   +-- hmd --> hmd.cli --> *.hmd
    |   |   +-- wnd --> wnd.cli --> *.wnd
    |   |   +-- atmo_dep --> atmo.cli
    |
    +-- Basin
    |   +-- codes.bsn
    |   +-- parameters.bsn
    |
    +-- Spatial Objects
    |   |
    |   +-- HRUs (hru-data.hru)
    |   |   +-- topo --> topography.hyd
    |   |   +-- hydro --> hydrology.hyd
    |   |   +-- soil --> soils.sol
    |   |   +-- lu_mgt --> landuse.lum
    |   |   |   +-- plnt_com --> plant.ini --> plants.plt
    |   |   |   +-- mgt --> management.sch
    |   |   |   +-- cn2 --> cntable.lum
    |   |   |   +-- cons_prac --> cons_practice.lum
    |   |   |   +-- ov_mann --> ovn_table.lum
    |   |   |   +-- tile --> tiledrain.str
    |   |   |   +-- sep --> septic.str
    |   |   |   +-- vfs --> filterstrip.str
    |   |   |   +-- grww --> grassedww.str
    |   |   |   +-- bmp --> bmpuser.str
    |   |   +-- soil_plant_init --> soil_plant.ini
    |   |   |   +-- nutrients --> nutrients.sol
    |   |   +-- snow --> snow.sno
    |   |   +-- field --> field.fld
    |   |
    |   +-- Routing Units (rout_unit.rtu)
    |   |   +-- define --> rout_unit.def
    |   |       +-- elements --> rout_unit.ele
    |   |
    |   +-- Aquifers (aquifer.aqu)
    |   |   +-- aqu_init --> initial.aqu
    |   |       +-- org_min --> om_water.ini
    |   |       +-- pest --> pest_water.ini
    |   |       +-- salt --> salt_water.ini
    |   |
    |   +-- Channels (channel.cha)
    |   |   +-- init --> initial.cha
    |   |   +-- hyd --> hydrology.cha
    |   |   +-- sed --> sediment.cha
    |   |   +-- nut --> nutrients.cha
    |   |
    |   +-- Reservoirs (reservoir.res)
    |   |   +-- init --> initial.res
    |   |   |   +-- org_min --> om_water.ini
    |   |   |   +-- pest --> pest_water.ini
    |   |   |   +-- salt --> salt_water.ini
    |   |   +-- hyd --> hydrology.res
    |   |   +-- sed --> sediment.res
    |   |   +-- nut --> nutrients.res
    |   |   +-- rel --> weir.res / res_rel.dtl
    |   |
    |   +-- Wetlands (wetland.wet)
    |       +-- init --> initial.wet
    |       +-- hyd --> hydrology.wet
    |       +-- sed --> (sediment data)
    |       +-- nut --> (nutrient data)
    |
    +-- Connectivity
    |   +-- hru.con (HRU connections)
    |   +-- aquifer.con (Aquifer connections)
    |   +-- channel.con (Channel connections)
    |   +-- reservoir.con (Reservoir connections)
    |   +-- aqu_cha.lin (Aquifer-Channel direct links)
    |   +-- chan_surf.lin (Channel-Surface links)
    |   +-- flo_con.dtl (Flow connection details)
    |
    +-- Databases (lookup tables)
        +-- plants.plt
        +-- fertilizer.frt
        +-- pesticide.pes
        +-- tillage.til
        +-- urban.urb
        +-- septic.sep
```

## Pointer Field Quick Reference

| Pointer Field | Source File Type | Target File Type | Purpose |
|--------------|------------------|------------------|---------|
| aqu_init | aquifer.aqu | initial.aqu | Aquifer initialization |
| init | reservoir.res, wetland.wet, channel.cha | initial.* | Object initialization |
| hyd | Multiple | hydrology.* | Hydrology parameters |
| sed | Multiple | sediment.* | Sediment parameters |
| nut | Multiple | nutrients.* | Nutrient parameters |
| org_min | initial.* | om_water.ini | Organic-mineral init |
| pest | initial.* | pest_water.ini | Pesticide init |
| salt | initial.* | salt_water.ini | Salt init |
| topo | hru-data.hru | topography.hyd | Topography |
| hydro | hru-data.hru | hydrology.hyd | Hydrology |
| soil | hru-data.hru | soils.sol | Soil properties |
| lu_mgt | hru-data.hru | landuse.lum | Land use/management |
| soil_plant_init | hru-data.hru | soil_plant.ini | Soil-plant init |
| plnt_com | landuse.lum | plant.ini | Plant community |
| mgt | landuse.lum | management.sch | Management schedule |
| define | rout_unit.rtu | rout_unit.def | Routing definition |
| elements | rout_unit.def | rout_unit.ele | Routing elements |

## Connectivity File Reference

```
Connectivity Files establish spatial relationships:

hru.con
  +-- Links HRUs to:
      +-- Weather stations (wst)
      +-- Constituents (cst)
      +-- Overflow destinations (ovfl)
      +-- Output objects (obj_typ, obj_id)

aquifer.con
  +-- Links Aquifers to:
      +-- HRUs (source of recharge)
      +-- Channels (discharge point)

channel.con
  +-- Links Channels to:
      +-- Upstream channels
      +-- Downstream channels/outlets
      +-- Floodplain connections

reservoir.con
  +-- Links Reservoirs to:
      +-- Inflow channels
      +-- Outflow channels

aqu_cha.lin (alternative to aquifer.con)
  +-- Direct aquifer to channel connections

chan_surf.lin
  +-- Direct channel to surface object connections

flo_con.dtl
  +-- Detailed flow routing between objects
```

## Database Lookup Pattern

```
Input Files --> Database Files (Lookup by name)

management.sch
  +-- Fertilizer operations --> fertilizer.frt (by name)
  +-- Pesticide operations --> pesticide.pes (by name)
  +-- Tillage operations --> tillage.til (by name)

plant.ini
  +-- plnt_name --> plants.plt (by name)

landuse.lum
  +-- urban --> urban.urb (by name)

septic.str
  +-- Database lookup --> septic.sep (by name)
```

## Process Flow with Dependencies

```
WEATHER DATA (*.cli files)
    |
    v
PRECIPITATION & TEMPERATURE
    |
    v
SURFACE RUNOFF <-- hru-data.hru, landuse.lum, soils.sol
    |
    v
INFILTRATION <-- hydrology.hyd, soil properties
    |
    +-- LATERAL FLOW --> CHANNELS
    |
    +-- PERCOLATION
        |
        v
    GROUNDWATER <-- aquifer.aqu
        |
        v
    BASE FLOW --> CHANNELS
        |
        v
CHANNEL ROUTING <-- channel.cha
    |
    +-- RESERVOIR/WETLAND <-- reservoir.res, wetland.wet
        |
        v
    OUTLET
```

Each process carries:
- Water volume
- Sediment (sediment.*)
- Nutrients (nutrients.*)
- Pesticides (pest_water.ini)
- Bacteria
- Other constituents

## File Naming Conventions

| Pattern | Meaning | Example |
|---------|---------|---------|
| *.hru | HRU data | hru-data.hru |
| *.aqu | Aquifer data | aquifer.aqu |
| *.cha | Channel data | channel.cha |
| *.res | Reservoir data | reservoir.res |
| *.wet | Wetland data | wetland.wet |
| *.cli | Climate data | weather-sta.cli |
| *.sol | Soil data | soils.sol |
| *.lum | Land use/management | landuse.lum |
| *.ini | Initialization data | initial.aqu |
| *.hyd | Hydrology parameters | hydrology.hyd |
| *.str | Structural practice | tiledrain.str |
| *.ops | Operation data | harv.ops |
| *.plt | Plant database | plants.plt |
| *.frt | Fertilizer database | fertilizer.frt |
| *.pes | Pesticide database | pesticide.pes |
| *.con | Connectivity | hru.con |
| *.dtl | Detail/decision table | lum.dtl |
| *.prt | Print control | print.prt |
| *.bsn | Basin data | codes.bsn |

## Usage Tips

1. **Start with file.cio** - Master file references all others
2. **Follow the pointers** - Each pointer field leads to another file
3. **Check connectivity files** - Define how objects interact spatially
4. **Reference databases** - Lookup tables for common properties
5. **Understand init files** - Many objects have initialization files
6. **Track the water** - Follow water through HRU → channel → reservoir → outlet

## Common Troubleshooting

**Missing file reference:**
- Check that pointer field matches target file name exactly
- Verify target file exists in correct location

**Connectivity issues:**
- Ensure object IDs in *.con files match IDs in object files
- Check that all required connections are defined

**Parameter not found:**
- May be in parent file (e.g., landuse.lum) or pointer file
- Check database files for lookup values

---

For complete details, see:
- **COMPLETE_DEPENDENCY_MAP.md** - Full analysis
- **FILE_RELATIONSHIPS.md** - Detailed tables
- **dependency_report.json** - Machine-readable data
