import * as assert from 'assert';
import { commandLineFor, shellKind } from '../terminal';

suite('Terminal command line', () => {
    test('recognises the shell family from the shell path', () => {
        assert.strictEqual(shellKind('C:\\Program Files\\PowerShell\\7\\pwsh.exe', 'win32'), 'powershell');
        assert.strictEqual(shellKind('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', 'win32'), 'powershell');
        assert.strictEqual(shellKind('C:\\Windows\\System32\\cmd.exe', 'win32'), 'cmd');
        assert.strictEqual(shellKind('C:\\Program Files\\Git\\bin\\bash.exe', 'win32'), 'posix');
        assert.strictEqual(shellKind('/bin/zsh', 'darwin'), 'posix');
    });

    test('falls back to the platform default', () => {
        assert.strictEqual(shellKind(undefined, 'win32'), 'powershell');
        assert.strictEqual(shellKind('', 'linux'), 'posix');
    });

    test('quotes the executable for each shell', () => {
        const exe = 'C:\\SWAT+ runs\\swatplus.exe';
        assert.strictEqual(commandLineFor(exe, 'powershell'), "& 'C:\\SWAT+ runs\\swatplus.exe'");
        assert.strictEqual(commandLineFor(exe, 'cmd'), '"C:\\SWAT+ runs\\swatplus.exe"');
        assert.strictEqual(commandLineFor(exe, 'posix'), "'C:\\SWAT+ runs\\swatplus.exe'");
    });

    test('escapes a single quote in the path', () => {
        assert.strictEqual(commandLineFor("C:\\O'Neil\\swat.exe", 'powershell'), "& 'C:\\O''Neil\\swat.exe'");
        assert.strictEqual(commandLineFor("/home/o'neil/swat", 'posix'), "'/home/o'\\''neil/swat'");
    });
});
