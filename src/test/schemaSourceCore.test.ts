import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    describeGeneratedSchema,
    findSourceDirectory,
    headerReferenceDirs,
    isSelectableSchema,
    isUnavailable,
    looksLikeSwatplusSource,
    pythonCandidates,
    readGeneratedSchemaOrigin,
    tamanduaCommands,
} from '../schemaSourceCore';
import { EnrichedSchemaIndex } from '../enrichedSchemaCore';

function tempTree(files: string[]): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'swat-src-'));
    for (const file of files) {
        const full = path.join(root, file);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, '');
    }
    return root;
}

suite('Schema from SWAT+ source', () => {

    test('a checkout or its src/ folder counts as SWAT+ source', () => {
        const checkout = tempTree(['src/hru_read.f90', 'CMakeLists.txt']);
        assert.strictEqual(looksLikeSwatplusSource(checkout), true);
        assert.strictEqual(looksLikeSwatplusSource(path.join(checkout, 'src')), true);
        assert.strictEqual(looksLikeSwatplusSource(tempTree(['README.md'])), false);
        assert.strictEqual(looksLikeSwatplusSource(undefined), false);
    });

    test('the configured source wins, and a bad one is not silently replaced', () => {
        const checkout = tempTree(['src/main.f90']);
        const other = tempTree(['src/other.f90']);
        assert.strictEqual(findSourceDirectory('', [tempTree(['a.txt']), checkout]), checkout);
        assert.strictEqual(findSourceDirectory(other, [checkout]), other);
        assert.strictEqual(findSourceDirectory('${workspaceFolder}/src', [checkout]),
            path.join(checkout, 'src'));
        assert.strictEqual(findSourceDirectory('/no/such/dir', [checkout]), undefined);
    });

    test('header references: the dataset first, then the checkout refdata', () => {
        const checkout = tempTree([
            'src/main.f90', 'refdata/Osu_1hru/file.cio', 'refdata/Ames_sub1/file.cio',
            'refdata/notes/readme.txt']);
        const dataset = tempTree(['file.cio']);
        assert.deepStrictEqual(headerReferenceDirs(dataset, checkout), [
            dataset,
            path.join(checkout, 'refdata', 'Ames_sub1'),
            path.join(checkout, 'refdata', 'Osu_1hru'),
        ]);
        assert.deepStrictEqual(headerReferenceDirs(undefined, path.join(checkout, 'src')), [
            path.join(checkout, 'refdata', 'Ames_sub1'),
            path.join(checkout, 'refdata', 'Osu_1hru'),
        ]);
        assert.deepStrictEqual(headerReferenceDirs(undefined, undefined), []);
    });

    test('Tamandua runs as a console script first, then as a module', () => {
        const commands = tamanduaCommands('swatplus-layouts', ['--out', 'x.json'], ['python3']);
        assert.deepStrictEqual(commands, [
            { command: 'swatplus-layouts', args: ['--out', 'x.json'] },
            { command: 'python3', args: ['-m', 'tamandua.index.layouts_cli', '--out', 'x.json'] },
        ]);
        assert.strictEqual(
            tamanduaCommands('swatplus-build', [], ['py'])[1].args[1], 'tamandua.index.cli');
    });

    test('python candidates honour SWATPLUS_PYTHON and the platform', () => {
        assert.deepStrictEqual(pythonCandidates({}, 'linux'), ['python3', 'python']);
        assert.deepStrictEqual(pythonCandidates({ SWATPLUS_PYTHON: 'py' }, 'win32'),
            ['py', 'python', 'python3']);
    });

    test('a missing command or module means try the next way, not failure', () => {
        assert.strictEqual(isUnavailable({ error: new Error('ENOENT'), stderr: '' }), true);
        assert.strictEqual(isUnavailable({ stderr: "No module named 'tamandua'" }), true);
        assert.strictEqual(isUnavailable({ stderr: 'error: cannot find swatplus-reference-corpus' }), false);
    });

    test('the dropdown label says what the schema was built from', () => {
        const schema = { generated_from: {
            swatplus: { describe: '62.0.0', commit: 'de210d64db4f1d75e110bd6af33ea9c333d27b8a' },
            header_references: ['Ames_sub1'] } };
        assert.strictEqual(describeGeneratedSchema(readGeneratedSchemaOrigin(schema, 'shipped')),
            'SWAT+ 62.0.0 (de210d6), shipped');
        const branch = { generated_from: { swatplus: { describe: null, commit: '97ca231e22b2' } } };
        assert.strictEqual(describeGeneratedSchema(readGeneratedSchemaOrigin(branch, 'source')),
            'SWAT+ 97ca231, from your source');
        assert.strictEqual(describeGeneratedSchema(undefined), 'Built from SWAT+ source');
        assert.strictEqual(readGeneratedSchemaOrigin({ tables: {} }), undefined);
    });

    test('documentation-only schemas are not offered for indexing', () => {
        assert.strictEqual(isSelectableSchema({ schema_version: '2.0.0', tables: {} }), true);
        assert.strictEqual(isSelectableSchema(
            { schema_version: '2.0.0', tables: {}, enrichment: { swatplus_version: '62.0.0' } }), false);
        assert.strictEqual(isSelectableSchema({ tables: {} }), false);
    });

    test('the shipped generated schema serves Tamandua docs and a version', () => {
        const shipped = path.join(__dirname, '..', '..', 'resources', 'schema',
            'swatplus-generated-schema.json');
        const data = JSON.parse(fs.readFileSync(shipped, 'utf-8'));
        const index = new EnrichedSchemaIndex(data);
        assert.strictEqual(index.getSwatplusVersion(), '62.0.0');
        // lu_mgt is the file's header name; the doc is the Fortran field's.
        const doc = index.getColumnDoc('hru-data.hru', 'lu_mgt');
        assert.ok(doc, 'lu_mgt has a doc');
        assert.strictEqual(doc!.fortran_target, 'hru_db%dbsc%land_use_mgt');
        assert.strictEqual(doc!.read_at, 'hru_read.f90:67');
        assert.match(doc!.source_ref ?? '', /^hru_module\.f90:\d+$/);
        const table = data.tables['hru-data.hru'];
        assert.strictEqual(table.origin, 'tamandua');
        assert.deepStrictEqual(table.foreign_keys.map((fk: { column: string }) => fk.column).sort(),
            ['field', 'hydro', 'lu_mgt', 'snow', 'soil', 'soil_plant_init', 'surf_stor', 'topo']);
    });
});
