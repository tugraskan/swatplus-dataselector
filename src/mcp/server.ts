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
import {
    RunOutcome,
    countIndexedRows,
    describeDatasetProblem,
    resolvePython,
    summarizeRun,
} from './datasetRuntime';
import {
    buildExpectations,
    checkCio,
    describeCioCheck,
    parseCioRows,
} from './cioCheck';

interface CliArgs {
    index?: string;
    dataset?: string;
    schema?: string;
    outputSchema?: string;
    metadata?: string;
    scripts?: string;
    /** Default SWAT+ executable for run_dataset. */
    exe?: string;
    /** SWAT+ source tree, for check_dataset's expectations. */
    source?: string;
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
            case '--exe': args.exe = next(); break;
            case '--source': args.source = next(); break;
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

/**
 * Whether an interpreter actually runs.
 *
 * `--version` rather than a bare launch, because the Windows Store alias that
 * occupies `python3` on a machine with no python3 installed does answer when
 * spawned -- it prints an advertisement and exits non-zero -- so only a
 * successful exit distinguishes it from a real interpreter.
 */
function pythonWorks(command: string, args: string[]): boolean {
    try {
        const probe = spawnSync(command, [...args, '--version'], {
            encoding: 'utf-8',
            timeout: 10_000,
        });
        return probe.status === 0;
    } catch {
        return false;
    }
}

/** Build a pandas index for a dataset dir via the bundled python script. */
function buildIndex(datasetDir: string, args: CliArgs): string {
    const scriptsDir = args.scripts ?? path.join(__dirname, '..', 'scripts');
    const script = path.join(scriptsDir, 'pandas_indexer.py');
    const schema = args.schema ?? defaultSchemaPath('swatplus-editor-schema.json');
    const metadata = args.metadata ?? defaultSchemaPath('txtinout-metadata.json');
    const outPath = path.join(os.tmpdir(), `swat-index-${Date.now()}.json`);

    const python = resolvePython(pythonWorks);
    if (!python) {
        throw new Error(
            'no working python interpreter found (tried python3, python, py -3). '
            + 'The index is built by scripts/pandas_indexer.py, which needs '
            + 'python with pandas on PATH.'
        );
    }
    const result = spawnSync(python.command, [
        ...python.args,
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
    //
    // Held in mutable state rather than a const because `select_dataset` swaps
    // it: the dataset used to be fixed by the command line for the life of the
    // process, which meant an agent handed a new dataset could do nothing with
    // it. Every tool below reads `state.host` at call time so a swap takes
    // effect immediately and no handler closes over a stale model.
    const state: {
        host: ReturnType<typeof createEngineHost>;
        datasetDir?: string;
        indexPath?: string;
    } = {
        host: createEngineHost(model, docs),
        datasetDir: args.dataset,
        indexPath,
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
    }, async ({ entity, id }) => textResult(state.host.describeEntity(entity, id)));

    server.registerTool('find_references', {
        title: 'Find references to a SWAT+ entity',
        description: 'List the rows that reference a given entity (reverse lookup), '
            + 'including name-pointer references. Example: entity="soils.sol", id="soil_01-h1".',
        inputSchema: {
            entity: z.string().describe('Entity kind, file name, or table name'),
            id: z.string().describe('The entity id or name'),
        },
    }, async ({ entity, id }) => textResult(state.host.findReferences(entity, id)));

    server.registerTool('lookup_docs', {
        title: 'Look up SWAT+ file/column documentation',
        description: 'Return source-backed documentation for an input or output file, '
            + 'and optionally a single column (meaning, units, type, default, source line). '
            + 'Works without a dataset. Example: file="aquifer.aqu", column="gw_flo".',
        inputSchema: {
            file: z.string().describe('Input or output file name, e.g. "aquifer.aqu" or "aquifer_day.txt"'),
            column: z.string().optional().describe('Optional column name'),
        },
    }, async ({ file, column }) => textResult(state.host.lookupDocs(file, column)));

    server.registerTool('list_entities', {
        title: 'List entity ids in a SWAT+ table',
        description: 'List the ids/names of rows in an entity table, to discover what '
            + 'can be described. Example: entity="hru".',
        inputSchema: {
            entity: z.string().describe('Entity kind, file name, or table name'),
            limit: z.number().int().positive().max(1000).optional()
                .describe('Maximum ids to return (default 100)'),
        },
    }, async ({ entity, limit }) => textResult(state.host.listEntities(entity, limit)));

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
        textResult(state.host.queryRows(entity, predicates, { match, limit })));

    server.registerTool('find_orphans', {
        title: 'Find unreferenced rows in a SWAT+ table',
        description: 'List rows in a table that nothing references — candidates for unused/dead '
            + 'data. Example: entity="soils.sol".',
        inputSchema: {
            entity: z.string().describe('Entity kind, file name, or table name'),
            limit: z.number().int().positive().max(1000).optional().describe('Max rows (default 100)'),
        },
    }, async ({ entity, limit }) => textResult(state.host.findOrphans(entity, limit)));


    server.registerTool('select_dataset', {
        title: 'Make a SWAT+ dataset the active one',
        description: 'Point every dataset tool at a different SWAT+ dataset directory '
            + '(the folder holding file.cio). Builds the pandas index for it, which takes '
            + 'a few seconds on a large dataset, then describe_entity, query_rows, '
            + 'find_references, find_orphans and run_dataset all work against it. '
            + 'Example: path="C:/work/TxtInOut".',
        inputSchema: {
            path: z.string().describe('Dataset directory: the folder containing file.cio'),
        },
    }, async ({ path: datasetDir }) => {
        const problem = describeDatasetProblem(
            datasetDir,
            p => fs.existsSync(p),
            p => fs.statSync(p).isDirectory(),
        );
        if (problem) {
            return textResult(`Not switched: ${problem}.`);
        }

        let built: string;
        try {
            built = buildIndex(datasetDir, args);
        } catch (err) {
            // The previous dataset stays active. A failed switch that also
            // cleared the old one would leave every other tool answering
            // "no record" with nothing saying why.
            return textResult(
                `Could not index ${datasetDir}, so the active dataset is unchanged`
                + `${state.datasetDir ? ` (${state.datasetDir})` : ''}.\n`
                + (err instanceof Error ? err.message : String(err)),
            );
        }

        const loaded = loadJson<IndexFile>(built);
        state.host = createEngineHost(
            new IndexFileDatasetModel(loaded, enrichedRaw as never),
            docs,
        );
        state.datasetDir = datasetDir;
        state.indexPath = built;

        const tables = Object.keys(loaded.tables ?? {});
        const rows = countIndexedRows(loaded.tables ?? {});
        return textResult(
            `Active dataset is now ${datasetDir}.\n`
            + `${tables.length} table(s), ${rows} row(s) indexed.\n`
            + 'describe_entity, query_rows, find_references, find_orphans and '
            + 'run_dataset now work against this dataset.',
        );
    });

    server.registerTool('check_dataset', {
        title: 'Check a SWAT+ dataset against the code that reads it',
        description: 'Check the dataset\'s file.cio for rows that are short of values, '
            + 'which is the failure worth catching before a run: list-directed input '
            + 'spans records to fill its item list, so a short row silently consumes '
            + 'the next line and every row after it is read shifted by one. The crash '
            + 'then surfaces far away, typically as a subscript error in an unrelated '
            + 'routine. Expectations come from the Fortran source, so an older branch '
            + 'expects an older file.cio and a matching dataset passes. Run this before '
            + 'run_dataset.',
        inputSchema: {
            dataset: z.string().optional()
                .describe('Dataset directory; defaults to the active dataset'),
            source: z.string().optional()
                .describe('SWAT+ source tree to read expectations from; defaults to '
                    + 'the server\'s --source'),
        },
    }, async ({ dataset, source }) => {
        const datasetDir = dataset ?? state.datasetDir;
        if (!datasetDir) {
            return textResult(
                'No dataset to check. Call select_dataset first, or pass `dataset`.',
            );
        }
        const sourceDir = source ?? args.source;
        if (!sourceDir) {
            return textResult(
                'No SWAT+ source tree to read expectations from. Pass `source`, or '
                + 'start this server with --source <swatplus repo>. The check '
                + 'compares file.cio against the types in src/input_file_module.f90, '
                + 'so it needs the source that will read the dataset -- which is '
                + 'also what makes it correct on an older branch.',
            );
        }

        const cioPath = path.join(datasetDir, 'file.cio');
        const readcioPath = path.join(sourceDir, 'src', 'readcio_read.f90');
        const modulePath = path.join(sourceDir, 'src', 'input_file_module.f90');
        for (const [label, needed] of [
            ['dataset', cioPath],
            ['source', readcioPath],
            ['source', modulePath],
        ] as const) {
            if (!fs.existsSync(needed)) {
                return textResult(`Cannot check: no ${needed} (${label} path wrong?).`);
            }
        }

        const expectations = buildExpectations(
            fs.readFileSync(readcioPath, 'utf-8'),
            fs.readFileSync(modulePath, 'utf-8'),
        );
        if (expectations.length === 0) {
            return textResult(
                `Read no row expectations from ${sourceDir}. The check needs `
                + 'readcio_read.f90 to read rows as `name, <derived type>`; if that '
                + 'has changed shape, this needs updating rather than trusting.',
            );
        }

        const findings = checkCio(
            parseCioRows(fs.readFileSync(cioPath, 'utf-8')),
            expectations,
        );
        return textResult(describeCioCheck(findings, { datasetDir, sourceDir }));
    });

    server.registerTool('run_dataset', {
        title: 'Run SWAT+ against the active dataset',
        description: 'Run the SWAT+ executable with the active dataset as its working '
            + 'directory, and report how it ended. A crash is the interesting case and '
            + 'leads the result: the forrtl line, then the traceback, which names the '
            + 'failing routine and source line when the build was compiled /traceback and '
            + 'linked /INCREMENTAL:NO. This is a plain run, not a debug session -- for '
            + 'breakpoints and variables use the fortran-ifx debug tools.',
        inputSchema: {
            executable: z.string().optional()
                .describe('SWAT+ executable to run; defaults to the server\'s --exe'),
            dataset: z.string().optional()
                .describe('Dataset directory to run in; defaults to the active dataset'),
            timeout_seconds: z.number().int().positive().max(86400).optional()
                .describe('Give up after this long (default 900)'),
            args: z.array(z.string()).optional()
                .describe('Extra arguments for the executable; SWAT+ normally takes none'),
        },
    }, async ({ executable, dataset, timeout_seconds, args: extraArgs }) => {
        const datasetDir = dataset ?? state.datasetDir;
        if (!datasetDir) {
            return textResult(
                'No dataset to run in. Call select_dataset first, or pass `dataset`, '
                + 'or start this server with --dataset.',
            );
        }
        const problem = describeDatasetProblem(
            datasetDir,
            p => fs.existsSync(p),
            p => fs.statSync(p).isDirectory(),
        );
        if (problem) {
            return textResult(`Cannot run: ${problem}.`);
        }

        const exe = executable ?? args.exe;
        if (!exe) {
            return textResult(
                'No SWAT+ executable to run. Pass `executable`, or start this server '
                + 'with --exe <path>.',
            );
        }
        if (!fs.existsSync(exe)) {
            return textResult(`Cannot run: the executable ${exe} does not exist.`);
        }

        const timeoutMs = (timeout_seconds ?? 900) * 1000;
        const started = Date.now();
        // Output is captured rather than streamed: this is one tool call that
        // answers when the run is over, and a SWAT+ run prints far more than
        // belongs in a result, so the digest does the choosing.
        const result = spawnSync(exe, extraArgs ?? [], {
            cwd: datasetDir,
            encoding: 'utf-8',
            timeout: timeoutMs,
            maxBuffer: 64 * 1024 * 1024,
        });
        const outcome: RunOutcome = {
            executable: exe,
            datasetDir,
            exitCode: result.status,
            signal: result.signal,
            timedOut: result.error !== undefined
                && (result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT',
            elapsedMs: Date.now() - started,
            stdout: result.stdout ?? '',
            stderr: result.stderr ?? '',
        };
        return textResult(summarizeRun(outcome));
    });

    const transport = new StdioServerTransport();
    server.connect(transport).catch((err: unknown) => {
        process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
    });
}

main();
