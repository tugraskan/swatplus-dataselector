import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
    EnrichedSchemaIndex,
    renderColumnDocLines,
} from '../enrichedSchemaCore';

suite('Enriched schema core', () => {

    test('empty/undefined data yields an unavailable index', () => {
        assert.strictEqual(new EnrichedSchemaIndex(undefined).isAvailable(), false);
        assert.strictEqual(new EnrichedSchemaIndex(null).isAvailable(), false);
        assert.strictEqual(new EnrichedSchemaIndex({}).isAvailable(), false);
    });

    test('parses file and column docs with case-insensitive lookup', () => {
        const idx = new EnrichedSchemaIndex({
            enrichment: { swatplus_version: '62.0.0' },
            tables: {
                'aquifer.aqu': {
                    doc: { reader_source: 'aqu_read.f90', summary: ['does things'] },
                    columns: [
                        { name: 'id', db_column: 'id' },  // no doc -> skipped
                        {
                            name: 'gw_flo', db_column: 'gw_flo',
                            doc: { description: 'flow', units: 'mm', match: 'exact' },
                        },
                    ],
                },
            },
        });
        assert.strictEqual(idx.isAvailable(), true);
        assert.strictEqual(idx.getSwatplusVersion(), '62.0.0');
        assert.strictEqual(idx.getFileDoc('aquifer.aqu')?.reader_source, 'aqu_read.f90');
        // case-insensitive on file and column names
        assert.strictEqual(idx.getColumnDoc('AQUIFER.AQU', 'GW_FLO')?.units, 'mm');
        // a column without a doc is absent
        assert.strictEqual(idx.getColumnDoc('aquifer.aqu', 'id'), undefined);
        // unknown file/column return undefined, not a throw
        assert.strictEqual(idx.getFileDoc('nope.xyz'), undefined);
        assert.strictEqual(idx.getColumnDoc('aquifer.aqu', 'nope'), undefined);
    });

    test('db_column alias is indexed when it differs from name', () => {
        const idx = new EnrichedSchemaIndex({
            tables: {
                'x.y': {
                    columns: [
                        { name: 'friendly', db_column: 'db_name',
                          doc: { description: 'd' } },
                    ],
                },
            },
        });
        assert.strictEqual(idx.getColumnDoc('x.y', 'friendly')?.description, 'd');
        assert.strictEqual(idx.getColumnDoc('x.y', 'db_name')?.description, 'd');
    });

    test('renderColumnDocLines composes description, facts, and source', () => {
        const lines = renderColumnDocLines({
            description: 'flow from aquifer',
            units: 'mm',
            fortran_type: 'real',
            default: '0.05',
            source_ref: 'aquifer_module.f90:8',
        });
        assert.strictEqual(lines[0], 'flow from aquifer');
        assert.ok(lines[1].includes('**Units:** mm'));
        assert.ok(lines[1].includes('**Type:** real'));
        assert.ok(lines[1].includes('**Default:** 0.05'));
        assert.ok(lines[2].startsWith('_Source:'));
    });

    test('renderColumnDocLines is empty for undefined or contentless docs', () => {
        assert.deepStrictEqual(renderColumnDocLines(undefined), []);
        assert.deepStrictEqual(renderColumnDocLines({ match: 'exact' }), []);
    });

    test('the shipped enriched schema loads and enriches known files', () => {
        const shipped = path.join(
            __dirname, '..', '..', 'resources', 'schema',
            'swatplus-schema-enriched.json');
        if (!fs.existsSync(shipped)) {
            return; // enriched file not present in this build; skip
        }
        const idx = new EnrichedSchemaIndex(
            JSON.parse(fs.readFileSync(shipped, 'utf-8')));
        assert.strictEqual(idx.isAvailable(), true);
        assert.strictEqual(idx.getSwatplusVersion(), '62.0.0');
        // aquifer.aqu is a directly-matched file with real per-column docs
        const gwFlo = idx.getColumnDoc('aquifer.aqu', 'gw_flo');
        assert.ok(gwFlo, 'expected a doc for aquifer.aqu gw_flo');
        assert.strictEqual(gwFlo?.units, 'mm');
        // the id column must never carry a non-id doc (regression guard)
        const codesId = idx.getColumnDoc('codes.bsn', 'id');
        assert.strictEqual(codesId, undefined);
    });
});
