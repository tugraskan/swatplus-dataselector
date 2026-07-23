/**
 * SWAT+ dataset MCP server.
 *
 * Exposes the headless dataset engine as MCP tools so any client (Claude Code,
 * Claude Desktop, …) can answer questions about an indexed SWAT+ dataset —
 * "describe hru 81", "what references this soil", "what does this column mean".
 *
 * Standalone (no vscode). Build with `node esbuild.js` → `dist/mcp-server.js`.
 *
 * Usage:
 *   node dist/mcp-server.js                            # docs-only (lookup_docs)
 *   node dist/mcp-server.js --index <pandas-index.json> [--schema <enriched.json>]
 *                           [--output-schema <output.json>]
 *   node dist/mcp-server.js --dataset <TxtInOut-dir>   # builds the index first
 *
 * The index is the JSON produced by `scripts/pandas_indexer.py`. When --dataset
 * is given instead of --index, the server builds it via that script (requires
 * python3 + pandas on PATH). With neither, the server runs in docs-only mode:
 * lookup_docs works from the shipped schemas; the dataset tools return no results.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { IndexFileDatasetModel, IndexFile } from '../indexFileModel';
import { EngineDocs } from '../datasetEngineCore';
import { EnrichedSchemaIndex, OutputSchemaIndex } from '../enrichedSchemaCore';
import { createEngineHost } from '../engineTools';

interface CliArgs {
    index?: string;
    dataset?: string;
    schema?: string;
    outputSchema?: string;
    metadata?: string;
    scripts?: string;
}

function parseArgs(argv: string[]): CliArgs {
    const args: CliArgs = {};
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const next = () => argv[++i];
        switch (arg) {
            case '--index': args.index = next(); break;
            case '--dataset': args.dataset = next(); break;
            case '--schema': args.schema = next(); break;
            case '--output-schema': args.outputSchema = next(); break;
            case '--metadata': args.metadata = next(); break;
            case '--scripts': args.scripts = next(); break;
        }
    }
    return args;
}

/** Resolve a shipped schema file (repo/vsix layout, or a flat release download). */
function defaultSchemaPath(fileName: string): string {
    // Checks the in-repo/vsix layout (dist/ → ../resources/schema) and, for flat
    // release downloads, alongside the bundle and the current directory.
    const candidates = [
        path.join(__dirname, '..', 'resources', 'schema', fileName),
        path.join(__dirname, fileName),
        path.join(process.cwd(), fileName),
    ];
    return candidates.find(p => fs.existsSync(p)) ?? candidates[0];
}

function loadJson<T>(filePath: string): T {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

/** Build a pandas index for a dataset dir via the bundled python script. */
function buildIndex(datasetDir: string, args: CliArgs): string {
    const scriptsDir = args.scripts ?? path.join(__dirname, '..', 'scripts');
    const script = path.join(scriptsDir, 'pandas_indexer.py');
    const schema = args.schema ?? defaultSchemaPath('swatplus-editor-schema.json');
    const metadata = args.metadata ?? defaultSchemaPath('txtinout-metadata.json');
    const outPath = path.join(os.tmpdir(), `swat-index-${Date.now()}.json`);
    const result = spawnSync('python3', [
        script, '--dataset', datasetDir, '--schema', schema,
        '--metadata', metadata, '--output', outPath,
    ], { encoding: 'utf-8', maxBuffer: 200 * 1024 * 1024 });
    if (result.status !== 0) {
        throw new Error(`pandas_indexer.py failed: ${result.stderr || result.stdout}`);
    }
    return outPath;
}

function textResult(text: string) {
    return { content: [{ type: 'text' as const, text }] };
}

function main(): void {
    const args = parseArgs(process.argv.slice(2));

    let indexPath = args.index;
    if (!indexPath && args.dataset) {
        indexPath = buildIndex(args.dataset, args);
    }
    const schemaPath = args.schema && args.schema.includes('enriched')
        ? args.schema
        : defaultSchemaPath('swatplus-schema-enriched.json');
    const outputSchemaPath = args.outputSchema ?? defaultSchemaPath('swatplus-output-schema.json');

    // A dataset is optional: without --index/--dataset the server still serves
    // documentation (lookup_docs), which needs only the schemas. The dataset
    // tools then report "no record"/"could not resolve" rather than failing.
    const index: IndexFile = indexPath
        ? loadJson<IndexFile>(indexPath)
        : { tables: {}, fkReferences: [], fileTableMap: {} };
    if (!indexPath) {
        process.stderr.write(
            'note: no --index/--dataset given; running in docs-only mode '
            + '(lookup_docs works; dataset tools return no results).\n');
    }
    const enrichedRaw = loadJson<{ tables: { [f: string]: { columns?: unknown[] } } }>(schemaPath);
    const model = new IndexFileDatasetModel(index, enrichedRaw as never);
    const docs: EngineDocs = {
        input: new EnrichedSchemaIndex(enrichedRaw as never),
        output: fs.existsSync(outputSchemaPath)
            ? new OutputSchemaIndex(loadJson(outputSchemaPath))
            : undefined,
    };

    // Shared host so the MCP tools behave identically to the @swat chat participant.
    const host = createEngineHost(model, docs);

    const server = new McpServer({ name: 'swatplus-dataset', version: '0.1.0' });

    server.registerTool('describe_entity', {
        title: 'Describe a SWAT+ entity',
        description: 'Describe one entity (its columns, documented meanings, resolved '
            + 'foreign-key connections, and incoming references). Example: entity="hru", id="81".',
        inputSchema: {
            entity: z.string().describe('Entity kind (hru, aquifer, channel…), file name, or table name'),
            id: z.string().describe('The entity id or name, e.g. "81" or "soil_01-h1"'),
        },
    }, async ({ entity, id }) => textResult(host.describeEntity(entity, id)));

    server.registerTool('find_references', {
        title: 'Find references to a SWAT+ entity',
        description: 'List the rows that reference a given entity (reverse lookup), '
            + 'including name-pointer references. Example: entity="soils.sol", id="soil_01-h1".',
        inputSchema: {
            entity: z.string().describe('Entity kind, file name, or table name'),
            id: z.string().describe('The entity id or name'),
        },
    }, async ({ entity, id }) => textResult(host.findReferences(entity, id)));

    server.registerTool('lookup_docs', {
        title: 'Look up SWAT+ file/column documentation',
        description: 'Return source-backed documentation for an input or output file, '
            + 'and optionally a single column (meaning, units, type, default, source line). '
            + 'Works without a dataset. Example: file="aquifer.aqu", column="gw_flo".',
        inputSchema: {
            file: z.string().describe('Input or output file name, e.g. "aquifer.aqu" or "aquifer_day.txt"'),
            column: z.string().optional().describe('Optional column name'),
        },
    }, async ({ file, column }) => textResult(host.lookupDocs(file, column)));

    server.registerTool('list_entities', {
        title: 'List entity ids in a SWAT+ table',
        description: 'List the ids/names of rows in an entity table, to discover what '
            + 'can be described. Example: entity="hru".',
        inputSchema: {
            entity: z.string().describe('Entity kind, file name, or table name'),
            limit: z.number().int().positive().max(1000).optional()
                .describe('Maximum ids to return (default 100)'),
        },
    }, async ({ entity, limit }) => textResult(host.listEntities(entity, limit)));

    const operatorEnum = z.enum(['equals', 'contains', 'gt', 'gte', 'lt', 'lte', 'in', 'is_empty']);

    server.registerTool('query_rows', {
        title: 'Query rows in a SWAT+ table',
        description: 'Find rows in a table matching one or more column predicates. '
            + 'Operators: equals, contains, gt, gte, lt, lte, in (comma-separated), is_empty. '
            + 'Example: entity="channel.cha", predicates=[{column:"slope",operator:"gt",value:"0.1"}].',
        inputSchema: {
            entity: z.string().describe('Entity kind, file name, or table name'),
            predicates: z.array(z.object({
                column: z.string(),
                operator: operatorEnum,
                value: z.string().optional(),
                negate: z.boolean().optional(),
            })).describe('Column predicates to match'),
            match: z.enum(['all', 'any']).optional().describe('Combine predicates with all (AND) or any (OR); default all'),
            limit: z.number().int().positive().max(1000).optional().describe('Max rows (default 100)'),
        },
    }, async ({ entity, predicates, match, limit }) =>
        textResult(host.queryRows(entity, predicates, { match, limit })));

    server.registerTool('find_orphans', {
        title: 'Find unreferenced rows in a SWAT+ table',
        description: 'List rows in a table that nothing references — candidates for unused/dead '
            + 'data. Example: entity="soils.sol".',
        inputSchema: {
            entity: z.string().describe('Entity kind, file name, or table name'),
            limit: z.number().int().positive().max(1000).optional().describe('Max rows (default 100)'),
        },
    }, async ({ entity, limit }) => textResult(host.findOrphans(entity, limit)));

    const transport = new StdioServerTransport();
    server.connect(transport).catch((err: unknown) => {
        process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
    });
}

main();
