import * as assert from 'assert';
import {
    buildExpectations,
    checkCio,
    describeCioCheck,
    parseCioRows,
    parseInputTypes,
    parseReadOrder,
    parseVariableTypes,
} from '../mcp/cioCheck';

/** `readcio_read.f90`, reduced to the shape the row order is read from. */
const READCIO = `
      subroutine readcio_read
      inquire (file="file.cio", exist=i_exist)
      if (i_exist ) then
        open (107,file="file.cio")
        read (107,*) titldum
     do i = 1, 31
        read (107,*,iostat=eof) name, in_sim
        if (eof < 0) exit
        read (107,*,iostat=eof) name, in_basin
        if (eof < 0) exit
        read (107,*,iostat=eof) name, in_cli
        if (eof < 0) exit
        read (107,*,iostat=eof) name, in_con
        if (eof < 0) exit
     end do
      endif
      end subroutine readcio_read
`;

/** `input_file_module.f90`, reduced to the types those rows are read into. */
const MODULE = `
      module input_file_module
      implicit none

!! simulation
      type input_sim
        character(len=25) :: time = "time.sim"
        character(len=25) :: prt = "print.prt"
      end type input_sim
      type (input_sim) :: in_sim

!! basin
      type input_basin
       character(len=25) :: codes_bas       = "codes.bsn"
       character(len=25) :: parms_bas       = "parameters.bsn"
       character(len=25) :: carbon_bsn      = "carbon.bsn"
      end type input_basin
      type (input_basin) :: in_basin

!! climate
      type input_cli
       character(len=25) :: weat_sta = "weather-sta.cli"
       !character(len=25) :: wind_dir = "wind-dir.cli"
       character(len=25) :: pcp_cli = "pcp.cli"
      end type input_cli
      type (input_cli) :: in_cli

!! connect
      type input_con
       character(len=25) :: hru_con = "hru.con"
       character(len=25) :: hruez_con = "hru-lte.con"
      end type input_con
      type (input_con) :: in_con
      end module input_file_module
`;

/** The same module as it stood before `carbon.bsn` was added to the basin row. */
const OLDER_MODULE = MODULE.replace(
    '       character(len=25) :: carbon_bsn      = "carbon.bsn"\n', ''
);

/** A `file.cio` whose basin row predates `carbon.bsn` -- the real failure. */
const SHORT_CIO = [
    'file.cio: AMES',
    'simulation        time.sim          print.prt',
    'basin             codes.bsn         parameters.bsn',
    'climate           weather-sta.cli   pcp.cli',
    'connect           hru.con           null',
].join('\n');

const GOOD_CIO = SHORT_CIO.replace(
    'basin             codes.bsn         parameters.bsn',
    'basin             codes.bsn         parameters.bsn    carbon.bsn'
);

suite('file.cio check - reading the code\'s expectations', () => {
    test('the read order is the row order', () => {
        assert.deepStrictEqual(parseReadOrder(READCIO),
            ['in_sim', 'in_basin', 'in_cli', 'in_con']);
    });

    test('the title read is not a row', () => {
        // `read (107,*) titldum` takes the header line and must not become a
        // row, or every expectation after it lines up against the wrong row.
        assert.ok(!parseReadOrder(READCIO).includes('titldum'));
    });

    test('a repeated read is the loop coming round, not another row', () => {
        const looped = READCIO + READCIO;
        assert.deepStrictEqual(parseReadOrder(looped),
            ['in_sim', 'in_basin', 'in_cli', 'in_con']);
    });

    test('a type yields its fields and their default filenames', () => {
        const fields = parseInputTypes(MODULE).get('input_basin');
        assert.deepStrictEqual(fields?.map(f => f.name),
            ['codes_bas', 'parms_bas', 'carbon_bsn']);
        assert.strictEqual(fields?.[2].fallback, 'carbon.bsn');
    });

    test('a commented-out declaration is not a field', () => {
        // input_file_module.f90 really does carry one. Counting it would shift
        // every expectation by one and report a correct dataset as broken.
        const fields = parseInputTypes(MODULE).get('input_cli');
        assert.deepStrictEqual(fields?.map(f => f.name), ['weat_sta', 'pcp_cli']);
    });

    test('variables map to the type they are declared as', () => {
        assert.strictEqual(parseVariableTypes(MODULE).get('in_basin'), 'input_basin');
    });

    test('expectations come out in read order, with their fields', () => {
        const expectations = buildExpectations(READCIO, MODULE);
        assert.deepStrictEqual(expectations.map(e => e.variable),
            ['in_sim', 'in_basin', 'in_cli', 'in_con']);
        assert.strictEqual(expectations[1].typeName, 'input_basin');
        assert.strictEqual(expectations[1].fields.length, 3);
    });

    test('a row read into something undeclared is skipped, not guessed at', () => {
        const readcio = READCIO.replace('name, in_con', 'name, in_mystery');
        const expectations = buildExpectations(readcio, MODULE);
        assert.ok(!expectations.some(e => e.variable === 'in_mystery'));
    });
});

suite('file.cio check - reading the dataset', () => {
    test('the title line is not a row', () => {
        const rows = parseCioRows(GOOD_CIO);
        assert.strictEqual(rows[0].label, 'simulation');
    });

    test('a row keeps its line number, for pointing at it', () => {
        const rows = parseCioRows(GOOD_CIO);
        assert.strictEqual(rows[1].label, 'basin');
        assert.strictEqual(rows[1].line, 3);
    });

    test('blank lines are not rows', () => {
        const rows = parseCioRows(GOOD_CIO + '\n\n   \n');
        assert.strictEqual(rows.length, 4);
    });

    test('the label is not counted as a value', () => {
        const basin = parseCioRows(GOOD_CIO)[1];
        assert.deepStrictEqual(basin.values,
            ['codes.bsn', 'parameters.bsn', 'carbon.bsn']);
    });
});

suite('file.cio check - the verdict', () => {
    test('a matching dataset reports nothing', () => {
        const findings = checkCio(parseCioRows(GOOD_CIO), buildExpectations(READCIO, MODULE));
        assert.deepStrictEqual(findings, []);
    });

    test('a short row is an error, and names the field it lacks', () => {
        // The Ames_sub1 failure exactly: two values where the code reads three.
        const findings = checkCio(parseCioRows(SHORT_CIO), buildExpectations(READCIO, MODULE));
        assert.strictEqual(findings.length, 1);
        assert.strictEqual(findings[0].severity, 'error');
        assert.strictEqual(findings[0].row, 'basin');
        assert.strictEqual(findings[0].expected, 3);
        assert.strictEqual(findings[0].found, 2);
        assert.deepStrictEqual(findings[0].missing.map(f => f.name), ['carbon_bsn']);
        assert.strictEqual(findings[0].missing[0].fallback, 'carbon.bsn');
    });

    test('a long row is a note, because Fortran ignores the extra', () => {
        // The asymmetry that makes the check worth reading. List-directed input
        // stops once its item list is satisfied and skips the rest of the
        // record, so extra values cost nothing. Reporting them as errors would
        // teach whoever reads this to ignore all of it.
        const long = GOOD_CIO.replace('connect           hru.con           null',
            'connect           hru.con           null   extra.con   more.con');
        const findings = checkCio(parseCioRows(long), buildExpectations(READCIO, MODULE));
        assert.strictEqual(findings.length, 1);
        assert.strictEqual(findings[0].severity, 'note');
        assert.deepStrictEqual(findings[0].missing, []);
    });

    test('an older source tree expects the older file.cio, and it passes', () => {
        // The reason expectations are read from the source rather than from a
        // reference dataset. On a branch predating carbon.bsn, a two-value
        // basin row is correct -- and a checker anchored to a stored reference
        // would call it broken.
        const findings = checkCio(
            parseCioRows(SHORT_CIO),
            buildExpectations(READCIO, OLDER_MODULE)
        );
        assert.deepStrictEqual(findings, []);
    });

    test('the newer dataset on the older tree is a note, not an error', () => {
        // The mirror image: a dataset carrying carbon.bsn against code that
        // does not read it yet. Harmless, and worth saying rather than hiding.
        const findings = checkCio(
            parseCioRows(GOOD_CIO),
            buildExpectations(READCIO, OLDER_MODULE)
        );
        assert.strictEqual(findings.length, 1);
        assert.strictEqual(findings[0].severity, 'note');
    });

    test('rows past what the code reads are not judged', () => {
        const extra = GOOD_CIO + '\npcp_path          null';
        const findings = checkCio(parseCioRows(extra), buildExpectations(READCIO, MODULE));
        assert.deepStrictEqual(findings, []);
    });
});

suite('file.cio check - what it says', () => {
    const context = { datasetDir: 'C:/work/Ames_sub1', sourceDir: 'C:/src/swatplus' };

    test('a clean check says so plainly', () => {
        const text = describeCioCheck([], context);
        assert.match(text, /no row is short of values/);
    });

    test('an error explains why the crash will look unrelated', () => {
        // Without this, someone reads "missing value" and goes looking in the
        // routine the traceback named, which has nothing to do with it.
        const findings = checkCio(parseCioRows(SHORT_CIO), buildExpectations(READCIO, MODULE));
        const text = describeCioCheck(findings, context);
        assert.match(text, /spans records/);
        assert.match(text, /shifted by one/);
        assert.match(text, /line 3: basin expects 3 value\(s\), found 2/);
        assert.match(text, /missing: carbon_bsn \(the code's default is "carbon\.bsn"\)/);
    });

    test('an error says what to do about it', () => {
        const findings = checkCio(parseCioRows(SHORT_CIO), buildExpectations(READCIO, MODULE));
        assert.match(describeCioCheck(findings, context), /"null" where the dataset/);
    });

    test('a note is marked harmless rather than left to worry about', () => {
        const findings = checkCio(parseCioRows(GOOD_CIO), buildExpectations(READCIO, OLDER_MODULE));
        const text = describeCioCheck(findings, context);
        assert.match(text, /harmless/);
        // It must not be presented as the breaking kind. The clean headline
        // ("no row is short of values") is still correct and stays.
        assert.doesNotMatch(text, /row\(s\) in file\.cio are short/);
        assert.match(text, /no row is short of values/);
    });

    test('both paths are stated, since either being wrong explains a surprise', () => {
        const text = describeCioCheck([], context);
        assert.match(text, /dataset: C:\/work\/Ames_sub1/);
        assert.match(text, /expectations read from: C:\/src\/swatplus/);
    });
});
