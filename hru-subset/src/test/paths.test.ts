import * as assert from 'assert';
import {
    canonicalPath,
    checkOutputLocation,
    defaultOutputPath,
    formatTimestamp,
    isSameOrInside,
    outputPathInside,
    uniqueOutputPath
} from '../paths';

suite('Output path', () => {
    const now = new Date(2026, 8, 5, 7, 8, 9); // 5 Sep 2026 07:08:09 local time

    test('formats the timestamp as yyyymmdd_hhmmss', () => {
        assert.strictEqual(formatTimestamp(now), '20260905_070809');
    });

    test('defaults to a sibling of the dataset (Windows)', () => {
        assert.strictEqual(
            defaultOutputPath('C:\\Data\\02070009', now, 'win32'),
            'C:\\Data\\02070009_subset_20260905_070809'
        );
        assert.strictEqual(
            defaultOutputPath('C:\\Data\\02070009\\', now, 'win32'),
            'C:\\Data\\02070009_subset_20260905_070809'
        );
    });

    test('defaults to a sibling of the dataset (POSIX)', () => {
        assert.strictEqual(
            defaultOutputPath('/data/02070009', now, 'linux'),
            '/data/02070009_subset_20260905_070809'
        );
    });

    test('the default is never inside the dataset it came from', () => {
        const datasets: Array<[string, NodeJS.Platform]> = [
            ['C:\\Data\\02070009', 'win32'],
            ['C:\\Data\\02070009\\TxtInOut', 'win32'],
            ['c:\\data\\proj\\', 'win32'],
            ['/data/02070009', 'linux'],
            ['/data/a b/02070009/', 'linux']
        ];
        for (const [dataset, platform] of datasets) {
            const output = defaultOutputPath(dataset, now, platform);
            assert.strictEqual(isSameOrInside(output, dataset, platform), false, `${output} vs ${dataset}`);
            assert.strictEqual(checkOutputLocation(output, [dataset], platform), undefined, `${output} vs ${dataset}`);
        }
        // A drive root cannot have a sibling, so the refusal check has to catch it.
        const rootOutput = defaultOutputPath('D:\\', now, 'win32');
        assert.strictEqual(rootOutput, 'D:\\dataset_subset_20260905_070809');
        assert.notStrictEqual(checkOutputLocation(rootOutput, ['D:\\'], 'win32'), undefined);
    });

    test('puts a chosen parent folder in front of the same name', () => {
        assert.strictEqual(
            outputPathInside('E:\\runs', 'C:\\Data\\02070009', now, 'win32'),
            'E:\\runs\\02070009_subset_20260905_070809'
        );
    });

    test('picks a free name', () => {
        const taken = new Set(['/o/a', '/o/a_2']);
        assert.strictEqual(uniqueOutputPath('/o/b', p => taken.has(p)), '/o/b');
        assert.strictEqual(uniqueOutputPath('/o/a', p => taken.has(p)), '/o/a_3');
    });
});

suite('Inside-dataset refusal', () => {
    test('detects same, inside and outside (case-insensitive on Windows)', () => {
        assert.strictEqual(isSameOrInside('C:\\Data\\X', 'c:\\data\\x', 'win32'), true);
        assert.strictEqual(isSameOrInside('C:\\Data\\X\\sub\\deep', 'C:\\Data\\X', 'win32'), true);
        assert.strictEqual(isSameOrInside('C:\\Data\\X_subset', 'C:\\Data\\X', 'win32'), false);
        assert.strictEqual(isSameOrInside('C:\\Data', 'C:\\Data\\X', 'win32'), false);
        assert.strictEqual(isSameOrInside('D:\\Data\\X', 'C:\\Data\\X', 'win32'), false);
        assert.strictEqual(isSameOrInside('C:\\Data\\X\\..foo', 'C:\\Data\\X', 'win32'), true);
        assert.strictEqual(isSameOrInside('C:\\Data\\X\\..\\Y', 'C:\\Data\\X', 'win32'), false);
    });

    test('is case-sensitive on POSIX', () => {
        assert.strictEqual(isSameOrInside('/data/X/out', '/data/x', 'linux'), false);
        assert.strictEqual(isSameOrInside('/data/x/out', '/data/x', 'linux'), true);
    });

    test('refuses an output inside, equal to, or around the dataset', () => {
        const dataset = 'C:\\Data\\02070009';
        const inside = checkOutputLocation('C:\\Data\\02070009\\multi_20260905_070809', [dataset], 'win32');
        assert.ok(inside && inside.includes('must not be inside the dataset folder'), inside);
        assert.ok(checkOutputLocation(dataset, [dataset], 'win32'));
        assert.ok(checkOutputLocation('c:\\data\\02070009\\', [dataset], 'win32'));
        const around = checkOutputLocation('C:\\Data', [dataset], 'win32');
        assert.ok(around && around.includes('would contain the dataset folder'), around);
    });

    test('refuses an output inside either of two dataset folders', () => {
        const folders = ['C:\\Proj', 'C:\\Proj\\TxtInOut'];
        assert.ok(checkOutputLocation('C:\\Proj\\TxtInOut\\out', folders, 'win32'));
        assert.ok(checkOutputLocation('C:\\Proj\\out', folders, 'win32'));
        assert.strictEqual(checkOutputLocation('C:\\Proj_subset_20260905_070809', folders, 'win32'), undefined);
    });

    test('accepts a sibling and an unrelated drive', () => {
        const dataset = 'C:\\Data\\02070009';
        assert.strictEqual(checkOutputLocation('C:\\Data\\02070009_subset_20260905_070809', [dataset], 'win32'), undefined);
        assert.strictEqual(checkOutputLocation('E:\\runs\\x', [dataset], 'win32'), undefined);
    });

    test('catches an output that is inside the dataset only through a link', () => {
        // C:\Link is a junction to the dataset: the output looks unrelated until links are resolved.
        const links = new Map<string, string>([
            ['C:\\Link', 'C:\\Data\\02070009'],
            ['C:\\Data\\02070009', 'C:\\Data\\02070009']
        ]);
        const realpath = (p: string) => links.get(p);
        const output = 'C:\\Link\\out';
        const dataset = 'C:\\Data\\02070009';
        assert.strictEqual(checkOutputLocation(output, [dataset], 'win32'), undefined);
        const canonical = canonicalPath(output, realpath, 'win32');
        assert.strictEqual(canonical, 'C:\\Data\\02070009\\out');
        assert.ok(checkOutputLocation(canonical, [canonicalPath(dataset, realpath, 'win32')], 'win32'));
    });

    test('canonicalPath keeps a path with nothing to resolve', () => {
        assert.strictEqual(canonicalPath('C:\\a\\b', () => undefined, 'win32'), 'C:\\a\\b');
    });
});
