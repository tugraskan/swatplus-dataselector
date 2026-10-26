import * as assert from 'assert';
import {
    buildHruProcessorArgs,
    describeHruSubsetWorkarounds,
    summarizeHruSubsetWorkarounds
} from '../hruProcessorOptions';

suite('HRU processor options', () => {
    const base = { datasetPath: 'C:/data/02070009', hruIds: '1532,1538', keepRouting: false, runSwat: false };

    test('passes no workaround flag by default, so the CLI defaults apply', () => {
        assert.deepStrictEqual(buildHruProcessorArgs(base), [
            '--dataset', 'C:/data/02070009', '--hru-ids', '1532,1538'
        ]);
        assert.deepStrictEqual(buildHruProcessorArgs({ ...base, keepRouting: true }), [
            '--dataset', 'C:/data/02070009', '--hru-ids', '1532,1538', '--keep-routing'
        ]);
    });

    test('each switch becomes its flag', () => {
        const args = buildHruProcessorArgs({
            ...base,
            keepRouting: true,
            exactHrus: true,
            keepWetlandFile: true,
            mainCompat: true,
            noOutputs: true,
            runSwat: true,
            executablePath: 'C:/swat/swatplus.exe'
        });
        assert.deepStrictEqual(args.slice(4), [
            '--keep-routing', '--exact-hrus', '--keep-wetland-file', '--main-compat', '--no-outputs',
            '--run-swat', '--exe', 'C:/swat/swatplus.exe'
        ]);
    });

    test('--exact-hrus is only passed while routing is kept', () => {
        assert.ok(!buildHruProcessorArgs({ ...base, exactHrus: true }).includes('--exact-hrus'));
    });

    test('false switches add nothing', () => {
        const args = buildHruProcessorArgs({
            ...base, keepRouting: true, exactHrus: false, keepWetlandFile: false, mainCompat: false, noOutputs: false
        });
        assert.deepStrictEqual(args.slice(4), ['--keep-routing']);
    });

    test('describes the added feeder HRUs and the applied workarounds', () => {
        const lines = describeHruSubsetWorkarounds({
            added_hru_ids: [
                { hru_id: 1802, reason: 'channel 404 had only channel inflows' },
                { hru_id: 2891, reason: 'channel 608 had only channel inflows' }
            ],
            workarounds_applied: ['W1', 'W2']
        });
        assert.deepStrictEqual(lines, [
            'Added feeder HRU 1802: channel 404 had only channel inflows',
            'Added feeder HRU 2891: channel 608 had only channel inflows',
            'Workarounds applied: W1 (feeder HRUs), W2 (compact hydrology.wet). See scripts/SWAT_WORKAROUNDS.md.'
        ]);
    });

    test('a result with nothing added or applied has nothing to say', () => {
        assert.deepStrictEqual(describeHruSubsetWorkarounds({}), []);
        assert.strictEqual(summarizeHruSubsetWorkarounds({ added_hru_ids: [], workarounds_applied: [] }), '');
    });

    test('summarizes for the notification', () => {
        assert.strictEqual(
            summarizeHruSubsetWorkarounds({
                added_hru_ids: [{ hru_id: 1802, reason: 'x' }],
                workarounds_applied: ['W1', 'W3']
            }),
            'Added feeder HRU 1802. Workarounds: W1, W3.'
        );
        assert.strictEqual(
            summarizeHruSubsetWorkarounds({
                added_hru_ids: [{ hru_id: 1, reason: 'x' }, { hru_id: 2, reason: 'y' }]
            }),
            'Added feeder HRUs 1, 2.'
        );
    });

    test('unknown workaround ids are listed as they are', () => {
        assert.deepStrictEqual(describeHruSubsetWorkarounds({ workarounds_applied: ['W9'] }), [
            'Workarounds applied: W9. See scripts/SWAT_WORKAROUNDS.md.'
        ]);
    });
});
