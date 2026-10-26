import * as assert from 'assert';
import {
    describeSubsetDetection,
    detectSubsetFolder,
    looksLikeSubsetName,
    RESULT_FILE_NAME,
    resolveTxtInOut
} from '../dataset';

suite('Dataset folder', () => {
    test('resolves a folder with file.cio, or its TxtInOut', () => {
        const files = new Set(['C:\\A\\file.cio', 'C:\\B\\TxtInOut\\file.cio']);
        const isFile = (p: string) => files.has(p);
        assert.strictEqual(resolveTxtInOut('C:\\A', isFile, 'win32'), 'C:\\A');
        assert.strictEqual(resolveTxtInOut('C:\\B', isFile, 'win32'), 'C:\\B\\TxtInOut');
        assert.strictEqual(resolveTxtInOut('C:\\C', isFile, 'win32'), undefined);
    });

    test('the marker file name is hru_subset_result.json', () => {
        assert.strictEqual(RESULT_FILE_NAME, 'hru_subset_result.json');
    });
});

suite('Subset detection', () => {
    test('recognises a folder holding the marker file', () => {
        const present = new Set(['C:\\Data\\whatever\\hru_subset_result.json']);
        const detection = detectSubsetFolder(['C:\\Data\\whatever'], p => present.has(p), 'win32');
        assert.deepStrictEqual(detection, { folder: 'C:\\Data\\whatever', how: 'marker' });
    });

    test('finds the marker in the resolved TxtInOut when the parent was picked', () => {
        const present = new Set(['C:\\Proj\\TxtInOut\\hru_subset_result.json']);
        const detection = detectSubsetFolder(['C:\\Proj', 'C:\\Proj\\TxtInOut'], p => present.has(p), 'win32');
        assert.deepStrictEqual(detection, { folder: 'C:\\Proj\\TxtInOut', how: 'marker' });
    });

    test('falls back to the names the script and this extension give', () => {
        const none = () => false;
        for (const name of [
            'multi_20260905_070809',
            'multi_20260905_070809_2',
            'solo_1532',
            'solo_1532_20260905_070809',
            '02070009_subset_20260905_070809',
            '02070009_subset_20260905_070809_2'
        ]) {
            const detection = detectSubsetFolder([`C:\\Data\\${name}`], none, 'win32');
            assert.deepStrictEqual(detection, { folder: `C:\\Data\\${name}`, how: 'name' }, name);
        }
    });

    test('does not mistake an ordinary dataset for a subset', () => {
        for (const name of ['02070009', 'TxtInOut', 'multiple', 'solo', 'multi_2026', 'my_subset', 'resolo_12']) {
            assert.strictEqual(looksLikeSubsetName(name), false, name);
            assert.strictEqual(detectSubsetFolder([`C:\\Data\\${name}`], () => false, 'win32'), undefined, name);
        }
    });

    test('prefers the marker over the name', () => {
        const present = new Set(['C:\\Data\\multi_20260905_070809\\hru_subset_result.json']);
        const detection = detectSubsetFolder(['C:\\Data\\multi_20260905_070809'], p => present.has(p), 'win32');
        assert.strictEqual(detection?.how, 'marker');
    });

    test('the warning says why', () => {
        const byMarker = describeSubsetDetection({ folder: 'C:\\X', how: 'marker' });
        assert.ok(byMarker.includes('hru_subset_result.json') && byMarker.includes('C:\\X'));
        const byName = describeSubsetDetection({ folder: 'C:\\multi_20260905_070809', how: 'name' });
        assert.ok(byName.includes('its name looks like a subset'));
    });
});
