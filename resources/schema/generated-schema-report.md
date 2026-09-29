# Generated schema report

- SWAT+: `62.0.0` (`de210d64db`), parser `110c2a24fd`
- Header references: Ames_sub1, Osu_1hru

- tables: **317**
- tables from source: **185**
- tables only in source: **79**
- special tables kept: **5**
- editor tables kept: **127**
- columns named by header: **726**
- columns named by aligned editor: **66**
- columns named by learned names: **0**
- columns named by editor: **67**
- columns named by fortran: **562**
- columns not read by swat: **54**

## Notes by file

- `aquifer.aqu`: link aqu_init -> initial_aqu dropped: no such column in what SWAT+ reads
- `calibration.cal`: link cal_parm -> cal_parms_cal dropped: no such column in what SWAT+ reads
- `channel-lte.cha`: link ini -> initial_cha dropped: no such column in what SWAT+ reads
- `channel-lte.cha`: link hyd -> hyd_sed_lte_cha dropped: no such column in what SWAT+ reads
- `channel-lte.cha`: link nut -> sed_nut_cha dropped: no such column in what SWAT+ reads
- `delratio.del`: link om -> dr_om_del dropped: no such column in what SWAT+ reads
- `delratio.del`: link pest -> dr_pest_del dropped: no such column in what SWAT+ reads
- `delratio.del`: link path -> dr_path_del dropped: no such column in what SWAT+ reads
- `delratio.del`: link hmet -> dr_hmet_del dropped: no such column in what SWAT+ reads
- `delratio.del`: link salt -> dr_salt_del dropped: no such column in what SWAT+ reads
- `exco.exc`: link om -> exco_om_exc dropped: no such column in what SWAT+ reads
- `exco.exc`: link pest -> exco_pest_exc dropped: no such column in what SWAT+ reads
- `exco.exc`: link path -> exco_path_exc dropped: no such column in what SWAT+ reads
- `exco.exc`: link hmet -> exco_hmet_exc dropped: no such column in what SWAT+ reads
- `exco.exc`: link salt -> exco_salt_exc dropped: no such column in what SWAT+ reads
- `hru-lte.hru`: link soil_text -> soils_lte_sol dropped: no such column in what SWAT+ reads
- `hru-lte.hru`: link grow_start -> d_table_dtl dropped: no such column in what SWAT+ reads
- `hru-lte.hru`: link grow_end -> d_table_dtl dropped: no such column in what SWAT+ reads
- `hru-lte.hru`: link plnt_typ -> plants_plt dropped: no such column in what SWAT+ reads
- `initial.aqu`: link salt_cs -> salt_aqu_ini dropped: no such column in what SWAT+ reads
- `initial.cha`: link salt_cs -> salt_channel_ini dropped: no such column in what SWAT+ reads
- `initial.res`: link salt_cs -> salt_res_ini dropped: no such column in what SWAT+ reads
- `object.prt`: link print_prt -> print_prt dropped: no such column in what SWAT+ reads
- `outlet.con`: link wst -> weather_sta_cli dropped: no such column in what SWAT+ reads
- `pesticide.pes`: header names 15 of the 16 values SWAT+ reads
- `reservoir.con`: link wst -> weather_sta_cli dropped: no such column in what SWAT+ reads
- `rout_unit.ele`: link rtu -> rout_unit_rtu dropped: no such column in what SWAT+ reads
- `salt_atmo.cli`: link sta -> atmo_cli_sta dropped: no such column in what SWAT+ reads
- `soil_plant.ini`: header names 7 of the 8 values SWAT+ reads
- `soil_plant.ini`: link nutrients -> nutrients_sol dropped: no such column in what SWAT+ reads
- `soil_plant.ini`: link salt_cs -> salt_hru_ini_cs dropped: no such column in what SWAT+ reads
