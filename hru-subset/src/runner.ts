// Running hru_processor.py. No vscode import, so tests and scripts/real-check.js
// can drive it directly.
//
// Each call here starts the script exactly once, under the interpreter it is
// given. There is no retry: an error from the script is the answer, and it is
// reported as the script wrote it.

import * as fs from 'fs';
import * as path from 'path';
import { isSameOrInside } from './paths';
import { RESULT_FILE_NAME } from './dataset';
import { buildSubsetArgs, SubsetArgsInput } from './options';
import type { ProcessResult, RunProcess } from './processRunner';
import type { PythonInterpreter } from './python';
import type { HruRange, SubsetResult } from './summary';

export interface RunnerContext {
    scriptPath: string;
    python: PythonInterpreter;
    run: RunProcess;
    signal?: AbortSignal;
    /** Receives the script's stderr as it is written (its progress log). */
    onLog?: (text: string) => void;
}

/** The script ran and failed, or could not be run. `message` is what to show. */
export class ScriptError extends Error {
    constructor(
        message: string,
        readonly details: { exitCode?: number | null; cancelled?: boolean } = {}
    ) {
        super(message);
        this.name = 'ScriptError';
    }

    get cancelled(): boolean {
        return this.details.cancelled === true;
    }
}

function tryParseJson(text: string): unknown {
    const trimmed = text.trim();
    if (!trimmed) {
        return undefined;
    }
    try {
        return JSON.parse(trimmed);
    } catch {
        return undefined;
    }
}

function lastLines(text: string, count: number): string {
    return text.trim().split(/\r?\n/).slice(-count).join('\n');
}

/** The message for a failed run: the script's own `error`, else the end of stderr. */
function failureMessage(result: ProcessResult, payload: unknown): string {
    if (payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string') {
        return (payload as { error: string }).error;
    }
    const tail = lastLines(result.stderr, 15) || lastLines(result.stdout, 15);
    return tail || `The script exited with code ${result.code} and printed nothing.`;
}

/** Runs the script once with `--json` and returns its parsed stdout. */
export async function runScriptJson<T>(context: RunnerContext, args: string[]): Promise<T> {
    const fullArgs = [context.scriptPath, ...args, '--json'];
    const result = await context.run(context.python.command, fullArgs, {
        signal: context.signal,
        onStderr: context.onLog
    });

    if (result.error) {
        const cancelled = result.error.code === 'ABORT_ERR';
        throw new ScriptError(
            cancelled ? 'Cancelled.' : `Could not run ${context.python.command}: ${result.error.message}`,
            { cancelled }
        );
    }

    const payload = tryParseJson(result.stdout);
    if (result.code !== 0 || (payload && (payload as { ok?: unknown }).ok === false)) {
        throw new ScriptError(failureMessage(result, payload), { exitCode: result.code });
    }
    if (payload === undefined) {
        throw new ScriptError(
            `The script exited normally but printed no JSON.${result.stderr.trim() ? `\n${lastLines(result.stderr, 15)}` : ''}`,
            { exitCode: result.code }
        );
    }
    return payload as T;
}

/** `--hru-range --json`: how many HRUs, and the lowest and highest id. */
export function inspectHruRange(context: RunnerContext, datasetPath: string): Promise<HruRange> {
    return runScriptJson<HruRange>(context, ['--dataset', datasetPath, '--hru-range']);
}

export interface SubsetRun {
    result: SubsetResult;
    /** The marker file written into the output folder. */
    resultFile: string;
    /** Set when the marker could not be written; the subset itself is fine. */
    resultFileError?: string;
}

/**
 * The record kept in the output folder as hru_subset_result.json. It is the
 * script's JSON plus where it came from, and its presence marks the folder as a
 * subset.
 */
export function buildResultRecord(result: SubsetResult, tool: { name: string; version: string }, createdAt: Date): object {
    return { tool, created_at: createdAt.toISOString(), ...result };
}

export function writeResultFile(
    outputDir: string,
    result: SubsetResult,
    tool: { name: string; version: string },
    createdAt: Date = new Date()
): string {
    const file = path.join(outputDir, RESULT_FILE_NAME);
    fs.writeFileSync(file, JSON.stringify(buildResultRecord(result, tool, createdAt), null, 2) + '\n', 'utf8');
    return file;
}

/** Creates the subset (one script run) and writes the marker file into it. */
export async function createSubset(
    context: RunnerContext,
    input: SubsetArgsInput,
    tool: { name: string; version: string }
): Promise<SubsetRun> {
    const result = await runScriptJson<SubsetResult>(context, buildSubsetArgs(input));
    const outputDir = result.output_dir || input.outputDir;
    try {
        return { result, resultFile: writeResultFile(outputDir, result, tool) };
    } catch (error) {
        return {
            result,
            resultFile: path.join(outputDir, RESULT_FILE_NAME),
            resultFileError: error instanceof Error ? error.message : String(error)
        };
    }
}

/**
 * Whether a half-made output folder may be deleted, as the reason it may not
 * (undefined: it may). Only a folder this run created qualifies, so a folder
 * that existed before the run, the dataset, anything around or inside the
 * dataset, and a filesystem root are all refused.
 */
export function whyNotDeletable(
    output: string,
    existedBefore: boolean,
    datasetFolders: readonly string[],
    platform: NodeJS.Platform = process.platform
): string | undefined {
    if (existedBefore) {
        return 'the folder existed before the run';
    }
    const api = platform === 'win32' ? path.win32 : path.posix;
    if (api.dirname(api.resolve(output)) === api.resolve(output)) {
        return 'it is a filesystem root';
    }
    for (const dataset of datasetFolders) {
        if (isSameOrInside(output, dataset, platform) || isSameOrInside(dataset, output, platform)) {
            return `it overlaps the dataset folder ${dataset}`;
        }
    }
    return undefined;
}

/**
 * Deletes the output folder of a failed run and nothing else. Returns false when
 * the folder is not there (the script failed before copying), true when deleted.
 */
export function deletePartialOutput(
    output: string,
    existedBefore: boolean,
    datasetFolders: readonly string[]
): boolean {
    const refusal = whyNotDeletable(output, existedBefore, datasetFolders);
    if (refusal) {
        throw new Error(`Not deleting ${output}: ${refusal}.`);
    }
    let stat: fs.Stats;
    try {
        stat = fs.lstatSync(output);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return false;
        }
        throw error;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error(`Not deleting ${output}: it is not a plain folder.`);
    }
    fs.rmSync(output, { recursive: true, force: true });
    return true;
}
