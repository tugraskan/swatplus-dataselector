import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
    DatasetFile,
    INPUT_PREFLIGHT_VERSION,
    InputExpectations,
    describeInputPreflight,
    expectationsFrom,
    expectationsFromLayouts,
    expectationsFromSchema,
    judgeFile,
    namedFiles,
    preflightInputs,
} from '../mcp/inputCheck';

/** A Tamandua layouts file (format 2), reduced to what the check reads. */
function column(name: string, extra: Record<string, unknown> = {}) {
    return { name, ...extra };
}

const LAYOUTS = {
    layout_format: '2',
    provenance: { source_commit: 'abc123def4567890', source_describe: '62.0.1' },
    files: {
        'exco.exc': {
            file: 'exco.exc',
            filename_is_default: true,
            data_starts_after: 2,
            records: [{
                role: 'main', at: 'exco_db_read.f90:56', loops: ['do', 'ii'], complete: true,
                columns: ['k', 'name', 'om_file', 'pest_file'].map(name => column(name)),
            }],
        },
        'soil_plant.ini': {
            file: 'soil_plant.ini',
            filename_is_default: true,
            data_starts_after: 2,
            records: [
                {
                    role: 'main', at: 'soil_plant_init.f90:50', loops: ['do', 'isp'], complete: true,
                    columns: ['name', 'sw_frac', 'nutc', 'pestc'].map(name => column(name)),
                },
                {
                    role: 'alternative', at: 'soil_plant_init.f90:52', loops: ['do', 'isp'], complete: true,
                    columns: ['name', 'sw_frac', 'nutc'].map(name => column(name)),
                },
            ],
        },
        'codes.bsn': {
            file: 'codes.bsn',
            filename_is_default: true,
            data_starts_after: 2,
            records: [{
                role: 'main', at: 'basin_read_cc.f90:20', loops: ['do'], complete: true,
                columns: ['pet_file', 'wq_file'].map(name => column(name)),
            }],
        },
        'print.prt': {
            file: 'print.prt',
            filename_is_default: true,
            data_starts_after: 1,
            records: [
                { role: 'main', at: 'basin_print_codes_read.f90:20', loops: ['do'], complete: true, columns: [column('nyskip')] },
                { role: 'line', at: 'basin_print_codes_read.f90:30', loops: ['do'], complete: true, columns: [column('daily')] },
            ],
        },
        'management.sch': {
            file: 'management.sch',
            filename_is_default: true,
            data_starts_after: 2,
            records: [
                { role: 'main', at: 'mgt_read_mgtops.f90:61', loops: ['do', 'isched'], complete: true, columns: [column('name')] },
                { role: 'child', at: 'read_mgtops.f90:27', loops: ['iop'], complete: true, columns: [column('op_typ')] },
            ],
        },
        'hru-data.hru': {
            file: 'hru-data.hru',
            filename_is_default: true,
            data_starts_after: 2,
            records: [{
                role: 'main', at: 'hru_read.f90:67', loops: ['do', 'i'], complete: false,
                columns: [column('id')],
            }],
        },
        'weather-sta.cli': {
            file: 'weather-sta.cli',
            filename_is_default: false,
            data_starts_after: 2,
            records: [{ role: 'main', at: 'cli_staread.f90:40', loops: ['do', 'i'], complete: true, columns: [column('name')] }],
        },
        'plants.plt': {
            file: 'plants.plt',
            filename_is_default: true,
            data_starts_after: 2,
            records: [{
                role: 'main', at: 'plant_parm_read.f90:30', loops: ['do', 'ic'], complete: true,
                columns: [column('name'), column('plnt_typ'), column('coef', { repeat: 'mxcoef' })],
            }],
        },
    },
};

suite('check_inputs - expectations', () => {
    test('a layouts file gives each complete default-named file its read', () => {
        const expectations = expectationsFromLayouts(LAYOUTS);
        assert.strictEqual(expectations.origin, 'layouts');
        assert.deepStrictEqual(expectations.swatplus, { commit: 'abc123def4567890', describe: '62.0.1' });
        const exco = expectations.layouts.get('exco.exc')!;
        assert.deepStrictEqual(
            [exco.readAt, exco.needed, exco.skippedLines, exco.rows, exco.columns],
            ['exco_db_read.f90:56', 4, 2, 'records', ['k', 'name', 'om_file', 'pest_file']],
        );
        // Either accepted width will do, so the shorter one is what a row needs.
        assert.strictEqual(expectations.layouts.get('soil_plant.ini')!.needed, 3);
        // A read inside only the bare `do` that exits on end of file is one record.
        assert.strictEqual(expectations.layouts.get('codes.bsn')!.rows, 'single');
        assert.strictEqual(expectations.layouts.get('print.prt')!.rows, 'sections');
        // Records nested under each main one (management.sch) are not one record per line.
        assert.strictEqual(expectations.layouts.get('management.sch')!.rows, 'sections');
        // Columns stop at a run-time-sized group.
        assert.deepStrictEqual(expectations.layouts.get('plants.plt')!.columns, ['name', 'plnt_typ']);
        // Incomplete layouts and files named from file.cio are not used.
        assert.ok(!expectations.layouts.has('hru-data.hru'));
        assert.ok(!expectations.layouts.has('weather-sta.cli'));
    });

    test('a generated schema gives its source-built tables', () => {
        const schema = {
            generated_from: { swatplus: { commit: 'de210d64db4f', describe: '62.0.0' } },
            tables: {
                'exco.exc': {
                    file_name: 'exco.exc', origin: 'tamandua', data_starts_after: 3,
                    columns: [
                        { name: 'name' }, { name: 'om_file' }, { name: 'descrip', read_by_swat: false },
                    ],
                    swat_layout: { read_at: 'exco_db_read.f90:56', record_widths: [2], rows: 'records' },
                },
                'exco-om.exc': { file_name: 'exco-om.exc', origin: 'editor', columns: [] },
            },
        };
        const expectations = expectationsFromSchema(schema);
        assert.strictEqual(expectations.origin, 'schema');
        assert.deepStrictEqual(expectations.swatplus, { commit: 'de210d64db4f', describe: '62.0.0' });
        assert.deepStrictEqual([...expectations.layouts.keys()], ['exco.exc']);
        assert.strictEqual(expectations.layouts.get('exco.exc')!.needed, 2);
        assert.strictEqual(expectationsFrom(schema)!.origin, 'schema');
        assert.strictEqual(expectationsFrom(LAYOUTS)!.origin, 'layouts');
        assert.strictEqual(expectationsFrom({ nothing: true }), undefined);
    });

    test('the shipped schema knows what SWAT+ reads from exco.exc', () => {
        const shipped = path.join(__dirname, '..', '..', 'resources', 'schema', 'swatplus-generated-schema.json');
        const expectations = expectationsFromSchema(JSON.parse(fs.readFileSync(shipped, 'utf-8')));
        assert.ok(expectations.swatplus.commit, 'the shipped schema names its SWAT+ commit');
        const exco = expectations.layouts.get('exco.exc');
        assert.ok(exco && exco.needed > 0 && exco.readAt.startsWith('exco_db_read.f90'));
    });
});

suite('check_inputs - judging lines', () => {
    const exco = expectationsFromLayouts(LAYOUTS).layouts.get('exco.exc')!;

    test('a line short of values is a finding naming what SWAT+ would read on for', () => {
        const text = ['exco.exc: title', 'k name om_file pest_file', '1 pt001 om1 null', '2 pt002 om2', '3 pt003 om3 null'].join('\n');
        const judged = judgeFile(text, exco);
        assert.strictEqual(judged.rowsChecked, 3);
        assert.strictEqual(judged.shortRows, 1);
        assert.deepStrictEqual(
            judged.findings.map(item => [item.line, item.at_end, item.found, item.needed, item.missing_columns]),
            [[4, false, 3, 4, ['pest_file']]],
        );
        assert.match(judged.findings[0].message, /reads on into the next line for pest_file/);
    });

    test('a short last line makes the read reach the end of the file instead', () => {
        const judged = judgeFile(['title', 'header', '1 pt001 om1 null', '2 pt002 om2', ''].join('\n'), exco);
        assert.deepStrictEqual(judged.findings.map(item => [item.line, item.at_end]), [[4, true]]);
        assert.match(judged.findings[0].message, /so the read reaches the end of the file for pest_file/);
    });

    test('lines whose values whitespace cannot count are not judged', () => {
        const text = [
            'title', 'header',
            "1 'pt 001' om1 null",      // a quoted value may hold a space
            '2 pt002 om2,null',         // a comma separates values
            '3 pt003 2*null',           // a repeat count stands for two values
            '4 pt004 om4 null n/a',     // long enough: trailing text is never read
            '', '# a comment the editor skips too',
        ].join('\n');
        const judged = judgeFile(text, exco);
        assert.deepStrictEqual(judged.unjudged.map(item => [item.line, item.reason]),
            [[3, 'quoted_values'], [4, 'list_directed_syntax'], [5, 'list_directed_syntax']]);
        assert.strictEqual(judged.rowsChecked, 1);
        assert.strictEqual(judged.shortRows, 0);
    });

    test('a single-record file is judged on its first data line only', () => {
        const codes = expectationsFromLayouts(LAYOUTS).layouts.get('codes.bsn')!;
        const judged = judgeFile(['title', 'header', 'pet wq', 'short'].join('\n'), codes);
        assert.deepStrictEqual([judged.rowsChecked, judged.shortRows], [1, 0]);
    });
});

suite('check_inputs - the verdict', () => {
    const identity = (file: string) => ({ path: `/data/${file}`, sha256: '0'.repeat(64), bytes: 1 });
    const expectations: InputExpectations = expectationsFromLayouts(LAYOUTS);
    const context = {
        datasetDir: '/data',
        fileCio: identity('file.cio'),
        expectations,
        expectationFile: { path: '/layouts.json', sha256: '1'.repeat(64) },
    };
    const reader = (files: Record<string, string>) => (name: string): DatasetFile =>
        name in files ? { kind: 'text', text: files[name], identity: identity(name) } : { kind: 'missing' };
    const GOOD_EXCO = ['title', 'header', '1 pt001 om1 null'].join('\n');
    const SHORT_EXCO = ['title', 'header', '1 pt001 om1'].join('\n');

    test('named files are listed once, and null names none', () => {
        const cio = ['file.cio: test', 'simulation time.sim print.prt', 'exco exco.exc null exco.exc', 'basin null null'].join('\n');
        assert.deepStrictEqual(namedFiles(cio).map(item => [item.label, item.file, item.line]),
            [['simulation', 'time.sim', 2], ['simulation', 'print.prt', 2], ['exco', 'exco.exc', 3]]);
    });

    test('a pass needs every named file checked', () => {
        const result = preflightInputs('file.cio: t\nexco exco.exc', reader({ 'exco.exc': GOOD_EXCO }), context);
        assert.strictEqual(result.check_version, INPUT_PREFLIGHT_VERSION);
        assert.strictEqual(result.status, 'pass');
        assert.deepStrictEqual(result.coverage, {
            complete: true, named_files: 1, checked_files: 1, unchecked_files: 0, unjudged_rows: 0, unjudged: [],
        });
        assert.strictEqual(result.files[0].outcome, 'match');
        assert.deepStrictEqual(result.files[0].identity, identity('exco.exc'));
        assert.deepStrictEqual(result.expectations, {
            origin: 'layouts', swatplus: { commit: 'abc123def4567890', describe: '62.0.1' },
            path: '/layouts.json', sha256: '1'.repeat(64),
        });
        assert.match(result.summary, /^1 of 1 files named on file\.cio rows checked against SWAT\+ 62\.0\.1 \(abc123def456\)/);
    });

    test('a short row fails however much else went unchecked, and says what was not checked', () => {
        const cio = 'file.cio: t\nexco exco.exc\nsim time.sim print.prt hru-data.hru\nmissing gone.txt';
        const result = preflightInputs(cio, reader({
            'exco.exc': SHORT_EXCO, 'time.sim': 'x', 'print.prt': 'x', 'hru-data.hru': 'x',
        }), context);
        assert.strictEqual(result.status, 'fail');
        assert.deepStrictEqual(result.files.map(item => [item.file, item.outcome, item.reason]), [
            ['exco.exc', 'short', null],
            ['time.sim', 'unchecked', 'no_layout'],
            ['print.prt', 'unchecked', 'sections'],
            ['hru-data.hru', 'unchecked', 'no_layout'],
            ['gone.txt', 'unchecked', 'missing'],
        ]);
        assert.strictEqual(result.coverage.complete, false);
        assert.strictEqual(result.findings.length, 1);
        assert.match(result.summary, /1 with rows short of values: exco\.exc \(1\); not checked: 4 \(no_layout 2, sections 1, missing 1\)/);
        assert.match(describeInputPreflight(result), /- exco\.exc line 3 has 3 values; SWAT\+ reads 4 per record/);
    });

    test('nothing short but something unchecked is inconclusive', () => {
        const result = preflightInputs('file.cio: t\nexco exco.exc time.sim',
            reader({ 'exco.exc': GOOD_EXCO, 'time.sim': 'x' }), context);
        assert.strictEqual(result.status, 'inconclusive');
        assert.doesNotMatch(describeInputPreflight(result), /Every file named on file\.cio was checked/);
    });
});
