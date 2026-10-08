# SWAT+ Dataset MCP Server

The extension ships a standalone **Model Context Protocol (MCP) server** that
exposes the headless dataset engine as agent tools. Any MCP client — Claude Code,
Claude Desktop, or another agent — can then answer questions about an indexed
SWAT+ dataset:

- *"Describe HRU 81"* — its columns, documented meanings, resolved foreign-key
  connections (soil, land use, topography, …), and what references it.
- *"What references `soil_01-h1`?"* — reverse lookup, including name-pointer
  references.
- *"What does `gw_flo` in `aquifer.aqu` mean?"* — source-backed docs (meaning,
  units, type, default, Fortran source line).

The server is source-backed by `swatplus-doc-builder` (SWAT+ 62.0.0) and reuses
the same enriched schemas the extension uses for hovers and diagnostics.

> **In-editor alternative:** the extension also ships a `@swat` chat participant
> that exposes the identical tool set in the VS Code chat panel, using your
> configured language model — no MCP setup required. Both the chat participant and
> this server register the same tools from one shared definition
> (`src/engineTools.ts`), so they never drift. Use the chat participant for
> interactive editor use; use this MCP server for external agents (Claude Code,
> Claude Desktop).

## In VS Code's own chat: nothing to configure

The extension registers this server with VS Code's own MCP registry
(`vscode.lm.registerMcpServerDefinitionProvider`, declared in
`package.json`'s `contributes.mcpServerDefinitionProviders`), the same way
its debug-tool counterpart does. Opening this workspace and enabling the
server once (VS Code's own one-time per-workspace trust prompt — `MCP: List
Servers` → `SWAT+ Dataset` → `Start`, if it isn't offered automatically) is
enough; no `.vscode/mcp.json` is written or needed for this path, and no
`node` executable path has to be found or hardcoded. The extension spawns
`dist/mcp-server.js` with `process.execPath` — the editor's own bundled
Node.js — so this keeps working across container/Codespaces rebuilds that
change where VS Code's bundled Node actually lives on disk.

The arguments the server is spawned with come from whichever dataset is
currently selected in the SWAT+ sidebar:

- A dataset selected with an existing, version-compatible `index.json`
  (written by the extension's own indexer) → `--index <dataset>/index.json`.
- A dataset selected with no cached index yet → `--dataset <dataset>` (the
  server builds one; requires `python3` + `pandas` on `PATH`, per Running
  below).
- No dataset selected → docs-only mode; `lookup_docs` still works.

Switching the selected dataset (via the sidebar, the status bar item, or
`swat-dataset-selector.switchDataset`) tells VS Code to re-request the
definition, so the next chat turn's server spawn picks up the new dataset.
An MCP session already in progress keeps talking to the process it started
with until that session ends.

This path is specific to VS Code's own chat (GitHub Copilot Chat's agent
mode, or any other client reading VS Code's MCP registry). Claude Code,
Claude Desktop, and any other external client keep their own MCP
configuration and don't read VS Code's registry — see Configuring an MCP
client below for those.

## Tools

| Tool | Arguments | Returns |
|---|---|---|
| `describe_entity` | `entity` (kind/file/table), `id` | Full description: values + meanings, FK connections, incoming references |
| `find_references` | `entity`, `id` | Rows that reference the entity (reverse lookup) |
| `lookup_docs` | `file`, `column?` | Documentation for a file or column (works with no dataset) |
| `list_entities` | `entity`, `limit?` | Ids/names in an entity table, to discover what to describe |
| `query_rows` | `entity`, `predicates[]`, `match?`, `limit?` | Rows matching column predicates (equals/contains/gt/gte/lt/lte/in/is_empty, AND/OR) |
| `find_orphans` | `entity`, `limit?` | Rows nothing references (unused/dead data) |
| `check_dataset` | `dataset?`, `source?` | Preflight of `file.cio` against the source that reads it: text, plus a structured verdict (see below) |
| `check_inputs` | `dataset?`, `layouts?` | Preflight of every file `file.cio` names against what SWAT+ reads from it: text, plus a structured verdict (see below) |

`entity` accepts an entity kind (`hru`, `aquifer`, `channel`, `reservoir`,
`wetland`, `plant`, `soil`), a file name (`hru-data.hru`), or a table name.

## Preflight: `check_dataset`

`check_dataset` compares a dataset's `file.cio` with what
`src/readcio_read.f90` reads, using the field lists declared in
`src/input_file_module.f90`. The failure it exists for is a row one value
short. List-directed input spans records, so the short row takes the first
token of the next line. Every later row is then read shifted by one, and the
run fails far away, usually as a subscript error.

The expectations come from the source tree given by `source` (or the
server's `--source`), not from a reference dataset. An older branch therefore
expects an older `file.cio`, and a dataset that matches it passes.

### Result

The text content is what the tool has always returned. Every result also has
`structuredContent`, described by the tool's advertised `outputSchema`
(strict: unknown fields are rejected). Version:
`check_version: "dataselector-cio-preflight/1"`.

| `status` | Meaning |
| --- | --- |
| `pass` | Every list-directed row was judged (`coverage.complete`), and none is short or missing. |
| `fail` | An error is established: a short row, a missing section, an empty file, or a title with no rows. This holds even when coverage is incomplete. |
| `inconclusive` | No error was found, but not every row could be judged. **Never a pass.** |
| `error` | The check could not run. The result has `isError: true` and `error.code` is set. |

A pass is never inferred from an empty `findings` list. Clients that gate a
run on this check should require `status == "pass"`, which already implies
complete coverage.

| Field | Content |
| --- | --- |
| `summary` | One line, e.g. `pass: 30 of 30 section(s) checked; …`. |
| `dataset` | The dataset directory, plus the `path`, `sha256` and `bytes` of the `file.cio` bytes that were judged. |
| `source` | The source directory, plus the identity of `readcio_read.f90` and `input_file_module.f90`. |
| `coverage` | `complete`; four counts (`expected_sections` the code reads, `resolved_sections` with a known value count, `checked_sections` compared with the file, `observed_sections` non-blank rows after the title); and the lists `unresolved`, `unsupported` and `unjudged`. |
| `sections` | One entry per read, in read order: `position`, `variable`, `read_kind`, `source_line`, `type_name`, `expected`, `label`, `line`, `found`, `outcome`. |
| `findings` | `short_row`, `missing_section`, `empty_file` and `no_rows` are errors. `surplus_values` and `extra_row` are notes. A short row lists its `missing_fields` with the code's default filenames. |
| `error` | `null`, or `{code, message}` with code `no_dataset`, `no_source`, `dataset_file_missing`, `source_file_missing` or `read_failed`. |

### What is judged

- **Positions are fixed by the source.** Each read of unit 107 after the
  title is one position, in source order.
  - A row whose type cannot be resolved keeps its place, marked
    `unresolved`, and the rows after it are still compared with what the
    code reads into them. Those later findings carry `position_assumed:
    true`: a failure there still stands, but the short row may be the
    earlier, uncounted one.
  - Older versions of this check dropped unresolved rows, which silently
    compared later rows with the wrong expectations.
- **Short is an error, surplus is a note.** List-directed input ignores
  values past what it reads, so extra values are harmless. They usually mean
  the dataset is newer than the source.
- **A file that ends early fails.** Each section the code reads after the
  last row is a `missing_section`. An empty file, or a title with no rows,
  fails once rather than once per section.
- **Rows after everything the code reads** are `extra_row` notes.
- **Labels are diagnostic only.** The code reads each row's first token into
  `name` and discards it, so a relabelled row still passes. A swapped row is
  judged where the code reads it, not where its label suggests.

### What makes coverage incomplete

Anything this check does not model is reported, not guessed. It makes the
result `inconclusive`, unless an error elsewhere already makes it `fail`.

| Where | `reason` | Why |
| --- | --- | --- |
| source | `undeclared_variable`, `undeclared_type` | The variable or its `type … end type` block is not found. |
| source | `unsupported_declaration` | The type holds something other than one `character(len=N) :: name [= "default"]` per line. |
| source | `no_fields` | The type declares no fields. |
| source | `unrecognized_read` | A read of unit 107 in another form. Nothing after it is placed. |
| source | `whole_record_not_trailing` | A `'(A)'` read before a list-directed row. |
| source | `no_title_read`, `no_row_reads` | `readcio_read.f90` no longer has the shape this check reads. |
| dataset | `uncounted_syntax` | A row uses a comma, slash, quote or repeat count, which list-directed input counts differently from whitespace. |
| dataset | `blank_first_line` | It is unclear which line the title read consumes. |

A trailing `read (107,'(A)',…)` reads one whole line as text. Current SWAT+
uses one for the output path after the weather paths. It is counted for
position and listed under `coverage.unjudged` with the `file.cio` line it
takes (or `null` when there is none), but its content is not judged. It cannot
be short and cannot shift anything after it.

The check models a straight sequence of `read (107, …)` statements. Reads
behind a condition, a unit other than the literal `107`, or a statement
continued across lines show up as `unrecognized_read`.

## Preflight: `check_inputs`

`check_dataset` judges `file.cio` and never opens the files its rows name.
`check_inputs` opens each of them and counts the values on every data line
against the statement SWAT+ reads that file with. A line short of values is
the same failure as a short `file.cio` row: the list-directed read carries on
into the next line, and every record after it is read shifted. When the short
line is the last one, the read reaches the end of the file instead
(`at_end: true`).

### Expectations

The layouts come from one SWAT+ source, named in `expectations.swatplus`
(`commit`, `describe`):

1. `layouts` with the call, or the server's `--layouts`: a Tamandua
   `swatplus-layouts` file. Build it from the checkout that will read the
   dataset:

   ```
   swatplus-build --source <swatplus checkout> --facts facts.json
   swatplus-layouts --facts facts.json --out layouts.json
   ```

2. Otherwise the shipped `swatplus-generated-schema.json`, which is built from
   one SWAT+ release.

Input files change shape between SWAT+ versions (`plants.plt`, `exco.exc`), so
a verdict says something certain only about the version it was judged
against. A client compares `expectations.swatplus.commit` with the source it
runs.

### Result

`check_version: "dataselector-input-preflight/1"`, with a strict
`outputSchema` as for `check_dataset`.

| `status` | Meaning |
| --- | --- |
| `pass` | Every named file was checked and every data line counted (`coverage.complete`), and none is short. |
| `fail` | At least one data line is short, whatever the coverage. |
| `inconclusive` | Nothing short was found, but not every file or line could be judged. **Never a pass.** |
| `error` | The check could not run: `no_dataset`, `dataset_file_missing`, `read_failed` or `no_expectations`. |

| Field | Content |
| --- | --- |
| `dataset` | The dataset directory and the identity of the `file.cio` bytes read. |
| `expectations` | `origin` (`layouts` or `schema`), `swatplus`, and the `path` and `sha256` of the expectations file. |
| `coverage` | `complete`; `named_files`, `checked_files`, `unchecked_files`; `unjudged_rows` and up to 50 of them in `unjudged`. |
| `files` | One entry per distinct file named on a `file.cio` row: the `label` and `cio_line` that name it, `outcome` (`match`, `short` or `unchecked`), the unchecked `reason`, the identity of the bytes judged, `read_at`, `needed`, `rows_checked`, `rows_unjudged` and `short_rows`. |
| `findings` | Each short line, up to 20 per file and 200 in all: `file`, `line`, `at_end`, `found`, `needed`, `missing_columns`, `read_at`. The `short_rows` counts always cover every line. |

### What is not judged

- **Files with no read layout** (`no_layout`), including a file `file.cio`
  names by something other than SWAT+'s default name: layouts are matched by
  file name.
- **Files of lines of different kinds or nested records** (`sections`), such
  as `print.prt` and `management.sch`.
- **Files named but absent** (`missing`) or unreadable (`unreadable`).
- **Lines whose values whitespace cannot count**: a quoted value
  (`quoted_values`), or a short line with a comma, slash or repeat count
  (`list_directed_syntax`). Blank lines and `#` lines are skipped, as the
  editor's diagnostics skip them.

## Building the server

The server is bundled alongside the extension:

```bash
npm install
node esbuild.js        # produces dist/extension.js and dist/mcp-server.js
```

### Consuming without building (release artifacts)

Downstream consumers don't need to build from source. Each tagged release
publishes the self-contained server and schemas as assets (see
`.github/workflows/release.yml`):

- `mcp-server.js` — the bundled, vscode-free server (run with `node mcp-server.js`)
- `swatplus-schema-enriched.json`, `swatplus-output-schema.json` — the docs
- `swatplus-generated-schema.json` — the read layouts `check_inputs` uses
  when no `--layouts` file is given

Pin a release tag and download those files. The server finds the schemas
alongside the bundle automatically; otherwise pass `--schema` / `--output-schema`.
This is the recommended integration path for external tools (e.g. the SWAT+
Assistant).

## Running

The server reads a **pandas index** — the JSON produced by
`scripts/pandas_indexer.py`. Point it at a prebuilt index, or at a dataset
directory to have it build one (requires `python3` + `pandas`). A dataset is
optional: with neither flag the server runs in **docs-only mode**, where
`lookup_docs` works from the shipped schemas and the dataset tools return no
results.

```bash
# Docs-only (lookup_docs works with no dataset)
node dist/mcp-server.js

# Against a prebuilt index
node dist/mcp-server.js --index /path/to/index.json

# Against a TxtInOut directory (builds the index first)
node dist/mcp-server.js --dataset /path/to/TxtInOut
```

Build an index manually with:

```bash
python3 scripts/pandas_indexer.py \
  --dataset /path/to/TxtInOut \
  --schema resources/schema/swatplus-editor-schema.json \
  --metadata resources/schema/txtinout-metadata.json \
  --output /path/to/index.json
```

### Options

| Flag | Default | Purpose |
|---|---|---|
| `--index <path>` | — | Prebuilt pandas index JSON |
| `--dataset <dir>` | — | TxtInOut dir to index (used when `--index` is absent) |
| `--schema <path>` | shipped `swatplus-schema-enriched.json` | Enriched schema (FK edges + column docs) |
| `--output-schema <path>` | shipped `swatplus-output-schema.json` | Output-column docs |
| `--metadata <path>` | shipped `txtinout-metadata.json` | Metadata for the indexer (with `--dataset`) |
| `--scripts <dir>` | bundled `scripts/` | Location of `pandas_indexer.py` (with `--dataset`) |
| `--source <dir>` | — | SWAT+ source tree whose `src/` `check_dataset` reads expectations from |
| `--layouts <path>` | shipped `swatplus-generated-schema.json` | Tamandua `swatplus-layouts` JSON that `check_inputs` reads expectations from |

## Configuring an MCP client

Add the server to your client's MCP configuration. For Claude Desktop
(`claude_desktop_config.json`) or Claude Code:

```json
{
  "mcpServers": {
    "swatplus": {
      "command": "node",
      "args": [
        "/absolute/path/to/swatplus-dataselector/dist/mcp-server.js",
        "--index",
        "/absolute/path/to/your/index.json"
      ]
    }
  }
}
```

Then ask the agent things like *"Using the swatplus tools, describe hru 81 and
tell me which HRUs share its soil."*

## Architecture

The server is a thin wrapper over the vscode-free engine core:

```
dist/mcp-server.js
  └─ IndexFileDatasetModel   (loads the pandas index into a DatasetModel)
  └─ datasetEngineCore       (describeEntity / findReferences / lookupDocs)
  └─ enrichedSchemaCore      (input + output documentation)
```

The same `datasetEngineCore` backs the extension's in-editor **SWAT+: Describe
Entity** command, so the CLI/agent and the editor give identical answers.
