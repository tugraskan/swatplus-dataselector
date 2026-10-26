import * as assert from 'assert';
import { expandHruIds, formatHruIds, parseHruIdRanges, validateHruIdText } from '../ids';

suite('HRU id parsing', () => {
    test('parses single ids and ranges', () => {
        assert.deepStrictEqual(parseHruIdRanges('1,4-6,10'), {
            ok: true,
            ranges: [{ start: 1, end: 1 }, { start: 4, end: 6 }, { start: 10, end: 10 }]
        });
        assert.deepStrictEqual(parseHruIdRanges(' 3 - 5 , 8 '), {
            ok: true,
            ranges: [{ start: 3, end: 5 }, { start: 8, end: 8 }]
        });
    });

    test('rejects empty input and empty entries', () => {
        assert.strictEqual(validateHruIdText(''), 'Enter at least one HRU ID.');
        assert.strictEqual(validateHruIdText('   '), 'Enter at least one HRU ID.');
        assert.strictEqual(validateHruIdText('1,,2'), 'Remove empty comma-separated entries.');
        assert.strictEqual(validateHruIdText('1,'), 'Remove empty comma-separated entries.');
    });

    test('rejects malformed ids and ranges', () => {
        assert.strictEqual(validateHruIdText('abc'), 'Invalid HRU ID: abc');
        assert.strictEqual(validateHruIdText('1.5'), 'Invalid HRU ID: 1.5');
        assert.strictEqual(validateHruIdText('1 2'), 'Invalid HRU ID: 1 2');
        assert.strictEqual(validateHruIdText('1-'), 'Invalid range: 1-');
        assert.strictEqual(validateHruIdText('-5'), 'Invalid range: -5');
        assert.strictEqual(validateHruIdText('1-2-3'), 'Invalid range: 1-2-3');
        assert.strictEqual(validateHruIdText('4-x'), 'Invalid range: 4-x');
    });

    test('rejects zero and a backwards range', () => {
        assert.strictEqual(validateHruIdText('0'), 'HRU IDs must be positive integers: 0');
        assert.strictEqual(validateHruIdText('0-3'), 'HRU IDs must be positive integers: 0-3');
        assert.strictEqual(validateHruIdText('6-4'), 'Range start must be <= end: 6-4');
    });

    test('rejects numbers too large to be exact', () => {
        assert.strictEqual(validateHruIdText('99999999999999999999'), 'Number too large: 99999999999999999999');
    });

    test('checks ids against the dataset range', () => {
        assert.strictEqual(validateHruIdText('1532,1538,3978', 1, 4000), undefined);
        assert.strictEqual(validateHruIdText('1,4000', 1, 4000), undefined);
        assert.strictEqual(
            validateHruIdText('99999', 1, 4000),
            "99999 is outside the dataset's HRU range 1-4000."
        );
        assert.strictEqual(
            validateHruIdText('3990-4010', 1, 4000),
            "3990-4010 is outside the dataset's HRU range 1-4000."
        );
        assert.strictEqual(
            validateHruIdText('5,10', 6, 4000),
            "5 is outside the dataset's HRU range 6-4000."
        );
    });

    test('bounds a huge range before expanding it', () => {
        // Would allocate billions of ids if expanded first.
        assert.strictEqual(
            validateHruIdText('1-2000000000', 1, 4000),
            "1-2000000000 is outside the dataset's HRU range 1-4000."
        );
    });

    test('expands to sorted unique ids', () => {
        assert.deepStrictEqual(expandHruIds('10,4-6,5,1'), [1, 4, 5, 6, 10]);
        assert.throws(() => expandHruIds('x'), /Invalid HRU ID: x/);
    });

    test('formats ids as the compact text the script takes', () => {
        assert.strictEqual(formatHruIds([1, 4, 5, 6, 10]), '1,4-6,10');
        assert.strictEqual(formatHruIds([10, 1, 5, 4, 6, 4]), '1,4-6,10');
        assert.strictEqual(formatHruIds([1532, 1538, 3978]), '1532,1538,3978');
        assert.strictEqual(formatHruIds([7]), '7');
        assert.strictEqual(formatHruIds([]), '');
        assert.strictEqual(formatHruIds(expandHruIds('1-3,5')), '1-3,5');
    });
});
