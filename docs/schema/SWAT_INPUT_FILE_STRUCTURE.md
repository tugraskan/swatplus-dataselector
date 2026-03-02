# SWAT+ Input File Structure Documentation

This document describes the file structure of all SWAT+ input files based on the database model definitions.

## Overview

This documentation covers **222 input models** organized into **28 categories**. Each model table includes:

- **Column Order**: The sequential position of each field
- **Column Name**: The name of the field/column
- **Type**: The data type (CharField, IntegerField, DoubleField, ForeignKeyField, etc.)
- **Constraints**: Additional constraints like UNIQUE, NULL, DEFAULT values, ON_DELETE actions
- **PK**: Indicates if the column is a Primary Key (✓ if yes)
- **FK**: Indicates if the column is a Foreign Key (✓ if yes)
- **Reference**: For foreign keys, shows which table/model is referenced

The models are organized by functional categories such as Climate, Hydrology, Soils, Connect (connectivity), and more.

## Table of Contents

- [Aquifer](#aquifer)
- [Basin](#basin)
- [Change](#change)
- [Channel](#channel)
- [Climate](#climate)
- [Config](#config)
- [Connect](#connect)
- [Decision Table](#decision-table)
- [Dr](#dr)
- [Exco](#exco)
- [Gis](#gis)
- [Gwflow](#gwflow)
- [Hru](#hru)
- [Hru Parm Db](#hru-parm-db)
- [Hydrology](#hydrology)
- [Init](#init)
- [Link](#link)
- [Lum](#lum)
- [Ops](#ops)
- [Recall](#recall)
- [Regions](#regions)
- [Reservoir](#reservoir)
- [Routing Unit](#routing-unit)
- [Salts](#salts)
- [Simulation](#simulation)
- [Soils](#soils)
- [Structural](#structural)
- [Water Rights](#water-rights)

---

## Aquifer

### Initial_aqu

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | org_min | ForeignKeyField | ON_DELETE=SET NULL, NULL |  | ✓ | init.Om_water_ini |
| 3 | pest | ForeignKeyField | ON_DELETE=SET NULL, NULL |  | ✓ | init.Pest_water_ini |
| 4 | path | ForeignKeyField | ON_DELETE=SET NULL, NULL |  | ✓ | init.Path_water_ini |
| 5 | hmet | ForeignKeyField | ON_DELETE=SET NULL, NULL |  | ✓ | init.Hmet_water_ini |
| 6 | salt | ForeignKeyField | ON_DELETE=SET NULL, NULL |  | ✓ | init.Salt_water_ini |
| 7 | salt_cs | ForeignKeyField | ON_DELETE=SET NULL, NULL |  | ✓ | Salt_aqu_ini |
| 8 | description | TextField | NULL |  |  | - |

### Aquifer_aqu

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | init | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Initial_aqu |
| 3 | gw_flo | DoubleField | - |  |  | - |
| 4 | dep_bot | DoubleField | - |  |  | - |
| 5 | dep_wt | DoubleField | - |  |  | - |
| 6 | no3_n | DoubleField | - |  |  | - |
| 7 | sol_p | DoubleField | - |  |  | - |
| 8 | carbon | DoubleField | - |  |  | - |
| 9 | flo_dist | DoubleField | - |  |  | - |
| 10 | bf_max | DoubleField | - |  |  | - |
| 11 | alpha_bf | DoubleField | - |  |  | - |
| 12 | revap | DoubleField | - |  |  | - |
| 13 | rchg_dp | DoubleField | - |  |  | - |
| 14 | spec_yld | DoubleField | - |  |  | - |
| 15 | hl_no3n | DoubleField | - |  |  | - |
| 16 | flo_min | DoubleField | - |  |  | - |
| 17 | revap_min | DoubleField | - |  |  | - |

## Basin

### Codes_bsn

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | pet_file | CharField | NULL |  |  | - |
| 2 | wq_file | CharField | NULL |  |  | - |
| 3 | pet | IntegerField | - |  |  | - |
| 4 | event | IntegerField | - |  |  | - |
| 5 | crack | IntegerField | - |  |  | - |
| 6 | swift_out | IntegerField | - |  |  | - |
| 7 | sed_det | IntegerField | - |  |  | - |
| 8 | rte_cha | IntegerField | - |  |  | - |
| 9 | deg_cha | IntegerField | - |  |  | - |
| 10 | wq_cha | IntegerField | - |  |  | - |
| 11 | nostress | IntegerField | - |  |  | - |
| 12 | cn | IntegerField | - |  |  | - |
| 13 | c_fact | IntegerField | - |  |  | - |
| 14 | carbon | IntegerField | - |  |  | - |
| 15 | lapse | IntegerField | - |  |  | - |
| 16 | uhyd | IntegerField | - |  |  | - |
| 17 | sed_cha | IntegerField | - |  |  | - |
| 18 | tiledrain | IntegerField | - |  |  | - |
| 19 | wtable | IntegerField | - |  |  | - |
| 20 | soil_p | IntegerField | - |  |  | - |
| 21 | gampt | IntegerField | - |  |  | - |
| 22 | atmo_dep | CharField | - |  |  | - |
| 23 | stor_max | IntegerField | - |  |  | - |
| 24 | i_fpwet | IntegerField | - |  |  | - |
| 25 | gwflow | IntegerField | DEFAULT=0 |  |  | - |

### Parameters_bsn

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | lai_noevap | DoubleField | - |  |  | - |
| 2 | sw_init | DoubleField | - |  |  | - |
| 3 | surq_lag | DoubleField | - |  |  | - |
| 4 | adj_pkrt | DoubleField | - |  |  | - |
| 5 | adj_pkrt_sed | DoubleField | - |  |  | - |
| 6 | lin_sed | DoubleField | - |  |  | - |
| 7 | exp_sed | DoubleField | - |  |  | - |
| 8 | orgn_min | DoubleField | - |  |  | - |
| 9 | n_uptake | DoubleField | - |  |  | - |
| 10 | p_uptake | DoubleField | - |  |  | - |
| 11 | n_perc | DoubleField | - |  |  | - |
| 12 | p_perc | DoubleField | - |  |  | - |
| 13 | p_soil | DoubleField | - |  |  | - |
| 14 | p_avail | DoubleField | - |  |  | - |
| 15 | rsd_decomp | DoubleField | - |  |  | - |
| 16 | pest_perc | DoubleField | - |  |  | - |
| 17 | msk_co1 | DoubleField | - |  |  | - |
| 18 | msk_co2 | DoubleField | - |  |  | - |
| 19 | msk_x | DoubleField | - |  |  | - |
| 20 | nperco_lchtile | DoubleField | - |  |  | - |
| 21 | evap_adj | DoubleField | - |  |  | - |
| 22 | scoef | DoubleField | - |  |  | - |
| 23 | denit_exp | DoubleField | - |  |  | - |
| 24 | denit_frac | DoubleField | - |  |  | - |
| 25 | man_bact | DoubleField | - |  |  | - |
| 26 | adj_uhyd | DoubleField | - |  |  | - |
| 27 | cn_froz | DoubleField | - |  |  | - |
| 28 | dorm_hr | DoubleField | - |  |  | - |
| 29 | plaps | DoubleField | - |  |  | - |
| 30 | tlaps | DoubleField | - |  |  | - |
| 31 | n_fix_max | DoubleField | - |  |  | - |
| 32 | rsd_decay | DoubleField | - |  |  | - |
| 33 | rsd_cover | DoubleField | - |  |  | - |
| 34 | urb_init_abst | DoubleField | - |  |  | - |
| 35 | petco_pmpt | DoubleField | - |  |  | - |
| 36 | uhyd_alpha | DoubleField | - |  |  | - |
| 37 | splash | DoubleField | - |  |  | - |
| 38 | rill | DoubleField | - |  |  | - |
| 39 | surq_exp | DoubleField | - |  |  | - |
| 40 | cov_mgt | DoubleField | - |  |  | - |
| 41 | cha_d50 | DoubleField | - |  |  | - |
| 42 | co2 | DoubleField | - |  |  | - |
| 43 | day_lag_max | DoubleField | - |  |  | - |
| 44 | igen | IntegerField | - |  |  | - |

## Change

### Cal_parms_cal

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | - |  |  | - |
| 2 | obj_typ | CharField | - |  |  | - |
| 3 | abs_min | DoubleField | - |  |  | - |
| 4 | abs_max | DoubleField | - |  |  | - |
| 5 | units | CharField | NULL |  |  | - |

### Calibration_cal

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | cal_parm | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Cal_parms_cal |
| 2 | chg_typ | CharField | - |  |  | - |
| 3 | chg_val | DoubleField | - |  |  | - |
| 4 | soil_lyr1 | IntegerField | NULL |  |  | - |
| 5 | soil_lyr2 | IntegerField | NULL |  |  | - |
| 6 | yr1 | IntegerField | NULL |  |  | - |
| 7 | yr2 | IntegerField | NULL |  |  | - |
| 8 | day1 | IntegerField | NULL |  |  | - |
| 9 | day2 | IntegerField | NULL |  |  | - |

### Calibration_cal_cond

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | calibration_cal | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Calibration_cal |
| 2 | cond_typ | CharField | - |  |  | - |
| 3 | cond_op | CharField | - |  |  | - |
| 4 | cond_val | DoubleField | NULL |  |  | - |
| 5 | cond_val_text | CharField | NULL |  |  | - |

### Calibration_cal_elem

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | calibration_cal | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Calibration_cal |
| 2 | obj_typ | CharField | - |  |  | - |
| 3 | obj_id | IntegerField | - |  |  | - |

### Codes_sft

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | landscape | BooleanField | DEFAULT=False |  |  | - |
| 2 | hyd | CharField | DEFAULT=n |  |  | - |
| 3 | plnt | BooleanField | DEFAULT=False |  |  | - |
| 4 | sed | BooleanField | DEFAULT=False |  |  | - |
| 5 | nut | BooleanField | DEFAULT=False |  |  | - |
| 6 | ch_sed | BooleanField | DEFAULT=False |  |  | - |
| 7 | ch_nut | BooleanField | DEFAULT=False |  |  | - |
| 8 | res | BooleanField | DEFAULT=False |  |  | - |

### Wb_parms_sft

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | chg_typ | CharField | - |  |  | - |
| 3 | neg | DoubleField | - |  |  | - |
| 4 | pos | DoubleField | - |  |  | - |
| 5 | lo | DoubleField | - |  |  | - |
| 6 | up | DoubleField | - |  |  | - |

### Water_balance_sft

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Water_balance_sft_item

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | water_balance_sft | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Water_balance_sft |
| 2 | name | CharField | - |  |  | - |
| 3 | surq_rto | DoubleField | DEFAULT=0 |  |  | - |
| 4 | latq_rto | DoubleField | DEFAULT=0 |  |  | - |
| 5 | perc_rto | DoubleField | DEFAULT=0 |  |  | - |
| 6 | et_rto | DoubleField | DEFAULT=0 |  |  | - |
| 7 | tileq_rto | DoubleField | DEFAULT=0 |  |  | - |
| 8 | pet | DoubleField | DEFAULT=0 |  |  | - |
| 9 | sed | DoubleField | DEFAULT=0 |  |  | - |
| 10 | wyr | DoubleField | DEFAULT=0 |  |  | - |
| 11 | bfr | DoubleField | DEFAULT=0 |  |  | - |
| 12 | solp | DoubleField | DEFAULT=0 |  |  | - |

### Ch_sed_budget_sft

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Ch_sed_budget_sft_item

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | ch_sed_budget_sft | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Ch_sed_budget_sft |
| 2 | name | CharField | - |  |  | - |
| 3 | cha_wide | DoubleField | - |  |  | - |
| 4 | cha_dc_accr | DoubleField | - |  |  | - |
| 5 | head_cut | DoubleField | - |  |  | - |
| 6 | fp_accr | DoubleField | - |  |  | - |

### Ch_sed_parms_sft

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | chg_typ | CharField | - |  |  | - |
| 3 | neg | DoubleField | - |  |  | - |
| 4 | pos | DoubleField | - |  |  | - |
| 5 | lo | DoubleField | - |  |  | - |
| 6 | up | DoubleField | - |  |  | - |

### Plant_parms_sft

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Plant_parms_sft_item

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | plant_parms_sft | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Plant_parms_sft |
| 2 | var | CharField | - |  |  | - |
| 3 | name | CharField | - |  |  | - |
| 4 | init | DoubleField | DEFAULT=0 |  |  | - |
| 5 | chg_typ | CharField | - |  |  | - |
| 6 | neg | DoubleField | DEFAULT=0 |  |  | - |
| 7 | pos | DoubleField | DEFAULT=0 |  |  | - |
| 8 | lo | DoubleField | DEFAULT=0 |  |  | - |
| 9 | up | DoubleField | DEFAULT=0 |  |  | - |

### Plant_gro_sft

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Plant_gro_sft_item

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | plant_gro_sft | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Plant_gro_sft |
| 2 | name | CharField | - |  |  | - |
| 3 | yld | DoubleField | DEFAULT=0 |  |  | - |
| 4 | npp | DoubleField | DEFAULT=0 |  |  | - |
| 5 | lai_mx | DoubleField | DEFAULT=0 |  |  | - |
| 6 | wstress | DoubleField | DEFAULT=0 |  |  | - |
| 7 | astress | DoubleField | DEFAULT=0 |  |  | - |
| 8 | tstress | DoubleField | DEFAULT=0 |  |  | - |

## Channel

### Initial_cha

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | org_min | ForeignKeyField | ON_DELETE=SET NULL, NULL |  | ✓ | init.Om_water_ini |
| 3 | pest | ForeignKeyField | ON_DELETE=SET NULL, NULL |  | ✓ | init.Pest_water_ini |
| 4 | path | ForeignKeyField | ON_DELETE=SET NULL, NULL |  | ✓ | init.Path_water_ini |
| 5 | hmet | ForeignKeyField | ON_DELETE=SET NULL, NULL |  | ✓ | init.Hmet_water_ini |
| 6 | salt | ForeignKeyField | ON_DELETE=SET NULL, NULL |  | ✓ | init.Salt_water_ini |
| 7 | salt_cs | ForeignKeyField | ON_DELETE=SET NULL, NULL |  | ✓ | Salt_channel_ini |
| 8 | description | TextField | NULL |  |  | - |

### Hydrology_cha

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | wd | DoubleField | - |  |  | - |
| 3 | dp | DoubleField | - |  |  | - |
| 4 | slp | DoubleField | - |  |  | - |
| 5 | len | DoubleField | - |  |  | - |
| 6 | mann | DoubleField | - |  |  | - |
| 7 | k | DoubleField | - |  |  | - |
| 8 | wdr | DoubleField | - |  |  | - |
| 9 | alpha_bnk | DoubleField | - |  |  | - |
| 10 | side_slp | DoubleField | - |  |  | - |
| 11 | description | TextField | NULL |  |  | - |

### Sediment_cha

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | sed_eqn | IntegerField | - |  |  | - |
| 3 | erod_fact | DoubleField | - |  |  | - |
| 4 | cov_fact | DoubleField | - |  |  | - |
| 5 | bd_bnk | DoubleField | - |  |  | - |
| 6 | bd_bed | DoubleField | - |  |  | - |
| 7 | kd_bnk | DoubleField | - |  |  | - |
| 8 | kd_bed | DoubleField | - |  |  | - |
| 9 | d50_bnk | DoubleField | - |  |  | - |
| 10 | d50_bed | DoubleField | - |  |  | - |
| 11 | css_bnk | DoubleField | - |  |  | - |
| 12 | css_bed | DoubleField | - |  |  | - |
| 13 | erod1 | DoubleField | - |  |  | - |
| 14 | erod2 | DoubleField | - |  |  | - |
| 15 | erod3 | DoubleField | - |  |  | - |
| 16 | erod4 | DoubleField | - |  |  | - |
| 17 | erod5 | DoubleField | - |  |  | - |
| 18 | erod6 | DoubleField | - |  |  | - |
| 19 | erod7 | DoubleField | - |  |  | - |
| 20 | erod8 | DoubleField | - |  |  | - |
| 21 | erod9 | DoubleField | - |  |  | - |
| 22 | erod10 | DoubleField | - |  |  | - |
| 23 | erod11 | DoubleField | - |  |  | - |
| 24 | erod12 | DoubleField | - |  |  | - |
| 25 | description | TextField | NULL |  |  | - |

### Nutrients_cha

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | plt_n | DoubleField | - |  |  | - |
| 3 | ptl_p | DoubleField | - |  |  | - |
| 4 | alg_stl | DoubleField | - |  |  | - |
| 5 | ben_disp | DoubleField | - |  |  | - |
| 6 | ben_nh3n | DoubleField | - |  |  | - |
| 7 | ptln_stl | DoubleField | - |  |  | - |
| 8 | ptlp_stl | DoubleField | - |  |  | - |
| 9 | cst_stl | DoubleField | - |  |  | - |
| 10 | ben_cst | DoubleField | - |  |  | - |
| 11 | cbn_bod_co | DoubleField | - |  |  | - |
| 12 | air_rt | DoubleField | - |  |  | - |
| 13 | cbn_bod_stl | DoubleField | - |  |  | - |
| 14 | ben_bod | DoubleField | - |  |  | - |
| 15 | bact_die | DoubleField | - |  |  | - |
| 16 | cst_decay | DoubleField | - |  |  | - |
| 17 | nh3n_no2n | DoubleField | - |  |  | - |
| 18 | no2n_no3n | DoubleField | - |  |  | - |
| 19 | ptln_nh3n | DoubleField | - |  |  | - |
| 20 | ptlp_solp | DoubleField | - |  |  | - |
| 21 | q2e_lt | IntegerField | - |  |  | - |
| 22 | q2e_alg | IntegerField | - |  |  | - |
| 23 | chla_alg | DoubleField | - |  |  | - |
| 24 | alg_n | DoubleField | - |  |  | - |
| 25 | alg_p | DoubleField | - |  |  | - |
| 26 | alg_o2_prod | DoubleField | - |  |  | - |
| 27 | alg_o2_resp | DoubleField | - |  |  | - |
| 28 | o2_nh3n | DoubleField | - |  |  | - |
| 29 | o2_no2n | DoubleField | - |  |  | - |
| 30 | alg_grow | DoubleField | - |  |  | - |
| 31 | alg_resp | DoubleField | - |  |  | - |
| 32 | slr_act | DoubleField | - |  |  | - |
| 33 | lt_co | DoubleField | - |  |  | - |
| 34 | const_n | DoubleField | - |  |  | - |
| 35 | const_p | DoubleField | - |  |  | - |
| 36 | lt_nonalg | DoubleField | - |  |  | - |
| 37 | alg_shd_l | DoubleField | - |  |  | - |
| 38 | alg_shd_nl | DoubleField | - |  |  | - |
| 39 | nh3_pref | DoubleField | - |  |  | - |
| 40 | description | TextField | NULL |  |  | - |

### Channel_cha

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | init | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Initial_cha |
| 3 | hyd | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Hydrology_cha |
| 4 | sed | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Sediment_cha |
| 5 | nut | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Nutrients_cha |
| 6 | description | TextField | NULL |  |  | - |

### Hyd_sed_lte_cha

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | order | CharField | NULL |  |  | - |
| 3 | wd | DoubleField | - |  |  | - |
| 4 | dp | DoubleField | - |  |  | - |
| 5 | slp | DoubleField | - |  |  | - |
| 6 | len | DoubleField | - |  |  | - |
| 7 | mann | DoubleField | - |  |  | - |
| 8 | k | DoubleField | - |  |  | - |
| 9 | erod_fact | DoubleField | - |  |  | - |
| 10 | cov_fact | DoubleField | - |  |  | - |
| 11 | sinu | DoubleField | - |  |  | - |
| 12 | eq_slp | DoubleField | - |  |  | - |
| 13 | d50 | DoubleField | - |  |  | - |
| 14 | clay | DoubleField | - |  |  | - |
| 15 | carbon | DoubleField | - |  |  | - |
| 16 | dry_bd | DoubleField | - |  |  | - |
| 17 | side_slp | DoubleField | - |  |  | - |
| 18 | bankfull_flo | DoubleField | - |  |  | - |
| 19 | fps | DoubleField | - |  |  | - |
| 20 | fpn | DoubleField | - |  |  | - |
| 21 | n_conc | DoubleField | - |  |  | - |
| 22 | p_conc | DoubleField | - |  |  | - |
| 23 | p_bio | DoubleField | - |  |  | - |
| 24 | description | TextField | NULL |  |  | - |

### Channel_lte_cha

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | init | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Initial_cha |
| 3 | hyd | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Hyd_sed_lte_cha |
| 4 | sed | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Sediment_cha |
| 5 | nut | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Nutrients_cha |
| 6 | description | TextField | NULL |  |  | - |

## Climate

### Weather_wgn_cli

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | lat | DoubleField | - |  |  | - |
| 3 | lon | DoubleField | - |  |  | - |
| 4 | elev | DoubleField | - |  |  | - |
| 5 | rain_yrs | IntegerField | - |  |  | - |

### Weather_wgn_cli_mon

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | weather_wgn_cli | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Weather_wgn_cli |
| 2 | month | IntegerField | - |  |  | - |
| 3 | tmp_max_ave | DoubleField | - |  |  | - |
| 4 | tmp_min_ave | DoubleField | - |  |  | - |
| 5 | tmp_max_sd | DoubleField | - |  |  | - |
| 6 | tmp_min_sd | DoubleField | - |  |  | - |
| 7 | pcp_ave | DoubleField | - |  |  | - |
| 8 | pcp_sd | DoubleField | - |  |  | - |
| 9 | pcp_skew | DoubleField | - |  |  | - |
| 10 | wet_dry | DoubleField | - |  |  | - |
| 11 | wet_wet | DoubleField | - |  |  | - |
| 12 | pcp_days | DoubleField | - |  |  | - |
| 13 | pcp_hhr | DoubleField | - |  |  | - |
| 14 | slr_ave | DoubleField | - |  |  | - |
| 15 | dew_ave | DoubleField | - |  |  | - |
| 16 | wnd_ave | DoubleField | - |  |  | - |

### Weather_sta_cli

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | wgn | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Weather_wgn_cli |
| 3 | pcp | CharField | NULL |  |  | - |
| 4 | tmp | CharField | NULL |  |  | - |
| 5 | slr | CharField | NULL |  |  | - |
| 6 | hmd | CharField | NULL |  |  | - |
| 7 | wnd | CharField | NULL |  |  | - |
| 8 | pet | CharField | NULL |  |  | - |
| 9 | atmo_dep | CharField | NULL |  |  | - |
| 10 | lat | DoubleField | NULL |  |  | - |
| 11 | lon | DoubleField | NULL |  |  | - |

### Weather_file

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | filename | CharField | - |  |  | - |
| 2 | type | CharField | - |  |  | - |
| 3 | lat | DoubleField | - |  |  | - |
| 4 | lon | DoubleField | - |  |  | - |

### Wind_dir_cli

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | cnt | IntegerField | - |  |  | - |
| 3 | n | DoubleField | - |  |  | - |
| 4 | nne | DoubleField | - |  |  | - |
| 5 | ne | DoubleField | - |  |  | - |
| 6 | ene | DoubleField | - |  |  | - |
| 7 | e | DoubleField | - |  |  | - |
| 8 | ese | DoubleField | - |  |  | - |
| 9 | se | DoubleField | - |  |  | - |
| 10 | sse | DoubleField | - |  |  | - |
| 11 | s | DoubleField | - |  |  | - |
| 12 | ssw | DoubleField | - |  |  | - |
| 13 | sw | DoubleField | - |  |  | - |
| 14 | wsw | DoubleField | - |  |  | - |
| 15 | w | DoubleField | - |  |  | - |
| 16 | wnw | DoubleField | - |  |  | - |
| 17 | nw | DoubleField | - |  |  | - |
| 18 | nnw | DoubleField | - |  |  | - |

### Atmo_cli

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | filename | CharField | - |  |  | - |
| 2 | timestep | CharField | - |  |  | - |
| 3 | mo_init | IntegerField | - |  |  | - |
| 4 | yr_init | IntegerField | - |  |  | - |
| 5 | num_aa | IntegerField | - |  |  | - |

### Atmo_cli_sta

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | atmo_cli | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Atmo_cli |
| 2 | name | CharField | - |  |  | - |

### Atmo_cli_sta_value

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | sta | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Atmo_cli_sta |
| 2 | timestep | IntegerField | - |  |  | - |
| 3 | nh4_wet | DoubleField | - |  |  | - |
| 4 | no3_wet | DoubleField | - |  |  | - |
| 5 | nh4_dry | DoubleField | - |  |  | - |
| 6 | no3_dry | DoubleField | - |  |  | - |

## Config

### File_cio_classification

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | - |  |  | - |

### File_cio

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | classification | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | File_cio_classification |
| 2 | order_in_class | IntegerField | - |  |  | - |
| 3 | file_name | CharField | - |  |  | - |
| 4 | customization | IntegerField | DEFAULT=0 |  |  | - |

### Project_config

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | project_name | CharField | NULL |  |  | - |
| 2 | project_directory | CharField | NULL |  |  | - |
| 3 | editor_version | CharField | NULL |  |  | - |
| 4 | gis_type | CharField | NULL |  |  | - |
| 5 | gis_version | CharField | NULL |  |  | - |
| 6 | project_db | CharField | NULL |  |  | - |
| 7 | reference_db | CharField | NULL |  |  | - |
| 8 | wgn_db | CharField | NULL |  |  | - |
| 9 | wgn_table_name | CharField | NULL |  |  | - |
| 10 | weather_data_dir | CharField | NULL |  |  | - |
| 11 | weather_data_format | CharField | NULL |  |  | - |
| 12 | input_files_dir | CharField | NULL |  |  | - |
| 13 | input_files_last_written | DateTimeField | NULL |  |  | - |
| 14 | swat_last_run | DateTimeField | NULL |  |  | - |
| 15 | delineation_done | BooleanField | DEFAULT=False |  |  | - |
| 16 | hrus_done | BooleanField | DEFAULT=False |  |  | - |
| 17 | soil_table | CharField | NULL |  |  | - |
| 18 | soil_layer_table | CharField | NULL |  |  | - |
| 19 | output_last_imported | DateTimeField | NULL |  |  | - |
| 20 | imported_gis | BooleanField | DEFAULT=False |  |  | - |
| 21 | is_lte | BooleanField | DEFAULT=False |  |  | - |
| 22 | use_gwflow | BooleanField | DEFAULT=False |  |  | - |

## Connect

### Con

**Description:** Inheritable base class for all connect files.

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | gis_id | IntegerField | NULL |  |  | - |
| 3 | area | DoubleField | - |  |  | - |
| 4 | lat | DoubleField | - |  |  | - |
| 5 | lon | DoubleField | - |  |  | - |
| 6 | elev | DoubleField | NULL |  |  | - |
| 7 | wst | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | climate.Weather_sta_cli |
| 8 | cst | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | simulation.Constituents_cs |
| 9 | ovfl | IntegerField | - |  |  | - |
| 10 | rule | IntegerField | - |  |  | - |

### Con_out

**Description:** Inheritable base class for all outflow parameters in many of the connect files.

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | order | IntegerField | - |  |  | - |
| 2 | obj_typ | CharField | - |  |  | - |
| 3 | obj_id | IntegerField | - |  |  | - |
| 4 | hyd_typ | CharField | - |  |  | - |
| 5 | frac | DoubleField | - |  |  | - |

### Hru_con

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | hru | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | hru_db.Hru_data_hru |

### Hru_con_out

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | hru_con | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Hru_con |

### Hru_lte_con

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | lhru | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | hru_db.Hru_lte_hru |

### Hru_lte_con_out

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | hru_lte_con | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Hru_lte_con |

### Rout_unit_con

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | rtu | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | routing_unit.Rout_unit_rtu |

### Rout_unit_con_out

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | rtu_con | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Rout_unit_con |

### Modflow_con

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | mfl | IntegerField | - |  |  | - |

### Modflow_con_out

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | modflow_con | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Modflow_con |

### Aquifer_con

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | aqu | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | aquifer.Aquifer_aqu |

### Aquifer_con_out

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | aquifer_con | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Aquifer_con |

### Aquifer2d_con

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | aqu2d | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | aquifer.Aquifer_aqu |

### Aquifer2d_con_out

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | aquifer2d_con | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Aquifer2d_con |

### Channel_con

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | cha | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | channel.Channel_cha |

### Channel_con_out

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | channel_con | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Channel_con |

### Reservoir_con

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | res | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | reservoir.Reservoir_res |

### Reservoir_con_out

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | reservoir_con | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Reservoir_con |

### Recall_con

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | rec | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | recall.Recall_rec |

### Recall_con_out

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | recall_con | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Recall_con |

### Exco_con

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | exco | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | exco.Exco_exc |

### Exco_con_out

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | exco_con | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Exco_con |

### Delratio_con

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | dlr | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | dr.Delratio_del |

### Delratio_con_out

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | delratio_con | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Delratio_con |

### Outlet_con

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | out | IntegerField | - |  |  | - |

### Outlet_con_out

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | outlet_con | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Outlet_con |

### Chandeg_con

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | lcha | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | channel.Channel_lte_cha |

### Chandeg_con_out

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | chandeg_con | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Chandeg_con |

### Rout_unit_ele

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | rtu | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Rout_unit_con |
| 3 | obj_typ | CharField | - |  |  | - |
| 4 | obj_id | IntegerField | - |  |  | - |
| 5 | frac | DoubleField | - |  |  | - |
| 6 | dlr | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | dr.Delratio_del |

## Decision Table

### D_table_dtl

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | file_name | CharField | - |  |  | - |
| 3 | description | CharField | NULL |  |  | - |

### D_table_dtl_cond

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | d_table | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | D_table_dtl |
| 2 | var | CharField | - |  |  | - |
| 3 | obj | CharField | - |  |  | - |
| 4 | obj_num | IntegerField | - |  |  | - |
| 5 | lim_var | CharField | - |  |  | - |
| 6 | lim_op | CharField | - |  |  | - |
| 7 | lim_const | DoubleField | - |  |  | - |
| 8 | description | CharField | NULL |  |  | - |

### D_table_dtl_cond_alt

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | cond | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | D_table_dtl_cond |
| 2 | alt | CharField | - |  |  | - |

### D_table_dtl_act

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | d_table | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | D_table_dtl |
| 2 | act_typ | CharField | - |  |  | - |
| 3 | obj | CharField | - |  |  | - |
| 4 | obj_num | IntegerField | - |  |  | - |
| 5 | name | CharField | - |  |  | - |
| 6 | option | CharField | - |  |  | - |
| 7 | const | DoubleField | - |  |  | - |
| 8 | const2 | DoubleField | - |  |  | - |
| 9 | fp | CharField | - |  |  | - |

### D_table_dtl_act_out

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | act | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | D_table_dtl_act |
| 2 | outcome | BooleanField | - |  |  | - |

## Dr

### Dr_om_del

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | flo | DoubleField | - |  |  | - |
| 3 | sed | DoubleField | - |  |  | - |
| 4 | orgn | DoubleField | - |  |  | - |
| 5 | sedp | DoubleField | - |  |  | - |
| 6 | no3 | DoubleField | - |  |  | - |
| 7 | solp | DoubleField | - |  |  | - |
| 8 | chla | DoubleField | - |  |  | - |
| 9 | nh3 | DoubleField | - |  |  | - |
| 10 | no2 | DoubleField | - |  |  | - |
| 11 | cbod | DoubleField | - |  |  | - |
| 12 | dox | DoubleField | - |  |  | - |
| 13 | sand | DoubleField | - |  |  | - |
| 14 | silt | DoubleField | - |  |  | - |
| 15 | clay | DoubleField | - |  |  | - |
| 16 | sag | DoubleField | - |  |  | - |
| 17 | lag | DoubleField | - |  |  | - |
| 18 | gravel | DoubleField | - |  |  | - |
| 19 | tmp | DoubleField | - |  |  | - |

### Dr_pest_del

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Dr_pest_col

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Dr_pest_val

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | row | ForeignKeyField | NULL, ON_DELETE=CASCADE |  | ✓ | Dr_pest_del |
| 2 | col | ForeignKeyField | NULL, ON_DELETE=CASCADE |  | ✓ | Dr_pest_col |
| 3 | pest_sol | DoubleField | - |  |  | - |
| 4 | pest_sor | DoubleField | - |  |  | - |

### Dr_path_del

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Dr_path_col

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Dr_path_val

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | row | ForeignKeyField | NULL, ON_DELETE=CASCADE |  | ✓ | Dr_path_del |
| 2 | col | ForeignKeyField | NULL, ON_DELETE=CASCADE |  | ✓ | Dr_path_col |
| 3 | path_sol | DoubleField | - |  |  | - |
| 4 | path_sor | DoubleField | - |  |  | - |

### Dr_hmet_del

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Dr_hmet_col

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Dr_hmet_val

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | row | ForeignKeyField | NULL, ON_DELETE=CASCADE |  | ✓ | Dr_hmet_del |
| 2 | col | ForeignKeyField | NULL, ON_DELETE=CASCADE |  | ✓ | Dr_hmet_col |
| 3 | hmet_sol | DoubleField | - |  |  | - |
| 4 | hmet_sor | DoubleField | - |  |  | - |

### Dr_salt_del

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Dr_salt_col

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Dr_salt_val

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | row | ForeignKeyField | NULL, ON_DELETE=CASCADE |  | ✓ | Dr_salt_del |
| 2 | col | ForeignKeyField | NULL, ON_DELETE=CASCADE |  | ✓ | Dr_salt_col |
| 3 | salt_sol | DoubleField | - |  |  | - |
| 4 | salt_sor | DoubleField | - |  |  | - |

### Delratio_del

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | om | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Dr_om_del |
| 3 | pest | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Dr_pest_del |
| 4 | path | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Dr_path_del |
| 5 | hmet | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Dr_hmet_del |
| 6 | salt | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Dr_salt_del |

## Exco

### Exco_om_exc

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | flo | DoubleField | - |  |  | - |
| 3 | sed | DoubleField | - |  |  | - |
| 4 | orgn | DoubleField | - |  |  | - |
| 5 | sedp | DoubleField | - |  |  | - |
| 6 | no3 | DoubleField | - |  |  | - |
| 7 | solp | DoubleField | - |  |  | - |
| 8 | chla | DoubleField | - |  |  | - |
| 9 | nh3 | DoubleField | - |  |  | - |
| 10 | no2 | DoubleField | - |  |  | - |
| 11 | cbod | DoubleField | - |  |  | - |
| 12 | dox | DoubleField | - |  |  | - |
| 13 | sand | DoubleField | - |  |  | - |
| 14 | silt | DoubleField | - |  |  | - |
| 15 | clay | DoubleField | - |  |  | - |
| 16 | sag | DoubleField | - |  |  | - |
| 17 | lag | DoubleField | - |  |  | - |
| 18 | gravel | DoubleField | - |  |  | - |
| 19 | tmp | DoubleField | - |  |  | - |

### Exco_pest_exc

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Exco_pest_col

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Exco_pest_val

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | row | ForeignKeyField | NULL, ON_DELETE=CASCADE |  | ✓ | Exco_pest_exc |
| 2 | col | ForeignKeyField | NULL, ON_DELETE=CASCADE |  | ✓ | Exco_pest_col |
| 3 | pest_sol | DoubleField | - |  |  | - |
| 4 | pest_sor | DoubleField | - |  |  | - |

### Exco_path_exc

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Exco_path_col

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Exco_path_val

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | row | ForeignKeyField | NULL, ON_DELETE=CASCADE |  | ✓ | Exco_path_exc |
| 2 | col | ForeignKeyField | NULL, ON_DELETE=CASCADE |  | ✓ | Exco_path_col |
| 3 | path_sol | DoubleField | - |  |  | - |
| 4 | path_sor | DoubleField | - |  |  | - |

### Exco_hmet_exc

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Exco_hmet_col

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Exco_hmet_val

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | row | ForeignKeyField | NULL, ON_DELETE=CASCADE |  | ✓ | Exco_hmet_exc |
| 2 | col | ForeignKeyField | NULL, ON_DELETE=CASCADE |  | ✓ | Exco_hmet_col |
| 3 | hmet_sol | DoubleField | - |  |  | - |
| 4 | hmet_sor | DoubleField | - |  |  | - |

### Exco_salt_exc

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Exco_salt_col

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Exco_salt_val

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | row | ForeignKeyField | NULL, ON_DELETE=CASCADE |  | ✓ | Exco_salt_exc |
| 2 | col | ForeignKeyField | NULL, ON_DELETE=CASCADE |  | ✓ | Exco_salt_col |
| 3 | salt_sol | DoubleField | - |  |  | - |
| 4 | salt_sor | DoubleField | - |  |  | - |

### Exco_exc

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | om | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Exco_om_exc |
| 3 | pest | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Exco_pest_exc |
| 4 | path | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Exco_path_exc |
| 5 | hmet | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Exco_hmet_exc |
| 6 | salt | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Exco_salt_exc |

## Gis

### Gis_aquifers

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | category | IntegerField | - |  |  | - |
| 2 | subbasin | IntegerField | - |  |  | - |
| 3 | deep_aquifer | IntegerField | - |  |  | - |
| 4 | area | DoubleField | - |  |  | - |
| 5 | lat | DoubleField | - |  |  | - |
| 6 | lon | DoubleField | - |  |  | - |
| 7 | elev | DoubleField | - |  |  | - |

### Gis_deep_aquifers

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | subbasin | IntegerField | - |  |  | - |
| 2 | area | DoubleField | - |  |  | - |
| 3 | lat | DoubleField | - |  |  | - |
| 4 | lon | DoubleField | - |  |  | - |
| 5 | elev | DoubleField | - |  |  | - |

### Gis_subbasins

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | area | DoubleField | - |  |  | - |
| 2 | slo1 | DoubleField | - |  |  | - |
| 3 | len1 | DoubleField | - |  |  | - |
| 4 | sll | DoubleField | - |  |  | - |
| 5 | lat | DoubleField | - |  |  | - |
| 6 | lon | DoubleField | - |  |  | - |
| 7 | elev | DoubleField | - |  |  | - |
| 8 | elevmin | DoubleField | - |  |  | - |
| 9 | elevmax | DoubleField | - |  |  | - |

### Gis_channels

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | subbasin | IntegerField | - |  |  | - |
| 2 | areac | DoubleField | - |  |  | - |
| 3 | strahler | IntegerField | - |  |  | - |
| 4 | len2 | DoubleField | - |  |  | - |
| 5 | slo2 | DoubleField | - |  |  | - |
| 6 | wid2 | DoubleField | - |  |  | - |
| 7 | dep2 | DoubleField | - |  |  | - |
| 8 | elevmin | DoubleField | - |  |  | - |
| 9 | elevmax | DoubleField | - |  |  | - |
| 10 | midlat | DoubleField | - |  |  | - |
| 11 | midlon | DoubleField | - |  |  | - |

### Gis_lsus

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | category | IntegerField | - |  |  | - |
| 2 | channel | IntegerField | - |  |  | - |
| 3 | area | DoubleField | - |  |  | - |
| 4 | slope | DoubleField | - |  |  | - |
| 5 | len1 | DoubleField | - |  |  | - |
| 6 | csl | DoubleField | - |  |  | - |
| 7 | wid1 | DoubleField | - |  |  | - |
| 8 | dep1 | DoubleField | - |  |  | - |
| 9 | lat | DoubleField | - |  |  | - |
| 10 | lon | DoubleField | - |  |  | - |
| 11 | elev | DoubleField | - |  |  | - |

### Gis_hrus

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | lsu | IntegerField | - |  |  | - |
| 2 | arsub | DoubleField | - |  |  | - |
| 3 | arlsu | DoubleField | - |  |  | - |
| 4 | landuse | CharField | NULL |  |  | - |
| 5 | arland | DoubleField | - |  |  | - |
| 6 | soil | CharField | - |  |  | - |
| 7 | arso | DoubleField | - |  |  | - |
| 8 | slp | CharField | - |  |  | - |
| 9 | arslp | DoubleField | - |  |  | - |
| 10 | slope | DoubleField | - |  |  | - |
| 11 | lat | DoubleField | - |  |  | - |
| 12 | lon | DoubleField | - |  |  | - |
| 13 | elev | DoubleField | - |  |  | - |

### Gis_water

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | wtype | CharField | - |  |  | - |
| 2 | lsu | IntegerField | - |  |  | - |
| 3 | subbasin | IntegerField | - |  |  | - |
| 4 | area | DoubleField | - |  |  | - |
| 5 | xpr | DoubleField | - |  |  | - |
| 6 | ypr | DoubleField | - |  |  | - |
| 7 | lat | DoubleField | - |  |  | - |
| 8 | lon | DoubleField | - |  |  | - |
| 9 | elev | DoubleField | - |  |  | - |

### Gis_points

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | subbasin | IntegerField | - |  |  | - |
| 2 | ptype | CharField | - |  |  | - |
| 3 | xpr | DoubleField | - |  |  | - |
| 4 | ypr | DoubleField | - |  |  | - |
| 5 | lat | DoubleField | - |  |  | - |
| 6 | lon | DoubleField | - |  |  | - |
| 7 | elev | DoubleField | - |  |  | - |

### Gis_routing

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | sourceid | PrimaryKeyField | - | ✓ |  | - |
| 2 | sourcecat | CharField | - |  |  | - |
| 3 | hyd_typ | CharField | NULL |  |  | - |
| 4 | sinkid | IntegerField | - |  |  | - |
| 5 | sinkcat | CharField | - |  |  | - |
| 6 | percent | DoubleField | - |  |  | - |

## Gwflow

### Gwflow_base

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | cell_size | IntegerField | NULL |  |  | - |
| 2 | row_count | IntegerField | NULL |  |  | - |
| 3 | col_count | IntegerField | NULL |  |  | - |
| 4 | boundary_conditions | IntegerField | NULL |  |  | - |
| 5 | recharge | IntegerField | NULL |  |  | - |
| 6 | soil_transfer | IntegerField | NULL |  |  | - |
| 7 | saturation_excess | IntegerField | NULL |  |  | - |
| 8 | external_pumping | IntegerField | NULL |  |  | - |
| 9 | tile_drainage | IntegerField | NULL |  |  | - |
| 10 | reservoir_exchange | IntegerField | NULL |  |  | - |
| 11 | wetland_exchange | IntegerField | NULL |  |  | - |
| 12 | floodplain_exchange | IntegerField | NULL |  |  | - |
| 13 | canal_seepage | IntegerField | NULL |  |  | - |
| 14 | solute_transport | IntegerField | NULL |  |  | - |
| 15 | transport_steps | DoubleField | NULL |  |  | - |
| 16 | disp_coef | DoubleField | NULL |  |  | - |
| 17 | recharge_delay | IntegerField | NULL |  |  | - |
| 18 | et_extinction_depth | DoubleField | NULL |  |  | - |
| 19 | water_table_depth | DoubleField | NULL |  |  | - |
| 20 | river_depth | DoubleField | NULL |  |  | - |
| 21 | tile_depth | DoubleField | NULL |  |  | - |
| 22 | tile_area | DoubleField | NULL |  |  | - |
| 23 | tile_k | DoubleField | NULL |  |  | - |
| 24 | tile_groups | IntegerField | NULL |  |  | - |
| 25 | resbed_thickness | DoubleField | NULL |  |  | - |
| 26 | resbed_k | DoubleField | NULL |  |  | - |
| 27 | wet_thickness | DoubleField | NULL |  |  | - |
| 28 | daily_output | IntegerField | NULL |  |  | - |
| 29 | annual_output | IntegerField | NULL |  |  | - |
| 30 | aa_output | IntegerField | NULL |  |  | - |
| 31 | daily_output_row | IntegerField | NULL |  |  | - |
| 32 | daily_output_col | IntegerField | NULL |  |  | - |
| 33 | timestep_balance | DoubleField | NULL |  |  | - |

### Gwflow_zone

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | zone_id | IntegerField | - | ✓ |  | - |
| 2 | aquifer_k | DoubleField | NULL |  |  | - |
| 3 | specific_yield | DoubleField | NULL |  |  | - |
| 4 | streambed_k | DoubleField | NULL |  |  | - |
| 5 | streambed_thickness | DoubleField | NULL |  |  | - |

### Gwflow_grid

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | cell_id | IntegerField | - | ✓ |  | - |
| 2 | status | IntegerField | NULL |  |  | - |
| 3 | zone | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Gwflow_zone |
| 4 | elevation | DoubleField | NULL |  |  | - |
| 5 | aquifer_thickness | DoubleField | NULL |  |  | - |
| 6 | extinction_depth | DoubleField | NULL |  |  | - |
| 7 | initial_head | DoubleField | NULL |  |  | - |
| 8 | tile | IntegerField | NULL |  |  | - |

### Gwflow_out_days

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | year | IntegerField | NULL |  |  | - |
| 2 | jday | IntegerField | NULL |  |  | - |

### Gwflow_obs_locs

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | cell_id | IntegerField | NULL |  |  | - |

### Gwflow_solutes

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | solute_name | CharField | NULL |  |  | - |
| 2 | sorption | DoubleField | NULL |  |  | - |
| 3 | rate_const | DoubleField | NULL |  |  | - |
| 4 | canal_irr | DoubleField | NULL |  |  | - |
| 5 | init_data | CharField | NULL |  |  | - |
| 6 | init_conc | DoubleField | NULL |  |  | - |

### Gwflow_init_conc

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | cell_id | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Gwflow_grid |
| 2 | init_no3 | DoubleField | DEFAULT=0 |  |  | - |
| 3 | init_p | DoubleField | DEFAULT=0 |  |  | - |
| 4 | init_so4 | DoubleField | DEFAULT=0 |  |  | - |
| 5 | init_ca | DoubleField | DEFAULT=0 |  |  | - |
| 6 | init_mg | DoubleField | DEFAULT=0 |  |  | - |
| 7 | init_na | DoubleField | DEFAULT=0 |  |  | - |
| 8 | init_k | DoubleField | DEFAULT=0 |  |  | - |
| 9 | init_cl | DoubleField | DEFAULT=0 |  |  | - |
| 10 | init_co3 | DoubleField | DEFAULT=0 |  |  | - |
| 11 | init_hco3 | DoubleField | DEFAULT=0 |  |  | - |

### Gwflow_hrucell

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | cell_id | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Gwflow_grid |
| 2 | hru | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | gis.Gis_hrus |
| 3 | area_m2 | DoubleField | NULL |  |  | - |

### Gwflow_fpcell

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | cell_id | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Gwflow_grid |
| 2 | channel | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | gis.Gis_channels |
| 3 | area_m2 | DoubleField | NULL |  |  | - |
| 4 | conductivity | DoubleField | NULL |  |  | - |

### Gwflow_rivcell

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | cell_id | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Gwflow_grid |
| 2 | channel | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | gis.Gis_channels |
| 3 | length_m | DoubleField | NULL |  |  | - |

### Gwflow_lsucell

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | cell_id | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Gwflow_grid |
| 2 | lsu | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | gis.Gis_lsus |
| 3 | area_m2 | DoubleField | NULL |  |  | - |

### Gwflow_rescell

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | cell_id | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Gwflow_grid |
| 2 | res | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | gis.Gis_water |
| 3 | res_stage | DoubleField | NULL |  |  | - |

### Gwflow_wetland

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | wet_id | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Wetland_wet |
| 2 | thickness | DoubleField | NULL |  |  | - |

## Hru

### Hru_data_hru

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | topo | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | hydrology.Topography_hyd |
| 3 | hydro | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | hydrology.Hydrology_hyd |
| 4 | soil | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | soils.Soils_sol |
| 5 | lu_mgt | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | lum.Landuse_lum |
| 6 | soil_plant_init | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | init.Soil_plant_ini |
| 7 | surf_stor | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | reservoir.Wetland_wet |
| 8 | snow | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | hru_parm_db.Snow_sno |
| 9 | field | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | hydrology.Field_fld |
| 10 | description | TextField | NULL |  |  | - |

### Hru_lte_hru

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | area | DoubleField | - |  |  | - |
| 3 | cn2 | DoubleField | - |  |  | - |
| 4 | cn3_swf | DoubleField | - |  |  | - |
| 5 | t_conc | DoubleField | - |  |  | - |
| 6 | soil_dp | DoubleField | - |  |  | - |
| 7 | perc_co | DoubleField | - |  |  | - |
| 8 | slp | DoubleField | - |  |  | - |
| 9 | slp_len | DoubleField | - |  |  | - |
| 10 | et_co | DoubleField | - |  |  | - |
| 11 | aqu_sp_yld | DoubleField | - |  |  | - |
| 12 | alpha_bf | DoubleField | - |  |  | - |
| 13 | revap | DoubleField | - |  |  | - |
| 14 | rchg_dp | DoubleField | - |  |  | - |
| 15 | sw_init | DoubleField | - |  |  | - |
| 16 | aqu_init | DoubleField | - |  |  | - |
| 17 | aqu_sh_flo | DoubleField | - |  |  | - |
| 18 | aqu_dp_flo | DoubleField | - |  |  | - |
| 19 | snow_h2o | DoubleField | - |  |  | - |
| 20 | lat | DoubleField | - |  |  | - |
| 21 | soil_text | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | soils.Soils_lte_sol |
| 22 | trop_flag | CharField | DEFAULT=non_trop |  |  | - |
| 23 | grow_start | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | decision_table.D_table_dtl |
| 24 | grow_end | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | decision_table.D_table_dtl |
| 25 | plnt_typ | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | hru_parm_db.Plants_plt |
| 26 | stress | DoubleField | - |  |  | - |
| 27 | pet_flag | CharField | DEFAULT=harg |  |  | - |
| 28 | irr_flag | CharField | DEFAULT=no_irr |  |  | - |
| 29 | irr_src | CharField | DEFAULT=outside_bsn |  |  | - |
| 30 | t_drain | DoubleField | - |  |  | - |
| 31 | usle_k | DoubleField | - |  |  | - |
| 32 | usle_c | DoubleField | - |  |  | - |
| 33 | usle_p | DoubleField | - |  |  | - |
| 34 | usle_ls | DoubleField | - |  |  | - |

## Hru Parm Db

### Plants_plt

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | plnt_typ | CharField | - |  |  | - |
| 3 | gro_trig | CharField | - |  |  | - |
| 4 | nfix_co | DoubleField | - |  |  | - |
| 5 | days_mat | DoubleField | - |  |  | - |
| 6 | bm_e | DoubleField | - |  |  | - |
| 7 | harv_idx | DoubleField | - |  |  | - |
| 8 | lai_pot | DoubleField | - |  |  | - |
| 9 | frac_hu1 | DoubleField | - |  |  | - |
| 10 | lai_max1 | DoubleField | - |  |  | - |
| 11 | frac_hu2 | DoubleField | - |  |  | - |
| 12 | lai_max2 | DoubleField | - |  |  | - |
| 13 | hu_lai_decl | DoubleField | - |  |  | - |
| 14 | dlai_rate | DoubleField | - |  |  | - |
| 15 | can_ht_max | DoubleField | - |  |  | - |
| 16 | rt_dp_max | DoubleField | - |  |  | - |
| 17 | tmp_opt | DoubleField | - |  |  | - |
| 18 | tmp_base | DoubleField | - |  |  | - |
| 19 | frac_n_yld | DoubleField | - |  |  | - |
| 20 | frac_p_yld | DoubleField | - |  |  | - |
| 21 | frac_n_em | DoubleField | - |  |  | - |
| 22 | frac_n_50 | DoubleField | - |  |  | - |
| 23 | frac_n_mat | DoubleField | - |  |  | - |
| 24 | frac_p_em | DoubleField | - |  |  | - |
| 25 | frac_p_50 | DoubleField | - |  |  | - |
| 26 | frac_p_mat | DoubleField | - |  |  | - |
| 27 | harv_idx_ws | DoubleField | - |  |  | - |
| 28 | usle_c_min | DoubleField | - |  |  | - |
| 29 | stcon_max | DoubleField | - |  |  | - |
| 30 | vpd | DoubleField | - |  |  | - |
| 31 | frac_stcon | DoubleField | - |  |  | - |
| 32 | ru_vpd | DoubleField | - |  |  | - |
| 33 | co2_hi | DoubleField | - |  |  | - |
| 34 | bm_e_hi | DoubleField | - |  |  | - |
| 35 | plnt_decomp | DoubleField | - |  |  | - |
| 36 | lai_min | DoubleField | - |  |  | - |
| 37 | bm_tree_acc | DoubleField | - |  |  | - |
| 38 | yrs_mat | DoubleField | - |  |  | - |
| 39 | bm_tree_max | DoubleField | - |  |  | - |
| 40 | ext_co | DoubleField | - |  |  | - |
| 41 | leaf_tov_mn | DoubleField | - |  |  | - |
| 42 | leaf_tov_mx | DoubleField | - |  |  | - |
| 43 | bm_dieoff | DoubleField | - |  |  | - |
| 44 | rt_st_beg | DoubleField | - |  |  | - |
| 45 | rt_st_end | DoubleField | - |  |  | - |
| 46 | plnt_pop1 | DoubleField | - |  |  | - |
| 47 | frac_lai1 | DoubleField | - |  |  | - |
| 48 | plnt_pop2 | DoubleField | - |  |  | - |
| 49 | frac_lai2 | DoubleField | - |  |  | - |
| 50 | frac_sw_gro | DoubleField | - |  |  | - |
| 51 | aeration | DoubleField | - |  |  | - |
| 52 | rsd_pctcov | DoubleField | - |  |  | - |
| 53 | rsd_covfac | DoubleField | - |  |  | - |
| 54 | description | TextField | NULL |  |  | - |

### Fertilizer_frt

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | min_n | DoubleField | - |  |  | - |
| 3 | min_p | DoubleField | - |  |  | - |
| 4 | org_n | DoubleField | - |  |  | - |
| 5 | org_p | DoubleField | - |  |  | - |
| 6 | nh3_n | DoubleField | - |  |  | - |
| 7 | pathogens | CharField | NULL |  |  | - |
| 8 | description | TextField | NULL |  |  | - |

### Tillage_til

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | mix_eff | DoubleField | - |  |  | - |
| 3 | mix_dp | DoubleField | - |  |  | - |
| 4 | rough | DoubleField | - |  |  | - |
| 5 | ridge_ht | DoubleField | - |  |  | - |
| 6 | ridge_sp | DoubleField | - |  |  | - |
| 7 | description | TextField | NULL |  |  | - |

### Pesticide_pst

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | soil_ads | DoubleField | - |  |  | - |
| 3 | frac_wash | DoubleField | - |  |  | - |
| 4 | hl_foliage | DoubleField | - |  |  | - |
| 5 | hl_soil | DoubleField | - |  |  | - |
| 6 | solub | DoubleField | - |  |  | - |
| 7 | aq_hlife | DoubleField | - |  |  | - |
| 8 | aq_volat | DoubleField | - |  |  | - |
| 9 | mol_wt | DoubleField | - |  |  | - |
| 10 | aq_resus | DoubleField | - |  |  | - |
| 11 | aq_settle | DoubleField | - |  |  | - |
| 12 | ben_act_dep | DoubleField | - |  |  | - |
| 13 | ben_bury | DoubleField | - |  |  | - |
| 14 | ben_hlife | DoubleField | - |  |  | - |
| 15 | pl_uptake | DoubleField | DEFAULT=0 |  |  | - |
| 16 | description | TextField | NULL |  |  | - |

### Pathogens_pth

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | die_sol | DoubleField | - |  |  | - |
| 3 | grow_sol | DoubleField | - |  |  | - |
| 4 | die_srb | DoubleField | - |  |  | - |
| 5 | grow_srb | DoubleField | - |  |  | - |
| 6 | sol_srb | DoubleField | - |  |  | - |
| 7 | tmp_adj | DoubleField | - |  |  | - |
| 8 | washoff | DoubleField | - |  |  | - |
| 9 | die_plnt | DoubleField | - |  |  | - |
| 10 | grow_plnt | DoubleField | - |  |  | - |
| 11 | frac_man | DoubleField | - |  |  | - |
| 12 | perc_sol | DoubleField | - |  |  | - |
| 13 | detect | DoubleField | - |  |  | - |
| 14 | die_cha | DoubleField | - |  |  | - |
| 15 | grow_cha | DoubleField | - |  |  | - |
| 16 | die_res | DoubleField | - |  |  | - |
| 17 | grow_res | DoubleField | - |  |  | - |
| 18 | swf | DoubleField | - |  |  | - |
| 19 | conc_min | DoubleField | - |  |  | - |

### Metals_mtl

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Salts_slt

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Urban_urb

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | frac_imp | DoubleField | - |  |  | - |
| 3 | frac_dc_imp | DoubleField | - |  |  | - |
| 4 | curb_den | DoubleField | - |  |  | - |
| 5 | urb_wash | DoubleField | - |  |  | - |
| 6 | dirt_max | DoubleField | - |  |  | - |
| 7 | t_halfmax | DoubleField | - |  |  | - |
| 8 | conc_totn | DoubleField | - |  |  | - |
| 9 | conc_totp | DoubleField | - |  |  | - |
| 10 | conc_no3n | DoubleField | - |  |  | - |
| 11 | urb_cn | DoubleField | - |  |  | - |
| 12 | description | TextField | NULL |  |  | - |

### Septic_sep

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | - |  |  | - |
| 2 | q_rate | DoubleField | - |  |  | - |
| 3 | bod | DoubleField | - |  |  | - |
| 4 | tss | DoubleField | - |  |  | - |
| 5 | nh4_n | DoubleField | - |  |  | - |
| 6 | no3_n | DoubleField | - |  |  | - |
| 7 | no2_n | DoubleField | - |  |  | - |
| 8 | org_n | DoubleField | - |  |  | - |
| 9 | min_p | DoubleField | - |  |  | - |
| 10 | org_p | DoubleField | - |  |  | - |
| 11 | fcoli | DoubleField | - |  |  | - |
| 12 | description | TextField | NULL |  |  | - |

### Snow_sno

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | - |  |  | - |
| 2 | fall_tmp | DoubleField | - |  |  | - |
| 3 | melt_tmp | DoubleField | - |  |  | - |
| 4 | melt_max | DoubleField | - |  |  | - |
| 5 | melt_min | DoubleField | - |  |  | - |
| 6 | tmp_lag | DoubleField | - |  |  | - |
| 7 | snow_h2o | DoubleField | - |  |  | - |
| 8 | cov50 | DoubleField | - |  |  | - |
| 9 | snow_init | DoubleField | - |  |  | - |

## Hydrology

### Hydrology_hyd

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | lat_ttime | DoubleField | - |  |  | - |
| 3 | lat_sed | DoubleField | - |  |  | - |
| 4 | can_max | DoubleField | - |  |  | - |
| 5 | esco | DoubleField | - |  |  | - |
| 6 | epco | DoubleField | - |  |  | - |
| 7 | orgn_enrich | DoubleField | - |  |  | - |
| 8 | orgp_enrich | DoubleField | - |  |  | - |
| 9 | cn3_swf | DoubleField | - |  |  | - |
| 10 | bio_mix | DoubleField | - |  |  | - |
| 11 | perco | DoubleField | - |  |  | - |
| 12 | lat_orgn | DoubleField | - |  |  | - |
| 13 | lat_orgp | DoubleField | - |  |  | - |
| 14 | pet_co | DoubleField | - |  |  | - |
| 15 | latq_co | DoubleField | - |  |  | - |

### Topography_hyd

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | slp | DoubleField | - |  |  | - |
| 3 | slp_len | DoubleField | - |  |  | - |
| 4 | lat_len | DoubleField | - |  |  | - |
| 5 | dist_cha | DoubleField | - |  |  | - |
| 6 | depos | DoubleField | - |  |  | - |
| 7 | type | CharField | NULL |  |  | - |

### Field_fld

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | len | DoubleField | - |  |  | - |
| 3 | wd | DoubleField | - |  |  | - |
| 4 | ang | DoubleField | - |  |  | - |

## Init

### Plant_ini

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | rot_yr_ini | IntegerField | - |  |  | - |
| 3 | description | TextField | NULL |  |  | - |

### Plant_ini_item

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | plant_ini | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Plant_ini |
| 2 | plnt_name | ForeignKeyField | ON_DELETE=CASCADE, NULL |  | ✓ | hru_parm_db.Plants_plt |
| 3 | lc_status | BooleanField | - |  |  | - |
| 4 | lai_init | DoubleField | - |  |  | - |
| 5 | bm_init | DoubleField | - |  |  | - |
| 6 | phu_init | DoubleField | - |  |  | - |
| 7 | plnt_pop | DoubleField | - |  |  | - |
| 8 | yrs_init | DoubleField | - |  |  | - |
| 9 | rsd_init | DoubleField | - |  |  | - |

### Om_water_ini

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | flo | DoubleField | - |  |  | - |
| 3 | sed | DoubleField | - |  |  | - |
| 4 | orgn | DoubleField | - |  |  | - |
| 5 | sedp | DoubleField | - |  |  | - |
| 6 | no3 | DoubleField | - |  |  | - |
| 7 | solp | DoubleField | - |  |  | - |
| 8 | chl_a | DoubleField | - |  |  | - |
| 9 | nh3 | DoubleField | - |  |  | - |
| 10 | no2 | DoubleField | - |  |  | - |
| 11 | cbn_bod | DoubleField | - |  |  | - |
| 12 | dis_ox | DoubleField | - |  |  | - |
| 13 | san | DoubleField | - |  |  | - |
| 14 | sil | DoubleField | - |  |  | - |
| 15 | cla | DoubleField | - |  |  | - |
| 16 | sag | DoubleField | - |  |  | - |
| 17 | lag | DoubleField | - |  |  | - |
| 18 | grv | DoubleField | - |  |  | - |
| 19 | tmp | DoubleField | - |  |  | - |
| 20 | c | DoubleField | - |  |  | - |

### Pest_hru_ini

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Pest_hru_ini_item

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | pest_hru_ini | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Pest_hru_ini |
| 2 | name | ForeignKeyField | ON_DELETE=CASCADE, NULL |  | ✓ | hru_parm_db.Pesticide_pst |
| 3 | plant | DoubleField | - |  |  | - |
| 4 | soil | DoubleField | - |  |  | - |

### Pest_water_ini

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Pest_water_ini_item

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | pest_water_ini | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Pest_water_ini |
| 2 | name | ForeignKeyField | ON_DELETE=CASCADE, NULL |  | ✓ | hru_parm_db.Pesticide_pst |
| 3 | water | DoubleField | - |  |  | - |
| 4 | benthic | DoubleField | - |  |  | - |

### Path_hru_ini

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Path_hru_ini_item

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | path_hru_ini | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Path_hru_ini |
| 2 | name | ForeignKeyField | ON_DELETE=CASCADE, NULL |  | ✓ | hru_parm_db.Pathogens_pth |
| 3 | plant | DoubleField | - |  |  | - |
| 4 | soil | DoubleField | - |  |  | - |

### Path_water_ini

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Path_water_ini_item

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | path_water_ini | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Path_water_ini |
| 2 | name | ForeignKeyField | ON_DELETE=CASCADE, NULL |  | ✓ | hru_parm_db.Pathogens_pth |
| 3 | water | DoubleField | - |  |  | - |
| 4 | benthic | DoubleField | - |  |  | - |

### Hmet_hru_ini

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Hmet_hru_ini_item

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | hmet_hru_ini | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Hmet_hru_ini |
| 2 | name | ForeignKeyField | ON_DELETE=CASCADE, NULL |  | ✓ | hru_parm_db.Metals_mtl |
| 3 | plant | DoubleField | - |  |  | - |
| 4 | soil | DoubleField | - |  |  | - |

### Hmet_water_ini

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Hmet_water_ini_item

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | hmet_water_ini | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Hmet_water_ini |
| 2 | name | ForeignKeyField | ON_DELETE=CASCADE, NULL |  | ✓ | hru_parm_db.Metals_mtl |
| 3 | water | DoubleField | - |  |  | - |
| 4 | benthic | DoubleField | - |  |  | - |

### Salt_hru_ini

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Salt_hru_ini_item

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | salt_hru_ini | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Salt_hru_ini |
| 2 | name | ForeignKeyField | ON_DELETE=CASCADE, NULL |  | ✓ | hru_parm_db.Salts_slt |
| 3 | plant | DoubleField | - |  |  | - |
| 4 | soil | DoubleField | - |  |  | - |

### Salt_water_ini

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Salt_water_ini_item

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | salt_water_ini | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Salt_water_ini |
| 2 | name | ForeignKeyField | ON_DELETE=CASCADE, NULL |  | ✓ | hru_parm_db.Salts_slt |
| 3 | water | DoubleField | - |  |  | - |
| 4 | benthic | DoubleField | - |  |  | - |

### Soil_plant_ini

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | sw_frac | DoubleField | - |  |  | - |
| 3 | nutrients | ForeignKeyField | ON_DELETE=SET NULL, NULL |  | ✓ | soils.Nutrients_sol |
| 4 | pest | ForeignKeyField | ON_DELETE=SET NULL, NULL |  | ✓ | Pest_hru_ini |
| 5 | path | ForeignKeyField | ON_DELETE=SET NULL, NULL |  | ✓ | Path_hru_ini |
| 6 | hmet | ForeignKeyField | ON_DELETE=SET NULL, NULL |  | ✓ | Hmet_hru_ini |
| 7 | salt | ForeignKeyField | ON_DELETE=SET NULL, NULL |  | ✓ | Salt_hru_ini |
| 8 | salt_cs | ForeignKeyField | ON_DELETE=SET NULL, NULL |  | ✓ | Salt_hru_ini_cs |

## Link

### Chan_surf_lin

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Chan_surf_lin_ob

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | chan_surf_lin | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Chan_surf_lin |
| 2 | obj_typ | IntegerField | - |  |  | - |
| 3 | obj_id | IntegerField | - |  |  | - |

### Chan_aqu_lin

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Chan_aqu_lin_ob

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | chan_aqu_lin | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Chan_aqu_lin |
| 2 | aqu_no | IntegerField | - |  |  | - |

## Lum

### Management_sch

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |

### Management_sch_auto

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | management_sch | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Management_sch |
| 2 | d_table | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | decision_table.D_table_dtl |
| 3 | plant1 | CharField | NULL |  |  | - |
| 4 | plant2 | CharField | NULL |  |  | - |

### Management_sch_op

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | management_sch | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Management_sch |
| 2 | op_typ | CharField | - |  |  | - |
| 3 | mon | IntegerField | - |  |  | - |
| 4 | day | IntegerField | - |  |  | - |
| 5 | hu_sch | DoubleField | - |  |  | - |
| 6 | op_data1 | CharField | NULL |  |  | - |
| 7 | op_data2 | CharField | NULL |  |  | - |
| 8 | op_data3 | DoubleField | - |  |  | - |
| 9 | description | CharField | NULL |  |  | - |
| 10 | order | IntegerField | - |  |  | - |

### Cntable_lum

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | cn_a | DoubleField | - |  |  | - |
| 3 | cn_b | DoubleField | - |  |  | - |
| 4 | cn_c | DoubleField | - |  |  | - |
| 5 | cn_d | DoubleField | - |  |  | - |
| 6 | description | TextField | NULL |  |  | - |
| 7 | treat | CharField | NULL |  |  | - |
| 8 | cond_cov | CharField | NULL |  |  | - |

### Ovn_table_lum

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | ovn_mean | DoubleField | - |  |  | - |
| 3 | ovn_min | DoubleField | - |  |  | - |
| 4 | ovn_max | DoubleField | - |  |  | - |
| 5 | description | TextField | NULL |  |  | - |

### Cons_prac_lum

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | usle_p | DoubleField | - |  |  | - |
| 3 | slp_len_max | DoubleField | - |  |  | - |
| 4 | description | TextField | NULL |  |  | - |

### Landuse_lum

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | cal_group | CharField | NULL |  |  | - |
| 3 | plnt_com | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | init.Plant_ini |
| 4 | mgt | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Management_sch |
| 5 | cn2 | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Cntable_lum |
| 6 | cons_prac | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Cons_prac_lum |
| 7 | urban | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | hru_parm_db.Urban_urb |
| 8 | urb_ro | CharField | NULL |  |  | - |
| 9 | ov_mann | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Ovn_table_lum |
| 10 | tile | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | structural.Tiledrain_str |
| 11 | sep | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | structural.Septic_str |
| 12 | vfs | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | structural.Filterstrip_str |
| 13 | grww | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | structural.Grassedww_str |
| 14 | bmp | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | structural.Bmpuser_str |
| 15 | description | TextField | NULL |  |  | - |

## Ops

### Graze_ops

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | fert | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | hru_parm_db.Fertilizer_frt |
| 3 | bm_eat | DoubleField | - |  |  | - |
| 4 | bm_tramp | DoubleField | - |  |  | - |
| 5 | man_amt | DoubleField | - |  |  | - |
| 6 | grz_bm_min | DoubleField | - |  |  | - |
| 7 | description | TextField | NULL |  |  | - |

### Harv_ops

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | harv_typ | CharField | - |  |  | - |
| 3 | harv_idx | DoubleField | - |  |  | - |
| 4 | harv_eff | DoubleField | - |  |  | - |
| 5 | harv_bm_min | DoubleField | - |  |  | - |
| 6 | description | TextField | NULL |  |  | - |

### Irr_ops

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | amt_mm | DoubleField | - |  |  | - |
| 3 | eff_frac | DoubleField | - |  |  | - |
| 4 | sumq_frac | DoubleField | - |  |  | - |
| 5 | dep_sub | DoubleField | - |  |  | - |
| 6 | salt_ppm | DoubleField | - |  |  | - |
| 7 | no3_ppm | DoubleField | - |  |  | - |
| 8 | po4_ppm | DoubleField | - |  |  | - |
| 9 | description | TextField | NULL |  |  | - |

### Sweep_ops

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | swp_eff | DoubleField | - |  |  | - |
| 3 | frac_curb | DoubleField | - |  |  | - |
| 4 | description | TextField | NULL |  |  | - |

### Fire_ops

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | chg_cn2 | DoubleField | - |  |  | - |
| 3 | frac_burn | DoubleField | - |  |  | - |
| 4 | description | TextField | NULL |  |  | - |

### Chem_app_ops

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | chem_form | CharField | - |  |  | - |
| 3 | app_typ | CharField | - |  |  | - |
| 4 | app_eff | DoubleField | - |  |  | - |
| 5 | foliar_eff | DoubleField | - |  |  | - |
| 6 | inject_dp | DoubleField | - |  |  | - |
| 7 | surf_frac | DoubleField | - |  |  | - |
| 8 | drift_pot | DoubleField | - |  |  | - |
| 9 | aerial_unif | DoubleField | - |  |  | - |
| 10 | description | TextField | NULL |  |  | - |

## Recall

### Recall_rec

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | rec_typ | IntegerField | - |  |  | - |

### Recall_dat

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | recall_rec | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Recall_rec |
| 2 | jday | IntegerField | - |  |  | - |
| 3 | mo | IntegerField | - |  |  | - |
| 4 | day_mo | IntegerField | - |  |  | - |
| 5 | yr | IntegerField | - |  |  | - |
| 6 | ob_typ | CharField | NULL |  |  | - |
| 7 | ob_name | CharField | NULL |  |  | - |
| 8 | flo | DoubleField | - |  |  | - |
| 9 | sed | DoubleField | - |  |  | - |
| 10 | orgn | DoubleField | - |  |  | - |
| 11 | sedp | DoubleField | - |  |  | - |
| 12 | no3 | DoubleField | - |  |  | - |
| 13 | solp | DoubleField | - |  |  | - |
| 14 | chla | DoubleField | - |  |  | - |
| 15 | nh3 | DoubleField | - |  |  | - |
| 16 | no2 | DoubleField | - |  |  | - |
| 17 | cbod | DoubleField | - |  |  | - |
| 18 | dox | DoubleField | - |  |  | - |
| 19 | sand | DoubleField | - |  |  | - |
| 20 | silt | DoubleField | - |  |  | - |
| 21 | clay | DoubleField | - |  |  | - |
| 22 | sag | DoubleField | - |  |  | - |
| 23 | lag | DoubleField | - |  |  | - |
| 24 | gravel | DoubleField | - |  |  | - |
| 25 | tmp | DoubleField | - |  |  | - |

## Regions

### Region_ele

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | obj_typ | CharField | - |  |  | - |
| 3 | obj_typ_no | IntegerField | - |  |  | - |
| 4 | bsn_frac | DoubleField | - |  |  | - |
| 5 | sub_frac | DoubleField | - |  |  | - |
| 6 | reg_frac | DoubleField | - |  |  | - |

### Region_def

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | area | DoubleField | - |  |  | - |

### Region_def_elem

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | elem | IntegerField | - |  |  | - |

## Reservoir

### Initial_res

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | org_min | ForeignKeyField | ON_DELETE=SET NULL, NULL |  | ✓ | init.Om_water_ini |
| 3 | pest | ForeignKeyField | ON_DELETE=SET NULL, NULL |  | ✓ | init.Pest_water_ini |
| 4 | path | ForeignKeyField | ON_DELETE=SET NULL, NULL |  | ✓ | init.Path_water_ini |
| 5 | hmet | ForeignKeyField | ON_DELETE=SET NULL, NULL |  | ✓ | init.Hmet_water_ini |
| 6 | salt | ForeignKeyField | ON_DELETE=SET NULL, NULL |  | ✓ | init.Salt_water_ini |
| 7 | salt_cs | ForeignKeyField | ON_DELETE=SET NULL, NULL |  | ✓ | Salt_res_ini |
| 8 | description | TextField | NULL |  |  | - |

### Hydrology_res

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | yr_op | IntegerField | - |  |  | - |
| 3 | mon_op | IntegerField | - |  |  | - |
| 4 | area_ps | DoubleField | - |  |  | - |
| 5 | vol_ps | DoubleField | - |  |  | - |
| 6 | area_es | DoubleField | - |  |  | - |
| 7 | vol_es | DoubleField | - |  |  | - |
| 8 | k | DoubleField | - |  |  | - |
| 9 | evap_co | DoubleField | - |  |  | - |
| 10 | shp_co1 | DoubleField | - |  |  | - |
| 11 | shp_co2 | DoubleField | - |  |  | - |

### Nutrients_res

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | mid_start | IntegerField | - |  |  | - |
| 3 | mid_end | IntegerField | - |  |  | - |
| 4 | mid_n_stl | DoubleField | - |  |  | - |
| 5 | n_stl | DoubleField | - |  |  | - |
| 6 | mid_p_stl | DoubleField | - |  |  | - |
| 7 | p_stl | DoubleField | - |  |  | - |
| 8 | chla_co | DoubleField | - |  |  | - |
| 9 | secchi_co | DoubleField | - |  |  | - |
| 10 | theta_n | DoubleField | - |  |  | - |
| 11 | theta_p | DoubleField | - |  |  | - |
| 12 | n_min_stl | DoubleField | - |  |  | - |
| 13 | p_min_stl | DoubleField | - |  |  | - |

### Sediment_res

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | sed_amt | DoubleField | - |  |  | - |
| 3 | d50 | DoubleField | - |  |  | - |
| 4 | carbon | DoubleField | - |  |  | - |
| 5 | bd | DoubleField | - |  |  | - |
| 6 | sed_stl | DoubleField | - |  |  | - |
| 7 | stl_vel | DoubleField | - |  |  | - |

### Weir_res

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | linear_c | DoubleField | - |  |  | - |
| 3 | exp_k | DoubleField | - |  |  | - |
| 4 | width | DoubleField | - |  |  | - |
| 5 | height | DoubleField | - |  |  | - |

### Reservoir_res

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | init | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Initial_res |
| 3 | hyd | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Hydrology_res |
| 4 | rel | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | D_table_dtl |
| 5 | sed | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Sediment_res |
| 6 | nut | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Nutrients_res |
| 7 | description | TextField | NULL |  |  | - |

### Hydrology_wet

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | hru_ps | DoubleField | - |  |  | - |
| 3 | dp_ps | DoubleField | - |  |  | - |
| 4 | hru_es | DoubleField | - |  |  | - |
| 5 | dp_es | DoubleField | - |  |  | - |
| 6 | k | DoubleField | - |  |  | - |
| 7 | evap | DoubleField | - |  |  | - |
| 8 | vol_area_co | DoubleField | - |  |  | - |
| 9 | vol_dp_a | DoubleField | - |  |  | - |
| 10 | vol_dp_b | DoubleField | - |  |  | - |
| 11 | hru_frac | DoubleField | - |  |  | - |

### Wetland_wet

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | init | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Initial_res |
| 3 | hyd | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Hydrology_wet |
| 4 | rel | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | D_table_dtl |
| 5 | sed | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Sediment_res |
| 6 | nut | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Nutrients_res |
| 7 | description | TextField | NULL |  |  | - |

## Routing Unit

### Rout_unit_dr

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | temp | DoubleField | - |  |  | - |
| 3 | flo | DoubleField | - |  |  | - |
| 4 | sed | DoubleField | - |  |  | - |
| 5 | orgn | DoubleField | - |  |  | - |
| 6 | sedp | DoubleField | - |  |  | - |
| 7 | no3 | DoubleField | - |  |  | - |
| 8 | solp | DoubleField | - |  |  | - |
| 9 | pest_sol | DoubleField | - |  |  | - |
| 10 | pest_sorb | DoubleField | - |  |  | - |
| 11 | chl_a | DoubleField | - |  |  | - |
| 12 | nh3 | DoubleField | - |  |  | - |
| 13 | no2 | DoubleField | - |  |  | - |
| 14 | cbn_bod | DoubleField | - |  |  | - |
| 15 | dis_ox | DoubleField | - |  |  | - |
| 16 | bact_p | DoubleField | - |  |  | - |
| 17 | bact_lp | DoubleField | - |  |  | - |
| 18 | met1 | DoubleField | - |  |  | - |
| 19 | met2 | DoubleField | - |  |  | - |
| 20 | met3 | DoubleField | - |  |  | - |
| 21 | san | DoubleField | - |  |  | - |
| 22 | sil | DoubleField | - |  |  | - |
| 23 | cla | DoubleField | - |  |  | - |
| 24 | sag | DoubleField | - |  |  | - |
| 25 | lag | DoubleField | - |  |  | - |
| 26 | grv | DoubleField | - |  |  | - |

### Rout_unit_rtu

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | dlr | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Rout_unit_dr |
| 3 | topo | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | hydrology.Topography_hyd |
| 4 | field | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | hydrology.Field_fld |
| 5 | description | TextField | NULL |  |  | - |

## Salts

### Salt_recall_rec

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | rec_typ | IntegerField | - |  |  | - |

### Salt_recall_dat

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | recall_rec | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Salt_recall_rec |
| 2 | jday | IntegerField | - |  |  | - |
| 3 | mo | IntegerField | - |  |  | - |
| 4 | day_mo | IntegerField | - |  |  | - |
| 5 | yr | IntegerField | - |  |  | - |
| 6 | ob_typ | CharField | NULL |  |  | - |
| 7 | ob_name | CharField | NULL |  |  | - |
| 8 | so4 | DoubleField | - |  |  | - |
| 9 | ca | DoubleField | - |  |  | - |
| 10 | mg | DoubleField | - |  |  | - |
| 11 | na | DoubleField | - |  |  | - |
| 12 | k | DoubleField | - |  |  | - |
| 13 | cl | DoubleField | - |  |  | - |
| 14 | co3 | DoubleField | - |  |  | - |
| 15 | hco3 | DoubleField | - |  |  | - |

### Salt_atmo_cli

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | sta | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Atmo_cli_sta |
| 2 | timestep | IntegerField | - |  |  | - |
| 3 | so4_wet | DoubleField | - |  |  | - |
| 4 | ca_wet | DoubleField | - |  |  | - |
| 5 | mg_wet | DoubleField | - |  |  | - |
| 6 | na_wet | DoubleField | - |  |  | - |
| 7 | k_wet | DoubleField | - |  |  | - |
| 8 | cl_wet | DoubleField | - |  |  | - |
| 9 | co3_wet | DoubleField | - |  |  | - |
| 10 | hco3_wet | DoubleField | - |  |  | - |
| 11 | so4_dry | DoubleField | - |  |  | - |
| 12 | ca_dry | DoubleField | - |  |  | - |
| 13 | mg_dry | DoubleField | - |  |  | - |
| 14 | na_dry | DoubleField | - |  |  | - |
| 15 | k_dry | DoubleField | - |  |  | - |
| 16 | cl_dry | DoubleField | - |  |  | - |
| 17 | co3_dry | DoubleField | - |  |  | - |
| 18 | hco3_dry | DoubleField | - |  |  | - |

### Salt_road

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | sta | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Atmo_cli_sta |
| 2 | timestep | IntegerField | - |  |  | - |
| 3 | so4 | DoubleField | - |  |  | - |
| 4 | ca | DoubleField | - |  |  | - |
| 5 | mg | DoubleField | - |  |  | - |
| 6 | na | DoubleField | - |  |  | - |
| 7 | k | DoubleField | - |  |  | - |
| 8 | cl | DoubleField | - |  |  | - |
| 9 | co3 | DoubleField | - |  |  | - |
| 10 | hco3 | DoubleField | - |  |  | - |

### Salt_fertilizer_frt

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Fertilizer_frt |
| 2 | so4 | DoubleField | - |  |  | - |
| 3 | ca | DoubleField | - |  |  | - |
| 4 | mg | DoubleField | - |  |  | - |
| 5 | na | DoubleField | - |  |  | - |
| 6 | k | DoubleField | - |  |  | - |
| 7 | cl | DoubleField | - |  |  | - |
| 8 | co3 | DoubleField | - |  |  | - |
| 9 | hco3 | DoubleField | - |  |  | - |

### Salt_urban

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Urban_urb |
| 2 | so4 | DoubleField | - |  |  | - |
| 3 | ca | DoubleField | - |  |  | - |
| 4 | mg | DoubleField | - |  |  | - |
| 5 | na | DoubleField | - |  |  | - |
| 6 | k | DoubleField | - |  |  | - |
| 7 | cl | DoubleField | - |  |  | - |
| 8 | co3 | DoubleField | - |  |  | - |
| 9 | hco3 | DoubleField | - |  |  | - |

### Salt_plants_flags

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | enabled | IntegerField | DEFAULT=0 |  |  | - |
| 2 | soil | IntegerField | DEFAULT=1 |  |  | - |
| 3 | stress | IntegerField | DEFAULT=2 |  |  | - |
| 4 | conversion_factor | DoubleField | DEFAULT=500 |  |  | - |

### Salt_plants

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Plants_plt |
| 2 | a | DoubleField | - |  |  | - |
| 3 | b | DoubleField | - |  |  | - |
| 4 | so4 | DoubleField | - |  |  | - |
| 5 | ca | DoubleField | - |  |  | - |
| 6 | mg | DoubleField | - |  |  | - |
| 7 | na | DoubleField | - |  |  | - |
| 8 | k | DoubleField | - |  |  | - |
| 9 | cl | DoubleField | - |  |  | - |
| 10 | co3 | DoubleField | - |  |  | - |
| 11 | hco3 | DoubleField | - |  |  | - |

### Salt_aqu_ini

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | so4 | DoubleField | - |  |  | - |
| 3 | ca | DoubleField | - |  |  | - |
| 4 | mg | DoubleField | - |  |  | - |
| 5 | na | DoubleField | - |  |  | - |
| 6 | k | DoubleField | - |  |  | - |
| 7 | cl | DoubleField | - |  |  | - |
| 8 | co3 | DoubleField | - |  |  | - |
| 9 | hco3 | DoubleField | - |  |  | - |
| 10 | caco3 | DoubleField | - |  |  | - |
| 11 | mgco3 | DoubleField | - |  |  | - |
| 12 | caso4 | DoubleField | - |  |  | - |
| 13 | mgso4 | DoubleField | - |  |  | - |
| 14 | nacl | DoubleField | - |  |  | - |

### Salt_channel_ini

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | so4 | DoubleField | - |  |  | - |
| 3 | ca | DoubleField | - |  |  | - |
| 4 | mg | DoubleField | - |  |  | - |
| 5 | na | DoubleField | - |  |  | - |
| 6 | k | DoubleField | - |  |  | - |
| 7 | cl | DoubleField | - |  |  | - |
| 8 | co3 | DoubleField | - |  |  | - |
| 9 | hco3 | DoubleField | - |  |  | - |

### Salt_res_ini

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | so4 | DoubleField | - |  |  | - |
| 3 | ca | DoubleField | - |  |  | - |
| 4 | mg | DoubleField | - |  |  | - |
| 5 | na | DoubleField | - |  |  | - |
| 6 | k | DoubleField | - |  |  | - |
| 7 | cl | DoubleField | - |  |  | - |
| 8 | co3 | DoubleField | - |  |  | - |
| 9 | hco3 | DoubleField | - |  |  | - |

### Salt_hru_ini_cs

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | soil_so4 | DoubleField | - |  |  | - |
| 3 | soil_ca | DoubleField | - |  |  | - |
| 4 | soil_mg | DoubleField | - |  |  | - |
| 5 | soil_na | DoubleField | - |  |  | - |
| 6 | soil_k | DoubleField | - |  |  | - |
| 7 | soil_cl | DoubleField | - |  |  | - |
| 8 | soil_co3 | DoubleField | - |  |  | - |
| 9 | soil_hco3 | DoubleField | - |  |  | - |
| 10 | soil_caco3 | DoubleField | - |  |  | - |
| 11 | soil_mgco3 | DoubleField | - |  |  | - |
| 12 | soil_caso4 | DoubleField | - |  |  | - |
| 13 | soil_mgso4 | DoubleField | - |  |  | - |
| 14 | soil_nacl | DoubleField | - |  |  | - |
| 15 | plant_so4 | DoubleField | - |  |  | - |
| 16 | plant_ca | DoubleField | - |  |  | - |
| 17 | plant_mg | DoubleField | - |  |  | - |
| 18 | plant_na | DoubleField | - |  |  | - |
| 19 | plant_k | DoubleField | - |  |  | - |
| 20 | plant_cl | DoubleField | - |  |  | - |
| 21 | plant_co3 | DoubleField | - |  |  | - |
| 22 | plant_hco3 | DoubleField | - |  |  | - |
| 23 | plant_caco3 | DoubleField | - |  |  | - |
| 24 | plant_mgco3 | DoubleField | - |  |  | - |
| 25 | plant_caso4 | DoubleField | - |  |  | - |
| 26 | plant_mgso4 | DoubleField | - |  |  | - |
| 27 | plant_nacl | DoubleField | - |  |  | - |

### Salt_irrigation

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Salt_hru_ini_cs |
| 2 | so4 | DoubleField | - |  |  | - |
| 3 | ca | DoubleField | - |  |  | - |
| 4 | mg | DoubleField | - |  |  | - |
| 5 | na | DoubleField | - |  |  | - |
| 6 | k | DoubleField | - |  |  | - |
| 7 | cl | DoubleField | - |  |  | - |
| 8 | co3 | DoubleField | - |  |  | - |
| 9 | hco3 | DoubleField | - |  |  | - |

### Salt_module

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | enabled | BooleanField | DEFAULT=False |  |  | - |
| 2 | recall | BooleanField | DEFAULT=False |  |  | - |
| 3 | atmo | BooleanField | DEFAULT=False |  |  | - |
| 4 | road | BooleanField | DEFAULT=False |  |  | - |
| 5 | fert | BooleanField | DEFAULT=False |  |  | - |
| 6 | irrigation | BooleanField | DEFAULT=False |  |  | - |
| 7 | urban | BooleanField | DEFAULT=False |  |  | - |
| 8 | plants_uptake | BooleanField | DEFAULT=False |  |  | - |
| 9 | atmo_timestep | CharField | NULL |  |  | - |
| 10 | road_timestep | CharField | NULL |  |  | - |

## Simulation

### Time_sim

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | day_start | IntegerField | - |  |  | - |
| 2 | yrc_start | IntegerField | - |  |  | - |
| 3 | day_end | IntegerField | - |  |  | - |
| 4 | yrc_end | IntegerField | - |  |  | - |
| 5 | step | IntegerField | - |  |  | - |

### Print_prt

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | nyskip | IntegerField | - |  |  | - |
| 2 | day_start | IntegerField | - |  |  | - |
| 3 | yrc_start | IntegerField | - |  |  | - |
| 4 | day_end | IntegerField | - |  |  | - |
| 5 | yrc_end | IntegerField | - |  |  | - |
| 6 | interval | IntegerField | - |  |  | - |
| 7 | csvout | BooleanField | - |  |  | - |
| 8 | dbout | BooleanField | - |  |  | - |
| 9 | cdfout | BooleanField | - |  |  | - |
| 10 | crop_yld | CharField | DEFAULT=b |  |  | - |
| 11 | mgtout | BooleanField | - |  |  | - |
| 12 | hydcon | BooleanField | - |  |  | - |
| 13 | fdcout | BooleanField | - |  |  | - |

### Print_prt_aa_int

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | print_prt | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Print_prt |
| 2 | year | IntegerField | - |  |  | - |

### Print_prt_object

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | print_prt | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Print_prt |
| 2 | name | CharField | - |  |  | - |
| 3 | daily | BooleanField | - |  |  | - |
| 4 | monthly | BooleanField | - |  |  | - |
| 5 | yearly | BooleanField | - |  |  | - |
| 6 | avann | BooleanField | - |  |  | - |

### Object_prt

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | ob_typ | CharField | - |  |  | - |
| 2 | ob_typ_no | IntegerField | - |  |  | - |
| 3 | hyd_typ | CharField | - |  |  | - |
| 4 | filename | CharField | - |  |  | - |

### Object_cnt

**Description:** 
	If the integer fields are set to 0, use the total - calculated programmatically.

	ls_area and tot_area not included below as they will be calculated.
	

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | - |  |  | - |
| 2 | obj | IntegerField | DEFAULT=0 |  |  | - |
| 3 | hru | IntegerField | DEFAULT=0 |  |  | - |
| 4 | lhru | IntegerField | DEFAULT=0 |  |  | - |
| 5 | rtu | IntegerField | DEFAULT=0 |  |  | - |
| 6 | mfl | IntegerField | DEFAULT=0 |  |  | - |
| 7 | aqu | IntegerField | DEFAULT=0 |  |  | - |
| 8 | cha | IntegerField | DEFAULT=0 |  |  | - |
| 9 | res | IntegerField | DEFAULT=0 |  |  | - |
| 10 | rec | IntegerField | DEFAULT=0 |  |  | - |
| 11 | exco | IntegerField | DEFAULT=0 |  |  | - |
| 12 | dlr | IntegerField | DEFAULT=0 |  |  | - |
| 13 | can | IntegerField | DEFAULT=0 |  |  | - |
| 14 | pmp | IntegerField | DEFAULT=0 |  |  | - |
| 15 | out | IntegerField | DEFAULT=0 |  |  | - |
| 16 | lcha | IntegerField | DEFAULT=0 |  |  | - |
| 17 | aqu2d | IntegerField | DEFAULT=0 |  |  | - |
| 18 | hrd | IntegerField | DEFAULT=0 |  |  | - |
| 19 | wro | IntegerField | DEFAULT=0 |  |  | - |

### Constituents_cs

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | - |  |  | - |
| 2 | pest_coms | CharField | NULL |  |  | - |
| 3 | path_coms | CharField | NULL |  |  | - |
| 4 | hmet_coms | CharField | NULL |  |  | - |
| 5 | salt_coms | CharField | NULL |  |  | - |

## Soils

### Soils_sol

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | hyd_grp | CharField | - |  |  | - |
| 3 | dp_tot | DoubleField | - |  |  | - |
| 4 | anion_excl | DoubleField | - |  |  | - |
| 5 | perc_crk | DoubleField | - |  |  | - |
| 6 | texture | CharField | NULL |  |  | - |
| 7 | description | TextField | NULL |  |  | - |

### Soils_sol_layer

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | soil | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Soils_sol |
| 2 | layer_num | IntegerField | - |  |  | - |
| 3 | dp | DoubleField | - |  |  | - |
| 4 | bd | DoubleField | - |  |  | - |
| 5 | awc | DoubleField | - |  |  | - |
| 6 | soil_k | DoubleField | - |  |  | - |
| 7 | carbon | DoubleField | - |  |  | - |
| 8 | clay | DoubleField | - |  |  | - |
| 9 | silt | DoubleField | - |  |  | - |
| 10 | sand | DoubleField | - |  |  | - |
| 11 | rock | DoubleField | - |  |  | - |
| 12 | alb | DoubleField | - |  |  | - |
| 13 | usle_k | DoubleField | - |  |  | - |
| 14 | ec | DoubleField | - |  |  | - |
| 15 | caco3 | DoubleField | NULL |  |  | - |
| 16 | ph | DoubleField | NULL |  |  | - |

### Nutrients_sol

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | exp_co | DoubleField | - |  |  | - |
| 3 | lab_p | DoubleField | - |  |  | - |
| 4 | nitrate | DoubleField | - |  |  | - |
| 5 | fr_hum_act | DoubleField | - |  |  | - |
| 6 | hum_c_n | DoubleField | - |  |  | - |
| 7 | hum_c_p | DoubleField | - |  |  | - |
| 8 | inorgp | DoubleField | - |  |  | - |
| 9 | watersol_p | DoubleField | - |  |  | - |
| 10 | h3a_p | DoubleField | - |  |  | - |
| 11 | mehlich_p | DoubleField | - |  |  | - |
| 12 | bray_strong_p | DoubleField | - |  |  | - |
| 13 | description | TextField | NULL |  |  | - |

### Soils_lte_sol

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | awc | DoubleField | - |  |  | - |
| 3 | por | DoubleField | - |  |  | - |
| 4 | scon | DoubleField | - |  |  | - |

## Structural

### Septic_str

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | typ | IntegerField | - |  |  | - |
| 3 | yr | IntegerField | - |  |  | - |
| 4 | operation | IntegerField | - |  |  | - |
| 5 | residents | DoubleField | - |  |  | - |
| 6 | area | DoubleField | - |  |  | - |
| 7 | t_fail | IntegerField | - |  |  | - |
| 8 | dp_bioz | DoubleField | - |  |  | - |
| 9 | thk_bioz | DoubleField | - |  |  | - |
| 10 | cha_dist | DoubleField | - |  |  | - |
| 11 | sep_dens | DoubleField | - |  |  | - |
| 12 | bm_dens | DoubleField | - |  |  | - |
| 13 | bod_decay | DoubleField | - |  |  | - |
| 14 | bod_conv | DoubleField | - |  |  | - |
| 15 | fc_lin | DoubleField | - |  |  | - |
| 16 | fc_exp | DoubleField | - |  |  | - |
| 17 | fecal_decay | DoubleField | - |  |  | - |
| 18 | tds_conv | DoubleField | - |  |  | - |
| 19 | mort | DoubleField | - |  |  | - |
| 20 | resp | DoubleField | - |  |  | - |
| 21 | slough1 | DoubleField | - |  |  | - |
| 22 | slough2 | DoubleField | - |  |  | - |
| 23 | nit | DoubleField | - |  |  | - |
| 24 | denit | DoubleField | - |  |  | - |
| 25 | p_sorp | DoubleField | - |  |  | - |
| 26 | p_sorp_max | DoubleField | - |  |  | - |
| 27 | solp_slp | DoubleField | - |  |  | - |
| 28 | solp_int | DoubleField | - |  |  | - |

### Bmpuser_str

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | flag | IntegerField | - |  |  | - |
| 3 | sed_eff | DoubleField | - |  |  | - |
| 4 | ptlp_eff | DoubleField | - |  |  | - |
| 5 | solp_eff | DoubleField | - |  |  | - |
| 6 | ptln_eff | DoubleField | - |  |  | - |
| 7 | soln_eff | DoubleField | - |  |  | - |
| 8 | bact_eff | DoubleField | - |  |  | - |
| 9 | description | TextField | NULL |  |  | - |

### Filterstrip_str

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | flag | IntegerField | - |  |  | - |
| 3 | fld_vfs | DoubleField | - |  |  | - |
| 4 | con_vfs | DoubleField | - |  |  | - |
| 5 | cha_q | DoubleField | - |  |  | - |
| 6 | description | TextField | NULL |  |  | - |

### Grassedww_str

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | flag | IntegerField | - |  |  | - |
| 3 | mann | DoubleField | - |  |  | - |
| 4 | sed_co | DoubleField | - |  |  | - |
| 5 | dp | DoubleField | - |  |  | - |
| 6 | wd | DoubleField | - |  |  | - |
| 7 | len | DoubleField | - |  |  | - |
| 8 | slp | DoubleField | - |  |  | - |
| 9 | description | TextField | NULL |  |  | - |

### Tiledrain_str

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | dp | DoubleField | - |  |  | - |
| 3 | t_fc | DoubleField | - |  |  | - |
| 4 | lag | DoubleField | - |  |  | - |
| 5 | rad | DoubleField | - |  |  | - |
| 6 | dist | DoubleField | - |  |  | - |
| 7 | drain | DoubleField | - |  |  | - |
| 8 | pump | DoubleField | - |  |  | - |
| 9 | lat_ksat | DoubleField | - |  |  | - |

## Water Rights

### Water_allocation_wro

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | name | CharField | UNIQUE |  |  | - |
| 2 | rule_typ | CharField | - |  |  | - |
| 3 | cha_ob | BooleanField | - |  |  | - |

### Water_allocation_src_ob

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | water_allocation | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Water_allocation_wro |
| 2 | obj_typ | CharField | DEFAULT=unl |  |  | - |
| 3 | obj_id | IntegerField | DEFAULT=0 |  |  | - |
| 4 | limit_01 | IntegerField | DEFAULT=0 |  |  | - |
| 5 | limit_02 | IntegerField | DEFAULT=0 |  |  | - |
| 6 | limit_03 | IntegerField | DEFAULT=0 |  |  | - |
| 7 | limit_04 | IntegerField | DEFAULT=0 |  |  | - |
| 8 | limit_05 | IntegerField | DEFAULT=0 |  |  | - |
| 9 | limit_06 | IntegerField | DEFAULT=0 |  |  | - |
| 10 | limit_07 | IntegerField | DEFAULT=0 |  |  | - |
| 11 | limit_08 | IntegerField | DEFAULT=0 |  |  | - |
| 12 | limit_09 | IntegerField | DEFAULT=0 |  |  | - |
| 13 | limit_10 | IntegerField | DEFAULT=0 |  |  | - |
| 14 | limit_11 | IntegerField | DEFAULT=0 |  |  | - |
| 15 | limit_12 | IntegerField | DEFAULT=0 |  |  | - |
| 16 | description | CharField | NULL |  |  | - |

### Water_allocation_dmd_ob

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | water_allocation | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Water_allocation_wro |
| 2 | obj_typ | CharField | DEFAULT=hru |  |  | - |
| 3 | obj_id | IntegerField | DEFAULT=0 |  |  | - |
| 4 | withdr | CharField | - |  |  | - |
| 5 | amount | DoubleField | - |  |  | - |
| 6 | right | CharField | - |  |  | - |
| 7 | treat_typ | CharField | NULL |  |  | - |
| 8 | treatment | CharField | NULL |  |  | - |
| 9 | rcv_obj | CharField | NULL |  |  | - |
| 10 | rcv_obj_id | IntegerField | DEFAULT=0 |  |  | - |
| 11 | rcv_dtl | CharField | NULL |  |  | - |
| 12 | description | CharField | NULL |  |  | - |

### Water_allocation_dmd_ob_src

| Column Order | Column Name | Type | Constraints | PK | FK | Reference |
|--------------|-------------|------|-------------|----|----|-----------|
| 1 | water_allocation_dmd_ob | ForeignKeyField | ON_DELETE=CASCADE |  | ✓ | Water_allocation_dmd_ob |
| 2 | src | ForeignKeyField | NULL, ON_DELETE=SET NULL |  | ✓ | Water_allocation_src_ob |
| 3 | frac | DoubleField | - |  |  | - |
| 4 | comp | BooleanField | - |  |  | - |
