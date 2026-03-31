import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseOutputFileToDataFrame } from '../outputDataFrameUtils';

function fixedWidthLine(values: string[], widths: number[], align: 'left' | 'right' = 'left'): string {
    return values
        .map((value, index) => {
            const width = widths[index] ?? Math.max(value.length + 2, 8);
            return align === 'right'
                ? value.padStart(width)
                : value.padEnd(width);
        })
        .join('');
}

suite('Output DataFrame Utils', () => {
    let tempDir: string;

    setup(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swat-output-df-'));
    });

    teardown(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('parses structured output with units row', () => {
        const filePath = path.join(tempDir, 'channel.out');
        fs.writeFileSync(filePath, [
            'Channel summary',
            'DAY FLOW SED',
            'day m3/s t',
            '1 2.5 0.7',
            '2 3.1 0.8'
        ].join('\n'), 'utf-8');

        const parsed = parseOutputFileToDataFrame(filePath);

        assert.strictEqual(parsed.parserKind, 'structured_text');
        assert.strictEqual(parsed.title, 'Channel summary');
        assert.deepStrictEqual(parsed.columns, ['DAY', 'FLOW', 'SED']);
        assert.deepStrictEqual(parsed.units, ['day', 'm3/s', 't']);
        assert.strictEqual(parsed.totalRowCount, 2);
        assert.deepStrictEqual(parsed.rows[0], ['1', '2.5', '0.7']);
    });

    test('parses csv output with quoted values', () => {
        const filePath = path.join(tempDir, 'summary.csv');
        fs.writeFileSync(filePath, [
            'day,label,flow',
            '1,"reach, upper",2.5',
            '2,"reach, lower",3.1'
        ].join('\n'), 'utf-8');

        const parsed = parseOutputFileToDataFrame(filePath, 1);

        assert.strictEqual(parsed.parserKind, 'csv');
        assert.strictEqual(parsed.title, 'summary.csv');
        assert.deepStrictEqual(parsed.columns, ['day', 'label', 'flow']);
        assert.strictEqual(parsed.totalRowCount, 2);
        assert.strictEqual(parsed.previewRowCount, 1);
        assert.strictEqual(parsed.truncated, true);
        assert.deepStrictEqual(parsed.rows[0], ['1', 'reach, upper', '2.5']);
    });

    test('detects header after a SWAT banner line', () => {
        const filePath = path.join(tempDir, 'crop_yld_aa.txt');
        fs.writeFileSync(filePath, [
            'demo                      SWAT+ 2026-03-31        MODULAR Rev 2026.61.0.2.5-743-g5be4e4f',
            '                                                                            --YIELD (kg/ha)--',
            '  jday   mon   day    yr    unit PLANTNM                         MASS          C           N           P',
            '   366    12    31  2020       1    corn                                              214.862      96.688       1.866       0.344',
            '   366    12    31  2020       1    soyb                                                0.000       0.000       0.000       0.000'
        ].join('\n'), 'utf-8');

        const parsed = parseOutputFileToDataFrame(filePath);

        assert.strictEqual(parsed.parserKind, 'structured_text');
        assert.match(parsed.title, /--YIELD \(kg\/ha\)--/);
        assert.deepStrictEqual(parsed.columns, ['jday', 'mon', 'day', 'yr', 'unit', 'PLANTNM', 'MASS', 'C', 'N', 'P']);
        assert.strictEqual(parsed.units, null);
        assert.strictEqual(parsed.totalRowCount, 2);
        assert.deepStrictEqual(parsed.rows[0], ['366', '12', '31', '2020', '1', 'corn', '214.862', '96.688', '1.866', '0.344']);
    });

    test('keeps headers when units row has blank unit columns', () => {
        const filePath = path.join(tempDir, 'hru_ls_yr.txt');
        const widths = [7, 6, 6, 7, 7, 10, 12, 10, 10];
        fs.writeFileSync(filePath, [
            'ceap_03010103 SWAT+ 2026-03-30 MODULAR Rev 2026.61.0.2.11-79-g71d40e6',
            fixedWidthLine(['jday', 'mon', 'day', 'yr', 'unit', 'gis_id', 'name', 'sedyld', 'sedorgn'], widths),
            fixedWidthLine(['', '', '', '', '', '', '', 't/ha', 'kg/ha'], widths),
            fixedWidthLine(['366', '12', '31', '2000', '1', '175195', 'corn', '3.388', '28.543'], widths, 'right')
        ].join('\n'), 'utf-8');

        const parsed = parseOutputFileToDataFrame(filePath);

        assert.strictEqual(parsed.title, 'ceap_03010103 SWAT+ 2026-03-30 MODULAR Rev 2026.61.0.2.11-79-g71d40e6');
        assert.deepStrictEqual(parsed.columns, ['jday', 'mon', 'day', 'yr', 'unit', 'gis_id', 'name', 'sedyld', 'sedorgn']);
        assert.deepStrictEqual(parsed.units, ['', '', '', '', '', '', '', 't/ha', 'kg/ha']);
        assert.deepStrictEqual(parsed.rows[0], ['366', '12', '31', '2000', '1', '175195', 'corn', '3.388', '28.543']);
    });

    test('splits centered fixed-width headers without merging adjacent data columns', () => {
        const filePath = path.join(tempDir, 'hru_plcarb_aa.txt');
        fs.writeFileSync(filePath, [
            ' demo                      SWAT+ 2026-03-31        MODULAR Rev 2026.61.0.2.5-743-g5be4e4f                 ',
            '        jday        mon        day         yr            unit              gis_id     name                  npp_c         harv_c         drop_c      grazeat_c         emit_c',
            '                                                                                                          kg C/ha        kg C/ha        kg C/ha        kg C/ha        kg C/ha',
            '         366          12          31        2020           1                     1 hru0001            247.8831       92.41814      0.0000000E+00   107.1007      0.0000000E+00  0.0000000E+00'
        ].join('\n'), 'utf-8');

        const parsed = parseOutputFileToDataFrame(filePath);

        assert.deepStrictEqual(parsed.columns, ['jday', 'mon', 'day', 'yr', 'unit', 'gis_id', 'name', 'npp_c', 'harv_c', 'drop_c', 'grazeat_c', 'emit_c']);
        assert.deepStrictEqual(parsed.units, ['', '', '', '', '', '', '', 'kg C/ha', 'kg C/ha', 'kg C/ha', 'kg C/ha', 'kg C/ha']);
        assert.deepStrictEqual(parsed.rows[0], ['366', '12', '31', '2020', '1', '1', 'hru0001', '247.8831', '92.41814', '0.0000000E+00', '107.1007', '0.0000000E+00 0.0000000E+00']);
    });
});
