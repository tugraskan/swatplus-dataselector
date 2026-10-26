# HRU subset script

`hru_processor.py` creates a reduced TxtInOut folder for selected HRU IDs. It is
dependency-free (Python 3.8+, standard library only) and is what the SWAT+ HRU
Subset extension runs. This folder holds the one copy of it, its tests
(`test_hru_processor.py`) and the workaround registry document
(`SWAT_WORKAROUNDS.md`, generated from the registry in the script).

It moved here from `scripts/` in the Dataset Selector repository; Dataset
Selector no longer has an HRU subset feature.

## Make a subset

```bash
python3 hru_processor.py --dataset /path/to/TxtInOut --hru-ids 1,4-6 --keep-routing
```

Add `--output-dir` to choose where the subset is written (the source folder is
never changed; without it the subset goes inside the source folder, which is why
the extension always passes it). `--run-swat --exe /path/to/swatplus.exe` runs the
generated subset; the extension does not use it.

`--keep-routing` traces the objects downstream of the selected HRUs. A routing unit
listed as an element of another routing unit reaches the channels through it, so a
single upland HRU still keeps the channel network. `aqu_cha.lin`, `chan-surf.lin`,
`rout_unit.rtu` and the REGIONS files that carry channel, aquifer, reservoir or
routing-unit numbers are filtered and renumbered with the same id maps; region files
the tool cannot renumber are set to `null` in `file.cio`.

With `--json` the result is one JSON object on stdout (the script's progress goes to
stderr): `retained_counts`, `added_hru_ids` (each with a `reason`),
`workarounds_applied`, `warnings`, `id_maps`, and the folders.

## Describe a dataset without writing anything

| Flag | What it does |
|---|---|
| `--hru-range` | the lowest and highest HRU id and how many there are |
| `--hru-table` | one row per HRU for the extension's picker (below) |
| `--plan` | with `--hru-ids` and the same switches as a run: what a run would keep and add |

### `--plan`

Runs the routing trace, the feeder-HRU selection (W1) and the workaround decisions
against the dataset itself, read-only, and prints what a run with the same
arguments would report:

```bash
python3 hru_processor.py --dataset /path/to/TxtInOut --hru-ids 1532,1538,3978 \
    --keep-routing --plan --json
```

The JSON has `retained_counts`, `added_hru_ids` (with reasons), `workarounds_applied`
(W1 when feeder HRUs would be added, W2 when `hydrology.wet` would be rewritten, W3
and W4 when asked for), `warnings` (for example kept channels that would have only
channel inflows with `--exact-hrus`, or routing units left out because none of their
elements is kept) and `"plan": true`. It never copies, writes or creates anything;
`--output-dir` is accepted and ignored, and the folder it names is not created. A
test checks that a plan and the run of the same arguments agree.

### `--hru-table`

One row per `hru.con` row: `id`, `name`, `landuse` (the `landuse.lum` name, the HRU's
`LU_MGT` in `hru-data.hru`), `landuse_group` (CAL_GRP), `plant_community`
(PLNT_COM), `management` (MGT), `area_ha` (`hru.con` AREA), `subbasin`,
`routing_unit`, `wetland` / `wetland_name` (`hru-data.hru` SURF_STOR is not `null`)
and `receives_upstream` (some `*.con` file routes to the HRU). Only `hru.con` is
required; a missing optional file leaves its columns `null` and adds a `warnings`
entry. The JSON is compact (no indentation) because it has one object per HRU.

`routing_unit` is the `rout_unit.def` unit that lists the HRU: `rout_unit.ele` maps
an element id to an object (`OBJ_TYP` `hru`, `OBJ_TYP_NO` the HRU) and
`rout_unit.def` lists each unit's element ids. `subbasin` is, first match wins:

1. the landscape unit in `ls_unit.def` whose name starts with `sub` and that lists
   the HRU in `ls_unit.ele`, without the `sub_` prefix (`sub_020700090101` →
   `020700090101`);
2. the routing unit name when it looks like `ru<n>_<code>` (`ru1_020700090101` →
   `020700090101`);
3. the HRU's weather station (`hru.con` WST) when it is not `null` or `0`;
4. `null` (the picker shows `-`).

The answer also carries `subbasin_rule` (this text) and `subbasin_sources` (how many
HRUs got their subbasin from which of these).

## Workarounds for SWAT+ bugs

Some subsets only run because the tool works around defects in SWAT+. Each workaround
has an id, is listed in the JSON result as `workarounds_applied`, and is tracked in
the `SWAT_WORKAROUNDS` registry in `hru_processor.py` and in
[`SWAT_WORKAROUNDS.md`](SWAT_WORKAROUNDS.md) (the SWAT+ file, line and code pattern,
the commits it was confirmed against, and when to remove it).

| Id | Flag | Default | What it does |
|---|---|---|---|
| W1 | `--exact-hrus` (turns it off) | on with `--keep-routing` | Adds one HRU for each kept channel that would have only channel inflows. Reported as `added_hru_ids`, with a reason each. |
| W2 | `--keep-wetland-file` (turns it off) | on | Rewrites `hydrology.wet` so each wetland's row sits at the number of the HRU that uses it (placeholder rows in between, never more rows than HRUs). |
| W3 | `--main-compat` | off | Sets `WATER_RIGHTS` to `null null null`, creates an empty `null` file and removes `print.prt` rows only NAM_Branch accepts. |
| W4 | `--no-outputs` | off | Sets all four flags of every `print.prt` object row to `n`. |

```bash
python3 hru_processor.py --dataset /path/to/TxtInOut --hru-ids 1532,1538,3978 \
    --keep-routing --main-compat --output-dir /path/to/subset --json
```

To see which workarounds a SWAT+ checkout still needs (JSON per workaround:
`still_needed`, `no_longer_needed` or `unknown`):

```bash
python3 hru_processor.py --check-swat-source /path/to/swatplus
```

## Tests

From this folder:

```bash
python3 -m unittest test_hru_processor
```

(or `python3 -m unittest discover -s python -p "test_*.py"` from `hru-subset/`).
`RegistryTests.test_markdown_file_matches_the_registry` fails when
`SWAT_WORKAROUNDS.md` and the registry differ; regenerate the file as its header
says.
