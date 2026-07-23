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

## Tools

| Tool | Arguments | Returns |
|---|---|---|
| `describe_entity` | `entity` (kind/file/table), `id` | Full description: values + meanings, FK connections, incoming references |
| `find_references` | `entity`, `id` | Rows that reference the entity (reverse lookup) |
| `lookup_docs` | `file`, `column?` | Documentation for a file or column (works with no dataset) |
| `list_entities` | `entity`, `limit?` | Ids/names in an entity table, to discover what to describe |
| `query_rows` | `entity`, `predicates[]`, `match?`, `limit?` | Rows matching column predicates (equals/contains/gt/gte/lt/lte/in/is_empty, AND/OR) |
| `find_orphans` | `entity`, `limit?` | Rows nothing references (unused/dead data) |

`entity` accepts an entity kind (`hru`, `aquifer`, `channel`, `reservoir`,
`wetland`, `plant`, `soil`), a file name (`hru-data.hru`), or a table name.

## Building the server

The server is bundled alongside the extension:

```bash
npm install
node esbuild.js        # produces dist/extension.js and dist/mcp-server.js
```

## Running

The server reads a **pandas index** — the JSON produced by
`scripts/pandas_indexer.py`. Point it at a prebuilt index, or at a dataset
directory to have it build one (requires `python3` + `pandas`):

```bash
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
