import * as assert from 'assert';
import {
    buildPlanArgs,
    buildSubsetArgs,
    DEFAULT_OPTIONS,
    isOptionEnabled,
    OPTION_CHOICES,
    sanitizeOptions
} from '../options';

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
        // And the panel starts with exactly those on.
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

    test('a plan passes the same switches as a run, and no output folder', () => {
        const options = { keepRouting: true, feederHrus: false, alignWetlands: false, mainCompat: true, noOutputs: true };
        const plan = buildPlanArgs({ datasetPath: base.datasetPath, hruIds: base.hruIds, options });
        const run = buildSubsetArgs({ ...base, options });
        assert.deepStrictEqual(plan, [
            '--dataset', base.datasetPath, '--hru-ids', base.hruIds, '--plan',
            '--keep-routing', '--exact-hrus', '--keep-wetland-file', '--main-compat', '--no-outputs'
        ]);
        assert.ok(!plan.includes('--output-dir'));
        // After the dataset and the ids, a plan and a run carry the same flags.
        assert.deepStrictEqual(plan.slice(5), run.slice(6));
    });

    test('the defaults give a plan with no workaround flag', () => {
        assert.deepStrictEqual(buildPlanArgs({ datasetPath: 'D', hruIds: '1', options: DEFAULT_OPTIONS }), [
            '--dataset', 'D', '--hru-ids', '1', '--plan'
        ]);
    });

    test('the panel lists the five controls in order, with help and the flag each maps to', () => {
        assert.deepStrictEqual(OPTION_CHOICES.map(choice => choice.key), [
            'keepRouting', 'feederHrus', 'alignWetlands', 'mainCompat', 'noOutputs'
        ]);
        assert.deepStrictEqual(OPTION_CHOICES.map(choice => choice.tag), [undefined, 'W1', 'W2', 'W3', 'W4']);
        for (const choice of OPTION_CHOICES) {
            assert.ok(choice.help.length > 20, `${choice.key} has help text`);
            assert.ok(choice.flag.startsWith('--'));
        }
        // The flag is passed when W1 and W2 are OFF, and when keep routing, W3 and W4 are ON.
        assert.deepStrictEqual(OPTION_CHOICES.map(choice => choice.flagWhen), ['on', 'off', 'off', 'on', 'on']);
    });

    test('feeder HRUs can be changed only while routing is kept', () => {
        assert.strictEqual(isOptionEnabled('feederHrus', DEFAULT_OPTIONS), false);
        assert.strictEqual(isOptionEnabled('feederHrus', { ...DEFAULT_OPTIONS, keepRouting: true }), true);
        for (const key of ['keepRouting', 'alignWetlands', 'mainCompat', 'noOutputs'] as const) {
            assert.strictEqual(isOptionEnabled(key, DEFAULT_OPTIONS), true);
        }
    });

    test('stored or posted options fall back to the defaults for anything that is not a boolean', () => {
        assert.deepStrictEqual(sanitizeOptions(undefined), DEFAULT_OPTIONS);
        assert.deepStrictEqual(sanitizeOptions('x'), DEFAULT_OPTIONS);
        assert.deepStrictEqual(
            sanitizeOptions({ keepRouting: true, feederHrus: 'no', alignWetlands: false, extra: 1 }),
            { keepRouting: true, feederHrus: true, alignWetlands: false, mainCompat: false, noOutputs: false }
        );
    });
});
