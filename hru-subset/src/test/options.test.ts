import * as assert from 'assert';
import { buildSubsetArgs, DEFAULT_OPTIONS, OPTION_CHOICES, optionsFromPicked, OptionKey } from '../options';

suite('Subset options', () => {
    const base = { datasetPath: 'C:\\Data\\02070009', hruIds: '1532,1538', outputDir: 'C:\\Data\\02070009_subset_x' };

    test('the defaults are the CLI defaults', () => {
        assert.deepStrictEqual(DEFAULT_OPTIONS, {
            keepRouting: false,
            feederHrus: true,
            alignWetlands: true,
            mainCompat: false,
            noOutputs: false
        });
        // And the quick pick starts with exactly those ticked.
        const ticked = OPTION_CHOICES.filter(choice => DEFAULT_OPTIONS[choice.key]).map(choice => choice.key);
        assert.deepStrictEqual(ticked, ['feederHrus', 'alignWetlands']);
    });

    test('the defaults add no workaround flag', () => {
        assert.deepStrictEqual(buildSubsetArgs({ ...base, options: DEFAULT_OPTIONS }), [
            '--dataset', 'C:\\Data\\02070009', '--hru-ids', '1532,1538', '--output-dir', 'C:\\Data\\02070009_subset_x'
        ]);
    });

    test('always passes --output-dir, and never --overwrite or --run-swat', () => {
        for (const keepRouting of [false, true]) {
            const args = buildSubsetArgs({
                ...base,
                options: { keepRouting, feederHrus: false, alignWetlands: false, mainCompat: true, noOutputs: true }
            });
            assert.strictEqual(args[args.indexOf('--output-dir') + 1], base.outputDir);
            assert.ok(!args.includes('--overwrite') && !args.includes('--run-swat') && !args.includes('--exe'));
        }
    });

    test('refuses an empty output folder', () => {
        assert.throws(() => buildSubsetArgs({ ...base, outputDir: '  ', options: DEFAULT_OPTIONS }), /output folder is required/);
    });

    test('keep routing adds --keep-routing; unticking feeder HRUs adds --exact-hrus', () => {
        assert.deepStrictEqual(
            buildSubsetArgs({ ...base, options: { ...DEFAULT_OPTIONS, keepRouting: true } }).slice(6),
            ['--keep-routing']
        );
        assert.deepStrictEqual(
            buildSubsetArgs({ ...base, options: { ...DEFAULT_OPTIONS, keepRouting: true, feederHrus: false } }).slice(6),
            ['--keep-routing', '--exact-hrus']
        );
    });

    test('--exact-hrus only means something with keep routing', () => {
        const args = buildSubsetArgs({ ...base, options: { ...DEFAULT_OPTIONS, feederHrus: false } });
        assert.ok(!args.includes('--exact-hrus'));
    });

    test('each remaining switch maps to its flag', () => {
        assert.deepStrictEqual(
            buildSubsetArgs({ ...base, options: { ...DEFAULT_OPTIONS, alignWetlands: false } }).slice(6),
            ['--keep-wetland-file']
        );
        assert.deepStrictEqual(
            buildSubsetArgs({ ...base, options: { ...DEFAULT_OPTIONS, mainCompat: true } }).slice(6),
            ['--main-compat']
        );
        assert.deepStrictEqual(
            buildSubsetArgs({ ...base, options: { ...DEFAULT_OPTIONS, noOutputs: true } }).slice(6),
            ['--no-outputs']
        );
    });

    test('builds options from the ticked quick-pick keys', () => {
        const picked = new Set<OptionKey>(['keepRouting', 'alignWetlands', 'noOutputs']);
        assert.deepStrictEqual(optionsFromPicked(picked), {
            keepRouting: true,
            feederHrus: false,
            alignWetlands: true,
            mainCompat: false,
            noOutputs: true
        });
        assert.deepStrictEqual(Object.keys(optionsFromPicked(new Set())).sort(), Object.keys(DEFAULT_OPTIONS).sort());
    });
});
