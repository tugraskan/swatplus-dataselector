// A scripted stand-in for processRunner.runProcess. Not a test itself (the
// mocha spec only loads *.test.js).

import type { ProcessOptions, ProcessResult, RunProcess } from '../processRunner';

export interface RecordedCall {
    command: string;
    args: string[];
    options?: ProcessOptions;
}

export type Responder = (call: RecordedCall) => Partial<ProcessResult> | undefined;

/**
 * A fake `RunProcess`. `respond` gets each call and returns the result; a missing
 * field defaults to exit 0 with empty output. Returning undefined behaves like a
 * program that does not exist (ENOENT).
 */
export function fakeProcess(respond: Responder): { run: RunProcess; calls: RecordedCall[] } {
    const calls: RecordedCall[] = [];
    const run: RunProcess = async (command, args, options) => {
        const call: RecordedCall = { command, args, options };
        calls.push(call);
        const reply = respond(call);
        if (reply === undefined) {
            return {
                code: null,
                stdout: '',
                stderr: '',
                error: Object.assign(new Error(`spawn ${command} ENOENT`), { code: 'ENOENT' })
            };
        }
        return { code: 0, stdout: '', stderr: '', ...reply };
    };
    return { run, calls };
}
