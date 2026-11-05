import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
    DatasetFile,
    InputIssue,
    InputPreflight,
    expectationsFromLayouts,
    expectationsFromSchema,
    judgeFile,
    preflightInputs,
} from '../mcp/inputCheck';
import {
    InputSourceFacts,
    actionFacts,
    caseBlocks,
    parseDecisionTables,
    parsePlantCommunities,
    parseSchedules,
    scanWeather,
    simPeriod,
} from '../mcp/inputCrossChecks';

/** Column of a Tamandua layout, with the type the walk reads. */
function typed(name: string, vartype: string, path = `db%${name}`) {
    return { name, path, vartype };
}

function table(file: string, at: string, columns: unknown[], extra: Record<string, unknown> = {}) {
    return {
        file,
        filename_is_default: true,
        data_starts_after: 2,
        records: [{ role: 'main', at, loops: ['do', 'i'], complete: true, columns }],
        ...extra,
    };
}

const reals = (...names: string[]) => names.map(name => typed(name, 'real'));

const LAYOUTS = {
    layout_format: '2',
    provenance: { source_commit: 'abc123def4567890', source_describe: '62.0.1' },
    files: {
        // A single record, as basin_read_prm.f90 reads it.
        'parameters.bsn': {
            ...table('parameters.bsn', 'basin_read_prm.f90:24', [
                ...reals('evlai', 'ffcb', 'temp_decay', 'cmn'),
                typed('day_lag_mx', 'integer'),
            ]),
            records: [{
                role: 'main', at: 'basin_read_prm.f90:24', loops: ['do'], complete: true,
                columns: [...reals('evlai', 'ffcb', 'temp_decay', 'cmn'), typed('day_lag_mx', 'integer')],
            }],
        },
        'codes.bsn': {
            ...table('codes.bsn', 'basin_read_cc.f90:20', []),
            records: [{
                role: 'main', at: 'basin_read_cc.f90:20', loops: ['do'], complete: true,
                columns: [
                    typed('pet_file', 'character(len=50)', 'bsn_cc%pet_file'),
                    typed('nam1', 'integer', 'bsn_cc%nam1'),
                    typed('cswat', 'integer', 'bsn_cc%cswat'),
                ],
            }],
        },
        // plant_parm_read.f90 takes the class only when nam1 is set: two accepted reads.
        'plants.plt': {
            ...table('plants.plt', 'plant_parm_read.f90:57', []),
            records: [
                {
                    role: 'alternative', at: 'plant_parm_read.f90:55', loops: ['do', 'ic'], complete: true,
                    columns: [
                        typed('plantnm', 'character(len=40)', 'pldb%plantnm'),
                        typed('trig', 'character(len=18)', 'pldb%trig'),
                        typed('bio_e', 'real', 'pldb%bio_e'),
                        typed('meta_frac', 'real', 'pldb%res_part_fracs%meta_frac'),
                        typed('str_frac', 'real', 'pldb%res_part_fracs%str_frac'),
                    ],
                },
                {
                    role: 'main', at: 'plant_parm_read.f90:57', loops: ['do', 'ic'], complete: true,
                    columns: [
                        typed('plantnm', 'character(len=40)', 'pldb%plantnm'),
                        typed('trig', 'character(len=18)', 'pldb%trig'),
                        typed('bio_e', 'real', 'pldb%bio_e'),
                        typed('meta_frac', 'real', 'pldb%res_part_fracs%meta_frac'),
                        typed('str_frac', 'real', 'pldb%res_part_fracs%str_frac'),
                        typed('pl_class', 'character(len=25)', 'pl_class'),
                    ],
                },
            ],
        },
        'tillage.til': table('tillage.til', 'till_parm_read.f90:47', [
            typed('tillnm', 'character(len=16)', 'tilldb%tillnm'), ...reals('effmix'),
        ]),
        'harv.ops': table('harv.ops', 'mgt_read_harvops.f90:40', [
            typed('name', 'character(len=40)', 'harvop_db%name'), typed('typ', 'character(len=40)', 'harvop_db%typ'),
        ]),
        'transplant.ops': table('transplant.ops', 'plant_transplant_read.f90:43', [
            typed('name', 'character(len=40)', 'transpl%name'),
        ]),
        'landuse.lum': table('landuse.lum', 'landuse_read.f90:56', [
            typed('name', 'character (len=40)'), typed('plant_cov', 'character (len=40)'),
            typed('mgt_ops', 'character (len=40)'),
        ]),
        'hru-data.hru': table('hru-data.hru', 'hru_read.f90:67', [
            typed('id', 'integer'), typed('name', 'character(len=40)'), typed('land_use_mgt', 'character(len=40)'),
        ]),
    },
};

const expectations = expectationsFromLayouts(LAYOUTS);

const identity = (file: string) => ({ path: `/data/${file}`, sha256: '0'.repeat(64), bytes: 1 });

function sourceFacts(actions: string, dtblLumRead: string, commit: string | null = 'abc123def4567890'): InputSourceFacts {
    return {
        dir: '/swatplus',
        commit,
        dtblLumRead: { text: dtblLumRead, identity: identity('dtbl_lum_read.f90') },
        actions: { text: actions, identity: identity('actions.f90') },
    };
}

function check(files: Record<string, string>, cio: string, source?: InputSourceFacts): InputPreflight {
    return preflightInputs(
        cio,
        (name: string): DatasetFile => (name in files
            ? { kind: 'text', text: files[name], identity: identity(name) }
            : { kind: 'missing' }),
        {
            datasetDir: '/data',
            fileCio: identity('file.cio'),
            expectations,
            expectationFile: { path: '/layouts.json', sha256: '1'.repeat(64) },
            source,
        },
    );
}

const issuesOf = (result: InputPreflight, kind: InputIssue['kind']) => result.issues.filter(item => item.kind === kind);
const stateOf = (result: InputPreflight, name: string) => result.checks.find(item => item.name === name);

suite('check_inputs - values by field type', () => {
    const parameters = expectations.layouts.get('parameters.bsn')!;

    test('a value its field cannot take is a read error, with the file, row, column, field and what is lost', () => {
        const text = ['title', 'evlai ffcb exp_sed cmn lag', '3.0 0.0 0.0null 0.0003 0'].join('\n');
        const result = check({ 'parameters.bsn': text }, 'file.cio: t\nbasin parameters.bsn');
        assert.strictEqual(result.status, 'fail');
        assert.deepStrictEqual(
            [result.files[0].outcome, result.files[0].short_rows, result.files[0].bad_value_rows],
            ['bad_value', 0, 1],
        );
        const [issue] = issuesOf(result, 'bad_value');
        assert.deepStrictEqual(
            [issue.severity, issue.file, issue.line, issue.column, issue.field, issue.header, issue.value, issue.lost_columns],
            ['error', 'parameters.bsn', 3, 3, 'temp_decay', 'exp_sed', '0.0null', ['temp_decay', 'cmn', 'day_lag_mx']],
        );
        assert.match(issue.message, /parameters\.bsn line 3 stops at value 3 \(exp_sed\): "0\.0null" cannot be read as the real temp_decay/);
        assert.match(issue.message, /temp_decay, cmn, day_lag_mx keep their code defaults/);
        assert.match(result.summary, /1 with values that stop the read: parameters\.bsn \(1\)/);
    });

    test('a count alone would call that row a match', () => {
        const judged = judgeFile(['title', 'header', '3.0 0.0 0.0null 0.0003 0'].join('\n'), parameters);
        assert.strictEqual(judged.shortRows, 0);
        assert.deepStrictEqual(judged.stopped.map(group => [group.kind, group.index]), [['bad_value', 2]]);
    });

    test('every form ifx and gfortran both read as a real passes, and the rest stop the read', () => {
        // Each checked against both compilers with a read of a derived type.
        for (const value of ['1', '1.', '.5', '-1.5', '+2', '1e2', '1E-2', '1d2', '1q2', '1.5+2', 'NaN', 'inf', 'Infinity']) {
            const judged = judgeFile(['t', 'h', `1.0 ${value} 3.0 4.0 5`].join('\n'), parameters);
            assert.deepStrictEqual(judged.stopped, [], value);
        }
        for (const value of ['0.0null', 'null', 'text', '-', '+.e']) {
            const judged = judgeFile(['t', 'h', `1.0 ${value} 3.0 4.0 5`].join('\n'), parameters);
            assert.deepStrictEqual(judged.stopped.map(group => group.kind), ['bad_value'], value);
        }
    });

    test('a decimal in an integer field reads differently by compiler, so it warns and does not fail', () => {
        const text = ['t', 'a b c d lag', '1.0 2.0 3.0 4.0 0.00000'].join('\n');
        const result = check({ 'parameters.bsn': text }, 'file.cio: t\nbasin parameters.bsn');
        assert.strictEqual(result.status, 'pass');
        assert.strictEqual(result.files[0].outcome, 'match');
        const [issue] = issuesOf(result, 'decimal_in_integer');
        assert.strictEqual(issue.severity, 'warning');
        assert.match(issue.message, /ifx reads on and keeps the whole part; gfortran stops the read there/);
    });

    test('text in an integer field stops both compilers', () => {
        const judged = judgeFile(['t', 'h', '1.0 2.0 3.0 4.0 lots'].join('\n'), parameters);
        assert.deepStrictEqual(judged.stopped.map(group => [group.kind, group.index]), [['bad_value', 4]]);
    });

    test('a slash ends the read with no error, keeping the value before it', () => {
        const result = check({ 'parameters.bsn': ['t', 'h', '1.0 2.0/3 3.0 4.0 5'].join('\n') }, 'file.cio: t\nbasin parameters.bsn');
        const [issue] = issuesOf(result, 'slash_ends_read');
        assert.strictEqual(issue.severity, 'error');
        assert.deepStrictEqual(issue.lost_columns, ['temp_decay', 'cmn', 'day_lag_mx']);
    });

    test('a slash in the last field loses nothing worth reporting', () => {
        const units = judgeFile(['t', 'h', 'length m/m'].join('\n'), expectations.layouts.get('harv.ops')!);
        assert.deepStrictEqual(units.stopped, []);
        assert.strictEqual(units.rowsChecked, 1);
    });

    test('where the accepted reads disagree on a type, the value is not judged', () => {
        const disagree = expectationsFromLayouts({
            layout_format: '2',
            provenance: {},
            files: {
                'x.txt': {
                    file: 'x.txt',
                    filename_is_default: true,
                    data_starts_after: 0,
                    records: [
                        { role: 'main', at: 'x.f90:1', loops: ['do', 'i'], complete: true, columns: [typed('a', 'real')] },
                        { role: 'alternative', at: 'x.f90:2', loops: ['do', 'i'], complete: true, columns: [typed('a', 'character(len=9)')] },
                    ],
                },
            },
        }).layouts.get('x.txt')!;
        assert.strictEqual(disagree.fields[0].type, 'unknown');
        assert.deepStrictEqual(judgeFile('text', disagree).stopped, []);
    });

    test('a character field keeps its declared length', () => {
        const field = expectations.layouts.get('tillage.til')!.fields[0];
        assert.deepStrictEqual([field.type, field.length, field.path], ['character', 16, 'tilldb%tillnm']);
    });

    test('the shipped schema carries the field types too', () => {
        const shipped = path.join(__dirname, '..', '..', 'resources', 'schema', 'swatplus-generated-schema.json');
        const layouts = expectationsFromSchema(JSON.parse(fs.readFileSync(shipped, 'utf-8'))).layouts;
        const parameters = layouts.get('parameters.bsn')!;
        assert.strictEqual(parameters.fields.length, parameters.columns.length);
        assert.strictEqual(parameters.fields[0].type, 'real');
        assert.strictEqual(parameters.fields[0].path, 'bsn_prm%evlai');
    });
});

suite('check_inputs - text columns a read stops at', () => {
    // Two plants written for an older reader: the class falls on the first of the last real fields.
    const PLANTS = [
        'plants.plt: older', 'NAME TRIG BM_E CLASS DESCRIPTION',
        'agrc temp_gro 30 close_grown agricultural_land',
        'corn temp_gro 39 row_crop maize',
    ].join('\n');
    const cio = 'file.cio: t\nbasin codes.bsn\nhru_parm_db plants.plt';
    const codes = (nam1: string, carbon: string) => ['t', 'pet nam1 carbon', `null ${nam1} ${carbon}`].join('\n');

    test('the rows stay in sync, so they are not short and nothing reads on', () => {
        const result = check({ 'plants.plt': PLANTS, 'codes.bsn': codes('0', '0') }, cio);
        const plants = result.files.find(item => item.file === 'plants.plt')!;
        assert.deepStrictEqual([plants.outcome, plants.short_rows, plants.bad_value_rows], ['bad_value', 0, 2]);
        assert.deepStrictEqual(result.findings, []);
        const [issue] = issuesOf(result, 'bad_value');
        assert.deepStrictEqual(
            [issue.rows, issue.lines, issue.column, issue.field, issue.header],
            [2, [3, 4], 4, 'meta_frac', 'CLASS'],
        );
        assert.match(issue.message, /2 rows of plants\.plt \(first at line 3\) stop at value 4 \(CLASS\)/);
        assert.match(issue.message, /The rows stay in sync: the next read starts on the next line/);
        assert.doesNotMatch(result.summary, /short of values:/);
    });

    test('with carbon off, the lost fields change nothing, and the result says why', () => {
        const result = check({ 'plants.plt': PLANTS, 'codes.bsn': codes('0', '0') }, cio);
        const [issue] = issuesOf(result, 'bad_value');
        assert.strictEqual(issue.severity, 'note');
        assert.deepStrictEqual(issue.lost_columns, ['meta_frac', 'str_frac', 'pl_class']);
        assert.match(issue.message, /They matter only when carbon = 2 \(here carbon = 0\)/);
        assert.strictEqual(result.status, 'pass');
    });

    test('with carbon = 2 the same rows are an error', () => {
        const result = check({ 'plants.plt': PLANTS, 'codes.bsn': codes('0', '2') }, cio);
        assert.strictEqual(issuesOf(result, 'bad_value')[0].severity, 'error');
        assert.strictEqual(result.status, 'fail');
    });

    test('with no codes.bsn to read, it stays a warning', () => {
        const result = check({ 'plants.plt': PLANTS }, 'file.cio: t\nhru_parm_db plants.plt');
        assert.strictEqual(issuesOf(result, 'bad_value')[0].severity, 'warning');
    });

    test('a read that stops before the last fields loses fields that always count', () => {
        const early = ['t', 'h', 'agrc temp_gro bad 0.1 0.2 row'].join('\n');
        const result = check({ 'plants.plt': early, 'codes.bsn': codes('0', '0') }, cio);
        assert.strictEqual(issuesOf(result, 'bad_value')[0].severity, 'error');
    });
});

suite('check_inputs - decision tables', () => {
    const ACTIONS = `
      subroutine actions
        do iac = 1, d_tbl%acts
          select case (d_tbl%act(iac)%typ)
          !tillage
          case ("till", "tillage")
            idtill = d_tbl%act_typ(iac)
          case ("harvest")
            iharvop = d_tbl%act_typ(iac)
            select case (harvop_db(iharvop)%typ)
            case ("biomass")    ! not an action
              x = 1
            end select
          case ("plant")
            if (d_tbl%act_app(iac) > 0) call mgt_transplant (d_tbl%act_app(iac))
          case ("rot_reset")
            pcom(j)%rot_yr = 1
          case ("manure")
            ifrt = d_tbl%act_typ(iac)
          end select
        end do
      end subroutine actions
`;
    const READER = `
      subroutine dtbl_lum_read
                select case (dtbl_lum(i)%act(iac)%typ)
                case ("plant")
                  do idb = 1, db_mx%transplant
                    if (dtbl_lum(i)%act(iac)%file_pointer == transpl(idb)%name) then
                      dtbl_lum(i)%act_app(iac) = idb
                      exit
                    endif
                  end do
                case ("harvest")
                  do idb = 1, db_mx%harvop_db
                    if (dtbl_lum(i)%act(iac)%file_pointer == harvop_db(idb)%name) then
                      dtbl_lum(i)%act_typ(iac) = idb
                      exit
                    end if
                  end do
                  case ("till")
                  do idb = 1, db_mx%tillparm
                    if (dtbl_lum(i)%act(iac)%option == tilldb(idb)%tillnm) then
                      dtbl_lum(i)%act_typ(iac) = idb
                      exit
                    endif
                  end do
                case ("irr_wallo")
                  do idb = 1, db_mx%irrop_db
                    if (dtbl_lum(i)%act(iac)%option == irrop_db(idb)%name) then
                      dtbl_lum(i)%act_typ(iac) = idb
                    end if
                  end do
                end select
      end subroutine dtbl_lum_read
`;

    function dtl(...tables: { name: string; actions: string[] }[]): string {
        const body = tables.flatMap(item => [
            '', 'name conds alts acts', `${item.name} 1 1 ${item.actions.length}`,
            'var obj obj_num lim_var lim_op lim_const alt1',
            'jday hru 0 null - 1.0 =',
            'act_typ obj obj_num name option const const2 fp outcome',
            ...item.actions,
        ]);
        return ['lum.dtl: test', String(tables.length), '', ...body.slice(1)].join('\n');
    }
    const row = (typ: string, option: string, fp = 'null') => `${typ} hru 0 name ${option} 0.0 1.0 ${fp} y`;
    const TILLAGE = ['tillage.til: t', 'name mix', 'fldcult 0.3', 'mldboard 0.9'].join('\n');
    const HARVEST = ['harv.ops: t', 'name typ', 'grain grain', 'hay_cut_low biomass'].join('\n');
    const SCHEDULE = ['management.sch: t', 'name ops autos', 'crop_rot 0 1', 'plow'].join('\n');
    const cio = 'file.cio: t\nhru_parm_db tillage.til\nops harv.ops\nlum management.sch\ndecision_table lum.dtl';
    const source = sourceFacts(ACTIONS, READER);
    const files = (tables: string) => ({
        'lum.dtl': tables, 'tillage.til': TILLAGE, 'harv.ops': HARVEST, 'management.sch': SCHEDULE,
    });

    test('the action names come from the source, and a nested select is not an action', () => {
        const blocks = caseBlocks(ACTIONS, /%act\(iac\)%typ\s*\)/i);
        assert.deepStrictEqual(blocks.flatMap(block => block.labels),
            ['till', 'tillage', 'harvest', 'plant', 'rot_reset', 'manure']);
        const facts = actionFacts(READER, ACTIONS)!;
        assert.deepStrictEqual([...facts.mapped.keys()], ['plant', 'harvest', 'till', 'irr_wallo']);
        assert.deepStrictEqual(facts.mapped.get('till'), [{ field: 'option', target: 'act_typ', path: 'tilldb%tillnm' }]);
        assert.deepStrictEqual(facts.mapped.get('plant'), [{ field: 'file_pointer', target: 'act_app', path: 'transpl%name' }]);
        assert.strictEqual(facts.run.get('tillage')!.readsLookup, true);
        assert.strictEqual(facts.run.get('rot_reset')!.readsLookup, false);
        assert.deepStrictEqual(facts.run.get('tillage')!.labels, ['till', 'tillage']);
        assert.strictEqual(actionFacts('no select here', ACTIONS), null);
    });

    test('a comment holding a case label is not one', () => {
        const blocks = caseBlocks([
            'select case (d%act(iac)%typ)',
            '! case ("commented")',
            'case ("real")   ! case ("trailing")',
            'end select',
        ].join('\n'), /%act\(iac\)%typ\s*\)/i);
        assert.deepStrictEqual(blocks.map(block => block.labels), [['real']]);
    });

    test('a table is walked the way dtbl_lum_read.f90 walks it', () => {
        const tables = parseDecisionTables(dtl({ name: 'plow', actions: [row('till', 'fldcult')] }, {
            name: 'hay', actions: [row('harvest', 'crop', 'grain'), row('rot_reset', 'null')],
        }))!;
        assert.deepStrictEqual(tables.map(item => [item.name, item.actions.map(action => action.typ)]),
            [['plow', ['till']], ['hay', ['harvest', 'rot_reset']]]);
        assert.deepStrictEqual(
            [tables[1].actions[0].option, tables[1].actions[0].filePointer],
            ['crop', 'grain'],
        );
        assert.strictEqual(parseDecisionTables('title\nnot a count\n'), null);
    });

    test('an action that runs but is never mapped is an error naming the mapped spelling', () => {
        const result = check(files(dtl({ name: 'plow', actions: [row('tillage', 'fldcult')] })), cio, source);
        const [issue] = issuesOf(result, 'action_never_mapped');
        assert.deepStrictEqual(
            [issue.severity, issue.action, issue.line, issue.tables, issue.tables_in_use],
            ['error', 'tillage', 9, ['plow'], ['plow']],
        );
        assert.match(issue.message, /actions\.f90:\d+ runs the action "tillage", but dtbl_lum_read\.f90 has no case/);
        assert.match(issue.message, /The spelling dtbl_lum_read\.f90 maps is "till"/);
        assert.strictEqual(result.status, 'fail');
    });

    test('the mapped spelling of a check passes', () => {
        const result = check(files(dtl({ name: 'plow', actions: [row('till', 'fldcult')] })), cio, source);
        assert.deepStrictEqual(result.issues, []);
        assert.strictEqual(stateOf(result, 'decision_tables')!.state, 'ran');
    });

    test('an action with no lookup needs no mapping', () => {
        const result = check(files(dtl({ name: 'plow', actions: [row('rot_reset', 'null')] })), cio, source);
        assert.deepStrictEqual(result.issues, []);
    });

    test('an action nothing runs is a warning', () => {
        const result = check(files(dtl({ name: 'plow', actions: [row('fertilise', 'urea'), row('irr_wallo', 'sprinkler')] })), cio, source);
        assert.deepStrictEqual(issuesOf(result, 'action_never_run').map(item => [item.action, item.severity]),
            [['fertilise', 'warning'], ['irr_wallo', 'warning']]);
    });

    test('an implement missing from its database is an error, whichever spelling asks for it', () => {
        const result = check(files(dtl({
            name: 'plow', actions: [row('till', 'discplow'), row('tillage', 'chisel')],
        })), cio, source);
        assert.deepStrictEqual(
            issuesOf(result, 'option_not_in_database').map(item => [item.action, item.option, item.database, item.severity]),
            [['till', 'discplow', 'tillage.til', 'error'], ['tillage', 'chisel', 'tillage.til', 'error']],
        );
    });

    test('a name is compared at the length SWAT+ stores it', () => {
        const long = 'chisel_plow_with_extras';
        const result = check({ ...files(dtl({ name: 'plow', actions: [row('till', long)] })),
            'tillage.til': ['t', 'h', `${long} 0.3`].join('\n') }, cio, source);
        assert.deepStrictEqual(issuesOf(result, 'option_not_in_database').map(item => item.option), [long]);
    });

    test('the column looked up is the one the source compares', () => {
        const result = check(files(dtl({ name: 'plow', actions: [row('harvest', 'crop', 'biomass')] })), cio, source);
        assert.deepStrictEqual(issuesOf(result, 'option_not_in_database').map(item => [item.option, item.database]),
            [['biomass', 'harv.ops']]);
    });

    test('an optional lookup left null is fine, and one missing is only a warning', () => {
        const fine = check(files(dtl({ name: 'plow', actions: [row('plant', 'corn')] })), cio, source);
        assert.deepStrictEqual(fine.issues, []);
        const missing = check(files(dtl({ name: 'plow', actions: [row('plant', 'rice', 'tr_rice')] })), cio, source);
        const [issue] = issuesOf(missing, 'option_not_in_database');
        assert.deepStrictEqual([issue.severity, issue.database], ['warning', 'transplant.ops']);
        assert.match(issue.message, /which the dataset does not have, so the action runs without it/);
    });

    test('what is wrong with a table no schedule runs is a note', () => {
        const result = check(files(dtl({ name: 'unused', actions: [row('tillage', 'fldcult')] })), cio, source);
        const [issue] = issuesOf(result, 'action_never_mapped');
        assert.deepStrictEqual([issue.severity, issue.tables_in_use], ['note', []]);
        assert.match(issue.message, /no schedule uses them/);
        assert.strictEqual(result.status === 'fail', false);
    });

    test('with no source the check does not run, and that rules out a pass', () => {
        const result = check({ 'lum.dtl': dtl({ name: 'plow', actions: [row('tillage', 'fldcult')] }) }, 'file.cio: t\ndecision_table lum.dtl');
        const run = stateOf(result, 'decision_tables')!;
        assert.strictEqual(run.state, 'skipped');
        assert.match(run.reason!, /no SWAT\+ source was given/);
        assert.strictEqual(result.status, 'inconclusive');
    });

    test('a dataset with no lum.dtl has nothing to check', () => {
        const result = check({ 'parameters.bsn': ['t', 'h', '1 2 3 4 5'].join('\n') }, 'file.cio: t\nbasin parameters.bsn', source);
        assert.strictEqual(stateOf(result, 'decision_tables')!.state, 'not_applicable');
        assert.strictEqual(result.status, 'pass');
    });

    test('a source with no such select says so', () => {
        const result = check(files(dtl({ name: 'plow', actions: [row('till', 'fldcult')] })), cio, sourceFacts('x', 'y'));
        assert.strictEqual(stateOf(result, 'decision_tables')!.state, 'skipped');
    });
});

suite('check_inputs - weather against time.sim', () => {
    const TIME = (dayEnd: number, end: number) => ['time.sim: t', 'day_start yrc_start day_end yrc_end step', `0 2020 ${dayEnd} ${end} 0`].join('\n');
    function daily(year: number, days: number, value: (day: number) => number = () => 0): string[] {
        return Array.from({ length: days }, (_, index) => `${year} ${index + 1} ${value(index + 1).toFixed(5)}`);
    }
    const weather = (...rows: string[]) => ['p.pcp: t', 'nbyr tstep lat lon elev', '2 0 42.2 2.2 725', ...rows].join('\n');
    const CIO = 'file.cio: t\nsimulation time.sim\nclimate weather-sta.cli pcp.cli';
    const stations = (...files: string[]) => ['weather-sta.cli: t', 'name wgn pcp tmp slr hmd wnd pet atmo',
        ...files.map((file, index) => `s${index} wgn1 ${file} sim sim sim sim null null`)].join('\n');
    const list = (...files: string[]) => ['pcp.cli: t', 'filename', ...files].join('\n');

    test('time.sim zeros mean the whole first and last year, leap years included', () => {
        assert.deepStrictEqual(simPeriod(TIME(0, 2021)), { startYear: 2020, startDay: 1, endYear: 2021, endDay: 365, days: 731 });
        assert.deepStrictEqual(simPeriod(['t', 'h', '10 2020 20 2020 0'].join('\n')), { startYear: 2020, startDay: 10, endYear: 2020, endDay: 20, days: 11 });
        assert.strictEqual(simPeriod(['t', 'h', 'x'].join('\n')), null);
    });

    test('a record is read the way cli_pmeas.f90 reads it, counting days once', () => {
        const period = simPeriod(TIME(0, 2020))!;
        const scan = scanWeather(weather('2019 365 0.0', '2020 1 -99.0', '2020 2 1.5'), period)!;
        assert.deepStrictEqual(scan, { first: 2019365, last: 2020002, days: 2, flagged: 1 });
        const hourly = ['t', 'h', '1 24 0 0 0', '2020 1 1 1 0 0.5', '2020 1 1 1 1 -99.0'].join('\n');
        assert.deepStrictEqual(scanWeather(hourly, period), { first: 2020001, last: 2020001, days: 1, flagged: 1 });
    });

    test('files that end before time.sim are a warning naming the dates and days', () => {
        const file = weather(...daily(2020, 366));
        const result = check({
            'time.sim': TIME(0, 2021), 'pcp.cli': list('a.pcp', 'b.pcp'),
            'weather-sta.cli': stations('a.pcp', 'b.pcp'), 'a.pcp': file, 'b.pcp': file,
        }, CIO);
        const [issue] = issuesOf(result, 'weather_ends_early');
        assert.deepStrictEqual(
            [issue.severity, issue.file, issue.variable, issue.files, issue.files_ending_early, issue.last_record, issue.sim_end, issue.days_short],
            ['warning', 'pcp.cli', 'pcp', 2, 2, { year: 2020, day: 366 }, { year: 2021, day: 365 }, 365],
        );
        assert.match(issue.message, /2 of 2 rain files end before time\.sim does/);
        assert.match(issue.message, /SWAT\+ generates the last 365 of 731 simulated days/);
    });

    test('the share of missing rain days counts flagged days and days past the record, per station', () => {
        // Station a: 366 of 731 days have a row, ten of them flagged. Station b: all 731 have one, none flagged.
        const a = weather(...daily(2020, 366, day => (day <= 10 ? -99 : 0)));
        const b = weather(...daily(2020, 366), ...daily(2021, 365));
        const result = check({
            'time.sim': TIME(0, 2021), 'pcp.cli': list('a.pcp', 'b.pcp'),
            'weather-sta.cli': stations('a.pcp', 'b.pcp'), 'a.pcp': a, 'b.pcp': b,
        }, CIO);
        const [issue] = issuesOf(result, 'rain_days_missing');
        assert.deepStrictEqual(
            [issue.missing_days, issue.total_days, issue.flagged_days, issue.days_after_records, issue.days_before_records, issue.gap_days, issue.missing_share],
            [375, 1462, 10, 365, 0, 0, 0.2565],
        );
        assert.match(issue.message, /Rain: 25\.6% of the station-days in the simulated period have no value \(375 of 1462\)/);
    });

    test('days before a record starts, and gaps inside it, are counted apart', () => {
        const rows = daily(2020, 366).filter(row => !row.startsWith('2020 1 ') && !row.startsWith('2020 200 '));
        const result = check({
            'time.sim': TIME(0, 2020), 'pcp.cli': list('a.pcp'), 'weather-sta.cli': stations('a.pcp'), 'a.pcp': weather(...rows),
        }, CIO);
        const [issue] = issuesOf(result, 'rain_days_missing');
        assert.deepStrictEqual([issue.days_before_records, issue.gap_days, issue.days_after_records], [1, 1, 0]);
        assert.match(issue.message, /reads a gap as no rain/);
    });

    test('a record that covers the period says nothing', () => {
        const result = check({
            'time.sim': TIME(0, 2020), 'pcp.cli': list('a.pcp'), 'weather-sta.cli': stations('a.pcp'),
            'a.pcp': weather(...daily(2020, 366)),
        }, CIO);
        assert.deepStrictEqual(result.issues, []);
        assert.strictEqual(stateOf(result, 'weather_coverage')!.state, 'ran');
    });

    test('a station on the generator is not a missing record', () => {
        const result = check({
            'time.sim': TIME(0, 2020), 'pcp.cli': list('a.pcp'), 'weather-sta.cli': stations('sim'), 'a.pcp': weather(),
        }, CIO);
        assert.deepStrictEqual(result.issues, []);
    });

    test('with no station file, every listed file counts', () => {
        const result = check({
            'time.sim': TIME(0, 2021), 'pcp.cli': list('a.pcp'), 'a.pcp': weather(...daily(2020, 366)),
        }, 'file.cio: t\nsimulation time.sim\nclimate pcp.cli');
        assert.strictEqual(issuesOf(result, 'weather_ends_early')[0].files, 1);
    });

    test('a weather file that cannot be read leaves the check partial, which rules out a pass', () => {
        const result = check({
            'time.sim': TIME(0, 2020), 'pcp.cli': list('gone.pcp'), 'weather-sta.cli': stations('gone.pcp'),
        }, CIO);
        const run = stateOf(result, 'weather_coverage')!;
        assert.strictEqual(run.state, 'partial');
        assert.match(run.reason!, /1 weather file\(s\) could not be read: gone\.pcp/);
        assert.notStrictEqual(result.status, 'pass');
    });
});

suite('check_inputs - crops that start as n', () => {
    const PLANT_INI = [
        'plant.ini: t', 'pcom_name plt_cnt rot_yr_ini plt_name lc_status',
        'alfa_comm 1 1', 'alfa n 1.0 1000.0 0.0 0.0 0.0 10000.0',
        'barl_comm 1 1', 'barl n 0.0 0.0 0.0 0.0 0.0 10000.0',
        'gras_comm 1 1', 'gras y 1.0 1000.0 0.0 0.0 0.0 10000.0',
    ].join('\n');
    const LANDUSE = ['landuse.lum: t', 'name plnt_com mgt',
        'alfa_lum alfa_comm alfa_rot', 'alfa_irr_lum alfa_comm alfa_irr',
        'barl_lum barl_comm barl_rot', 'gras_lum gras_comm null'].join('\n');
    const hru = (...uses: [string, number][]) => ['hru-data.hru: t', 'id name lu_mgt',
        ...uses.flatMap(([use, count]) => Array.from({ length: count }, (_, index) => `${index + 1} h${index} ${use}`))].join('\n');
    const SCHEDULES = ['management.sch: t', 'name ops autos',
        'alfa_rot 1 1', 'fert_test', 'harv 5 30 0.0 alfa hay 0',
        'alfa_irr 0 1', 'irr_opt',
        'barl_rot 0 1', 'pl_hv_winter1 barl'].join('\n');
    const CIO = 'file.cio: t\nhru hru-data.hru\nlum landuse.lum management.sch\ninit plant.ini';
    const base = (extra: Record<string, string> = {}) => ({
        'plant.ini': PLANT_INI, 'landuse.lum': LANDUSE, 'management.sch': SCHEDULES,
        'hru-data.hru': hru(['alfa_lum', 3], ['alfa_irr_lum', 2], ['barl_lum', 4], ['gras_lum', 5]), ...extra,
    });

    test('the files are walked the way SWAT+ walks them', () => {
        assert.deepStrictEqual(parseSchedules(SCHEDULES)!.map(item => [item.name, item.autos, item.ops]), [
            ['alfa_rot', [{ name: 'fert_test', crops: [] }], [{ op: 'harv', crop: 'alfa' }]],
            ['alfa_irr', [{ name: 'irr_opt', crops: [] }], []],
            ['barl_rot', [{ name: 'pl_hv_winter1', crops: ['barl'] }], []],
        ]);
        assert.deepStrictEqual(parsePlantCommunities(PLANT_INI)!.map(item => item.plants.map(plant => [plant.name, plant.growing, plant.line])),
            [[['alfa', 'n', 4]], [['barl', 'n', 6]], [['gras', 'y', 8]]]);
        assert.strictEqual(parseSchedules(['t', 'h', 'name 5 5', 'x'].join('\n')), null);
        assert.strictEqual(parsePlantCommunities(['t', 'h', 'name many'].join('\n')), null);
    });

    test('a crop nothing plants is a warning with its land uses and HRUs', () => {
        const result = check(base(), CIO);
        const issues = issuesOf(result, 'crop_never_planted');
        assert.deepStrictEqual(issues.map(item => [item.severity, item.crop, item.community, item.land_uses, item.schedules, item.hrus, item.line]), [
            ['warning', 'alfa', 'alfa_comm', ['alfa_lum', 'alfa_irr_lum'], ['alfa_rot', 'alfa_irr'], 5, 4],
        ]);
        assert.match(issues[0].message, /alfa \(alfa_comm\) starts as n and nothing plants it on 5 HRU\(s\)/);
    });

    test('a harvest is not a planting, but a plnt operation is', () => {
        const planted = SCHEDULES.replace('harv 5 30 0.0 alfa hay 0', 'plnt 4 1 0.0 alfa null 0');
        const issues = issuesOf(check(base({ 'management.sch': planted }), CIO), 'crop_never_planted');
        assert.deepStrictEqual(issues.map(item => [item.crop, item.land_uses, item.hrus]), [['alfa', ['alfa_irr_lum'], 2]]);
    });

    test('a decision table with a plant action plants it', () => {
        const tables = ['lum.dtl: t', '1', '', 'name conds alts acts', 'alfa_pl 0 1 1', 'var', 'act_typ',
            'plant hru 0 pl alfa 0.0 1.0 null y'].join('\n');
        const schedules = SCHEDULES.replaceAll('fert_test', 'alfa_pl').replaceAll('irr_opt', 'alfa_pl');
        const result = check(base({ 'management.sch': schedules, 'lum.dtl': tables }),
            `${CIO}\ndecision_table lum.dtl`);
        assert.deepStrictEqual(issuesOf(result, 'crop_never_planted'), []);
    });

    test('a generic table plants the crop on its schedule line, whatever its own option says', () => {
        const result = check(base(), CIO);
        assert.ok(!issuesOf(result, 'crop_never_planted').some(item => item.crop === 'barl'));
    });

    test('a crop no HRU uses does not matter', () => {
        const result = check(base({ 'hru-data.hru': hru(['barl_lum', 4]) }), CIO);
        assert.deepStrictEqual(issuesOf(result, 'crop_never_planted'), []);
    });

    test('a land use with no schedule plants nothing', () => {
        const landUse = LANDUSE.replace('alfa_lum alfa_comm alfa_rot', 'alfa_lum alfa_comm null');
        const issues = issuesOf(check(base({ 'landuse.lum': landUse }), CIO), 'crop_never_planted');
        assert.deepStrictEqual(issues[0].schedules, ['null', 'alfa_irr']);
    });

    test('the monsoon trigger starts a moisture_gro crop with no planting', () => {
        const monsoon = SCHEDULES.replace('harv 5 30 0.0 alfa hay 0', 'mons 6 1 0.0 null null 1');
        const landUse = LANDUSE.replace('alfa_irr_lum alfa_comm alfa_irr', 'alfa_irr_lum alfa_comm alfa_rot');
        const plants = ['plants.plt: t', 'name trig bm_e', 'alfa moisture_gro 20 0 0 row'].join('\n');
        const cio = `${CIO}\nhru_parm_db plants.plt`;
        const moisture = check(base({ 'management.sch': monsoon, 'landuse.lum': landUse, 'plants.plt': plants }), cio);
        assert.deepStrictEqual(issuesOf(moisture, 'crop_never_planted'), []);
        const temperature = check(base({
            'management.sch': monsoon, 'landuse.lum': landUse, 'plants.plt': plants.replace('moisture_gro', 'temp_gro'),
        }), cio);
        assert.strictEqual(issuesOf(temperature, 'crop_never_planted').length, 1);
    });

    test('a schedule file of another shape stops the check instead of guessing', () => {
        const result = check(base({ 'management.sch': ['t', 'h', 'alfa_rot many'].join('\n') }), CIO);
        assert.strictEqual(stateOf(result, 'plant_starts')!.state, 'skipped');
        assert.deepStrictEqual(issuesOf(result, 'crop_never_planted'), []);
    });
});

suite('check_inputs - layouts for the version that will run', () => {
    const cio = 'file.cio: t\nbasin parameters.bsn';
    const files = { 'parameters.bsn': ['t', 'h', '1 2 3 4 5'].join('\n') };

    test('layouts of another commit are named, and rule out a pass', () => {
        const result = check(files, cio, sourceFacts('', '', 'ffffffffffffffff'));
        const [issue] = issuesOf(result, 'layouts_not_for_source');
        assert.strictEqual(issue.severity, 'warning');
        assert.match(issue.message, /The layouts are from SWAT\+ 62\.0\.1 \(abc123def456\), not the source that will run \(ffffffffffff\)/);
        assert.strictEqual(result.coverage.complete, false);
        assert.strictEqual(result.status, 'inconclusive');
    });

    test('why no layouts were exported is part of that message', () => {
        const source = { ...sourceFacts('', '', 'ffffffffffffffff'), layoutsNote: 'Tamandua could not index it (swatplus-build)' };
        assert.match(issuesOf(check(files, cio, source), 'layouts_not_for_source')[0].message, /Tamandua could not index it/);
    });

    test('the same commit, shortened or not, is the same source', () => {
        assert.deepStrictEqual(issuesOf(check(files, cio, sourceFacts('', '', 'abc123def4')), 'layouts_not_for_source'), []);
        assert.strictEqual(check(files, cio, sourceFacts('', '', 'abc123def4567890')).status, 'pass');
    });

    test('a source with no commit to compare says nothing', () => {
        assert.deepStrictEqual(issuesOf(check(files, cio, sourceFacts('', '', null)), 'layouts_not_for_source'), []);
    });

    test('the result names the source and the bytes read', () => {
        const result = check(files, cio, sourceFacts('', ''));
        assert.deepStrictEqual(result.source, {
            dir: '/swatplus', commit: 'abc123def4567890',
            dtbl_lum_read: identity('dtbl_lum_read.f90'), actions: identity('actions.f90'),
        });
        assert.strictEqual(check(files, cio).source, null);
    });
});
