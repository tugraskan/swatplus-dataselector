import * as assert from 'assert';
import {
    baseName,
    formatRelativeAge,
    formatStaleSummary,
    isSelfWrittenFile,
    shouldMarkStale,
    MAX_TRACKED_STALE_FILES
} from '../indexStalenessUtils';

const indexedFiles = new Set(['hru.con', 'hru-data.hru', 'soils.sol']);
const context = (indexBuilt: boolean) => ({
    indexBuilt,
    isIndexedFile: (filePath: string) => indexedFiles.has(baseName(filePath).toLowerCase())
});

suite('Index Staleness Utils', () => {
    suite('baseName', () => {
        test('extracts the file name from a POSIX path', () => {
            assert.strictEqual(baseName('/home/user/TxtInOut/hru.con'), 'hru.con');
        });

        test('extracts the file name from a Windows path', () => {
            assert.strictEqual(baseName('C:\\data\\TxtInOut\\hru.con'), 'hru.con');
        });

        test('returns the input when there is no directory part', () => {
            assert.strictEqual(baseName('hru.con'), 'hru.con');
        });
    });

    suite('isSelfWrittenFile', () => {
        test('identifies the index cache the extension writes', () => {
            assert.strictEqual(isSelfWrittenFile('/data/TxtInOut/index.json'), true);
        });

        test('is case-insensitive', () => {
            assert.strictEqual(isSelfWrittenFile('/data/Index.JSON'), true);
        });

        test('does not match ordinary input files', () => {
            assert.strictEqual(isSelfWrittenFile('/data/TxtInOut/hru.con'), false);
        });
    });

    suite('shouldMarkStale', () => {
        test('marks an indexed input file as stale', () => {
            assert.strictEqual(shouldMarkStale('/d/TxtInOut/hru.con', context(true)), true);
        });

        test('ignores changes when no index has been built yet', () => {
            assert.strictEqual(shouldMarkStale('/d/TxtInOut/hru.con', context(false)), false);
        });

        test('ignores output files written by a SWAT+ run', () => {
            // The common failure this guards: a finished run rewrites hundreds of
            // output files and would otherwise leave the banner permanently lit.
            assert.strictEqual(shouldMarkStale('/d/TxtInOut/channel_sd_day.txt', context(true)), false);
            assert.strictEqual(shouldMarkStale('/d/TxtInOut/basin_wb_yr.csv', context(true)), false);
        });

        test('ignores the extension-written index cache', () => {
            assert.strictEqual(shouldMarkStale('/d/TxtInOut/index.json', context(true)), false);
        });

        test('matches indexed files case-insensitively', () => {
            assert.strictEqual(shouldMarkStale('/d/TxtInOut/HRU.CON', context(true)), true);
        });

        test('handles Windows paths', () => {
            assert.strictEqual(shouldMarkStale('C:\\d\\TxtInOut\\soils.sol', context(true)), true);
        });
    });

    suite('formatStaleSummary', () => {
        test('falls back to a generic message with no file names', () => {
            assert.strictEqual(formatStaleSummary([]), 'Input files changed on disk.');
        });

        test('lists a short set of files in full', () => {
            assert.strictEqual(
                formatStaleSummary(['hru.con', 'soils.sol']),
                'Changed: hru.con, soils.sol.'
            );
        });

        test('lists exactly three files in full', () => {
            assert.strictEqual(
                formatStaleSummary(['a.con', 'b.sol', 'c.hru']),
                'Changed: a.con, b.sol, c.hru.'
            );
        });

        test('truncates longer lists with a remainder count', () => {
            assert.strictEqual(
                formatStaleSummary(['a.con', 'b.sol', 'c.hru', 'd.lum', 'e.cli']),
                'Changed: a.con, b.sol, c.hru and 2 more.'
            );
        });
    });

    suite('formatRelativeAge', () => {
        const now = new Date('2026-08-16T12:00:00Z');
        const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

        test('reports unknown without a timestamp', () => {
            assert.strictEqual(formatRelativeAge(undefined, now), 'unknown');
        });

        test('reports unknown for an unparseable timestamp', () => {
            assert.strictEqual(formatRelativeAge('not-a-date', now), 'unknown');
        });

        test('reports sub-minute ages as just now', () => {
            assert.strictEqual(formatRelativeAge(ago(30 * 1000), now), 'just now');
        });

        test('reports minutes', () => {
            assert.strictEqual(formatRelativeAge(ago(5 * 60 * 1000), now), '5m ago');
        });

        test('reports hours', () => {
            assert.strictEqual(formatRelativeAge(ago(3 * 60 * 60 * 1000), now), '3h ago');
        });

        test('reports days', () => {
            assert.strictEqual(formatRelativeAge(ago(2 * 24 * 60 * 60 * 1000), now), '2d ago');
        });

        test('treats a future timestamp as fresh rather than negative', () => {
            // Clock skew between the stored timestamp and now must not print "-3m ago".
            const future = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
            assert.strictEqual(formatRelativeAge(future, now), 'just now');
        });

        test('rolls over at the hour boundary', () => {
            assert.strictEqual(formatRelativeAge(ago(59 * 60 * 1000), now), '59m ago');
            assert.strictEqual(formatRelativeAge(ago(60 * 60 * 1000), now), '1h ago');
        });
    });

    test('exposes a sane cap on tracked files', () => {
        assert.ok(MAX_TRACKED_STALE_FILES > 0);
    });
});
