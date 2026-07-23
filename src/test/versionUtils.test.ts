import * as assert from 'assert';
import { parseSwatVersion, compareSwatVersions } from '../versionUtils';

suite('SWAT+ version utils', () => {

    test('parseSwatVersion reads major/minor/patch and ignores prefixes', () => {
        assert.deepStrictEqual(parseSwatVersion('62.0.0'), { major: 62, minor: 0, patch: 0 });
        assert.deepStrictEqual(parseSwatVersion('v61.5'), { major: 61, minor: 5, patch: 0 });
        assert.deepStrictEqual(parseSwatVersion('rev.60'), { major: 60, minor: 0, patch: 0 });
        assert.strictEqual(parseSwatVersion(''), undefined);
        assert.strictEqual(parseSwatVersion(undefined), undefined);
        assert.strictEqual(parseSwatVersion('none'), undefined);
    });

    test('compareSwatVersions classifies drift', () => {
        assert.strictEqual(compareSwatVersions('62.0.0', '62.0.0'), 'match');
        // patch differences are treated as a match (no layout impact)
        assert.strictEqual(compareSwatVersions('62.0.3', '62.0.0'), 'match');
        assert.strictEqual(compareSwatVersions('62.1.0', '62.0.0'), 'minor-drift');
        assert.strictEqual(compareSwatVersions('60.5.0', '62.0.0'), 'major-drift');
    });

    test('compareSwatVersions returns unknown when a version is missing', () => {
        assert.strictEqual(compareSwatVersions(undefined, '62.0.0'), 'unknown');
        assert.strictEqual(compareSwatVersions('62.0.0', undefined), 'unknown');
        assert.strictEqual(compareSwatVersions('', ''), 'unknown');
    });
});
