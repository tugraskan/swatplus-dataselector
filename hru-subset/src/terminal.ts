// Building the command line that starts SWAT+ in a terminal. No vscode import.

import * as path from 'path';

export type ShellKind = 'powershell' | 'cmd' | 'posix';

/** The quoting family of a shell path such as "C:\\Program Files\\PowerShell\\7\\pwsh.exe". */
export function shellKind(shellPath: string | undefined, platform: NodeJS.Platform = process.platform): ShellKind {
    const name = shellPath
        ? path.win32.basename(shellPath).replace(/\.exe$/i, '').toLowerCase()
        : '';
    if (name === 'pwsh' || name === 'powershell') {
        return 'powershell';
    }
    if (name === 'cmd') {
        return 'cmd';
    }
    if (name) {
        return 'posix';
    }
    return platform === 'win32' ? 'powershell' : 'posix';
}

/** `exe` as one quoted command that the given shell runs. */
export function commandLineFor(exe: string, kind: ShellKind): string {
    switch (kind) {
        case 'powershell':
            return `& '${exe.replace(/'/g, "''")}'`;
        case 'cmd':
            return `"${exe}"`;
        default:
            return `'${exe.replace(/'/g, `'\\''`)}'`;
    }
}
