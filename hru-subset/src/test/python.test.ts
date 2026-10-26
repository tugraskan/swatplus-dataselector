import * as assert from 'assert';
import {
    describePythonNotFound,
    isWindowsAppsPath,
    probePython,
    pythonCandidateNames,
    resolvePython
} from '../python';
import { fakeProcess } from './fakeProcess';

const STORE_STDERR = 'Python was not found; run without arguments to install from the Microsoft Store, '
    + 'or disable this shortcut from Settings > Apps > Advanced app settings > App execution aliases.';

suite('Python candidates', () => {
    test('Windows order: py, python, python3', () => {
        assert.deepStrictEqual(pythonCandidateNames({ platform: 'win32' }), ['py', 'python', 'python3']);
    });

    test('elsewhere: python3, python', () => {
        assert.deepStrictEqual(pythonCandidateNames({ platform: 'linux' }), ['python3', 'python']);
        assert.deepStrictEqual(pythonCandidateNames({ platform: 'darwin' }), ['python3', 'python']);
    });

    test('the setting comes first, then the environment variable', () => {
        assert.deepStrictEqual(
            pythonCandidateNames({ platform: 'win32', setting: 'C:\\Py\\python.exe', env: 'D:\\py311\\python.exe' }),
            ['C:\\Py\\python.exe', 'D:\\py311\\python.exe', 'py', 'python', 'python3']
        );
        assert.deepStrictEqual(
            pythonCandidateNames({ platform: 'linux', env: '/opt/py/bin/python' }),
            ['/opt/py/bin/python', 'python3', 'python']
        );
    });

    test('ignores blank settings and drops duplicates', () => {
        assert.deepStrictEqual(
            pythonCandidateNames({ platform: 'win32', setting: '  ', env: 'python' }),
            ['python', 'py', 'python3']
        );
    });
});

suite('Python probe', () => {
    test('accepts a working interpreter and keeps its version line', async () => {
        const { run } = fakeProcess(() => ({ stdout: 'Python 3.13.12\r\n' }));
        assert.deepStrictEqual(await probePython('py', run, 'win32'), { version: 'Python 3.13.12' });
    });

    test('accepts an interpreter that prints its version to stderr', async () => {
        const { run } = fakeProcess(() => ({ stderr: 'Python 3.9.1\n' }));
        assert.deepStrictEqual(await probePython('python3', run, 'linux'), { version: 'Python 3.9.1' });
    });

    test('skips a missing executable', async () => {
        const { run } = fakeProcess(() => undefined);
        assert.deepStrictEqual(await probePython('python3', run, 'linux'), { skip: 'not found' });
    });

    test('skips the Store stub by its exit code 9009', async () => {
        const { run } = fakeProcess(() => ({ code: 9009 }));
        const probe = await probePython('python3', run, 'win32');
        assert.ok('skip' in probe && probe.skip.includes('Microsoft Store'), JSON.stringify(probe));
    });

    test('skips the Store stub by its message, whatever the exit code', async () => {
        const { run } = fakeProcess(() => ({ code: 1, stderr: STORE_STDERR }));
        const probe = await probePython('python3', run, 'win32');
        assert.ok('skip' in probe && probe.skip.includes('Microsoft Store'), JSON.stringify(probe));
    });

    test('skips a path under WindowsApps without starting it', async () => {
        const stub = 'C:\\Users\\taci\\AppData\\Local\\Microsoft\\WindowsApps\\python3.exe';
        const { run, calls } = fakeProcess(() => ({ stdout: 'Python 3.12.1' }));
        const probe = await probePython(stub, run, 'win32');
        assert.ok('skip' in probe && probe.skip.includes('WindowsApps'), JSON.stringify(probe));
        assert.strictEqual(calls.length, 0);
    });

    test('recognises WindowsApps paths only', () => {
        assert.strictEqual(isWindowsAppsPath('C:\\Users\\x\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe'), true);
        assert.strictEqual(isWindowsAppsPath('c:/users/x/appdata/local/microsoft/windowsapps/python3.exe'), true);
        assert.strictEqual(isWindowsAppsPath('python3'), false);
        assert.strictEqual(isWindowsAppsPath('C:\\Python313\\python.exe'), false);
    });

    test('skips a non-zero exit, a timeout and output that is not a version', async () => {
        const failing = fakeProcess(() => ({ code: 2, stderr: 'bad option' }));
        const failed = await probePython('python', failing.run, 'linux');
        assert.ok('skip' in failed && failed.skip.includes('code 2') && failed.skip.includes('bad option'));

        const slow = fakeProcess(() => ({
            code: null,
            error: Object.assign(new Error('Timed out'), { code: 'ETIMEDOUT' })
        }));
        const timedOut = await probePython('python', slow.run, 'linux');
        assert.ok('skip' in timedOut && timedOut.skip.includes('did not answer'));

        const odd = fakeProcess(() => ({ stdout: 'hello' }));
        const notPython = await probePython('python', odd.run, 'linux');
        assert.ok('skip' in notPython && notPython.skip.includes('not a Python version'));
    });

    test('skips an interpreter older than 3.8', async () => {
        const { run } = fakeProcess(() => ({ stderr: 'Python 2.7.18' }));
        const probe = await probePython('python', run, 'linux');
        assert.ok('skip' in probe && probe.skip.includes('older than 3.8'), JSON.stringify(probe));
        const edge = fakeProcess(() => ({ stdout: 'Python 3.7.9' }));
        assert.ok('skip' in (await probePython('python', edge.run, 'linux')));
        const ok = fakeProcess(() => ({ stdout: 'Python 3.8.0' }));
        assert.ok('version' in (await probePython('python', ok.run, 'linux')));
    });
});

suite('Python resolution', () => {
    test('a Windows machine where python3 is the Store stub: py wins, the stub is never probed', async () => {
        const { run, calls } = fakeProcess(call => {
            if (call.command === 'py') {
                return { stdout: 'Python 3.13.12' };
            }
            return { code: 9009, stderr: STORE_STDERR };
        });
        const resolution = await resolvePython(['py', 'python', 'python3'], run, 'win32');
        assert.strictEqual(resolution.interpreter?.command, 'py');
        assert.deepStrictEqual(resolution.skipped, []);
        assert.deepStrictEqual(calls.map(call => call.command), ['py']);
    });

    test('skips what fails and takes the first that passes', async () => {
        const { run, calls } = fakeProcess(call => {
            switch (call.command) {
                case 'py':
                    return undefined; // no launcher
                case 'python':
                    return { code: 9009, stderr: STORE_STDERR }; // Store stub
                default:
                    return { stdout: 'Python 3.11.4' };
            }
        });
        const resolution = await resolvePython(['py', 'python', 'python3'], run, 'win32');
        assert.deepStrictEqual(resolution.interpreter, { command: 'python3', version: 'Python 3.11.4' });
        assert.deepStrictEqual(resolution.skipped.map(item => item.command), ['py', 'python']);
        assert.deepStrictEqual(calls.map(call => call.command), ['py', 'python', 'python3']);
        assert.ok(calls.every(call => call.args.length === 1 && call.args[0] === '--version'));
    });

    test('reports every skip when nothing is usable', async () => {
        const { run } = fakeProcess(call => (call.command === 'python3' ? { code: 9009 } : undefined));
        const resolution = await resolvePython(['py', 'python3'], run, 'win32');
        assert.strictEqual(resolution.interpreter, undefined);
        assert.strictEqual(resolution.skipped.length, 2);
        const text = describePythonNotFound(resolution.skipped);
        assert.ok(text.includes('py: not found'), text);
        assert.ok(text.includes('python3: the Microsoft Store'), text);
        assert.ok(text.includes('swatHruSubset.pythonPath') && text.includes('SWATPLUS_PYTHON'), text);
    });

    test('a configured path that fails the probe is skipped, not fatal', async () => {
        const { run } = fakeProcess(call => (call.command === 'python3' ? { stdout: 'Python 3.12.0' } : undefined));
        const resolution = await resolvePython(['/typo/python', 'python3'], run, 'linux');
        assert.strictEqual(resolution.interpreter?.command, 'python3');
        assert.deepStrictEqual(resolution.skipped, [{ command: '/typo/python', reason: 'not found' }]);
    });
});
