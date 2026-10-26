// The "Create Subset…" command: the only file besides extension.ts that imports
// vscode. Everything it decides lives in the modules next to it.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { describeSubsetDetection, detectSubsetFolder } from './dataset';
import { expandHruIds, formatHruIds, validateHruIdText } from './ids';
import {
    DEFAULT_OPTIONS,
    OPTION_CHOICES,
    OptionKey,
    optionsFromPicked,
    SubsetOptions
} from './options';
import { canonicalPath, checkOutputLocation, defaultOutputPath, outputPathInside, uniqueOutputPath } from './paths';
import { runProcess } from './processRunner';
import { describePythonNotFound, pythonCandidateNames, resolvePython } from './python';
import { createSubset, deletePartialOutput, inspectHruRange, RunnerContext, ScriptError } from './runner';
import { formatHeadline, formatRange, formatSummaryLines, SubsetResult } from './summary';
import { commandLineFor, shellKind } from './terminal';

const exists = (p: string): boolean => fs.existsSync(p);
const isFile = (p: string): boolean => {
    try {
        return fs.statSync(p).isFile();
    } catch {
        return false;
    }
};
const realpath = (p: string): string | undefined => {
    try {
        return fs.realpathSync.native(p);
    } catch {
        return undefined;
    }
};

const TITLE = 'SWAT+ HRU Subset';

/** Asks for the dataset folder; undefined when cancelled. Loops while the user wants another folder. */
async function pickDatasetFolder(log: vscode.OutputChannel): Promise<string | undefined> {
    for (;;) {
        const picked = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Use as Dataset',
            title: `${TITLE}: select the SWAT+ dataset folder (the one with file.cio)`
        });
        const folder = picked?.[0]?.fsPath;
        if (!folder) {
            return undefined;
        }

        const resolved = (() => {
            for (const candidate of [folder, path.join(folder, 'TxtInOut')]) {
                if (isFile(path.join(candidate, 'file.cio'))) {
                    return candidate;
                }
            }
            return undefined;
        })();
        const folders = resolved && resolved !== folder ? [folder, resolved] : [folder];
        const detection = detectSubsetFolder(folders, exists);
        if (!detection) {
            return folder;
        }

        log.appendLine(`Warning: ${describeSubsetDetection(detection)}`);
        const choice = await vscode.window.showWarningMessage(
            'This folder is already an HRU subset',
            {
                modal: true,
                detail: `${describeSubsetDetection(detection)}\n\nPick the original dataset to make a subset of it.`
            },
            'Choose Another Folder',
            'Use It Anyway'
        );
        if (choice === 'Use It Anyway') {
            return folder;
        }
        if (choice !== 'Choose Another Folder') {
            return undefined;
        }
    }
}

/** Picks the folder to create, never inside the dataset; undefined when cancelled. */
async function pickOutputFolder(datasetFolders: string[]): Promise<string | undefined> {
    const primary = datasetFolders[0];
    for (;;) {
        const suggested = defaultOutputPath(primary, new Date());
        const choice = await vscode.window.showQuickPick(
            [
                {
                    label: `$(folder) ${path.basename(suggested)}`,
                    description: 'next to the dataset',
                    detail: suggested,
                    custom: false
                },
                {
                    label: '$(folder-opened) Choose a different folder…',
                    description: 'a new subset folder is created inside the folder you pick',
                    custom: true
                }
            ],
            {
                title: `${TITLE}: output folder`,
                placeHolder: 'Where should the subset be created? It is a new folder, never inside the dataset.',
                ignoreFocusOut: true
            }
        );
        if (!choice) {
            return undefined;
        }

        let output = suggested;
        if (choice.custom) {
            const picked = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Create Subset Here',
                title: `${TITLE}: folder to create the subset in`,
                defaultUri: vscode.Uri.file(path.dirname(path.resolve(primary)))
            });
            if (!picked?.[0]) {
                continue;
            }
            output = outputPathInside(picked[0].fsPath, primary, new Date());
        }

        output = uniqueOutputPath(output, exists);
        const refusal = checkOutputLocation(output, datasetFolders)
            ?? checkOutputLocation(
                canonicalPath(output, realpath),
                datasetFolders.map(folder => canonicalPath(folder, realpath))
            );
        if (refusal) {
            await vscode.window.showErrorMessage('Cannot create the subset there', { modal: true, detail: refusal });
            continue;
        }
        return output;
    }
}

/** Starts SWAT+ in a terminal in `outputDir`; asks for the executable the first time. */
async function runSwat(outputDir: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('swatHruSubset');
    let exe = (config.get<string>('swatExecutable') ?? '').trim();
    if (!exe || !isFile(exe)) {
        if (exe) {
            vscode.window.showWarningMessage(`The SWAT+ executable in "swatHruSubset.swatExecutable" was not found: ${exe}`);
        }
        const picked = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: process.platform === 'win32' ? { Executable: ['exe'], 'All Files': ['*'] } : undefined,
            openLabel: 'Select SWAT+ Executable',
            title: `${TITLE}: select the SWAT+ executable to run`
        });
        if (!picked?.[0]) {
            return;
        }
        exe = picked[0].fsPath;
        await config.update('swatExecutable', exe, vscode.ConfigurationTarget.Global);
    }

    const terminal = vscode.window.createTerminal({ name: 'SWAT+ (HRU subset)', cwd: outputDir });
    terminal.show();
    terminal.sendText(commandLineFor(exe, shellKind(vscode.env.shell)));
}

async function showFailure(
    log: vscode.OutputChannel,
    message: string,
    detail: string,
    output: string,
    outputExistedBefore: boolean,
    datasetFolders: string[]
): Promise<void> {
    log.appendLine(`${message}\n${detail}`);
    const partial = !outputExistedBefore && exists(output);
    const buttons = partial ? ['Delete Partial Output', 'Show Log'] : ['Show Log'];
    const choice = await vscode.window.showErrorMessage(
        message,
        {
            modal: true,
            detail: partial ? `${detail}\n\nThe run left a partly made folder:\n${output}` : detail
        },
        ...buttons
    );
    if (choice === 'Show Log') {
        log.show();
    } else if (choice === 'Delete Partial Output') {
        try {
            const removed = deletePartialOutput(output, outputExistedBefore, datasetFolders);
            log.appendLine(removed ? `Deleted ${output}` : `${output} was already gone.`);
            vscode.window.showInformationMessage(`Deleted ${output}`);
        } catch (error) {
            vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
        }
    }
}

export async function createSubsetCommand(context: vscode.ExtensionContext, log: vscode.OutputChannel): Promise<void> {
    const scriptPath = path.join(context.extensionPath, 'python', 'hru_processor.py');
    if (!isFile(scriptPath)) {
        vscode.window.showErrorMessage(
            `${TITLE}: hru_processor.py is missing from the extension (${scriptPath}). `
            + 'Run "npm run copy-python" in hru-subset/ and rebuild, or reinstall the extension.'
        );
        return;
    }

    // 1. Dataset folder.
    const datasetPick = await pickDatasetFolder(log);
    if (!datasetPick) {
        return;
    }

    log.clear();
    log.appendLine(`Dataset: ${datasetPick}`);

    // Python: one interpreter, chosen before anything runs.
    const config = vscode.workspace.getConfiguration('swatHruSubset');
    const names = pythonCandidateNames({
        setting: config.get<string>('pythonPath'),
        env: process.env['SWATPLUS_PYTHON'],
        platform: process.platform
    });
    const resolution = await resolvePython(names, runProcess);
    for (const item of resolution.skipped) {
        log.appendLine(`Skipped Python "${item.command}": ${item.reason}`);
    }
    if (!resolution.interpreter) {
        log.appendLine(describePythonNotFound(resolution.skipped));
        await vscode.window.showErrorMessage('No usable Python found', {
            modal: true,
            detail: describePythonNotFound(resolution.skipped)
        });
        return;
    }
    const python = resolution.interpreter;
    log.appendLine(`Python: ${python.command} (${python.version})`);

    const runnerContext = (signal?: AbortSignal): RunnerContext => ({
        scriptPath,
        python,
        run: runProcess,
        signal,
        onLog: text => log.append(text)
    });

    // 2. HRU range; the script also resolves the TxtInOut folder here.
    let range;
    try {
        range = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `${TITLE}: reading HRU range…` },
            () => inspectHruRange(runnerContext(), datasetPick)
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.appendLine(message);
        await vscode.window.showErrorMessage('Could not read the dataset', { modal: true, detail: message });
        return;
    }
    const datasetFolders = Array.from(new Set([datasetPick, range.source_dir]));
    log.appendLine(`HRUs: ${formatRange(range)} in ${range.source_dir}`);

    // 3. HRU ids.
    const idText = await vscode.window.showInputBox({
        title: `${TITLE}: HRU IDs`,
        prompt: `${formatRange(range)}. Enter HRU IDs or ranges, for example 1,4-6,10.`,
        placeHolder: '1,4-6,10',
        ignoreFocusOut: true,
        validateInput: value => validateHruIdText(value, range.min_hru, range.max_hru)
    });
    if (idText === undefined) {
        return;
    }
    const hruIds = formatHruIds(expandHruIds(idText));

    // 4. Options.
    type OptionItem = vscode.QuickPickItem & { key: OptionKey };
    const items: OptionItem[] = OPTION_CHOICES.map(choice => ({
        label: choice.label,
        description: choice.description,
        detail: choice.detail,
        picked: DEFAULT_OPTIONS[choice.key],
        key: choice.key
    }));
    const pickedItems = await vscode.window.showQuickPick(items, {
        title: `${TITLE}: options`,
        placeHolder: 'Tick what applies. Enter keeps the defaults.',
        canPickMany: true,
        ignoreFocusOut: true
    });
    if (!pickedItems) {
        return;
    }
    const options: SubsetOptions = optionsFromPicked(new Set(pickedItems.map(item => item.key)));

    // 5. Output folder.
    const output = await pickOutputFolder(datasetFolders);
    if (!output) {
        return;
    }
    const outputExistedBefore = exists(output);

    // 6. Run.
    log.appendLine(`HRU IDs: ${hruIds}`);
    log.appendLine(`Options: ${JSON.stringify(options)}`);
    log.appendLine(`Output: ${output}`);
    const controller = new AbortController();
    try {
        const run = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `${TITLE}: creating subset…`,
                cancellable: true
            },
            (_progress, token) => {
                token.onCancellationRequested(() => controller.abort());
                return createSubset(
                    runnerContext(controller.signal),
                    { datasetPath: datasetPick, hruIds, outputDir: output, options },
                    { name: 'swat-hru-subset', version: String(context.extension.packageJSON.version) }
                );
            }
        );

        const result: SubsetResult = run.result;
        const lines = formatSummaryLines(result);
        if (run.resultFileError) {
            lines.push(`Could not write ${run.resultFile}: ${run.resultFileError}`);
        } else {
            lines.push(`Result: ${run.resultFile}`);
        }
        for (const line of lines) {
            log.appendLine(line);
        }

        const choice = await vscode.window.showInformationMessage(
            formatHeadline(result),
            { modal: true, detail: lines.join('\n') },
            'Open Folder',
            'Run SWAT+'
        );
        if (choice === 'Open Folder') {
            await vscode.commands.executeCommand(
                'vscode.openFolder',
                vscode.Uri.file(result.output_dir),
                { forceNewWindow: true }
            );
        } else if (choice === 'Run SWAT+') {
            await runSwat(result.output_dir);
        }
    } catch (error) {
        if (error instanceof ScriptError && error.cancelled) {
            await showFailure(log, 'Cancelled', 'The run was cancelled.', output, outputExistedBefore, datasetFolders);
            return;
        }
        const detail = error instanceof Error ? error.message : String(error);
        await showFailure(log, 'Creating the subset failed', detail, output, outputExistedBefore, datasetFolders);
    }
}
