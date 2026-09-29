// One-click onboarding: installs Tamandua, wires up both its MCP server and
// this extension's own bundled one for both VS Code's native MCP discovery
// (.vscode/mcp.json) and Claude Code's (.mcp.json), and -- when the Fortran
// ifx/GNU Debug extension is present -- hands off to its own debug-config and
// MCP-config commands rather than duplicating that logic here.

import * as vscode from 'vscode';
import { spawn } from 'child_process';

interface CommandDescriptor {
    command: string;
    args: string[];
}

export interface SetupStepResult {
    label: string;
    status: 'ok' | 'skipped' | 'failed';
    detail: string;
}

export interface WorkspaceSetupOptions {
    extensionUri: vscode.Uri;
    selectedDatasetPath: string | undefined;
    isSwatplusSourceWorkspace: boolean;
}

interface CommandOutcome {
    status: number | null;
    stdout: string;
    stderr: string;
    error?: Error;
}

function getPythonCommandCandidates(): CommandDescriptor[] {
    return process.platform === 'win32'
        ? [{ command: 'py', args: ['-3'] }, { command: 'python', args: [] }, { command: 'python3', args: [] }]
        : [{ command: 'python3', args: [] }, { command: 'python', args: [] }];
}

function runCommand(descriptor: CommandDescriptor, extraArgs: string[]): Promise<CommandOutcome> {
    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let settled = false;
        try {
            const child = spawn(descriptor.command, [...descriptor.args, ...extraArgs], {
                stdio: 'pipe',
                windowsHide: true
            });
            child.stdout?.on('data', (chunk: Buffer | string) => {
                stdout += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
            });
            child.stderr?.on('data', (chunk: Buffer | string) => {
                stderr += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
            });
            child.on('error', (error) => {
                if (settled) { return; }
                settled = true;
                resolve({ status: null, stdout, stderr, error });
            });
            child.on('close', (status) => {
                if (settled) { return; }
                settled = true;
                resolve({ status, stdout, stderr });
            });
        } catch (error) {
            resolve({
                status: null,
                stdout,
                stderr,
                error: error instanceof Error ? error : new Error(String(error))
            });
        }
    });
}

async function detectPythonCommand(): Promise<CommandDescriptor | undefined> {
    for (const candidate of getPythonCommandCandidates()) {
        const result = await runCommand(candidate, ['--version']);
        if (!result.error && result.status === 0) {
            return candidate;
        }
    }
    return undefined;
}

async function isTamanduaOnPath(): Promise<boolean> {
    const result = await runCommand({ command: 'swatplus-mcp', args: [] }, ['--help']);
    return !result.error && result.status === 0;
}

async function installTamandua(): Promise<SetupStepResult> {
    if (await isTamanduaOnPath()) {
        return { label: 'Tamandua', status: 'ok', detail: 'already installed (swatplus-mcp is on PATH).' };
    }

    const python = await detectPythonCommand();
    if (!python) {
        return {
            label: 'Tamandua',
            status: 'skipped',
            detail: 'no Python interpreter found on PATH. Install Python 3.11+ and re-run this command.'
        };
    }

    const install = await runCommand(python, ['-m', 'pip', 'install', 'git+https://github.com/tugraskan/Tamandua.git']);
    if (install.error || install.status !== 0) {
        const reason = install.error
            ? install.error.message
            : install.stderr.trim().split('\n').slice(-5).join('\n') || `pip exited ${install.status}`;
        return { label: 'Tamandua', status: 'failed', detail: `pip install failed: ${reason}` };
    }

    const resolvesNow = await isTamanduaOnPath();
    return {
        label: 'Tamandua',
        status: 'ok',
        detail: resolvesNow
            ? 'installed via pip.'
            : 'installed via pip, but swatplus-mcp is not resolvable on PATH in this VS Code session yet -- ' +
              'reload the window before using it.'
    };
}

async function readJsonObject(uri: vscode.Uri): Promise<Record<string, unknown>> {
    try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        const parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

/**
 * Merges one server definition into an MCP config file, keyed by `serversKey`
 * ("servers" for VS Code's native .vscode/mcp.json, "mcpServers" for Claude
 * Code's .mcp.json). Every other entry already in the file is left alone.
 */
async function mergeMcpServer(
    configUri: vscode.Uri,
    serversKey: 'servers' | 'mcpServers',
    name: string,
    definition: Record<string, unknown>
): Promise<void> {
    const existing = await readJsonObject(configUri);
    const servers = { ...((existing[serversKey] as Record<string, unknown>) ?? {}), [name]: definition };
    const merged = { ...existing, [serversKey]: servers };

    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(configUri, '..'));
    await vscode.workspace.fs.writeFile(
        configUri,
        Buffer.from(`${JSON.stringify(merged, null, 2)}\n`, 'utf8')
    );
}

const IFX_DEBUG_EXTENSION_ID = 'PbsandtDev.vsc-ifx-debug';

async function setUpIfxDebug(claudeMcpUri: vscode.Uri, vscodeMcpUri: vscode.Uri): Promise<SetupStepResult[]> {
    const extension = vscode.extensions.getExtension(IFX_DEBUG_EXTENSION_ID);
    if (!extension) {
        return [{
            label: 'Fortran debug setup',
            status: 'skipped',
            detail: 'the Fortran ifx/GNU Debug extension is not installed. Install it (or the SWAT+ Tools ' +
                'extension pack) to also get a debug launch config and its MCP server wired in.'
        }];
    }

    const results: SetupStepResult[] = [];
    try {
        if (!extension.isActive) {
            await extension.activate();
        }
    } catch (error) {
        return [{
            label: 'Fortran debug setup',
            status: 'failed',
            detail: `could not activate the Fortran ifx/GNU Debug extension: ${
                error instanceof Error ? error.message : String(error)
            }`
        }];
    }

    try {
        await vscode.commands.executeCommand('fortranIfx.createFortranLaunchConfig');
        results.push({
            label: 'Fortran debug config',
            status: 'ok',
            detail: 'handed off to the Fortran ifx/GNU Debug extension\'s own setup flow -- follow any prompt ' +
                'it showed.'
        });
    } catch (error) {
        results.push({
            label: 'Fortran debug config',
            status: 'failed',
            detail: error instanceof Error ? error.message : String(error)
        });
    }

    try {
        await vscode.commands.executeCommand('fortranIfx.writeMcpServerConfig');
        // That command wrote .vscode/mcp.json itself; mirror the same entry into
        // .mcp.json so Claude Code (not just VS Code's native MCP discovery) sees it.
        const vscodeMcp = await readJsonObject(vscodeMcpUri);
        const ifxServer = (vscodeMcp.servers as Record<string, unknown> | undefined)?.['fortran-ifx'];
        if (ifxServer) {
            await mergeMcpServer(claudeMcpUri, 'mcpServers', 'fortran-ifx', ifxServer as Record<string, unknown>);
            results.push({
                label: 'Fortran ifx MCP config',
                status: 'ok',
                detail: 'added to .vscode/mcp.json and .mcp.json. Its port changes each session -- re-run this ' +
                    'command after a reload if the connection goes stale.'
            });
        } else {
            results.push({
                label: 'Fortran ifx MCP config',
                status: 'skipped',
                detail: 'the debug MCP server has no address yet. Re-run this command once it has started.'
            });
        }
    } catch (error) {
        results.push({
            label: 'Fortran ifx MCP config',
            status: 'failed',
            detail: error instanceof Error ? error.message : String(error)
        });
    }

    return results;
}

/** Runs every onboarding step, collecting what happened rather than throwing partway through. */
export async function setupWorkspace(options: WorkspaceSetupOptions): Promise<SetupStepResult[]> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
        return [{ label: 'Workspace', status: 'failed', detail: 'no folder is open.' }];
    }

    const results: SetupStepResult[] = [];
    const vscodeMcpUri = vscode.Uri.joinPath(folder.uri, '.vscode', 'mcp.json');
    const claudeMcpUri = vscode.Uri.joinPath(folder.uri, '.mcp.json');

    const tamanduaResult = await installTamandua();
    results.push(tamanduaResult);

    if (tamanduaResult.status === 'ok') {
        const args = ['--compact', ...(options.isSwatplusSourceWorkspace ? ['--source', folder.uri.fsPath] : [])];
        await mergeMcpServer(vscodeMcpUri, 'servers', 'tamandua', { command: 'swatplus-mcp', args });
        await mergeMcpServer(claudeMcpUri, 'mcpServers', 'tamandua', { command: 'swatplus-mcp', args });
        results.push({
            label: 'Tamandua MCP config',
            status: 'ok',
            detail: `added to .vscode/mcp.json and .mcp.json (${
                options.isSwatplusSourceWorkspace ? 'reading this checkout live' : 'serving the bundled snapshot'
            }).`
        });
    } else {
        results.push({
            label: 'Tamandua MCP config',
            status: 'skipped',
            detail: 'Tamandua is not installed yet -- fix that above and re-run this command.'
        });
    }

    const serverJsPath = vscode.Uri.joinPath(options.extensionUri, 'dist', 'mcp-server.js').fsPath;
    const datasetArgs = options.selectedDatasetPath ? ['--dataset', options.selectedDatasetPath] : [];
    await mergeMcpServer(vscodeMcpUri, 'servers', 'swatplus-dataset', { command: 'node', args: [serverJsPath, ...datasetArgs] });
    await mergeMcpServer(claudeMcpUri, 'mcpServers', 'swatplus-dataset', { command: 'node', args: [serverJsPath, ...datasetArgs] });
    results.push({
        label: 'Dataset MCP config',
        status: 'ok',
        detail: options.selectedDatasetPath
            ? `added, pointed at ${options.selectedDatasetPath}.`
            : 'added in docs-only mode (no dataset selected yet -- select one and re-run to wire it in).'
    });

    results.push(...(await setUpIfxDebug(claudeMcpUri, vscodeMcpUri)));

    return results;
}
