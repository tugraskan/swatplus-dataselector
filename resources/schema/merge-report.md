# Overlay Merge Report

- SWAT+ version: **62.0.0**
- Overlays repo: tugraskan/swatplus-doc-builder
- Tables enriched directly: **107**
- Tables enriched by parent inheritance: **19**
- Overlay-only tables added: **84**
- Schema tables with no overlay: **112**

> Columns are enriched only when they match an overlay row by name identity (file header or the Fortran field name in the overlay `target`). Position-based matching is intentionally not used: the editor schema's column order does not reliably match the file's physical read order, so a column that matches neither name is left unenriched rather than risk a wrong doc.

## Direct matches

| Schema file | Overlay | Columns matched |
|---|---|---|
| `aqu_cha.lin` | `aqu_cha.lin` | 1/13 |
| `aquifer.aqu` | `aquifer.aqu` | 18/18 |
| `bmpuser.str` | `bmpuser.str` | 1/10 |
| `cal-parms.cal` | `cal_parms.cal` | 4/6 |
| `calibration.cal` | `calibration.cal` | 3/10 |
| `ch-sed-budget.sft` | `ch_sed_budget.sft` | 1/2 |
| `ch-sed-parms.sft` | `ch_sed_parms.sft` | 6/7 |
| `chan-surf.lin` | `chan-surf.lin` | 2/2 |
| `channel-lte.cha` | `channel-lte.cha` | 1/7 |
| `channel.cha` | `channel.cha` | 5/7 |
| `chem-app.ops` | `chem_app.ops` | 6/11 |
| `cntable.lum` | `cntable.lum` | 1/9 |
| `codes.bsn` | `codes.bsn` | 10/27 |
| `codes.sft` | `codes.sft` | 5/9 |
| `constituents.cs` | `constituents.cs` | 0/6 |
| `delratio.del` | `delratio.del` | 1/7 |
| `dr-hmet.del` | `dr_hmet.del` | 0/2 |
| `dr-om.del` | `dr_om.del` | 13/20 |
| `dr-path.del` | `dr_path.del` | 0/2 |
| `dr-pest.del` | `dr_pest.del` | 0/2 |
| `dr-salt.del` | `dr_salt.del` | 0/2 |
| `exco-hmet.exc` | `exco_hmet.exc` | 0/2 |
| `exco-om.exc` | `exco_om.exc` | 13/20 |
| `exco-path.exc` | `exco_path.exc` | 0/2 |
| `exco-pest.exc` | `exco_pest.exc` | 0/2 |
| `exco-salt.exc` | `exco_salt.exc` | 0/2 |
| `exco.exc` | `exco.exc` | 1/7 |
| `fertilizer.frt` | `fertilizer.frt` | 0/9 |
| `field.fld` | `field.fld` | 2/5 |
| `file.cio` | `file.cio` | 0/5 |
| `filterstrip.str` | `filterstrip.str` | 1/7 |
| `fire.ops` | `fire.ops` | 1/5 |
| `grassedww.str` | `grassedww.str` | 1/10 |
| `graze.ops` | `graze.ops` | 1/8 |
| `harv.ops` | `harv.ops` | 1/7 |
| `hmd.cli` | `hmd.cli` | 1/2 |
| `hmet-hru.ini` | `hmet_hru.ini` | 1/2 |
| `hru-data.hru` | `hru-data.hru` | 10/11 |
| `hru-lte.hru` | `hru-lte.hru` | 11/35 |
| `hyd-sed-lte.cha` | `hyd-sed-lte.cha` | 9/27 |
| `hydrology.cha` | `hydrology.cha` | 4/12 |
| `hydrology.hyd` | `hydrology.hyd` | 12/17 |
| `hydrology.res` | `hydrology.res` | 2/12 |
| `hydrology.wet` | `hydrology.wet` | 2/12 |
| `initial.aqu` | `initial.aqu` | 6/9 |
| `initial.cha` | `initial.cha` | 6/9 |
| `initial.res` | `initial.res` | 5/9 |
| `irr.ops` | `irr.ops` | 2/10 |
| `landuse.lum` | `landuse.lum` | 4/16 |
| `ls_unit.def` | `ls_unit.def` | 1/4 |
| `ls_unit.ele` | `ls_unit.ele` | 2/6 |
| `management.sch` | `management.sch` | 1/4 |
| `nutrients.cha` | `nutrients.cha` | 1/41 |
| `nutrients.res` | `nutrients.res` | 3/14 |
| `nutrients.sol` | `nutrients.sol` | 12/14 |
| `object.cnt` | `object.cnt` | 19/20 |
| `object.prt` | `object.prt` | 1/7 |
| `om-water.ini` | `om_water.ini` | 15/21 |
| `ovn-table.lum` | `ovn_table.lum` | 3/6 |
| `parameters.bsn` | `parameters.bsn` | 13/45 |
| `path-hru.ini` | `path_hru.ini` | 1/2 |
| `path-water.ini` | `path_water.ini` | 1/2 |
| `pathogens.pth` | `pathogens.pth` | 2/20 |
| `pcp.cli` | `pcp.cli` | 1/2 |
| `pest-hru.ini` | `pest_hru.ini` | 1/2 |
| `pest-water.ini` | `pest_water.ini` | 1/2 |
| `pesticide.pes` | `pesticide.pes` | 8/15 |
| `plant-gro.sft` | `plant_gro.sft` | 1/2 |
| `plant-parms.sft` | `plant_parms.sft` | 1/2 |
| `plant.ini` | `plant.ini` | 2/4 |
| `plants.plt` | `plants.plt` | 8/57 |
| `print.prt` | `print.prt` | 11/15 |
| `reservoir.res` | `reservoir.res` | 5/8 |
| `rout-unit.def` | `rout_unit.def` | 1/13 |
| `rout-unit.ele` | `rout_unit.ele` | 3/7 |
| `rout-unit.rtu` | `rout_unit.rtu` | 2/6 |
| `salt-aqu.ini` | `salt_aqu.ini` | 1/15 |
| `salt-atmo.cli` | `salt_atmo.cli` | 0/19 |
| `salt-channel.ini` | `salt_channel.ini` | 1/10 |
| `salt-fertilizer.frt` | `salt_fertilizer.frt` | 8/10 |
| `salt-hru.ini` | `salt_hru.ini` | 1/2 |
| `salt-recall.rec` | `salt_recall.rec` | 1/3 |
| `sediment.cha` | `sediment.cha` | 1/26 |
| `sediment.res` | `sediment.res` | 4/14 |
| `septic.sep` | `septic.sep` | 0/13 |
| `septic.str` | `septic.str` | 8/29 |
| `slr.cli` | `slr.cli` | 1/2 |
| `snow.sno` | `snow.sno` | 4/10 |
| `soil_plant.ini` | `soil_plant.ini` | 6/9 |
| `soils-lte.sol` | `soils_lte.sol` | 3/5 |
| `soils.sol` | `soils.sol` | 0/8 |
| `sweep.ops` | `sweep.ops` | 1/5 |
| `temperature.cha` | `temperature.cha` | 4/7 |
| `tiledrain.str` | `tiledrain.str` | 4/10 |
| `tillage.til` | `tillage.til` | 2/8 |
| `time.sim` | `time.sim` | 5/6 |
| `tmp.cli` | `tmp.cli` | 1/2 |
| `topography.hyd` | `topography.hyd` | 2/8 |
| `urban.urb` | `urban.urb` | 1/13 |
| `water-allocation.wro` | `water_allocation.wro` | 2/4 |
| `water-balance.sft` | `water_balance.sft` | 0/2 |
| `wb-parms.sft` | `wb_parms.sft` | 6/7 |
| `weather-sta.cli` | `weather-sta.cli` | 1/11 |
| `weather-wgn.cli` | `weather-wgn.cli` | 3/6 |
| `weir.res` | `weir.res` | 1/6 |
| `wetland.wet` | `wetland.wet` | 5/8 |
| `wnd.cli` | `wnd.cli` | 1/2 |

## Inherited from parent overlay

| Child schema file | Parent overlay |
|---|---|
| `calibration-cal.cond` | `calibration.cal` |
| `calibration-cal.elem` | `calibration.cal` |
| `ch-sed-budget-sft.item` | `ch_sed_budget.sft` |
| `chan-surf-lin.ob` | `chan-surf.lin` |
| `gwflow-wetland.txt` | `gwflow.wetland` |
| `hmet-hru-ini.item` | `hmet_hru.ini` |
| `management-sch.auto` | `management.sch` |
| `management-sch.op` | `management.sch` |
| `path-hru-ini.item` | `path_hru.ini` |
| `path-water-ini.item` | `path_water.ini` |
| `pest-hru-ini.item` | `pest_hru.ini` |
| `pest-water-ini.item` | `pest_water.ini` |
| `plant-gro-sft.item` | `plant_gro.sft` |
| `plant-ini.item` | `plant.ini` |
| `plant-parms-sft.item` | `plant_parms.sft` |
| `salt-hru-ini.cs` | `salt_hru.ini` |
| `salt-hru-ini.item` | `salt_hru.ini` |
| `water-balance-sft.item` | `water_balance.sft` |
| `weather-wgn-cli.mon` | `weather-wgn.cli` |

## Overlay-only tables added

- `aqu_catunit.def`
- `aqu_catunit.ele`
- `atmodep.cli`
- `carbon.bsn`
- `carbon_layers.prt`
- `cell_sol.gw`
- `cellcon.gw`
- `cells.gw`
- `ch_catunit.def`
- `ch_reg.def`
- `chan_depth.gw`
- `chancell.gw`
- `co2_yr.dat`
- `codes.gw`
- `cons_practice.lum`
- `cs_aqu.ini`
- `cs_atmo.cli`
- `cs_channel.ini`
- `cs_hru.ini`
- `cs_recall.rec`
- `fertilizer.frt_cs`
- `flo_con.dtl`
- `floodplain.gw`
- `gwflow.wbgroups`
- `gwflow_canal.con`
- `hru_pump.gw`
- `hrucell.gw`
- `initial.aqu_cs`
- `initial.cha_cs`
- `ls_reg.def`
- `ls_reg.ele`
- `lsucell.gw`
- `lum.dtl`
- `manure.frt`
- `manure_allo.mnu`
- `manure_db.frt`
- `manure_om.frt`
- `minerals.gw`
- `nutrients.rte`
- `om_osrc.wal`
- `om_treat.wal`
- `om_use.wal`
- `out_src.wal`
- `outputs.gw`
- `outside_rcv.wal`
- `pest.com`
- `pest_metabolite.pes`
- `pet.cli`
- `phreato.gw`
- `phreato_cell.gw`
- `pond_cell.gw`
- `pond_div.gw`
- `ponds.gw`
- `puddle.ops`
- `pumpex.gw`
- `rec_catunit.def`
- `rec_catunit.ele`
- `rec_reg.def`
- `recall_db.rec`
- `res_catunit.def`
- `res_catunit.ele`
- `res_conds.dat`
- `res_reg.def`
- `res_rel.dtl`
- `rescell.gw`
- `reservoir.res_cs`
- `satbuffer.str`
- `scen_dtl.upd`
- `scen_lu.dtl`
- `shade_factor.shf`
- `soil_lyr_depths.sol`
- `solute.gw`
- `sw_group.gw`
- `tile.gw`
- `transit.gw`
- `transplant.plt`
- `tvheads.gw`
- `water_canal.wal`
- `water_pipe.wal`
- `water_tower.wal`
- `water_treat.wal`
- `water_use.wal`
- `wetland.wet_cs`
- `zones.gw`

## Schema tables with no overlay (no enrichment)

- `aquifer.con`
- `atmo-cli-sta-value.txt`
- `atmo-cli.sta`
- `atmo.cli`
- `basin-crop-yld.aa`
- `basin-crop-yld.yr`
- `chan-aqu-lin.ob`
- `chan-aqu.lin`
- `chandeg.con`
- `con.out`
- `con.txt`
- `cons-prac.lum`
- `crop-yld.aa`
- `d-table-dtl-act.out`
- `d-table-dtl-cond.alt`
- `d-table-dtl.act`
- `d-table-dtl.cond`
- `d_table.dtl`
- `dr-hmet.col`
- `dr-hmet.val`
- `dr-path.col`
- `dr-path.val`
- `dr-pest.col`
- `dr-pest.val`
- `dr-salt.col`
- `dr-salt.val`
- `exco-hmet.col`
- `exco-hmet.val`
- `exco-path.col`
- `exco-path.val`
- `exco-pest.col`
- `exco-pest.val`
- `exco-salt.col`
- `exco-salt.val`
- `file-cio-classification.txt`
- `flow-duration-curve.txt`
- `gis-aquifers.txt`
- `gis-channels.txt`
- `gis-deep-aquifers.txt`
- `gis-points.txt`
- `gis-routing.txt`
- `gis-subbasins.txt`
- `gis-water.txt`
- `gis.hrus`
- `gis.lsus`
- `gwflow-fpcell.txt`
- `gwflow-hrucell.txt`
- `gwflow-init.conc`
- `gwflow-lsucell.txt`
- `gwflow-obs.locs`
- `gwflow-out.days`
- `gwflow-rescell.txt`
- `gwflow-rivcell.txt`
- `gwflow-solutes.txt`
- `gwflow.base`
- `gwflow.grid`
- `gwflow.zone`
- `hmet-water-ini.item`
- `hmet-water.ini`
- `hru.con`
- `hyd.base`
- `metals.mtl`
- `mgt.out`
- `outlet.con`
- `pesticide.pst`
- `plant-parms.cal`
- `print-prt-aa.int`
- `project-config.txt`
- `pts-no-type.base`
- `pts.base`
- `recall.con`
- `recall.dat`
- `recall.rec`
- `region-def.elem`
- `region.def`
- `region.ele`
- `reservoir.con`
- `rout-unit.dr`
- `rout_unit.con`
- `salt-irrigation.txt`
- `salt-module.txt`
- `salt-plants-flags.txt`
- `salt-plants.txt`
- `salt-recall.dat`
- `salt-res.ini`
- `salt-urban.txt`
- `salt-water-ini.item`
- `salt-water.ini`
- `salt.road`
- `salts.slt`
- `sed_nut.cha`
- `soil-layer.txt`
- `soil-nutcarb.out`
- `soil.txt`
- `tropical-bounds.txt`
- `var-range-option.txt`
- `var-range.txt`
- `var.code`
- `version.txt`
- `water-allocation-dmd-ob.src`
- `water-allocation-dmd.ob`
- `water-allocation-src.ob`
- `water.allo`
- `weather-hmd.hmd`
- `weather-pcp.pcp`
- `weather-slr.slr`
- `weather-tmp.tmp`
- `weather-wnd.wnd`
- `weather.file`
- `wgn.mon`
- `wgn.txt`
- `wind-dir.cli`

## Columns not matched within enriched files

_These columns are in an enriched file but their name matched no overlay row (the editor column name differs from both the file header and the Fortran field name). Left unenriched._

| Schema file | Unmatched columns |
|---|---|
| `aqu_cha.lin` | `numb`, `elem_cnt`, `elem1`, `elem2`, `elem3`, `elem4`, `elem5`, `elem6`, `elem7`, `elem8`, `elem9`, `elem10` |
| `bmpuser.str` | `id`, `flag`, `sed_eff`, `ptlp_eff`, `solp_eff`, `ptln_eff`, `soln_eff`, `bact_eff`, `description` |
| `cal-parms.cal` | `id`, `obj_typ` |
| `calibration.cal` | `id`, `cal_parm`, `chg_val`, `soil_lyr1`, `soil_lyr2`, `yr1`, `yr2` |
| `ch-sed-budget.sft` | `id` |
| `ch-sed-parms.sft` | `id` |
| `channel-lte.cha` | `id`, `cha_ini`, `cha_hyd`, `cha_sed`, `cha_nut`, `description` |
| `channel.cha` | `id`, `description` |
| `chem-app.ops` | `id`, `chem_form`, `app_typ`, `inject_dp`, `description` |
| `cntable.lum` | `id`, `cn_a`, `cn_b`, `cn_c`, `cn_d`, `description`, `treat`, `cond_cov` |
| `codes.bsn` | `id`, `wq_file`, `event`, `crack`, `rtu_wq`, `rte_cha`, `deg_cha`, `wq_cha`, `c_fact`, `carbon`, `sed_cha`, `tiledrain`, `wtable`, `soil_p`, `atmo_dep`, `stor_max`, `i_fpwet` |
| `codes.sft` | `id`, `landscape`, `hyd`, `plnt` |
| `constituents.cs` | `id`, `name`, `pest_coms`, `path_coms`, `hmet_coms`, `salt_coms` |
| `delratio.del` | `id`, `om`, `pest`, `path`, `hmet`, `salt` |
| `dr-hmet.del` | `id`, `name` |
| `dr-om.del` | `id`, `name`, `sand`, `silt`, `clay`, `gravel`, `tmp` |
| `dr-path.del` | `id`, `name` |
| `dr-pest.del` | `id`, `name` |
| `dr-salt.del` | `id`, `name` |
| `exco-hmet.exc` | `id`, `name` |
| `exco-om.exc` | `id`, `name`, `sand`, `silt`, `clay`, `gravel`, `tmp` |
| `exco-path.exc` | `id`, `name` |
| `exco-pest.exc` | `id`, `name` |
| `exco-salt.exc` | `id`, `name` |
| `exco.exc` | `id`, `om`, `pest`, `path`, `hmet`, `salt` |
| `fertilizer.frt` | `id`, `name`, `min_n`, `min_p`, `org_n`, `org_p`, `nh3_n`, `pathogens`, `description` |
| `field.fld` | `id`, `len`, `wd` |
| `file.cio` | `id`, `classification`, `order_in_class`, `file_name`, `customization` |
| `filterstrip.str` | `id`, `flag`, `fld_vfs`, `con_vfs`, `cha_q`, `description` |
| `fire.ops` | `id`, `chg_cn2`, `frac_burn`, `description` |
| `grassedww.str` | `id`, `flag`, `mann`, `sed_co`, `dp`, `wd`, `len`, `slp`, `description` |
| `graze.ops` | `id`, `fert`, `bm_eat`, `bm_tramp`, `man_amt`, `grz_bm_min`, `description` |
| `harv.ops` | `id`, `harv_typ`, `harv_idx`, `harv_eff`, `harv_bm_min`, `description` |
| `hmd.cli` | `id` |
| `hmet-hru.ini` | `id` |
| `hru-data.hru` | `description` |
| `hru-lte.hru` | `id`, `area`, `t_conc`, `soil_dp`, `perc_co`, `slp`, `slp_len`, `aqu_sp_yld`, `alpha_bf`, `revap`, `rchg_dp`, `sw_init`, `aqu_init`, `aqu_sh_flo`, `aqu_dp_flo`, `snow_h2o`, `lat`, `soil_text`, `trop_flag`, `grow_start`, `grow_end`, `plnt_typ`, `pet_flag`, `irr_flag` |
| `hyd-sed-lte.cha` | `id`, `name`, `order`, `wd`, `dp`, `slp`, `len`, `mann`, `k`, `erod_fact`, `cov_fact`, `wd_rto`, `eq_slp`, `clay`, `dry_bd`, `side_slp`, `bed_load`, `description` |
| `hydrology.cha` | `id`, `wd`, `dp`, `slp`, `len`, `mann`, `side_slp`, `description` |
| `hydrology.hyd` | `id`, `can_max`, `orgn_enrich`, `orgp_enrich`, `harg_pet` |
| `hydrology.res` | `id`, `yr_op`, `mon_op`, `area_ps`, `vol_ps`, `area_es`, `vol_es`, `evap_co`, `shp_co1`, `shp_co2` |
| `hydrology.wet` | `id`, `hru_ps`, `dp_ps`, `hru_es`, `dp_es`, `evap`, `vol_area_co`, `vol_dp_a`, `vol_dp_b`, `hru_frac` |
| `initial.aqu` | `id`, `salt_cs`, `description` |
| `initial.cha` | `id`, `salt_cs`, `description` |
| `initial.res` | `id`, `name`, `salt_cs`, `description` |
| `irr.ops` | `id`, `eff_frac`, `sumq_frac`, `dep_sub`, `salt_ppm`, `no3_ppm`, `po4_ppm`, `description` |
| `landuse.lum` | `id`, `plnt_com`, `mgt`, `cn2`, `urban`, `ov_mann`, `tile`, `sep`, `vfs`, `grww`, `bmp`, `description` |
| `ls_unit.def` | `id`, `elem_tot`, `elements` |
| `ls_unit.ele` | `id`, `obj_typ`, `obj_typ_no`, `lsu_frac` |
| `management.sch` | `id`, `numb_ops`, `numb_auto` |
| `nutrients.cha` | `id`, `plt_n`, `ptl_p`, `alg_stl`, `ben_disp`, `ben_nh3n`, `ptln_stl`, `ptlp_stl`, `cst_stl`, `ben_cst`, `cbn_bod_co`, `air_rt`, `cbn_bod_stl`, `ben_bod`, `bact_die`, `cst_decay`, `nh3n_no2n`, `no2n_no3n`, `ptln_nh3n`, `ptlp_solp`, `q2e_lt`, `q2e_alg`, `chla_alg`, `alg_n`, `alg_p`, `alg_o2_prod`, `alg_o2_resp`, `o2_nh3n`, `o2_no2n`, `alg_grow`, `alg_resp`, `slr_act`, `lt_co`, `const_n`, `const_p`, `lt_nonalg`, `alg_shd_l`, `alg_shd_nl`, `nh3_pref`, `description` |
| `nutrients.res` | `id`, `mid_start`, `mid_end`, `mid_n_stl`, `n_stl`, `mid_p_stl`, `p_stl`, `chla_co`, `secchi_co`, `n_min_stl`, `p_min_stl` |
| `nutrients.sol` | `id`, `description` |
| `object.cnt` | `id` |
| `object.prt` | `print_prt`, `name`, `daily`, `monthly`, `yearly`, `avann` |
| `om-water.ini` | `id`, `name`, `cbn_bod`, `dis_ox`, `tmp`, `c` |
| `ovn-table.lum` | `id`, `ovn_mean`, `description` |
| `parameters.bsn` | `id`, `lai_noevap`, `sw_init`, `surq_lag`, `adj_pkrt`, `adj_pkrt_sed`, `lin_sed`, `exp_sed`, `orgn_min`, `n_uptake`, `p_uptake`, `n_perc`, `p_perc`, `p_soil`, `p_avail`, `rsd_decomp`, `pest_perc`, `evap_adj`, `denit_exp`, `denit_frac`, `man_bact`, `adj_uhyd`, `n_fix_max`, `rsd_decay`, `rsd_cover`, `uhyd_alpha`, `splash`, `rill`, `surq_exp`, `cov_mgt`, `cha_d50`, `day_lag_max` |
| `path-hru.ini` | `id` |
| `path-water.ini` | `id` |
| `pathogens.pth` | `id`, `name`, `die_sol`, `grow_sol`, `die_srb`, `grow_srb`, `sol_srb`, `tmp_adj`, `die_plnt`, `grow_plnt`, `frac_man`, `perc_sol`, `detect`, `die_cha`, `grow_cha`, `die_res`, `grow_res`, `swf` |
| `pcp.cli` | `id` |
| `pest-hru.ini` | `id` |
| `pest-water.ini` | `id` |
| `pesticide.pes` | `id`, `soil_ads`, `frac_wash`, `hl_foliage`, `hl_soil`, `aq_reac`, `ben_reac` |
| `plant-gro.sft` | `id` |
| `plant-parms.sft` | `id` |
| `plant.ini` | `id`, `description` |
| `plants.plt` | `id`, `name`, `plnt_typ`, `gro_trig`, `bm_e`, `harv_idx`, `lai_pot`, `frac_hu1`, `lai_max1`, `frac_hu2`, `lai_max2`, `hu_lai_decl`, `can_ht_max`, `rt_dp_max`, `tmp_opt`, `tmp_base`, `frac_n_yld`, `frac_p_yld`, `frac_n_em`, `frac_n_50`, `frac_n_mat`, `frac_p_em`, `frac_p_50`, `frac_p_mat`, `harv_idx_ws`, `usle_c_min`, `stcon_max`, `vpd`, `frac_stcon`, `ru_vpd`, `bm_e_hi`, `plnt_decomp`, `lai_min`, `bm_tree_acc`, `yrs_mat`, `bm_tree_max`, `ext_co`, `leaf_tov_mn`, `leaf_tov_mx`, `rt_st_beg`, `rt_st_end`, `plnt_pop1`, `frac_lai1`, `plnt_pop2`, `frac_lai2`, `frac_sw_gro`, `wnd_dead`, `wnd_flat`, `description` |
| `print.prt` | `id`, `interval`, `dbout`, `soilout` |
| `reservoir.res` | `id`, `rel`, `description` |
| `rout-unit.def` | `id`, `elem_tot`, `elem1`, `elem2`, `elem3`, `elem4`, `elem5`, `elem6`, `elem7`, `elem8`, `elem9`, `elem10` |
| `rout-unit.ele` | `rtu`, `obj_typ`, `obj_id`, `dlr` |
| `rout-unit.rtu` | `id`, `dlr`, `topo`, `description` |
| `salt-aqu.ini` | `id`, `so4`, `ca`, `mg`, `na`, `k`, `cl`, `co3`, `hco3`, `caco3`, `mgco3`, `caso4`, `mgso4`, `nacl` |
| `salt-atmo.cli` | `id`, `sta`, `timestep`, `so4_wet`, `ca_wet`, `mg_wet`, `na_wet`, `k_wet`, `cl_wet`, `co3_wet`, `hco3_wet`, `so4_dry`, `ca_dry`, `mg_dry`, `na_dry`, `k_dry`, `cl_dry`, `co3_dry`, `hco3_dry` |
| `salt-channel.ini` | `id`, `so4`, `ca`, `mg`, `na`, `k`, `cl`, `co3`, `hco3` |
| `salt-fertilizer.frt` | `id`, `name` |
| `salt-hru.ini` | `id` |
| `salt-recall.rec` | `id`, `rec_typ` |
| `sediment.cha` | `id`, `sed_eqn`, `erod_fact`, `cov_fact`, `bd_bnk`, `bd_bed`, `kd_bnk`, `kd_bed`, `d50_bnk`, `d50_bed`, `css_bnk`, `css_bed`, `erod1`, `erod2`, `erod3`, `erod4`, `erod5`, `erod6`, `erod7`, `erod8`, `erod9`, `erod10`, `erod11`, `erod12`, `description` |
| `sediment.res` | `id`, `sed_amt`, `sed_stl`, `stl_vel`, `name`, `num_steps`, `disch_co`, `energy_co`, `weir_wd`, `vel_co` |
| `septic.sep` | `id`, `name`, `q_rate`, `bod`, `tss`, `nh4_n`, `no3_n`, `no2_n`, `org_n`, `min_p`, `org_p`, `fcoli`, `description` |
| `septic.str` | `id`, `operation`, `residents`, `dp_bioz`, `thk_bioz`, `cha_dist`, `sep_dens`, `bm_dens`, `bod_decay`, `fc_lin`, `fc_exp`, `fecal_decay`, `tds_conv`, `mort`, `resp`, `slough1`, `slough2`, `nit`, `denit`, `p_sorp`, `solp_int` |
| `slr.cli` | `id` |
| `snow.sno` | `id`, `melt_max`, `melt_min`, `tmp_lag`, `snow_h2o`, `snow_init` |
| `soil_plant.ini` | `id`, `nutrients`, `salt_cs` |
| `soils-lte.sol` | `id`, `name` |
| `soils.sol` | `id`, `name`, `hyd_grp`, `dp_tot`, `anion_excl`, `perc_crk`, `texture`, `description` |
| `sweep.ops` | `id`, `swp_eff`, `frac_curb`, `description` |
| `temperature.cha` | `id`, `bulk_co`, `air_lag` |
| `tiledrain.str` | `id`, `dp`, `t_fc`, `rad`, `drain`, `pump` |
| `tillage.til` | `id`, `name`, `mix_eff`, `mix_dp`, `rough`, `description` |
| `time.sim` | `id` |
| `tmp.cli` | `id` |
| `topography.hyd` | `id`, `slp`, `slp_len`, `dist_cha`, `depos`, `type` |
| `urban.urb` | `id`, `name`, `frac_imp`, `frac_dc_imp`, `urb_wash`, `dirt_max`, `t_halfmax`, `conc_totn`, `conc_totp`, `conc_no3n`, `urb_cn`, `description` |
| `water-allocation.wro` | `id`, `cha_ob` |
| `water-balance.sft` | `id`, `name` |
| `wb-parms.sft` | `id` |
| `weather-sta.cli` | `id`, `wgn`, `pcp`, `tmp`, `slr`, `hmd`, `wnd`, `wnd_dir`, `atmo_dep`, `pet` |
| `weather-wgn.cli` | `id`, `name`, `lon` |
| `weir.res` | `id`, `linear_c`, `exp_k`, `width`, `height` |
| `wetland.wet` | `id`, `rel`, `description` |
| `wnd.cli` | `id` |
