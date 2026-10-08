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

suite('check_inputs over MCP - the input preflight contract', function () {
    this.timeout(60_000);
    let root: string;
    let client: Client;
    const at = (...parts: string[]) => path.join(root, ...parts);

    function write(relative: string, text: string): void {
        fs.mkdirSync(path.dirname(at(relative)), { recursive: true });
        fs.writeFileSync(at(relative), text);
    }

    async function check(args: { dataset?: string; layouts?: string }) {
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
        for (const field of ['check_version', 'status', 'error', 'dataset', 'expectations', 'coverage', 'files', 'findings']) {
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
