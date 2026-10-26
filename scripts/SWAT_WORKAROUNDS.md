# SWAT+ workarounds in the HRU subset tool

<!-- Generated from SWAT_WORKAROUNDS in hru_processor.py. Edit the registry, then regenerate:
     python -c "import hru_processor as h; open('SWAT_WORKAROUNDS.md', 'w', newline='\n').write(h.render_workarounds_markdown())"
     (run from scripts/). A unit test fails when this file and the registry differ. -->

`scripts/hru_processor.py` works around defects in SWAT+ so that a subset of a dataset can run. Each
workaround has an id (`W1`..`W4`), is listed in the JSON result as `workarounds_applied`, and is
recorded here with the SWAT+ code it works around, so it can be removed once SWAT+ is fixed.

Confirmed against these SWAT+ commits: `NAM_Branch` 6efcee0, `main` 6f51536, `dev` 16ea369.

To see which workarounds a SWAT+ checkout still needs:

```bash
python scripts/hru_processor.py --check-swat-source /path/to/swatplus
```

The command greps each pattern below under `src/` and prints JSON with one status per workaround:
`still_needed` (a defect pattern is present), `no_longer_needed` (every pattern is absent or its fixed
form is present; that also holds for a checkout the defect never existed in, for example W1 and W3 on
`NAM_Branch`) or `unknown` (a source file is missing, or the workaround has no pattern).

| Id | Workaround | Controlled by | Default |
|---|---|---|---|
| W1 | Feeder HRUs | `--exact-hrus` | on for --keep-routing; --exact-hrus turns it off |
| W2 | Compact hydrology.wet | `--keep-wetland-file` | on in both modes; --keep-wetland-file turns it off |
| W3 | main/dev compatibility (water allocation off, NAM-only print.prt rows removed) | `--main-compat` | off (opt-in) |
| W4 | All outputs off | `--no-outputs` | off (opt-in); independent of --main-compat |

## W1 - Feeder HRUs

- **Flag:** `--exact-hrus`
- **Default:** on for --keep-routing; --exact-hrus turns it off
- **What the tool does:** After tracing, finds kept channels whose inflows are all other channels. For each, it looks up the routing unit(s) that feed that channel in the full dataset and adds one HRU element of that unit, then traces again until no such channel is left. The added HRUs are reported as added_hru_ids with a reason each.
- **Confirmed in:** `main` 6f51536, `dev` 16ea369
- **Remove when:** ch_temp.f90 no longer reads hin_d(in-1) for the first inflow (or skips the tributary mixing when the first inflow is a channel). Then drop add_feeder_hrus from RoutingTracer, the --exact-hrus flag, and the extension option.

**SWAT+ code** - ch_temp reads hin_d(in-1), index 0, when the first inflow of a channel is another channel. sd_channel_control3 calls ch_temp unconditionally. In the full dataset every channel also has a routing-unit inflow, so only subsets hit it (forrtl 408, HIN_D 0).

- File: `src/ch_temp.f90`
- Where: `main` ch_temp.f90:145, `dev` ch_temp.f90:148
- Pattern: `trib1_temp *= *ob\(iob\)%hin_d\(in-1\)`
- Find it: `grep -rniE 'trib1_temp *= *ob\(iob\)%hin_d\(in-1\)' <swatplus checkout>/src`

## W2 - Compact hydrology.wet

- **Flag:** `--keep-wetland-file`
- **Default:** on in both modes; --keep-wetland-file turns it off
- **What the tool does:** Keeps only the hydrology.wet rows that the kept HRUs' wetlands refer to (hru-data.hru SURF_STOR -> wetland.wet HYD -> hydrology.wet), in their original order, so every row number is at most the HRU count.
- **Confirmed in:** `NAM_Branch` 6efcee0, `main` 6f51536, `dev` 16ea369
- **Remove when:** et_act.f90 reads the wetland's own hydrology (for example wet_hyddb(ihyd) or a per-HRU copy indexed by the HRU) instead of wet_hyd(ihyd). Then drop compact_hydrology_wet and the --keep-wetland-file flag.

**SWAT+ code** - et_act indexes wet_hyd with the hydrology.wet row (wet_dat%hyd). wet_hyd is per HRU (sized sp_ob%hru, filled at wet_initial.f90:81) but the row can be larger than the HRU count in a subset. main stops with WET_HYD subscript 27 > upper bound 3; NAM reads past the array and gets junk (wetland ET = 0). Compacting keeps the row inside the array, though it can still read another HRU's entry (default evrsv 0.7) until SWAT+ is fixed.

- File: `src/et_act.f90`
- Where: `NAM_Branch` et_act.f90:143, `main` et_act.f90:142, `dev` et_act.f90:142
- Pattern: `es_max *= *wet_hyd\(ihyd\)`
- Find it: `grep -rniE 'es_max *= *wet_hyd\(ihyd\)' <swatplus checkout>/src`

## W3 - main/dev compatibility (water allocation off, NAM-only print.prt rows removed)

- **Flag:** `--main-compat`
- **Default:** off (opt-in)
- **What the tool does:** Sets the file.cio WATER_RIGHTS line to `null null null`, creates an empty file named `null` in the subset when missing, and removes print.prt object rows whose names only NAM_Branch accepts (today: basin_sed_bud).
- **Confirmed in:** `main` 6f51536, `dev` 16ea369
- **Remove when:** water_allocation_read.f90 skips the file when the name is "null" (and a subset no longer breaks the allocation objects), and basin_print_codes_read.f90 accepts basin_sed_bud. Then drop apply_main_compat, NAM_ONLY_PRINT_OBJECTS and --main-compat.

**SWAT+ code** - water_allocation_read has an inverted check: `.not. i_exist .or. in_wallo%pou /= "null"` reads the file when it does not exist or when the name is not "null". A subset also removes the objects water allocation uses (pou_ex1.wal/pod_ex1.wal in the 02070009 dataset point at aquifer 1 and channels 2 and 15).

- File: `src/water_allocation_read.f90`
- Where: `main` water_allocation_read.f90:38, `dev` water_allocation_read.f90:38
- Pattern: `\.not\. *i_exist *\.or\. *in_wallo%pou`
- Find it: `grep -rniE '\.not\. *i_exist *\.or\. *in_wallo%pou' <swatplus checkout>/src`

**SWAT+ code** - basin_print_codes_read validates every print.prt object name and stops with "... is not a valid object". NAM_Branch reads print.prt by position, so a NAM dataset may name basin_sed_bud, which main/dev reject.

- File: `src/basin_print_codes_read.f90`
- Where: `main` basin_print_codes_read.f90:771, `dev` basin_print_codes_read.f90:763
- Pattern: `is not a valid object`
- Fixed when this appears instead: `case *\( *"basin_sed_bud" *\)`
- Find it: `grep -rniE 'is not a valid object' <swatplus checkout>/src`

## W4 - All outputs off

- **Flag:** `--no-outputs`
- **Default:** off (opt-in); independent of --main-compat
- **What the tool does:** Sets all four flags (daily, monthly, yearly, average annual) of every remaining print.prt object row to n, so the subset runs without writing any output table.
- **Remove when:** Nothing to remove: no SWAT+ defect is registered for this option. It is a user option that takes the output writers out of a run, for example to tell a model failure from an output failure. If a defect turns up, register it here with a code pattern so --check-swat-source can track it.
- **SWAT+ code:** none registered.

## Known SWAT+ bugs with no workaround

The tool cannot work around these. They are listed so a failing run can be recognised, and `--check-swat-source` reports whether they are still present.

### K1 - NAM_Branch: 0/0 in the basin sediment budget when a run has no channels

time_control divides fp_dep_mm and fp_dep_fr_km by sp_ob%chandeg. With no channels (every isolate subset) that is 0/0, and the run ends with forrtl error 65 after all HRU outputs are written.

- `src/time_control.f90` (`NAM_Branch` time_control.f90:460-461): pattern `fp_dep_mm *= *bsn_sedbud%fp_dep_mm */ *sp_ob%chandeg`

### K2 - Routing-unit element sizing and one routing unit per object

ru_read_elements sizes ru_def by the largest element id in rout_unit.ele and allocates ob(iob)%ru(1) once per object. So every kept routing unit needs at least one real element, there must be at least as many elements as units, and no object may sit in two units. The tool keeps its subsets inside these limits; empty or zero-fraction placeholder units do not work.

- `src/ru_read_elements.f90` (`NAM_Branch` ru_read_elements.f90:53, `main` ru_read_elements.f90:55, `dev` ru_read_elements.f90:55): pattern `allocate *\(ru_def\(imax\)\)`
- `src/ru_read_elements.f90` (`NAM_Branch` ru_read_elements.f90:177, `main` ru_read_elements.f90:179, `dev` ru_read_elements.f90:179): pattern `allocate *\(ob\(iob\)%ru\(1\)`

## Retiring a workaround

1. Run `--check-swat-source` on the SWAT+ version you target; a workaround reported `no_longer_needed`
   can go.
2. Delete its code and its entry in `SWAT_WORKAROUNDS`, and the flag from the CLI and from
   `src/hruProcessor.ts` and the extension options.
3. Update `scripts/test_hru_processor.py`; the registry test lists every id.
