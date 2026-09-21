/**
 * Switching the active dataset, and running the model against it.
 *
 * The MCP server started as a read-only view of one dataset fixed at launch:
 * an agent could ask what a column means or what references an HRU, but the
 * dataset came from the command line and could not change, and nothing could
 * actually run the model. That leaves the obvious request -- "here is a
 * dataset, run it and tell me why it failed" -- outside what an agent can do
 * on its own, which is the gap `select_dataset` and `run_dataset` close.
 *
 * Deliberately headless. Launching under the debugger needs VS Code, and this
 * server has no editor to reach: it is a plain stdio process. A plain run is
 * the right trade anyway, because an ifx build with `/traceback` and
 * `/INCREMENTAL:NO` prints a traceback that already names the routine and
 * line -- so the crash text alone identifies the failing subroutine, with no
 * debugger, no PDB and no load address. Breakpoints and variable inspection
 * remain the other extension's job, for when the line is not enough.
 *
 * Everything here is pure text and path handling over injected side effects,
 * so the selection rules and the run digest are testable without a dataset,
 * a python install, or a SWAT+ executable.
 */

import * as path from 'path';

/** Files that mark a directory as a SWAT+ dataset rather than any folder. */
export const DATASET_MARKER_FILES = ['file.cio', 'object.cnt', 'time.sim'];

/**
 * Interpreters to try for the pandas indexer, in order.
 *
 * `python3` alone was the original assumption and it does not hold on Windows,
 * where it usually resolves to the Microsoft Store alias stub -- a program
 * that prints an advertisement, exits non-zero, and never runs the script. The
 * failure then looks like a broken indexer rather than a missing interpreter,
 * so the list is tried in order and the first one that actually answers wins.
 *
 * `py -3` is the Windows launcher, which is present when the Store alias is
 * the only `python3` on PATH.
 */
export const PYTHON_CANDIDATES: ReadonlyArray<{ command: string; args: string[] }> = [
    { command: 'python3', args: [] },
    { command: 'python', args: [] },
    { command: 'py', args: ['-3'] },
];

/** Probes one interpreter; injected so the choice is testable. */
export type PythonProbe = (command: string, args: string[]) => boolean;

/**
 * The first interpreter that runs, or `undefined`.
 *
 * Returns the whole invocation rather than a name, because `py -3` needs its
 * argument carried with it -- dropping it would launch whatever version the
 * launcher defaults to.
 */
export function resolvePython(
    probe: PythonProbe,
    candidates: ReadonlyArray<{ command: string; args: string[] }> = PYTHON_CANDIDATES
): { command: string; args: string[] } | undefined {
    for (const candidate of candidates) {
        if (probe(candidate.command, candidate.args)) {
            return candidate;
        }
    }
    return undefined;
}

/** Why a directory was rejected as a dataset, or `undefined` if it is one. */
export function describeDatasetProblem(
    datasetDir: string,
    exists: (p: string) => boolean,
    isDirectory: (p: string) => boolean
): string | undefined {
    if (!datasetDir || !datasetDir.trim()) {
        return 'no dataset path was given';
    }
    if (!exists(datasetDir)) {
        return `${datasetDir} does not exist`;
    }
    if (!isDirectory(datasetDir)) {
        return `${datasetDir} is a file; a SWAT+ dataset is the directory that holds file.cio`;
    }
    const found = DATASET_MARKER_FILES.filter(name => exists(path.join(datasetDir, name)));
    if (found.length === 0) {
        // Named rather than guessed at: a TxtInOut folder always has these, so
        // a directory without any of them is almost always the parent folder
        // or a results directory, and saying which files were looked for is
        // what makes that obvious.
        return `${datasetDir} has none of ${DATASET_MARKER_FILES.join(', ')}, `
            + 'so it does not look like a SWAT+ dataset directory';
    }
    return undefined;
}

/** One row of a `forrtl` traceback table. */
export interface TracebackFrame {
    image: string;
    pc: string;
    routine?: string;
    line?: number;
    source?: string;
}

export interface RunFailure {
    /** The `forrtl: severe (408): ...` line, as printed. */
    message: string;
    frames: TracebackFrame[];
    /** True when no frame carried a routine name. */
    unresolved: boolean;
}

const FORRTL_LINE = /forrtl:\s*(severe|error|warning|info)\s*\(\s*(\d+|\?)\s*\)\s*:\s*(.*)/i;
const TRACEBACK_HEADER = /^\s*Image\s+PC\s+Routine\s+Line\s+Source\s*$/i;
const TRACEBACK_ROW = /^(\S+)\s+([0-9A-Fa-f]{8,16})\s+(\S+)\s+(\S+)(?:\s+(.+?))?\s*$/;

function resolved(value: string | undefined): string | undefined {
    const trimmed = (value ?? '').trim();
    return trimmed && !/^unknown$/i.test(trimmed) ? trimmed : undefined;
}

/**
 * Pulls the last `forrtl` failure out of a run's output.
 *
 * The last one, not the first: a run that survived an earlier warning and then
 * died has two, and the one that killed it is the one worth reporting.
 *
 * Anchored on the program counter rather than on column positions, because the
 * Image column is fixed width and long executable names arrive truncated.
 */
export function parseRunFailure(output: string): RunFailure | undefined {
    let found: RunFailure | undefined;
    for (const line of output.split(/\r?\n/)) {
        const header = FORRTL_LINE.exec(line);
        if (header) {
            found = {
                message: line.trim(),
                frames: [],
                unresolved: true,
            };
            continue;
        }
        if (!found || TRACEBACK_HEADER.test(line)) {
            continue;
        }
        const row = TRACEBACK_ROW.exec(line);
        if (!row) {
            continue;
        }
        const lineText = resolved(row[4]);
        const parsed = lineText ? Number.parseInt(lineText, 10) : undefined;
        found.frames.push({
            image: row[1],
            pc: row[2],
            routine: resolved(row[3]),
            // Line 0 is the runtime saying it has no line for this frame --
            // it prints one for an inlined or compiler-generated routine.
            // Rendering it as `file.f90:0` invites someone to go and look at
            // a line that is not there.
            line: parsed !== undefined && Number.isFinite(parsed) && parsed > 0
                ? parsed
                : undefined,
            source: resolved(row[5]),
        });
    }
    if (found) {
        found.unresolved = !found.frames.some(frame => frame.routine);
    }
    return found;
}

/** How much of a run's own output to keep when it says nothing went wrong. */
export const RUN_TAIL_CHARS = 3000;

/** How many traceback frames to print. */
export const RUN_FRAME_LIMIT = 20;

export interface RunOutcome {
    executable: string;
    datasetDir: string;
    exitCode: number | null;
    /** Non-null when the process was killed rather than exiting. */
    signal?: string | null;
    timedOut?: boolean;
    elapsedMs: number;
    stdout: string;
    stderr: string;
}

function tail(text: string, limit: number): string {
    if (text.length <= limit) {
        return text;
    }
    const cut = text.length - limit;
    return `... (${cut} earlier chars omitted)\n${text.slice(cut)}`;
}

/**
 * Renders a run as something worth reading.
 *
 * A SWAT+ run prints far more than fits in a tool result, and almost none of
 * it matters when the thing went wrong. So the failure leads: the `forrtl`
 * line, then the named frames, then the tail. A reader who only sees the first
 * three lines still has the failing subroutine and its source line.
 *
 * When every frame is `Unknown`, that is called out rather than left as a wall
 * of addresses -- it means the build lost its traceback tables, which is a
 * build fix and not something to chase in the data.
 */
export function summarizeRun(outcome: RunOutcome): string {
    const lines: string[] = [];
    const combined = `${outcome.stdout}\n${outcome.stderr}`;
    const failure = parseRunFailure(combined);
    const seconds = (outcome.elapsedMs / 1000).toFixed(1);

    if (outcome.timedOut) {
        lines.push(`The run was still going after ${seconds}s and was stopped.`);
    } else if (failure) {
        lines.push(failure.message);
    } else if (outcome.exitCode === 0) {
        lines.push(`The run finished normally in ${seconds}s.`);
    } else {
        lines.push(
            `The run exited with code ${outcome.exitCode} after ${seconds}s, `
            + 'without a forrtl error.'
        );
    }

    if (failure && failure.frames.length > 0) {
        lines.push('');
        if (failure.unresolved) {
            lines.push(
                `traceback: ${failure.frames.length} frame(s), none named. The build `
                + 'has no usable traceback tables -- compile with /traceback and '
                + 'link /INCREMENTAL:NO, which is what lets the runtime name the '
                + 'routine and line itself.'
            );
        } else {
            lines.push('traceback, innermost first:');
        }
        for (const frame of failure.frames.slice(0, RUN_FRAME_LIMIT)) {
            // A frame with a file but no line still says more than a raw
            // address does, so the filename is kept rather than discarded
            // along with the line.
            const where = frame.source
                ? (frame.line !== undefined ? `${frame.source}:${frame.line}` : frame.source)
                : frame.pc;
            const named = frame.routine ? ` in ${frame.routine}` : '';
            lines.push(`  ${where}${named}`);
        }
        if (failure.frames.length > RUN_FRAME_LIMIT) {
            lines.push(`  ... ${failure.frames.length - RUN_FRAME_LIMIT} more frame(s)`);
        }
    }

    lines.push('');
    lines.push(`executable: ${outcome.executable}`);
    lines.push(`dataset:    ${outcome.datasetDir}`);
    lines.push(`exit code:  ${outcome.exitCode ?? `killed (${outcome.signal ?? 'unknown'})`}`);
    lines.push(`elapsed:    ${seconds}s`);

    const printed = tail(combined.trim(), RUN_TAIL_CHARS);
    if (printed) {
        lines.push('');
        lines.push('--- output ---');
        lines.push(printed);
    }
    return lines.join('\n');
}
