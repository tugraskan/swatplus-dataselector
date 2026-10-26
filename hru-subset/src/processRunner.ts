// The one place that starts processes. Everything else takes a `RunProcess`, so
// tests can pass a fake. No vscode import.

import { spawn } from 'child_process';

export interface ProcessResult {
    /** Exit code, or null when the process did not start or was killed. */
    code: number | null;
    stdout: string;
    stderr: string;
    /** Set when the process could not be started (e.g. code 'ENOENT') or timed out. */
    error?: NodeJS.ErrnoException;
}

export interface ProcessOptions {
    cwd?: string;
    /** Kill the process after this many milliseconds. */
    timeoutMs?: number;
    /** Kill the process when this fires. */
    signal?: AbortSignal;
    /** Called with each chunk of stderr as it arrives (the script logs there). */
    onStderr?: (text: string) => void;
}

export type RunProcess = (command: string, args: string[], options?: ProcessOptions) => Promise<ProcessResult>;

export const runProcess: RunProcess = (command, args, options = {}) => {
    return new Promise(resolve => {
        let stdout = '';
        let stderr = '';
        let settled = false;
        let timer: NodeJS.Timeout | undefined;

        const finish = (result: ProcessResult) => {
            if (settled) {
                return;
            }
            settled = true;
            if (timer) {
                clearTimeout(timer);
            }
            options.signal?.removeEventListener('abort', onAbort);
            resolve(result);
        };

        // utf-8 on the pipes: the script prints paths, and a Windows code page
        // would turn non-ASCII folder names into mojibake in the error text.
        const child = spawn(command, args, {
            cwd: options.cwd,
            shell: false,
            windowsHide: true,
            env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
        });

        const onAbort = () => {
            child.kill();
            finish({ code: null, stdout, stderr, error: Object.assign(new Error('Cancelled'), { code: 'ABORT_ERR' }) });
        };
        if (options.signal) {
            if (options.signal.aborted) {
                onAbort();
                return;
            }
            options.signal.addEventListener('abort', onAbort, { once: true });
        }
        if (options.timeoutMs) {
            timer = setTimeout(() => {
                child.kill();
                finish({
                    code: null,
                    stdout,
                    stderr,
                    error: Object.assign(new Error(`Timed out after ${options.timeoutMs} ms`), { code: 'ETIMEDOUT' })
                });
            }, options.timeoutMs);
        }

        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
            stdout += chunk;
        });
        child.stderr.on('data', (chunk: string) => {
            stderr += chunk;
            options.onStderr?.(chunk);
        });
        child.on('error', (error: NodeJS.ErrnoException) => finish({ code: null, stdout, stderr, error }));
        child.on('close', code => finish({ code, stdout, stderr }));
    });
};
