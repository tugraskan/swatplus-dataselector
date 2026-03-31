import * as assert from 'assert';
import { CURRENT_INDEX_CACHE_VERSION, isIndexCacheCompatible } from '../indexCacheUtils';

suite('Index Cache Utils', () => {
    test('accepts the current cache version', () => {
        assert.strictEqual(isIndexCacheCompatible(CURRENT_INDEX_CACHE_VERSION), true);
    });

    test('rejects older cache versions', () => {
        assert.strictEqual(isIndexCacheCompatible(CURRENT_INDEX_CACHE_VERSION - 1), false);
    });

    test('rejects missing cache versions', () => {
        assert.strictEqual(isIndexCacheCompatible(undefined), false);
    });
});
