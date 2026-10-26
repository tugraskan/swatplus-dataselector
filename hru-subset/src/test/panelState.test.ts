import * as assert from 'assert';
import { DEFAULT_OPTIONS } from '../options';
import { checkIds, checkOutputFolder, planKey, previewWaitingReason, readiness } from '../panelState';

suite('Panel state', () => {
    suite('HRU ids', () => {
        const range = { min: 1, max: 4222 };

        test('nothing typed yet is not shown as an error but cannot be used', () => {
            assert.deepStrictEqual(checkIds('', range), { valid: false });
            assert.deepStrictEqual(checkIds('   ', range), { valid: false });
        });

        test('accepts single ids and ranges inside the dataset range', () => {
            assert.deepStrictEqual(checkIds('1532,1538,3978', range), { valid: true });
            assert.deepStrictEqual(checkIds('1,4-6,10', range), { valid: true });
        });

        test('says why text is wrong, as the Dataset Selector panel did', () => {
            assert.strictEqual(checkIds('abc', range).error, 'Invalid HRU ID: abc');
            assert.strictEqual(checkIds('1,,2', range).error, 'Remove empty comma-separated entries.');
            assert.strictEqual(checkIds('6-4', range).error, 'Range start must be <= end: 6-4');
            assert.strictEqual(checkIds('0', range).error, 'HRU IDs must be positive integers: 0');
            assert.strictEqual(checkIds('4000-5000', range).error, "4000-5000 is outside the dataset's HRU range 1-4222.");
        });

        test('without a dataset only the format is checked', () => {
            assert.deepStrictEqual(checkIds('99999', undefined), { valid: true });
            assert.strictEqual(checkIds('x', undefined).valid, false);
        });
    });

    suite('output folder', () => {
        const folders = ['C:\\Data\\02070009'];
        const env = (existing: string[] = [], real: Record<string, string> = {}) => ({
            exists: (p: string) => existing.includes(p),
            realpath: (p: string) => real[p],
            platform: 'win32' as const
        });

        test('an empty box and a relative path are refused', () => {
            assert.strictEqual(checkOutputFolder('', folders, env()).error, 'Choose where to create the subset.');
            assert.match(checkOutputFolder('subset', folders, env()).error ?? '', /full path/);
        });

        test('a sibling of the dataset is fine', () => {
            const check = checkOutputFolder('C:\\Data\\02070009_subset_20260905_070809', folders, env());
            assert.strictEqual(check.error, undefined);
            assert.strictEqual(check.folder, 'C:\\Data\\02070009_subset_20260905_070809');
            assert.strictEqual(check.note, undefined);
        });

        test('a folder inside the dataset, or the dataset itself, is refused', () => {
            for (const bad of ['C:\\Data\\02070009\\multi', 'C:\\Data\\02070009', 'c:\\data\\02070009\\x']) {
                const check = checkOutputFolder(bad, folders, env());
                assert.match(check.error ?? '', /must not be inside the dataset folder/, bad);
            }
        });

        test('a folder that would contain the dataset is refused', () => {
            assert.match(checkOutputFolder('C:\\Data', folders, env()).error ?? '', /would contain the dataset folder/);
        });

        test('a link into the dataset is caught after the links are resolved', () => {
            const check = checkOutputFolder('C:\\Elsewhere\\link\\out', folders, env([], {
                'C:\\Elsewhere\\link': 'C:\\Data\\02070009'
            }));
            assert.match(check.error ?? '', /must not be inside the dataset folder/);
        });

        test('a folder that already exists is not refused: the first free numbered name is used', () => {
            const check = checkOutputFolder('C:\\Data\\x_subset', folders, env(['C:\\Data\\x_subset', 'C:\\Data\\x_subset_2']));
            assert.strictEqual(check.error, undefined);
            assert.strictEqual(check.folder, 'C:\\Data\\x_subset_3');
            assert.match(check.note ?? '', /x_subset already exists.*x_subset_3/);
        });

        test('with no dataset yet only the shape of the path is checked', () => {
            assert.strictEqual(checkOutputFolder('C:\\anything', [], env()).error, undefined);
        });
    });

    suite('which buttons are live', () => {
        const ready = { datasetReady: true, pythonOk: true, idsValid: true, outputOk: true, options: { ...DEFAULT_OPTIONS, keepRouting: true }, busy: false };

        test('everything in place: pick, preview and create', () => {
            assert.deepStrictEqual(readiness(ready), { canPick: true, canPreview: true, canCreate: true });
        });

        test('preview needs keep routing; create does not', () => {
            assert.deepStrictEqual(readiness({ ...ready, options: DEFAULT_OPTIONS }), { canPick: true, canPreview: false, canCreate: true });
        });

        test('no dataset, no Python or a run in progress turns everything off', () => {
            for (const off of [{ datasetReady: false }, { pythonOk: false }, { busy: true }]) {
                assert.deepStrictEqual(readiness({ ...ready, ...off }), { canPick: false, canPreview: false, canCreate: false });
            }
        });

        test('bad ids keep preview and create off but not the picker', () => {
            assert.deepStrictEqual(readiness({ ...ready, idsValid: false }), { canPick: true, canPreview: false, canCreate: false });
        });

        test('a refused output folder keeps only create off', () => {
            assert.deepStrictEqual(readiness({ ...ready, outputOk: false }), { canPick: true, canPreview: true, canCreate: false });
        });
    });

    test('the preview says what is missing', () => {
        assert.match(previewWaitingReason({ datasetReady: false, idsText: '', idsValid: false }), /Choose a dataset/);
        assert.match(previewWaitingReason({ datasetReady: true, idsText: '', idsValid: false }), /Enter HRU IDs/);
        assert.match(previewWaitingReason({ datasetReady: true, idsText: 'x', idsValid: false }), /Fix the HRU IDs/);
    });

    test('a plan is reused only for the same dataset, ids and options', () => {
        const options = { ...DEFAULT_OPTIONS, keepRouting: true };
        const key = planKey('D', '1,2', options);
        assert.strictEqual(planKey('D', '1,2', { ...options }), key);
        assert.notStrictEqual(planKey('E', '1,2', options), key);
        assert.notStrictEqual(planKey('D', '1,3', options), key);
        assert.notStrictEqual(planKey('D', '1,2', { ...options, feederHrus: false }), key);
        assert.notStrictEqual(planKey('D', '1,2', { ...options, noOutputs: true }), key);
    });
});
