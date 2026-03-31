import * as assert from 'assert';
import { analyzeHeaderLine, getPhysicalColumnsForValidation, isAcceptedBooleanLiteral, resolveValidationLayout } from '../fileFormatUtils';
import type { SchemaColumn, SchemaTable } from '../indexer';

suite('File Format Header Analysis', () => {
    const irrOpsColumns: SchemaColumn[] = [
        {
            name: 'name',
            db_column: 'name',
            type: 'CharField',
            nullable: false,
            is_primary_key: false,
            is_foreign_key: false
        },
        {
            name: 'amt_mm',
            db_column: 'amt_mm',
            type: 'DoubleField',
            nullable: false,
            is_primary_key: false,
            is_foreign_key: false
        },
        {
            name: 'eff_frac',
            db_column: 'eff_frac',
            type: 'DoubleField',
            nullable: false,
            is_primary_key: false,
            is_foreign_key: false
        },
        {
            name: 'sumq_frac',
            db_column: 'sumq_frac',
            type: 'DoubleField',
            nullable: false,
            is_primary_key: false,
            is_foreign_key: false
        },
        {
            name: 'dep_sub',
            db_column: 'dep_sub',
            type: 'DoubleField',
            nullable: false,
            is_primary_key: false,
            is_foreign_key: false
        },
        {
            name: 'salt_ppm',
            db_column: 'salt_ppm',
            type: 'DoubleField',
            nullable: false,
            is_primary_key: false,
            is_foreign_key: false
        },
        {
            name: 'no3_ppm',
            db_column: 'no3_ppm',
            type: 'DoubleField',
            nullable: false,
            is_primary_key: false,
            is_foreign_key: false
        },
        {
            name: 'po4_ppm',
            db_column: 'po4_ppm',
            type: 'DoubleField',
            nullable: false,
            is_primary_key: false,
            is_foreign_key: false
        },
        {
            name: 'description',
            db_column: 'description',
            type: 'TextField',
            nullable: true,
            is_primary_key: false,
            is_foreign_key: false
        }
    ];

    const calibrationColumns: SchemaColumn[] = [
        {
            name: 'cal_parm',
            db_column: 'cal_parm',
            type: 'ForeignKeyField',
            nullable: false,
            is_primary_key: false,
            is_foreign_key: true,
            fk_target: {
                table: 'cal_parms_cal',
                column: 'id'
            }
        },
        {
            name: 'chg_typ',
            db_column: 'chg_typ',
            type: 'CharField',
            nullable: false,
            is_primary_key: false,
            is_foreign_key: false
        },
        {
            name: 'chg_val',
            db_column: 'chg_val',
            type: 'DoubleField',
            nullable: false,
            is_primary_key: false,
            is_foreign_key: false
        },
        {
            name: 'soil_lyr1',
            db_column: 'soil_lyr1',
            type: 'IntegerField',
            nullable: true,
            is_primary_key: false,
            is_foreign_key: false
        },
        {
            name: 'soil_lyr2',
            db_column: 'soil_lyr2',
            type: 'IntegerField',
            nullable: true,
            is_primary_key: false,
            is_foreign_key: false
        },
        {
            name: 'yr1',
            db_column: 'yr1',
            type: 'IntegerField',
            nullable: true,
            is_primary_key: false,
            is_foreign_key: false
        },
        {
            name: 'yr2',
            db_column: 'yr2',
            type: 'IntegerField',
            nullable: true,
            is_primary_key: false,
            is_foreign_key: false
        },
        {
            name: 'day1',
            db_column: 'day1',
            type: 'IntegerField',
            nullable: true,
            is_primary_key: false,
            is_foreign_key: false
        },
        {
            name: 'day2',
            db_column: 'day2',
            type: 'IntegerField',
            nullable: true,
            is_primary_key: false,
            is_foreign_key: false
        }
    ];

    const codesColumns: SchemaColumn[] = [
        {
            name: 'landscape',
            db_column: 'landscape',
            type: 'BooleanField',
            nullable: false,
            is_primary_key: false,
            is_foreign_key: false
        },
        {
            name: 'hyd',
            db_column: 'hyd',
            type: 'CharField',
            nullable: false,
            is_primary_key: false,
            is_foreign_key: false
        },
        {
            name: 'plnt',
            db_column: 'plnt',
            type: 'BooleanField',
            nullable: false,
            is_primary_key: false,
            is_foreign_key: false
        },
        {
            name: 'sed',
            db_column: 'sed',
            type: 'BooleanField',
            nullable: false,
            is_primary_key: false,
            is_foreign_key: false
        },
        {
            name: 'nut',
            db_column: 'nut',
            type: 'BooleanField',
            nullable: false,
            is_primary_key: false,
            is_foreign_key: false
        },
        {
            name: 'ch_sed',
            db_column: 'ch_sed',
            type: 'BooleanField',
            nullable: false,
            is_primary_key: false,
            is_foreign_key: false
        },
        {
            name: 'ch_nut',
            db_column: 'ch_nut',
            type: 'BooleanField',
            nullable: false,
            is_primary_key: false,
            is_foreign_key: false
        },
        {
            name: 'res',
            db_column: 'res',
            type: 'BooleanField',
            nullable: false,
            is_primary_key: false,
            is_foreign_key: false
        }
    ];

    test('treats blank header line as missing header', () => {
        const result = analyzeHeaderLine('', irrOpsColumns, ['null', '0', '']);
        assert.strictEqual(result.kind, 'missing_header_line');
    });

    test('treats shifted data row as missing header instead of mismatch', () => {
        const result = analyzeHeaderLine(
            'irr_dry 25.0 0.85 0.15 10.0 0.0 0.0 0.0 sprinkler',
            irrOpsColumns,
            ['null', '0', '']
        );

        assert.strictEqual(result.kind, 'missing_header_line');
    });

    test('keeps true header mistakes as header mismatch', () => {
        const result = analyzeHeaderLine(
            'foo bar baz qux quux corge grault garply waldo',
            irrOpsColumns,
            ['null', '0', '']
        );

        assert.strictEqual(result.kind, 'header_column_mismatch');
    });

    test('accepts a valid header line', () => {
        const result = analyzeHeaderLine(
            'name amt_mm eff_frac sumq_frac dep_sub salt_ppm no3_ppm po4_ppm description',
            irrOpsColumns,
            ['null', '0', '']
        );

        assert.strictEqual(result.kind, null);
    });

    test('accepts calibration.cal header aliases and ignores extra columns', () => {
        const result = analyzeHeaderLine(
            'NAME CHG_TYPE VAL CONDS LYR1 LYR2 YEAR1 YEAR2 DAY1 DAY2 OBJ_TOT',
            calibrationColumns,
            ['null', '0', ''],
            'calibration.cal'
        );

        assert.strictEqual(result.kind, null);
        assert.strictEqual(result.matchedExpectedCount, calibrationColumns.length);
    });

    test('resolves count-prefixed calibration.cal headers before validating rows', () => {
        const table: SchemaTable = {
            file_name: 'calibration.cal',
            table_name: 'calibration_cal',
            model_class: 'project.change.Calibration_cal',
            has_metadata_line: true,
            has_header_line: true,
            data_starts_after: 2,
            columns: calibrationColumns,
            primary_keys: ['id'],
            foreign_keys: [
                {
                    column: 'cal_parm',
                    db_column: 'cal_parm_id',
                    references: {
                        table: 'cal_parms_cal',
                        column: 'id'
                    }
                }
            ],
            notes: ''
        };

        const rawLines = [
            'calibration.cal (modified calibration decision table)',
            '189',
            'NAME CHG_TYPE VAL CONDS LYR1 LYR2 YEAR1 YEAR2 DAY1 DAY2 OBJ_TOT',
            'alpha absval 0.001 0 0 0 0 0 0 0 0'
        ];

        const layout = resolveValidationLayout(rawLines, table, calibrationColumns, ['null', '0', '']);
        const rowValues = rawLines[layout.dataStartLineIdx].split(/\s+/);

        assert.strictEqual(layout.headerLineIdx, 2);
        assert.strictEqual(layout.dataStartLineIdx, 3);
        assert.strictEqual(layout.headerAnalysis?.kind, null);
        assert.strictEqual(layout.columnPositions.get('cal_parm'), 0);
        assert.strictEqual(layout.columnPositions.get('chg_val'), 2);
        assert.strictEqual(layout.columnPositions.get('soil_lyr1'), 4);
        assert.strictEqual(layout.columnPositions.get('day2'), 9);
        assert.strictEqual(rowValues[layout.columnPositions.get('soil_lyr1')!], '0');
    });

    test('accepts codes.sft header aliases', () => {
        const result = analyzeHeaderLine(
            'LANDSCAPE_YN HYD_YN PLNT_YN SED_YN NUT_YN CH_SED_YN CH_NUT_YN RES_YN',
            codesColumns,
            ['null', '0', ''],
            'codes.sft'
        );

        assert.strictEqual(result.kind, null);
        assert.strictEqual(result.matchedExpectedCount, codesColumns.length);
    });

    test('accepts y and n as valid boolean literals', () => {
        assert.strictEqual(isAcceptedBooleanLiteral('y', ['null', '0', '']), true);
        assert.strictEqual(isAcceptedBooleanLiteral('n', ['null', '0', '']), true);
        assert.strictEqual(isAcceptedBooleanLiteral('maybe', ['null', '0', '']), false);
    });

    test('keeps physical id columns when metadata marks them as real file columns', () => {
        const table: SchemaTable = {
            file_name: 'aquifer.aqu',
            table_name: 'aquifer_aqu',
            model_class: 'project.aquifer.Aquifer_aqu',
            has_metadata_line: true,
            has_header_line: true,
            data_starts_after: 2,
            columns: [
                {
                    name: 'id',
                    db_column: 'id',
                    type: 'AutoField',
                    nullable: false,
                    is_primary_key: true,
                    is_foreign_key: false
                },
                {
                    name: 'name',
                    db_column: 'name',
                    type: 'CharField',
                    nullable: false,
                    is_primary_key: false,
                    is_foreign_key: false
                },
                {
                    name: 'init',
                    db_column: 'init',
                    type: 'ForeignKeyField',
                    nullable: true,
                    is_primary_key: false,
                    is_foreign_key: true,
                    fk_target: {
                        table: 'initial_aqu',
                        column: 'id'
                    }
                },
                {
                    name: 'gw_flo',
                    db_column: 'gw_flo',
                    type: 'DoubleField',
                    nullable: false,
                    is_primary_key: false,
                    is_foreign_key: false
                }
            ],
            primary_keys: ['id'],
            foreign_keys: [
                {
                    column: 'init',
                    db_column: 'init_id',
                    references: {
                        table: 'initial_aqu',
                        column: 'id'
                    }
                }
            ],
            notes: ''
        };

        const physicalColumns = getPhysicalColumnsForValidation(table, {
            file_metadata: {
                'aquifer.aqu': {
                    primary_keys: ['id']
                }
            }
        });

        assert.deepStrictEqual(
            physicalColumns.map(column => column.name),
            ['id', 'name', 'init', 'gw_flo']
        );
    });
});
