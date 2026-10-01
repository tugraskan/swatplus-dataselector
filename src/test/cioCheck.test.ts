import * as assert from 'assert';
import {
    CIO_PREFLIGHT_VERSION,
    CioPreflight,
    buildCioLayout,
    buildExpectations,
    checkCio,
    cioPreflightError,
    describeCioCheck,
    describeCioPreflight,
    parseCioRows,
    parseInputTypes,
    parseReadOrder,
    parseVariableTypes,
    preflightCio,
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

/** The trailing whole-line read the real readcio_read.f90 makes for the output path. */
const READCIO_WITH_OUT_PATH = READCIO.replace(
    '     end do',
    "        read (107,'(A)',iostat=eof) line_buffer\n     end do"
);

function preflight(cio: string, readcio = READCIO, module = MODULE): CioPreflight {
    return preflightCio(cio, readcio, module, {
        dataset: { dir: 'C:/work/Ames_sub1', file_cio: null },
        source: { dir: 'C:/src/swatplus', readcio_read: null, input_file_module: null },
    });
}

function kinds(result: CioPreflight): string[] {
    return result.findings.map(f => f.kind);
}

suite('file.cio preflight - the verdict', () => {
    test('a matching dataset passes, and says how much it checked', () => {
        const result = preflight(GOOD_CIO);
        assert.strictEqual(result.status, 'pass');
        assert.strictEqual(result.check_version, CIO_PREFLIGHT_VERSION);
        assert.strictEqual(result.coverage.complete, true);
        assert.strictEqual(result.coverage.expected_sections, 4);
        assert.strictEqual(result.coverage.resolved_sections, 4);
        assert.strictEqual(result.coverage.checked_sections, 4);
        assert.strictEqual(result.coverage.observed_sections, 4);
        assert.deepStrictEqual(result.findings, []);
        assert.ok(result.sections.every(s => s.outcome === 'match'));
    });

    test('a short row fails and names the field it lacks', () => {
        const result = preflight(SHORT_CIO);
        assert.strictEqual(result.status, 'fail');
        assert.deepStrictEqual(kinds(result), ['short_row']);
        const [short] = result.findings;
        assert.strictEqual(short.position, 2);
        assert.strictEqual(short.variable, 'in_basin');
        assert.deepStrictEqual(short.missing_fields, [{ name: 'carbon_bsn', fallback: 'carbon.bsn' }]);
        assert.strictEqual(short.position_assumed, false);
    });

    test('a matching older dataset on the older tree still passes', () => {
        assert.strictEqual(preflight(SHORT_CIO, READCIO, OLDER_MODULE).status, 'pass');
    });

    test('surplus values are a note, never a missing value', () => {
        const result = preflight(GOOD_CIO, READCIO, OLDER_MODULE);
        assert.strictEqual(result.status, 'pass');
        assert.deepStrictEqual(kinds(result), ['surplus_values']);
        assert.strictEqual(result.findings[0].severity, 'note');
        assert.deepStrictEqual(result.findings[0].missing_fields, []);
        assert.strictEqual(result.sections[1].outcome, 'surplus');
    });
});

suite('file.cio preflight - truncated and empty files', () => {
    const WITHOUT_CONNECT = GOOD_CIO.replace('\nconnect           hru.con           null', '');

    test('a missing last section fails', () => {
        // The old check compared only as far as the shorter of the two lists,
        // so a file cut off before its last row came out clean.
        assert.deepStrictEqual(checkCio(parseCioRows(WITHOUT_CONNECT), buildExpectations(READCIO, MODULE)), []);
        const result = preflight(WITHOUT_CONNECT);
        assert.strictEqual(result.status, 'fail');
        assert.deepStrictEqual(kinds(result), ['missing_section']);
        assert.strictEqual(result.findings[0].position, 4);
        assert.strictEqual(result.findings[0].variable, 'in_con');
        assert.deepStrictEqual(result.findings[0].missing_fields.map(f => f.name), ['hru_con', 'hruez_con']);
        assert.strictEqual(result.sections[3].outcome, 'missing');
        assert.strictEqual(result.coverage.observed_sections, 3);
    });

    test('several missing sections each say which', () => {
        const result = preflight(['file.cio: AMES', 'simulation  time.sim  print.prt'].join('\n'));
        assert.strictEqual(result.status, 'fail');
        assert.deepStrictEqual(result.findings.map(f => f.variable), ['in_basin', 'in_cli', 'in_con']);
    });

    test('a title with no body fails once, not once per section', () => {
        const result = preflight('file.cio: AMES\n\n   \n');
        assert.strictEqual(result.status, 'fail');
        assert.deepStrictEqual(kinds(result), ['no_rows']);
        assert.ok(result.sections.every(s => s.outcome === 'missing'));
    });

    test('an empty file fails', () => {
        for (const text of ['', '\n', '  \r\n\t\r\n']) {
            const result = preflight(text);
            assert.strictEqual(result.status, 'fail', JSON.stringify(text));
            assert.deepStrictEqual(kinds(result), ['empty_file']);
        }
    });
});

suite('file.cio preflight - positions stay put', () => {
    const MYSTERY_READCIO = READCIO.replace('name, in_basin', 'name, in_mystery');

    test('an unresolved middle row keeps its place, so later rows are not misjudged', () => {
        // The old expectations dropped in_mystery, so the basin row was judged
        // against in_cli and the climate row against in_con: a clean result
        // from comparing the wrong things.
        const legacy = checkCio(parseCioRows(GOOD_CIO), buildExpectations(MYSTERY_READCIO, MODULE));
        assert.ok(!legacy.some(f => f.severity === 'error'));

        const result = preflight(GOOD_CIO, MYSTERY_READCIO);
        assert.strictEqual(result.status, 'inconclusive');
        assert.strictEqual(result.coverage.complete, false);
        assert.strictEqual(result.coverage.expected_sections, 4);
        assert.strictEqual(result.coverage.resolved_sections, 3);
        assert.deepStrictEqual(result.coverage.unresolved.map(g => [g.position, g.variable, g.reason]),
            [[2, 'in_mystery', 'undeclared_variable']]);
        assert.deepStrictEqual(result.sections.map(s => [s.variable, s.label, s.outcome]), [
            ['in_sim', 'simulation', 'match'],
            ['in_mystery', 'basin', 'unresolved'],
            ['in_cli', 'climate', 'match'],
            ['in_con', 'connect', 'match'],
        ]);
    });

    test('a short row after an unresolved one still fails, flagged as assumed', () => {
        const shortClimate = GOOD_CIO.replace('climate           weather-sta.cli   pcp.cli',
            'climate           weather-sta.cli');
        const result = preflight(shortClimate, MYSTERY_READCIO);
        assert.strictEqual(result.status, 'fail');
        assert.deepStrictEqual(kinds(result), ['short_row']);
        assert.strictEqual(result.findings[0].variable, 'in_cli');
        assert.strictEqual(result.findings[0].position_assumed, true);
    });

    test('an unresolved section with no row is still missing', () => {
        const result = preflight(GOOD_CIO.replace('\nconnect           hru.con           null', ''),
            READCIO.replace('name, in_con', 'name, in_mystery'));
        assert.strictEqual(result.status, 'fail');
        assert.strictEqual(result.findings[0].kind, 'missing_section');
        assert.strictEqual(result.findings[0].expected, null);
    });

    test('a type with a declaration this check does not count is unresolved', () => {
        const module = MODULE.replace('       character(len=25) :: pcp_cli = "pcp.cli"',
            '       character(len=25) :: pcp_cli = "pcp.cli"\n       integer :: n_cli = 0');
        const result = preflight(GOOD_CIO, READCIO, module);
        assert.strictEqual(result.status, 'inconclusive');
        assert.deepStrictEqual(result.coverage.unresolved.map(g => g.reason), ['unsupported_declaration']);
        assert.strictEqual(result.sections[2].outcome, 'unresolved');
    });

    test('a row in list-directed syntax the check cannot count is not counted', () => {
        const commas = GOOD_CIO.replace('climate           weather-sta.cli   pcp.cli',
            'climate           weather-sta.cli,pcp.cli');
        const result = preflight(commas);
        assert.strictEqual(result.status, 'inconclusive');
        assert.deepStrictEqual(result.coverage.unsupported.map(g => [g.where, g.reason, g.line]),
            [['dataset', 'uncounted_syntax', 4]]);
        assert.strictEqual(result.sections[2].outcome, 'uncounted');
    });

    test('an unrecognised read stops placement rather than guessing past it', () => {
        const readcio = READCIO.replace('read (107,*,iostat=eof) name, in_cli',
            'read (107,*,iostat=eof) name, in_cli, in_extra');
        const result = preflight(GOOD_CIO, readcio);
        assert.strictEqual(result.status, 'inconclusive');
        assert.deepStrictEqual(result.coverage.unsupported.map(g => g.reason), ['unrecognized_read']);
        assert.deepStrictEqual(result.sections.map(s => s.outcome),
            ['match', 'match', 'unrecognized', 'not_checked']);
    });

    test('a failure before an unrecognised read still fails', () => {
        const readcio = READCIO.replace('read (107,*,iostat=eof) name, in_con',
            "read (107,'(i4)',iostat=eof) count");
        const result = preflight(SHORT_CIO, readcio);
        assert.strictEqual(result.status, 'fail');
        assert.deepStrictEqual(kinds(result), ['short_row']);
    });

    test('a commented-out read is not a row', () => {
        const readcio = READCIO.replace('        read (107,*,iostat=eof) name, in_cli',
            '        !read (107,*,iostat=eof) name, in_old\n        read (107,*,iostat=eof) name, in_cli');
        assert.strictEqual(preflight(GOOD_CIO, readcio).status, 'pass');
    });

    test('a blank first line is not placed', () => {
        // The title read is list-directed too, so whether it takes the blank
        // line or skips to the next one decides every position after it.
        const result = preflight('\n' + GOOD_CIO);
        assert.strictEqual(result.status, 'inconclusive');
        assert.deepStrictEqual(result.coverage.unsupported.map(g => g.reason), ['blank_first_line']);
    });
});

suite('file.cio preflight - labels, order and extra rows', () => {
    test('labels are not required: the code reads them and throws them away', () => {
        const relabelled = GOOD_CIO.replace('basin             codes.bsn', 'bsn               codes.bsn');
        const result = preflight(relabelled);
        assert.strictEqual(result.status, 'pass');
        assert.strictEqual(result.sections[1].label, 'bsn');
        assert.strictEqual(result.sections[1].variable, 'in_basin');
    });

    test('order is what counts: swapped rows are judged where the code reads them', () => {
        const lines = GOOD_CIO.split('\n');
        [lines[2], lines[3]] = [lines[3], lines[2]];
        const result = preflight(lines.join('\n'));
        assert.strictEqual(result.status, 'fail');
        assert.deepStrictEqual(result.findings.map(f => [f.kind, f.variable, f.label]), [
            ['short_row', 'in_basin', 'climate'],
            ['surplus_values', 'in_cli', 'basin'],
        ]);
    });

    test('rows past what the code reads are noted, and do not fail', () => {
        const result = preflight(GOOD_CIO + '\npcp_path          null');
        assert.strictEqual(result.status, 'pass');
        assert.deepStrictEqual(kinds(result), ['extra_row']);
        assert.strictEqual(result.findings[0].line, 6);
        assert.strictEqual(result.coverage.observed_sections, 5);
    });

    test('a trailing whole-line read is counted but not judged', () => {
        const absent = preflight(GOOD_CIO, READCIO_WITH_OUT_PATH);
        assert.strictEqual(absent.status, 'pass');
        assert.strictEqual(absent.coverage.complete, true);
        assert.strictEqual(absent.coverage.expected_sections, 4);
        assert.deepStrictEqual(absent.coverage.unjudged,
            [{ position: 5, variable: 'line_buffer', source_line: 16, line: null }]);

        // When present, it takes its line, which is then not an extra row.
        const present = preflight(GOOD_CIO + '\nout_path          C:/runs/out', READCIO_WITH_OUT_PATH);
        assert.strictEqual(present.status, 'pass');
        assert.deepStrictEqual(present.findings, []);
        assert.strictEqual(present.coverage.unjudged[0].line, 6);
    });

    test('a whole-line read between rows is not placed', () => {
        const readcio = READCIO.replace('        read (107,*,iostat=eof) name, in_con',
            "        read (107,'(A)',iostat=eof) line_buffer\n        read (107,*,iostat=eof) name, in_con");
        const result = preflight(GOOD_CIO, readcio);
        assert.strictEqual(result.status, 'inconclusive');
        assert.deepStrictEqual(result.coverage.unsupported.map(g => g.reason), ['whole_record_not_trailing']);
    });
});

suite('file.cio preflight - missing expectations', () => {
    test('zero row reads are inconclusive, never a pass', () => {
        const titleOnly = 'read (107,*) titldum\n';
        const result = preflight(GOOD_CIO, titleOnly);
        assert.strictEqual(result.status, 'inconclusive');
        assert.strictEqual(result.coverage.expected_sections, 0);
        assert.deepStrictEqual(result.coverage.unsupported.map(g => g.reason), ['no_row_reads']);
        assert.match(describeCioPreflight(result), /Read no row expectations from C:\/src\/swatplus/);
    });

    test('empty source text is inconclusive, not a pass', () => {
        const result = preflight(GOOD_CIO, '', '');
        assert.strictEqual(result.status, 'inconclusive');
        assert.deepStrictEqual(result.coverage.unsupported.map(g => g.reason).sort(),
            ['no_row_reads', 'no_title_read']);
    });

    test('a module without the types leaves every row unresolved', () => {
        const result = preflight(GOOD_CIO, READCIO, '');
        assert.strictEqual(result.status, 'inconclusive');
        assert.strictEqual(result.coverage.resolved_sections, 0);
        assert.strictEqual(result.coverage.unresolved.length, 4);
    });

    test('the layout keeps a title, every row and its source line', () => {
        const layout = buildCioLayout(READCIO_WITH_OUT_PATH + READCIO_WITH_OUT_PATH, MODULE);
        assert.strictEqual(layout.titleLine, 6);
        assert.deepStrictEqual(layout.reads.map(r => [r.position, r.kind, r.variable]), [
            [1, 'list_directed', 'in_sim'],
            [2, 'list_directed', 'in_basin'],
            [3, 'list_directed', 'in_cli'],
            [4, 'list_directed', 'in_con'],
            [5, 'whole_record', 'line_buffer'],
        ]);
    });
});

suite('file.cio preflight - structured and text agree', () => {
    const context = { datasetDir: 'C:/work/Ames_sub1', sourceDir: 'C:/src/swatplus' };

    test('a pass reads exactly as it always has', () => {
        assert.strictEqual(describeCioPreflight(preflight(GOOD_CIO)), describeCioCheck([], context));
    });

    test('a short row reads exactly as it always has', () => {
        const legacy = checkCio(parseCioRows(SHORT_CIO), buildExpectations(READCIO, MODULE));
        assert.strictEqual(describeCioPreflight(preflight(SHORT_CIO)), describeCioCheck(legacy, context));
    });

    test('a surplus note reads exactly as it always has', () => {
        const legacy = checkCio(parseCioRows(GOOD_CIO), buildExpectations(READCIO, OLDER_MODULE));
        assert.strictEqual(describeCioPreflight(preflight(GOOD_CIO, READCIO, OLDER_MODULE)),
            describeCioCheck(legacy, context));
    });

    test('only a pass carries the clean headline', () => {
        const cases: [string, CioPreflight][] = [
            ['missing', preflight(GOOD_CIO.replace('\nconnect           hru.con           null', ''))],
            ['empty', preflight('')],
            ['no rows', preflight('file.cio: AMES')],
            ['unresolved', preflight(GOOD_CIO, READCIO.replace('name, in_basin', 'name, in_mystery'))],
            ['no expectations', preflight(GOOD_CIO, 'read (107,*) titldum')],
            ['pass', preflight(GOOD_CIO)],
        ];
        for (const [name, result] of cases) {
            const clean = /matches what the code reads/.test(describeCioPreflight(result));
            assert.strictEqual(clean, result.status === 'pass', name);
        }
    });

    test('a missing section and an inconclusive check say so', () => {
        const missing = describeCioPreflight(preflight(GOOD_CIO.replace('\nconnect           hru.con           null', '')));
        assert.match(missing, /file\.cio ends before the code has read all of it/);
        assert.match(missing, /section 4: no row for in_con \(input_con, 2 value\(s\)\)/);

        const unresolved = describeCioPreflight(preflight(GOOD_CIO, READCIO.replace('name, in_basin', 'name, in_mystery')));
        assert.match(unresolved, /could not be checked completely, so this is not a pass/);
        assert.match(unresolved, /section 2 \(in_mystery, readcio_read\.f90:10\): in_mystery is not declared/);
    });

    test('an error is its message, in the same shape as a result', () => {
        const result = cioPreflightError('source_file_missing', 'Cannot check: no C:/src/readcio_read.f90 (source path wrong?).');
        assert.strictEqual(result.status, 'error');
        assert.strictEqual(result.error?.code, 'source_file_missing');
        assert.strictEqual(result.coverage.complete, false);
        assert.strictEqual(describeCioPreflight(result), result.error?.message);
        assert.deepStrictEqual(Object.keys(result).sort(), Object.keys(preflight(GOOD_CIO)).sort());
    });

    test('the result is plain JSON', () => {
        const result = preflight(SHORT_CIO);
        assert.deepStrictEqual(JSON.parse(JSON.stringify(result)), result);
    });
});
