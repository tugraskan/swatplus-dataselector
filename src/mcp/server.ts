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
 *   node dist/mcp-server.js --index <pandas-index.json> [--schema <enriched.json>]
 *                           [--output-schema <output.json>]
 *   node dist/mcp-server.js --dataset <TxtInOut-dir>   # builds the index first
 *
 * The index is the JSON produced by `scripts/pandas_indexer.py`. When --dataset
 * is given instead of --index, the server builds it via that script (requires
 * python3 + pandas on PATH).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { IndexFileDatasetModel, IndexFile } from '../indexFileModel';
import {
    EngineDocs,
    describeEntity,
    findReferences,
    lookupDocs,
    ENTITY_FILE_ALIASES,
} from '../datasetEngineCore';
import { EnrichedSchemaIndex, OutputSchemaIndex } from '../enrichedSchemaCore';
import { queryRows, findOrphans, renderQueryResult } from '../datasetQuery';

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

/** Resolve a shipped schema file relative to this bundle's package root. */
function defaultSchemaPath(fileName: string): string {
    // dist/mcp-server.js → package root is one level up.
    return path.join(__dirname, '..', 'resources', 'schema', fileName);
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
    if (!indexPath) {
        process.stderr.write(
            'error: provide --index <pandas-index.json> or --dataset <TxtInOut-dir>\n');
        process.exit(2);
    }

    const schemaPath = args.schema && args.schema.includes('enriched')
        ? args.schema
        : defaultSchemaPath('swatplus-schema-enriched.json');
    const outputSchemaPath = args.outputSchema ?? defaultSchemaPath('swatplus-output-schema.json');

    const index = loadJson<IndexFile>(indexPath);
    const enrichedRaw = loadJson<{ tables: { [f: string]: { columns?: unknown[] } } }>(schemaPath);
    const model = new IndexFileDatasetModel(index, enrichedRaw as never);
    const docs: EngineDocs = {
        input: new EnrichedSchemaIndex(enrichedRaw as never),
        output: fs.existsSync(outputSchemaPath)
            ? new OutputSchemaIndex(loadJson(outputSchemaPath))
            : undefined,
    };

    const resolve = (entity: string): { table?: string; hint?: string } => {
        const table = model.resolveEntityTable(entity);
        if (table) {
            return { table };
        }
        const kinds = Object.keys(ENTITY_FILE_ALIASES).join(', ');
        return { hint: `Could not resolve "${entity}". Try an entity kind (${kinds}), a file name (e.g. hru-data.hru), or a table name.` };
    };

    const server = new McpServer({ name: 'swatplus-dataset', version: '0.1.0' });

    server.registerTool('describe_entity', {
        title: 'Describe a SWAT+ entity',
        description: 'Describe one entity (its columns, documented meanings, resolved '
            + 'foreign-key connections, and incoming references). Example: entity="hru", id="81".',
        inputSchema: {
            entity: z.string().describe('Entity kind (hru, aquifer, channel…), file name, or table name'),
            id: z.string().describe('The entity id or name, e.g. "81" or "soil_01-h1"'),
        },
    }, async ({ entity, id }) => {
        const { table, hint } = resolve(entity);
        return textResult(table ? describeEntity(model, docs, table, id) : hint!);
    });

    server.registerTool('find_references', {
        title: 'Find references to a SWAT+ entity',
        description: 'List the rows that reference a given entity (reverse lookup), '
            + 'including name-pointer references. Example: entity="soils.sol", id="soil_01-h1".',
        inputSchema: {
            entity: z.string().describe('Entity kind, file name, or table name'),
            id: z.string().describe('The entity id or name'),
        },
    }, async ({ entity, id }) => {
        const { table, hint } = resolve(entity);
        return textResult(table ? findReferences(model, table, id) : hint!);
    });

    server.registerTool('lookup_docs', {
        title: 'Look up SWAT+ file/column documentation',
        description: 'Return source-backed documentation for an input or output file, '
            + 'and optionally a single column (meaning, units, type, default, source line). '
            + 'Works without a dataset. Example: file="aquifer.aqu", column="gw_flo".',
        inputSchema: {
            file: z.string().describe('Input or output file name, e.g. "aquifer.aqu" or "aquifer_day.txt"'),
            column: z.string().optional().describe('Optional column name'),
        },
    }, async ({ file, column }) => {
        return textResult(lookupDocs(docs, file, column));
    });

    server.registerTool('list_entities', {
        title: 'List entity ids in a SWAT+ table',
        description: 'List the ids/names of rows in an entity table, to discover what '
            + 'can be described. Example: entity="hru".',
        inputSchema: {
            entity: z.string().describe('Entity kind, file name, or table name'),
            limit: z.number().int().positive().max(1000).optional()
                .describe('Maximum ids to return (default 100)'),
        },
    }, async ({ entity, limit }) => {
        const { table, hint } = resolve(entity);
        if (!table) {
            return textResult(hint!);
        }
        const rows = model.getRows(table);
        const ids = rows.slice(0, limit ?? 100).map(r => r.pk);
        const file = model.getFileName(table) ?? table;
        const more = rows.length > ids.length ? ` (of ${rows.length})` : '';
        return textResult(`# ${file}: ${ids.length}${more} ids\n\n${ids.join(', ')}`);
    });

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
    }, async ({ entity, predicates, match, limit }) => {
        const { table, hint } = resolve(entity);
        if (!table) {
            return textResult(hint!);
        }
        const fileName = model.getFileName(table) ?? table;
        const result = queryRows(model, table, predicates, { match, limit });
        return textResult(renderQueryResult(result, fileName, 'matching rows'));
    });

    server.registerTool('find_orphans', {
        title: 'Find unreferenced rows in a SWAT+ table',
        description: 'List rows in a table that nothing references — candidates for unused/dead '
            + 'data. Example: entity="soils.sol".',
        inputSchema: {
            entity: z.string().describe('Entity kind, file name, or table name'),
            limit: z.number().int().positive().max(1000).optional().describe('Max rows (default 100)'),
        },
    }, async ({ entity, limit }) => {
        const { table, hint } = resolve(entity);
        if (!table) {
            return textResult(hint!);
        }
        const fileName = model.getFileName(table) ?? table;
        const result = findOrphans(model, table, { limit });
        return textResult(renderQueryResult(result, fileName, 'unreferenced (orphan) rows'));
    });

    const transport = new StdioServerTransport();
    server.connect(transport).catch((err: unknown) => {
        process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
    });
}

main();
