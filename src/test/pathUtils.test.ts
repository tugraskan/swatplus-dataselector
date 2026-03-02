import * as assert from 'assert';
import {
    normalizeSeparators,
    normalizePathForComparison,
    pathStartsWith,
    windowsPathToWsl,
    normalizeIndexedPath
} from '../pathUtils';

suite('Path Utilities – cross-platform indexing', () => {

    // -------------------------------------------------------------------------
    // normalizeSeparators
    // -------------------------------------------------------------------------
    test('normalizeSeparators converts backslashes to forward slashes', () => {
        assert.strictEqual(
            normalizeSeparators('C:\\Users\\foo\\bar'),
            'C:/Users/foo/bar'
        );
        assert.strictEqual(
            normalizeSeparators('/home/user/datasets'),
            '/home/user/datasets'
        );
        assert.strictEqual(
            normalizeSeparators('mixed\\path/with/both'),
            'mixed/path/with/both'
        );
    });

    // -------------------------------------------------------------------------
    // normalizePathForComparison
    // -------------------------------------------------------------------------
    test('normalizePathForComparison normalizes separators', () => {
        const winPath  = 'C:\\Users\\foo\\TxtInOut\\plants.plt';
        const posixPath = 'C:/Users/foo/TxtInOut/plants.plt';
        assert.strictEqual(
            normalizePathForComparison(winPath),
            normalizePathForComparison(posixPath),
            'Windows backslash and forward-slash paths for same location should compare equal'
        );
    });

    test('normalizePathForComparison is case-insensitive for Windows drive paths', () => {
        assert.strictEqual(
            normalizePathForComparison('C:/Users/Foo/Bar'),
            normalizePathForComparison('c:/users/foo/bar'),
            'Windows drive paths should be case-insensitive'
        );
    });

    test('normalizePathForComparison is case-sensitive for POSIX paths on non-Windows', () => {
        if (process.platform === 'win32') {
            // Skip on Windows where everything is case-insensitive
            return;
        }
        assert.notStrictEqual(
            normalizePathForComparison('/home/User/datasets'),
            normalizePathForComparison('/home/user/datasets'),
            'POSIX paths should be case-sensitive on non-Windows hosts'
        );
    });

    // -------------------------------------------------------------------------
    // pathStartsWith
    // -------------------------------------------------------------------------
    test('pathStartsWith works with matching POSIX paths', () => {
        assert.strictEqual(
            pathStartsWith('/home/user/datasets/Ames/TxtInOut/plants.plt', '/home/user/datasets/Ames/TxtInOut'),
            true
        );
    });

    test('pathStartsWith works when prefix has trailing slash', () => {
        assert.strictEqual(
            pathStartsWith('/home/user/datasets/Ames/TxtInOut/plants.plt', '/home/user/datasets/Ames/TxtInOut/'),
            true
        );
    });

    test('pathStartsWith returns false for non-child path', () => {
        assert.strictEqual(
            pathStartsWith('/home/user1/datasets', '/home/user'),
            false,
            'Should not match a sibling directory with a shared prefix'
        );
    });

    test('pathStartsWith works with mixed separators (Windows path from cache vs POSIX prefix)', () => {
        // Windows path from index cache; POSIX prefix from current environment
        const storedFile = 'C:\\Users\\foo\\Ames\\TxtInOut\\plants.plt';
        const prefix     = 'C:/Users/foo/Ames/TxtInOut';
        assert.strictEqual(
            pathStartsWith(storedFile, prefix),
            true,
            'Mixed-separator paths that refer to the same location should match'
        );
    });

    test('pathStartsWith returns true for exact match', () => {
        assert.strictEqual(
            pathStartsWith('/home/user/datasets', '/home/user/datasets'),
            true
        );
    });

    // -------------------------------------------------------------------------
    // windowsPathToWsl
    // -------------------------------------------------------------------------
    test('windowsPathToWsl converts C:\\ path to /mnt/c/', () => {
        assert.strictEqual(
            windowsPathToWsl('C:\\Users\\foo\\datasets\\Ames'),
            '/mnt/c/Users/foo/datasets/Ames'
        );
    });

    test('windowsPathToWsl converts forward-slash Windows path', () => {
        assert.strictEqual(
            windowsPathToWsl('D:/datasets/Ames_sub1'),
            '/mnt/d/datasets/Ames_sub1'
        );
    });

    test('windowsPathToWsl handles bare drive root', () => {
        assert.strictEqual(
            windowsPathToWsl('C:\\'),
            '/mnt/c'
        );
    });

    test('windowsPathToWsl leaves non-Windows paths unchanged', () => {
        assert.strictEqual(
            windowsPathToWsl('/home/user/datasets'),
            '/home/user/datasets'
        );
    });

    // -------------------------------------------------------------------------
    // normalizeIndexedPath
    // -------------------------------------------------------------------------
    test('normalizeIndexedPath converts Windows path to WSL path on non-Windows host', () => {
        if (process.platform === 'win32') {
            return; // No conversion expected on Windows
        }
        assert.strictEqual(
            normalizeIndexedPath('C:\\Users\\foo\\TxtInOut\\plants.plt'),
            '/mnt/c/Users/foo/TxtInOut/plants.plt'
        );
    });

    test('normalizeIndexedPath leaves Linux paths unchanged on non-Windows host', () => {
        assert.strictEqual(
            normalizeIndexedPath('/home/user/datasets/TxtInOut/plants.plt'),
            '/home/user/datasets/TxtInOut/plants.plt'
        );
    });

    test('normalizeIndexedPath handles empty string', () => {
        assert.strictEqual(normalizeIndexedPath(''), '');
    });
});

