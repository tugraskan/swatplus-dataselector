import * as assert from 'assert';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { INPUT_PREFLIGHT_VERSION, InputPreflight } from '../mcp/inputCheck';

/**
 * `check_inputs` as a client sees it: the compiled server over stdio, and the
 * SDK client's validation of every structured result against the output
 * schema the tool advertises.
 */

const SERVER = path.join(__dirname, '..', 'mcp', 'server.js');
const SCHEMAS = path.join(__dirname, '..', '..', 'resources', 'schema');

function layouts(commit: string, excoColumns: string[]) {
    return {
        layout_format: '2',
        provenance: { source_commit: commit, source_describe: '62.0.1' },
        files: {
            'exco.exc': {
                file: 'exco.exc',
                filename_is_default: true,
                data_starts_after: 2,
                records: [{
                    role: 'main', at: 'exco_db_read.f90:56', loops: ['do', 'ii'], complete: true,
                    columns: excoColumns.map(name => ({ name })),
                }],
            },
        },
    };
}

const CIO = ['file.cio: contract', 'simulation  time.sim', 'exco  exco.exc  null'].join('\n');
const EXCO = ['exco.exc: contract', 'name  om_file', 'pt001  om1', 'pt002'].join('\n');

/** A dataset with one of each silent failure, for the fields only `issues` carries. */
function silentFailures(commit: string) {
    const column = (name: string, vartype: string, path = `db%${name}`) => ({ name, vartype, path });
    const file = (name: string, at: string, columns: unknown[]) => ({
        file: name,
        filename_is_default: true,
        data_starts_after: 2,
        records: [{ role: 'main', at, loops: ['do'], complete: true, columns }],
    });
    return {
        layouts: {
            layout_format: '2',
            provenance: { source_commit: commit, source_describe: '62.0.1' },
            files: {
                'parameters.bsn': file('parameters.bsn', 'basin_read_prm.f90:24', [
                    column('evlai', 'real'), column('temp_decay', 'real'), column('cmn', 'real'), column('day_lag_mx', 'integer'),
                ]),
                'tillage.til': file('tillage.til', 'till_parm_read.f90:47', [
                    column('tillnm', 'character(len=16)', 'tilldb%tillnm'), column('effmix', 'real'),
                ]),
            },
        },
        cio: [
            'file.cio: contract', 'simulation  time.sim', 'basin  parameters.bsn',
            'climate  weather-sta.cli  pcp.cli', 'hru  hru-data.hru', 'hru_parm_db  tillage.til',
            'lum  landuse.lum  management.sch', 'init  plant.ini', 'decision_table  lum.dtl',
        ].join('\n'),
        files: {
            'parameters.bsn': ['t', 'a b c d', '3.0 0.0null 0.1 0.00000'].join('\n'),
            'tillage.til': ['t', 'h', 'fldcult 0.3'].join('\n'),
            'time.sim': ['t', 'h', '0 2020 0 2020 0'].join('\n'),
            'weather-sta.cli': ['t', 'h', 's1 wgn1 a.pcp'].join('\n'),
            'pcp.cli': ['t', 'h', 'a.pcp'].join('\n'),
            'a.pcp': ['t', 'h', '1 0 42 2 700', '2020 1 -99.0', '2020 2 1.0'].join('\n'),
            'hru-data.hru': ['t', 'h', '1 h1 topo hyd soil alfa_lum'].join('\n'),
            'landuse.lum': ['t', 'h', 'alfa_lum null alfa_comm alfa_rot'].join('\n'),
            'management.sch': ['t', 'h', 'alfa_rot 0 1', 'plow'].join('\n'),
            'plant.ini': ['t', 'h', 'alfa_comm 1 1', 'alfa n 1 1 0 0 0 1'].join('\n'),
            'lum.dtl': ['t', '1', '', 'name', 'plow 0 1 2', 'var', 'act_typ',
                'tillage hru 0 p fldcult 0 1 null y', 'fertilise hru 0 f urea 0 1 null y'].join('\n'),
        },
        source: {
            'src/actions.f90': ['select case (d_tbl%act(iac)%typ)', 'case ("till", "tillage")',
                'idtill = d_tbl%act_typ(iac)', 'end select'].join('\n'),
            'src/dtbl_lum_read.f90': ['select case (dtbl_lum(i)%act(iac)%typ)', 'case ("till")',
                'if (dtbl_lum(i)%act(iac)%option == tilldb(idb)%tillnm) then', 'dtbl_lum(i)%act_typ(iac) = idb',
                'end select'].join('\n'),
        },
    };
}

suite('check_inputs over MCP - the input preflight contract', function () {
    this.timeout(60_000);
    let root: string;
    let client: Client;
    const at = (...parts: string[]) => path.join(root, ...parts);

    function write(relative: string, text: string): void {
        fs.mkdirSync(path.dirname(at(relative)), { recursive: true });
        fs.writeFileSync(at(relative), text);
    }

    async function check(args: { dataset?: string; layouts?: string; source?: string }) {
        const result = await client.callTool({ name: 'check_inputs', arguments: args }) as CallToolResult;
        const text = result.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
        return { result, text, structured: result.structuredContent as unknown as InputPreflight };
    }

    suiteSetup(async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'input-preflight-'));
        write('data/file.cio', CIO);
        write('data/time.sim', 'time.sim: contract\n');
        write('data/EXCO.EXC', EXCO);
        write('server-layouts.json', JSON.stringify(layouts('1111111111111111', ['name', 'om_file'])));
        write('wider-layouts.json', JSON.stringify(layouts('2222222222222222', ['name', 'om_file', 'pest_file'])));
        write('not-layouts.json', JSON.stringify({ something: 'else' }));
        fs.mkdirSync(at('nocio'));

        client = new Client({ name: 'input-preflight-contract', version: '1.0.0' });
        await client.connect(new StdioClientTransport({
            command: process.execPath,
            args: [
                SERVER,
                '--schema', path.join(SCHEMAS, 'swatplus-schema-enriched.json'),
                '--output-schema', path.join(SCHEMAS, 'swatplus-output-schema.json'),
                '--layouts', at('server-layouts.json'),
            ],
            stderr: 'ignore',
        }));
        await client.listTools();
    });

    suiteTeardown(async () => {
        await client?.close();
        if (root) {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test('the tool advertises a strict object output schema', async () => {
        const { tools } = await client.listTools();
        const schema = tools.find((tool) => tool.name === 'check_inputs')?.outputSchema;
        assert.ok(schema, 'check_inputs has no outputSchema');
        for (const field of ['check_version', 'status', 'error', 'dataset', 'expectations', 'source', 'coverage',
            'checks', 'files', 'findings', 'issues']) {
            assert.ok(schema.required?.includes(field), field);
        }
        assert.strictEqual((schema as { additionalProperties?: unknown }).additionalProperties, false);
    });

    test('a short line fails against the server layouts, found case-insensitively, with the bytes judged', async () => {
        const { result, text, structured } = await check({ dataset: at('data') });
        assert.ok(!result.isError, 'a failed check is a result, not a tool error');
        assert.strictEqual(structured.check_version, INPUT_PREFLIGHT_VERSION);
        assert.strictEqual(structured.status, 'fail');
        assert.deepStrictEqual(structured.expectations?.swatplus, { commit: '1111111111111111', describe: '62.0.1' });
        assert.strictEqual(structured.expectations?.origin, 'layouts');
        assert.deepStrictEqual(structured.files.map(item => [item.file, item.outcome, item.reason]),
            [['time.sim', 'unchecked', 'no_layout'], ['exco.exc', 'short', null]]);
        assert.deepStrictEqual(structured.files[1].identity, {
            path: path.resolve(at('data', 'EXCO.EXC')),
            sha256: createHash('sha256').update(EXCO).digest('hex'),
            bytes: Buffer.byteLength(EXCO),
        });
        assert.deepStrictEqual(structured.findings.map(item => [item.file, item.line, item.missing_columns]),
            [['exco.exc', 4, ['om_file']]]);
        assert.match(text, /exco\.exc line 4 has 1 value; SWAT\+ reads 2 per record/);
    });

    test('layouts passed with the call replace the server default', async () => {
        const { structured } = await check({ dataset: at('data'), layouts: at('wider-layouts.json') });
        assert.deepStrictEqual(structured.expectations?.swatplus.commit, '2222222222222222');
        assert.strictEqual(structured.files[1].short_rows, 2);
    });

    test('every kind of issue is a result the client accepts, with the source bytes judged', async () => {
        const fixture = silentFailures('3333333333333333');
        write('silent/data/file.cio', fixture.cio);
        Object.entries(fixture.files).forEach(([name, text]) => write(`silent/data/${name}`, text));
        Object.entries(fixture.source).forEach(([name, text]) => write(`silent/source/${name}`, text));
        write('silent/layouts.json', JSON.stringify(fixture.layouts));

        const { result, text, structured } = await check({
            dataset: at('silent', 'data'), layouts: at('silent', 'layouts.json'), source: at('silent', 'source'),
        });
        assert.ok(!result.isError);
        assert.strictEqual(structured.status, 'fail');
        assert.deepStrictEqual(structured.checks.map(item => [item.name, item.state]), [
            ['value_types', 'ran'], ['decision_tables', 'ran'], ['weather_coverage', 'ran'], ['plant_starts', 'ran'],
        ]);
        assert.deepStrictEqual(structured.issues.map(item => item.kind).sort(), [
            'action_never_mapped', 'action_never_run', 'bad_value', 'crop_never_planted',
            'rain_days_missing', 'weather_ends_early',
        ]);
        assert.deepStrictEqual(structured.source?.actions, {
            path: path.resolve(at('silent', 'source', 'src', 'actions.f90')),
            sha256: createHash('sha256').update(fixture.source['src/actions.f90']).digest('hex'),
            bytes: Buffer.byteLength(fixture.source['src/actions.f90']),
        });
        assert.match(text, /error: parameters\.bsn line 3 stops at value 2 \(b\)/);
    });

    test('with no source, the action check says it did not run', async () => {
        const { structured, text } = await check({
            dataset: at('silent', 'data'), layouts: at('silent', 'layouts.json'),
        });
        assert.strictEqual(structured.source, null);
        assert.deepStrictEqual(structured.checks.find(item => item.name === 'decision_tables')?.state, 'skipped');
        assert.match(text, /decision_tables did not run: no SWAT\+ source was given/);
    });

    test('a check that cannot run is an error result with its code', async () => {
        const missing = await check({ dataset: at('nocio') });
        assert.ok(missing.result.isError);
        assert.strictEqual(missing.structured.status, 'error');
        assert.strictEqual(missing.structured.error?.code, 'dataset_file_missing');
        const bad = await check({ dataset: at('data'), layouts: at('not-layouts.json') });
        assert.strictEqual(bad.structured.error?.code, 'no_expectations');
        assert.strictEqual(bad.structured.dataset.file_cio?.sha256, createHash('sha256').update(CIO).digest('hex'));
    });
});
