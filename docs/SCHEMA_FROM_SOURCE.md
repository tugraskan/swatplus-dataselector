# Schema built from SWAT+ source

The schema tells the indexer, the format checker and the panels how to read
each SWAT+ input file. It used to be a static extraction from one
swatplus-editor commit. It is now built from the SWAT+ Fortran itself, so it
follows your code and your branch.

## What it is made of

`scripts/generate_schema_from_layouts.py` merges three sources, each used only
for what it is right about:

| Source | Gives | How it is matched |
|---|---|---|
| [Tamandua](https://github.com/tugraskan/Tamandua) layouts (`swatplus-layouts`) | Which columns SWAT+ reads, in order; types, units and descriptions from the declarations; the lines skipped before data; the read statement, e.g. `hru_read.f90:67` | Derived from the Fortran, never guessed |
| Real header lines: your dataset first, then the checkout's `refdata/` datasets | What each column is called in the files (`lu_mgt`, not `land_use_mgt`) | By position -- safe, because the layout *is* the read order |
| The editor schema | File links (foreign keys) and primary keys, by column name; every table the layouts do not cover | By name only |

Why never the editor schema's column order: measured on Ames, it matches the
real header in only 20 of 32 files (297 of 399 names). Where no header line is
available the generator uses, in order: header names learned from an earlier
run (`resources/schema/swatplus-learned-names.json`, keyed by the variable the
value lands in, so they survive a column moving); the editor's names by
position, only when at least 70% of positions agree by name (exact on all 8
files that could be checked); an exact-name match; the Fortran name.

Column docs (hovers, tooltips, the MCP server's `lookup_docs`) come from
Tamandua only: each carries the declaration it came from, and nothing is
written by a model. Output-file docs still come from
`swatplus-output-schema.json` -- Tamandua does not derive output columns yet.

Multi-line files the extension already parses specially (`soils.sol`,
`plant.ini`, `management.sch`, decision tables, `weather-wgn.cli`, `atmo.cli`,
`file.cio`) keep the editor schema's structure and only gain docs.

## Where the layouts come from

Best first; `src/schemaSourceCore.ts` decides, `src/schemaBuilder.ts` runs it.

1. **Your source** -- the SWAT+ checkout in the workspace, or
   `swatplus.sourceDirectory`. Runs `swatplus-build` (a no-op in milliseconds
   when nothing changed) and `swatplus-layouts`. Needs Tamandua and its parser;
   `SWAT+: Set Up This Workspace` installs both.
2. **Tamandua's snapshot** -- the facts bundled with the installed Tamandua.
3. **Shipped** -- `resources/schema/swatplus-layouts.json`, built from SWAT+
   62.0.0 when the extension was packaged. Needs nothing but Python.

If Python cannot run the generator at all, the shipped
`swatplus-generated-schema.json` is used as is. A schema you pick, upload or
edit in the sidebar always wins over all of these; choose **Automatic** in the
Schema dropdown to go back.

The schema is rebuilt before every index build (so your dataset's own headers
name the columns), whenever the Fortran in the source tree changes, and on
`SWAT+: Rebuild Schema from SWAT+ Source`. The "SWAT+ Schema" output channel
logs each step, and a report of what was named how, and which links were
dropped, is written next to the built schema.

## What it changes in the extension

- **Hover and tooltips** say which SWAT+ variable a column is read into, and
  where: `hru_db%dbsc%land_use_mgt` at `hru_read.f90:67`.
- **Table viewer**: a header's hover says the same; **Show SWAT+ names** adds a
  row under the headers with each column's Fortran name, and marks columns
  SWAT+ never reads (a trailing `description`) as *not read by SWAT+*.
- **Format checks** use what SWAT+ reads:
  - a row with fewer values than SWAT+ reads is flagged with the missing
    columns and the read statement -- a list-directed read that runs short
    carries on into the next line;
  - columns SWAT+ never reads are never required;
  - files read two ways (`plants.plt`, `soil_plant.ini`, switched by
    `codes.bsn`'s `nam1`) accept either width;
  - files of mixed line kinds (`print.prt`) are not counted per line;
  - a data row where SWAT+ expects its header is flagged with what SWAT+ will
    do: skip it. Ames's `tillage.til` has no title line, so SWAT+ never reads
    its first record, `bedderd`.

## Measured on Ames (SWAT+ 62.0.0 layouts)

Indexing with the static editor schema and with the generated one:

| | Editor schema | Generated |
|---|---|---|
| Files indexed | 35 | 39 (+ `carbon.bsn`, `manure_db.frt`, `manure_om.frt`, `soil_lyr_depths.sol`) |
| Rows | 589 | 830 -- identical in every file both index |
| File links found | 3,254 | 3,254, the same ones |
| Column-count warnings | 26 (12 on `hru.con`, 14 on `print.prt`, all spurious) | 0 |

## Regenerating the shipped files

```bash
swatplus-layouts --out resources/schema/swatplus-layouts.json   # Tamandua's bundled facts
python3 scripts/generate_schema_from_layouts.py \
    --layouts resources/schema/swatplus-layouts.json \
    --editor-schema resources/schema/swatplus-editor-schema.json \
    --metadata resources/schema/txtinout-metadata.json \
    --headers <swatplus>/refdata/Ames_sub1 --headers <swatplus>/refdata/Osu_1hru \
    --out resources/schema/swatplus-generated-schema.json \
    --report resources/schema/generated-schema-report.md \
    --write-names resources/schema/swatplus-learned-names.json
```

Use the SWAT+ tag Tamandua's bundled facts were built from (62.0.0) for the
`refdata` headers. Ames comes before Osu: Osu's files were written by SWAT+
Editor v2.2.0 for revision 60.5.4.

## Not covered yet

- File links are still the editor schema's. Deriving them from the Fortran
  (SWAT+ matches names at run time, `if (hru_db(i)%dbsc%land_use_mgt ==
  lum(ilum)%name)`) is planned in Tamandua.
- Which of two alternative forms applies is not known -- the branch condition
  is not in Tamandua's facts yet -- so both are accepted.
- `management.sch` operation lines are read by a routine the layout does not
  follow, so they keep their hand-written handling.
