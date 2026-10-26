import * as assert from 'assert';
import {
    checkDatasetFolder,
    describeSelectorFailure,
    interpretSelectorAnswer,
    normalizeDatasetInput,
    SELECTOR_COMMAND,
    SELECTOR_EXTENSION_ID,
    selectorAvailable
} from '../datasetSource';

suite('Dataset source', () => {
    test('talks to Dataset Selector by the id and command it registers', () => {
        assert.strictEqual(SELECTOR_EXTENSION_ID, 'PbsandtDev.swat-dataset-selector');
        assert.strictEqual(SELECTOR_COMMAND, 'swat-dataset-selector.getDatasetFolder');
    });

    test('offers the Dataset Selector button when the command exists or the extension is installed', () => {
        assert.strictEqual(selectorAvailable({ extensionInstalled: false, commandRegistered: false }), false);
        assert.strictEqual(selectorAvailable({ extensionInstalled: true, commandRegistered: false }), true);
        assert.strictEqual(selectorAvailable({ extensionInstalled: false, commandRegistered: true }), true);
        assert.strictEqual(selectorAvailable({ extensionInstalled: true, commandRegistered: true }), true);
    });

    test('a folder from the command is the dataset; anything else says nothing is selected', () => {
        assert.deepStrictEqual(interpretSelectorAnswer('C:\\Data\\02070009'), { path: 'C:\\Data\\02070009' });
        assert.deepStrictEqual(interpretSelectorAnswer('  /data/ds  '), { path: '/data/ds' });
        for (const nothing of [undefined, null, '', '   ', 42, {}]) {
            const answer = interpretSelectorAnswer(nothing);
            assert.ok('message' in answer && /no dataset selected/.test(answer.message), String(nothing));
        }
    });

    test('a command that cannot be run is described with its reason', () => {
        assert.match(describeSelectorFailure(new Error('command not found')), /Could not ask SWAT\+ Dataset Selector.*command not found/);
        assert.match(describeSelectorFailure('boom'), /boom/);
    });

    test('pasted paths lose their whitespace and the quotes "copy as path" adds', () => {
        assert.strictEqual(normalizeDatasetInput('  C:\\Data\\x  '), 'C:\\Data\\x');
        assert.strictEqual(normalizeDatasetInput('"C:\\Data\\x"'), 'C:\\Data\\x');
        assert.strictEqual(normalizeDatasetInput(' "C:\\My Data\\x" '), 'C:\\My Data\\x');
        assert.strictEqual(normalizeDatasetInput(''), '');
    });

    test('a lower-case Windows drive letter, as the Explorer gives it, is written as C:', () => {
        assert.strictEqual(normalizeDatasetInput('c:\\Users\\x\\02070009', 'win32'), 'C:\\Users\\x\\02070009');
        assert.strictEqual(normalizeDatasetInput('C:\\Users\\x', 'win32'), 'C:\\Users\\x');
        assert.strictEqual(normalizeDatasetInput('\\\\server\\share\\x', 'win32'), '\\\\server\\share\\x');
        assert.strictEqual(normalizeDatasetInput('/data/a:b', 'linux'), '/data/a:b');
        assert.strictEqual(normalizeDatasetInput('c:/data', 'linux'), 'c:/data');
    });

    suite('checkDatasetFolder', () => {
        const dirs = new Set(['C:\\d\\a', 'C:\\d\\b', 'C:\\d\\b\\TxtInOut', 'C:\\d\\empty']);
        const files = new Set(['C:\\d\\a\\file.cio', 'C:\\d\\b\\TxtInOut\\file.cio']);
        const fs = { isDirectory: (p: string) => dirs.has(p), isFile: (p: string) => files.has(p) };
        const check = (input: string) => checkDatasetFolder(input, fs, 'win32');

        test('accepts a folder with file.cio', () => {
            assert.deepStrictEqual(check('C:\\d\\a'), { ok: true, picked: 'C:\\d\\a', txtInOut: 'C:\\d\\a' });
        });

        test('accepts the parent of a TxtInOut folder and says which folder holds the files', () => {
            assert.deepStrictEqual(check('"C:\\d\\b"'), { ok: true, picked: 'C:\\d\\b', txtInOut: 'C:\\d\\b\\TxtInOut' });
        });

        test('says what is wrong with anything else', () => {
            assert.deepStrictEqual(check(''), { ok: false, error: 'Choose the dataset folder (the one with file.cio).' });
            assert.deepStrictEqual(check('C:\\d\\nope'), { ok: false, error: 'Folder not found: C:\\d\\nope' });
            assert.deepStrictEqual(check('C:\\d\\empty'), {
                ok: false,
                error: 'No file.cio in C:\\d\\empty or in its TxtInOut subfolder.'
            });
        });
    });
});
