// Picking the Python interpreter. No vscode import, so unit tests can load it.
//
// The rule that matters: the script runs under ONE interpreter, the first that
// answers `--version`, and whatever that run prints is reported as it is. The
// Dataset Selector version retried the whole script with the next name whenever
// it exited non-zero, so on a machine where `python3` is the Microsoft Store
// stub the script's real error ("HRU ID(s) not found in hru.con") was replaced by
// "Python was not found", and each retry left another half-made subset folder.

import type { RunProcess } from './processRunner';

/** hru_processor.py uses `from __future__ import annotations`; older than this is untested. */
export const MIN_PYTHON: readonly [number, number] = [3, 8];

export interface PythonCandidateSource {
    /** `swatHruSubset.pythonPath` */
    setting?: string;
    /** `SWATPLUS_PYTHON` */
    env?: string;
    platform: NodeJS.Platform;
}

/** Interpreter names to probe, in order, without duplicates. */
export function pythonCandidateNames(source: PythonCandidateSource): string[] {
    const names: string[] = [];
    for (const configured of [source.setting, source.env]) {
        if (configured && configured.trim()) {
            names.push(configured.trim());
        }
    }
    if (source.platform === 'win32') {
        names.push('py', 'python', 'python3');
    } else {
        names.push('python3', 'python');
    }
    return Array.from(new Set(names));
}

export interface SkippedPython {
    command: string;
    reason: string;
}

export interface PythonInterpreter {
    command: string;
    /** First line of `--version`, e.g. "Python 3.13.12". */
    version: string;
}

export interface PythonResolution {
    interpreter?: PythonInterpreter;
    skipped: SkippedPython[];
}

/** A path inside the Microsoft Store's per-user alias folder. */
export function isWindowsAppsPath(command: string): boolean {
    return /[\\/]WindowsApps[\\/]/i.test(command);
}

const STORE_STUB_TEXT = /python was not found/i;
/** What cmd.exe reports for a command it cannot find, which the Store stub also returns. */
const EXIT_NOT_FOUND = 9009;

function firstLine(text: string): string {
    return text.split(/\r?\n/).map(line => line.trim()).find(line => line.length > 0) ?? '';
}

/**
 * Probes one interpreter with `--version` and says why it cannot be used, or
 * returns its version.
 */
export async function probePython(
    command: string,
    run: RunProcess,
    platform: NodeJS.Platform = process.platform
): Promise<{ version: string } | { skip: string }> {
    // The stub lives in WindowsApps; skipping by path means it is never started.
    if (platform === 'win32' && isWindowsAppsPath(command)) {
        return { skip: 'a Microsoft Store alias (WindowsApps) stub, not a Python install' };
    }

    const result = await run(command, ['--version'], { timeoutMs: 15000 });
    if (result.error) {
        if (result.error.code === 'ENOENT') {
            return { skip: 'not found' };
        }
        if (result.error.code === 'ETIMEDOUT') {
            return { skip: '`--version` did not answer within 15 seconds' };
        }
        return { skip: `could not be started (${result.error.message})` };
    }

    const combined = `${result.stdout}\n${result.stderr}`;
    if (result.code === EXIT_NOT_FOUND || STORE_STUB_TEXT.test(combined)) {
        return { skip: 'the Microsoft Store "Python was not found" stub' };
    }
    if (result.code !== 0) {
        const detail = firstLine(combined);
        return { skip: `\`--version\` exited with code ${result.code}${detail ? `: ${detail}` : ''}` };
    }

    // Python 3.4+ prints to stdout, older ones to stderr.
    const line = firstLine(result.stdout) || firstLine(result.stderr);
    const match = /^Python\s+(\d+)\.(\d+)/i.exec(line);
    if (!match) {
        return { skip: `\`--version\` printed "${line || 'nothing'}", not a Python version` };
    }
    const major = Number(match[1]);
    const minor = Number(match[2]);
    if (major < MIN_PYTHON[0] || (major === MIN_PYTHON[0] && minor < MIN_PYTHON[1])) {
        return { skip: `${line} is older than ${MIN_PYTHON[0]}.${MIN_PYTHON[1]}` };
    }
    return { version: line };
}

/** The first candidate that passes the probe, plus every one that was skipped and why. */
export async function resolvePython(
    names: readonly string[],
    run: RunProcess,
    platform: NodeJS.Platform = process.platform
): Promise<PythonResolution> {
    const skipped: SkippedPython[] = [];
    for (const command of names) {
        const probe = await probePython(command, run, platform);
        if ('version' in probe) {
            return { interpreter: { command, version: probe.version }, skipped };
        }
        skipped.push({ command, reason: probe.skip });
    }
    return { skipped };
}

/** Text for the "no usable Python" error: what was tried and how to fix it. */
export function describePythonNotFound(skipped: readonly SkippedPython[]): string {
    const tried = skipped.length > 0
        ? skipped.map(item => `  ${item.command}: ${item.reason}`).join('\n')
        : '  (no candidates)';
    return `No usable Python ${MIN_PYTHON[0]}.${MIN_PYTHON[1]}+ was found. Tried:\n${tried}\n`
        + 'Install Python from python.org, or set "swatHruSubset.pythonPath" (or the SWATPLUS_PYTHON environment variable) to an interpreter.';
}
