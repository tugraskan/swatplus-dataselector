import * as assert from 'assert';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CIO_PREFLIGHT_VERSION, CioPreflight } from '../mcp/cioCheck';

/**
 * `check_dataset` as a client sees it: the compiled server over stdio, the
 * output schema it advertises, and the SDK client's own validation of every
 * structured result against that schema -- error results included, since this
 * client validates those too.
 */

const SERVER = path.join(__dirname, '..', 'mcp', 'server.js');
const SCHEMAS = path.join(__dirname, '..', '..', 'resources', 'schema');

const READCIO = [
    '      subroutine readcio_read',
    '        open (107,file="file.cio")',
    '        read (107,*) titldum',
    '        read (107,*,iostat=eof) name, in_sim',
    '        if (eof < 0) exit',
    '        read (107,*,iostat=eof) name, in_basin',
    '      end subroutine readcio_read',
].join('\n');

const MODULE = [
    '      module input_file_module',
    '      type input_sim',
    '        character(len=25) :: time = "time.sim"',
    '      end type input_sim',
    '      type (input_sim) :: in_sim',
    '      type input_basin',
    '        character(len=25) :: codes_bas = "codes.bsn"',
    '        character(len=25) :: carbon_bsn = "carbon.bsn"',
    '      end type input_basin',
    '      type (input_basin) :: in_basin',
    '      end module input_file_module',
].join('\n');

const GOOD = ['file.cio: contract', 'simulation  time.sim', 'basin  codes.bsn  carbon.bsn'].join('\n');
const SHORT = ['file.cio: contract', 'simulation  time.sim', 'basin  codes.bsn'].join('\n');

suite('check_dataset over MCP - the preflight contract', function () {
    this.timeout(60_000);
    let root: string;
    let client: Client;
    const at = (...parts: string[]) => path.join(root, ...parts);

    function write(relative: string, text: string): void {
        fs.mkdirSync(path.dirname(at(relative)), { recursive: true });
        fs.writeFileSync(at(relative), text);
    }

    async function check(args: { dataset?: string; source?: string }) {
        const result = await client.callTool({ name: 'check_dataset', arguments: args }) as CallToolResult;
        const text = result.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
        return { result, text, structured: result.structuredContent as unknown as CioPreflight };
    }

    suiteSetup(async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'cio-preflight-'));
        write('source/src/readcio_read.f90', READCIO);
        write('source/src/input_file_module.f90', MODULE);
        write('mystery/src/readcio_read.f90', READCIO.replace('name, in_basin', 'name, in_mystery'));
        write('mystery/src/input_file_module.f90', MODULE);
        write('halfsource/src/readcio_read.f90', READCIO);
        write('good/file.cio', GOOD);
        write('short/file.cio', SHORT);
        fs.mkdirSync(at('nocio'));

        client = new Client({ name: 'cio-preflight-contract', version: '1.0.0' });
        await client.connect(new StdioClientTransport({
            command: process.execPath,
            args: [
                SERVER,
                '--schema', path.join(SCHEMAS, 'swatplus-schema-enriched.json'),
                '--output-schema', path.join(SCHEMAS, 'swatplus-output-schema.json'),
                '--source', at('source'),
            ],
            stderr: 'ignore',
        }));
        // Listing caches each tool's output schema, which is what makes the
        // client validate every result below against it.
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
        const schema = tools.find((tool) => tool.name === 'check_dataset')?.outputSchema;
        assert.ok(schema, 'check_dataset has no outputSchema');
        assert.strictEqual(schema.type, 'object');
        for (const field of ['check_version', 'status', 'error', 'dataset', 'source', 'coverage', 'sections', 'findings']) {
            assert.ok(schema.required?.includes(field), field);
        }
        assert.strictEqual((schema as { additionalProperties?: unknown }).additionalProperties, false);
    });

    test('a pass keeps its old text and adds the verdict and the bytes it judged', async () => {
        const { result, text, structured } = await check({ dataset: at('good') });
        assert.ok(!result.isError);
        assert.match(text, /^file\.cio matches what the code reads; no row is short of values\./);
        assert.strictEqual(structured.check_version, CIO_PREFLIGHT_VERSION);
        assert.strictEqual(structured.status, 'pass');
        assert.strictEqual(structured.coverage.complete, true);
        assert.strictEqual(structured.coverage.expected_sections, 2);
        assert.strictEqual(structured.coverage.observed_sections, 2);
        assert.strictEqual(structured.source.dir, at('source'));
        assert.deepStrictEqual(structured.dataset.file_cio, {
            path: path.resolve(at('good', 'file.cio')),
            sha256: createHash('sha256').update(GOOD).digest('hex'),
            bytes: Buffer.byteLength(GOOD),
        });
        assert.ok(structured.source.readcio_read && structured.source.input_file_module);
    });

    test('a short row fails in both the text and the structure', async () => {
        const { result, text, structured } = await check({ dataset: at('short') });
        assert.ok(!result.isError, 'a failed check is a result, not a tool error');
        assert.match(text, /1 row\(s\) in file\.cio are short of values/);
        assert.strictEqual(structured.status, 'fail');
        assert.deepStrictEqual(structured.findings.map((item) => [item.kind, item.variable]), [['short_row', 'in_basin']]);
    });

    test('an unresolved expectation is inconclusive, with its gap', async () => {
        const { text, structured } = await check({ dataset: at('good'), source: at('mystery') });
        assert.strictEqual(structured.status, 'inconclusive');
        assert.deepStrictEqual(structured.coverage.unresolved.map((item) => item.reason), ['undeclared_variable']);
        assert.doesNotMatch(text, /matches what the code reads/);
    });

    test('a check that cannot run is a structured tool error', async () => {
        const cases: [{ dataset?: string; source?: string }, string, RegExp][] = [
            [{}, 'no_dataset', /^No dataset to check/],
            [{ dataset: at('nocio') }, 'dataset_file_missing', /^Cannot check: no .*file\.cio \(dataset path wrong\?\)\.$/],
            [{ dataset: at('good'), source: at('halfsource') }, 'source_file_missing',
                /^Cannot check: no .*input_file_module\.f90 \(source path wrong\?\)\.$/],
        ];
        for (const [args, code, message] of cases) {
            const { result, text, structured } = await check(args);
            assert.strictEqual(result.isError, true, code);
            assert.strictEqual(structured.status, 'error', code);
            assert.strictEqual(structured.error?.code, code);
            assert.match(text, message);
            assert.strictEqual(structured.error?.message, text);
            assert.strictEqual(structured.coverage.complete, false);
        }
    });
});
