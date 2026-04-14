import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

export interface HruProcessorResult {
    ok: boolean;
    output_dir: string;
    source_dir: string;
    hru_ids: number[];
    keep_routing: boolean;
    run_simulation: boolean;
    simulation_exe?: string | null;
    retained_counts?: Record<string, number>;
    error?: string;
}

export interface HruRangeResult {
    ok: boolean;
    source_dir: string;
    min_hru: number;
    max_hru: number;
    total_hrus: number;
    error?: string;
}

export interface HruProcessorOptions {
    datasetPath: string;
    hruIds: string;
    keepRouting: boolean;
    runSwat: boolean;
    executablePath?: string;
}

interface PythonRunResult {
    code: number | null;
    stdout: string;
    stderr: string;
    error?: NodeJS.ErrnoException;
}

function getPythonCandidates(): string[] {
    const candidates: string[] = [];
    const configured = process.env['SWATPLUS_PYTHON'];
    if (configured) {
        candidates.push(configured);
    }

    if (process.platform === 'win32') {
        candidates.push('py', 'python', 'python3');
    } else {
        candidates.push('python3', 'python');
    }

    return Array.from(new Set(candidates));
}

function runPythonCandidate(
    pythonExecutable: string,
    args: string[],
    outputChannel: vscode.OutputChannel
): Promise<PythonRunResult> {
    return new Promise(resolve => {
        outputChannel.appendLine(`> ${pythonExecutable} ${args.map(arg => arg.includes(' ') ? `"${arg}"` : arg).join(' ')}`);

        const child = spawn(pythonExecutable, args, { shell: false });
        let stdout = '';
        let stderr = '';
        let settled = false;

        child.stdout.on('data', chunk => {
            const text = chunk.toString();
            stdout += text;
        });

        child.stderr.on('data', chunk => {
            const text = chunk.toString();
            stderr += text;
            outputChannel.append(text);
        });

        child.on('error', error => {
            if (settled) {
                return;
            }
            settled = true;
            resolve({ code: null, stdout, stderr, error });
        });

        child.on('close', code => {
            if (settled) {
                return;
            }
            settled = true;
            resolve({ code, stdout, stderr });
        });
    });
}

function parseJsonPayload<T>(stdout: string): T {
    const trimmed = stdout.trim();
    if (!trimmed) {
        throw new Error('No JSON output was produced.');
    }
    return JSON.parse(trimmed) as T;
}

async function runHruProcessorJson<T>(
    context: vscode.ExtensionContext,
    args: string[],
    outputChannel: vscode.OutputChannel
): Promise<T> {
    const scriptPath = path.join(context.extensionPath, 'scripts', 'hru_processor.py');
    if (!fs.existsSync(scriptPath)) {
        throw new Error('HRU processor script not found (scripts/hru_processor.py).');
    }

    const fullArgs = [scriptPath, ...args, '--json'];
    const candidates = getPythonCandidates();
    let lastError = '';

    for (const pythonExecutable of candidates) {
        const result = await runPythonCandidate(pythonExecutable, fullArgs, outputChannel);
        if (result.error) {
            if (result.error.code !== 'ENOENT') {
                lastError = result.error.message;
                outputChannel.appendLine(`Failed to start ${pythonExecutable}: ${lastError}`);
            }
            continue;
        }

        if (result.code === 0) {
            return parseJsonPayload<T>(result.stdout);
        }

        try {
            const payload = parseJsonPayload<{ error?: string }>(result.stdout);
            lastError = payload.error || `Exit code ${result.code}`;
        } catch {
            lastError = (result.stderr || result.stdout || `Exit code ${result.code}`).trim();
        }
        outputChannel.appendLine(lastError);
    }

    throw new Error(lastError || `Python not found. Tried: ${candidates.join(', ')}`);
}

export async function inspectHruRange(
    context: vscode.ExtensionContext,
    datasetPath: string,
    outputChannel: vscode.OutputChannel
): Promise<HruRangeResult> {
    return runHruProcessorJson<HruRangeResult>(
        context,
        ['--dataset', datasetPath, '--hru-range'],
        outputChannel
    );
}

export async function runHruProcessor(
    context: vscode.ExtensionContext,
    options: HruProcessorOptions,
    outputChannel: vscode.OutputChannel
): Promise<HruProcessorResult> {
    const args = [
        '--dataset',
        options.datasetPath,
        '--hru-ids',
        options.hruIds
    ];

    if (options.keepRouting) {
        args.push('--keep-routing');
    }
    if (options.runSwat) {
        args.push('--run-swat');
    }
    if (options.executablePath) {
        args.push('--exe', options.executablePath);
    }

    const result = await runHruProcessorJson<HruProcessorResult>(context, args, outputChannel);
    if (!result.ok) {
        throw new Error(result.error || 'HRU processor failed.');
    }
    return result;
}

export function validateHruIdInput(value: string): string | undefined {
    if (!value.trim()) {
        return 'Enter at least one HRU ID.';
    }

    for (const part of value.split(',')) {
        const trimmed = part.trim();
        if (!trimmed) {
            return 'Remove empty comma-separated entries.';
        }
        if (trimmed.includes('-')) {
            const pieces = trimmed.split('-').map(piece => piece.trim());
            if (pieces.length !== 2 || !pieces[0] || !pieces[1]) {
                return `Invalid range: ${trimmed}`;
            }
            const start = Number(pieces[0]);
            const end = Number(pieces[1]);
            if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end <= 0) {
                return `Ranges must contain positive integers: ${trimmed}`;
            }
            if (start > end) {
                return `Range start must be <= end: ${trimmed}`;
            }
        } else {
            const valueNumber = Number(trimmed);
            if (!Number.isInteger(valueNumber) || valueNumber <= 0) {
                return `Invalid HRU ID: ${trimmed}`;
            }
        }
    }

    return undefined;
}
