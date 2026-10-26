// The sidebar panel (a webview view) and the glue that gives the controller its
// real files, dialogs and Python. With extension.ts and pickerPanel.ts, the only
// files that import vscode.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { PanelController, PanelEnv } from './controller';
import { SELECTOR_COMMAND, SELECTOR_EXTENSION_ID, selectorAvailable } from './datasetSource';
import { makeNonce, panelHtml } from './html';
import { isPanelMessage, PanelViewState } from './protocol';
import { runProcess } from './processRunner';
import {
    describePythonNotFound,
    PythonInterpreter,
    pythonCandidateNames,
    resolvePython
} from './python';
import { RunnerContext } from './runner';
import { PickerPanel } from './pickerPanel';

export const VIEW_ID = 'swatHruSubsetView';

const isDirectory = (p: string): boolean => {
    try {
        return fs.statSync(p).isDirectory();
    } catch {
        return false;
    }
};
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

/**
 * Finds the one Python the script runs under, once per setting value. Concurrent
 * callers share the probe. The script is never retried with another interpreter.
 */
export class PythonLocator {
    private cached?: { key: string; promise: Promise<PythonInterpreter> };

    constructor(private readonly log: (text: string) => void) {}

    invalidate(): void {
        this.cached = undefined;
    }

    resolve(): Promise<PythonInterpreter> {
        const config = vscode.workspace.getConfiguration('swatHruSubset');
        const names = pythonCandidateNames({
            setting: config.get<string>('pythonPath'),
            env: process.env['SWATPLUS_PYTHON'],
            platform: process.platform
        });
        const key = names.join('\n');
        if (this.cached?.key === key) {
            return this.cached.promise;
        }
        const promise = (async () => {
            const resolution = await resolvePython(names, runProcess);
            for (const item of resolution.skipped) {
                this.log(`Skipped Python "${item.command}": ${item.reason}\n`);
            }
            if (!resolution.interpreter) {
                throw new Error(describePythonNotFound(resolution.skipped));
            }
            this.log(`Python: ${resolution.interpreter.command} (${resolution.interpreter.version})\n`);
            return resolution.interpreter;
        })();
        this.cached = { key, promise };
        // A failed probe is not kept: the next call looks again (Python may have been installed since).
        promise.catch(() => {
            if (this.cached?.promise === promise) {
                this.cached = undefined;
            }
        });
        return promise;
    }
}

export class HruSubsetViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    readonly controller: PanelController;
    readonly python: PythonLocator;
    private view?: vscode.WebviewView;
    private lastPickerIds?: string;
    /** What the smoke test observes: the latest state posted, and the latest revision the webview drew. */
    lastState?: PanelViewState;
    renderedRevision = 0;
    readyCount = 0;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly log: vscode.OutputChannel
    ) {
        this.python = new PythonLocator(text => log.append(text));
        this.controller = new PanelController(this.createEnv());
    }

    dispose(): void {
        this.view = undefined;
    }

    /** The runner context for the script, or a rejection that says why not (also used by the picker). */
    async runnerContext(signal?: AbortSignal): Promise<RunnerContext> {
        const scriptPath = path.join(this.context.extensionPath, 'python', 'hru_processor.py');
        if (!isFile(scriptPath)) {
            throw new Error(`hru_processor.py is missing from the extension (${scriptPath}). Reinstall the extension.`);
        }
        const python = await this.python.resolve();
        return { scriptPath, python, run: runProcess, signal, onLog: text => this.log.append(text) };
    }

    resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        const distUri = vscode.Uri.joinPath(this.context.extensionUri, 'dist');
        view.webview.options = { enableScripts: true, localResourceRoots: [distUri] };
        view.webview.html = panelHtml({
            nonce: makeNonce(),
            scriptUri: view.webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'panel.js')).toString(),
            title: 'SWAT+ HRU Subset'
        });
        view.webview.onDidReceiveMessage(async (message: unknown) => {
            if (!isPanelMessage(message)) {
                return;
            }
            if (message.type === 'rendered') {
                this.renderedRevision = Math.max(this.renderedRevision, message.revision);
            } else if (message.type === 'ready') {
                this.readyCount++;
            }
            try {
                await this.controller.handle(message);
            } catch (error) {
                const text = error instanceof Error ? error.message : String(error);
                this.log.appendLine(`Unexpected error: ${text}`);
                void vscode.window.showErrorMessage(`SWAT+ HRU Subset: ${text}`);
            }
        });
        view.onDidDispose(() => {
            if (this.view === view) {
                this.view = undefined;
            }
        });
    }

    /** Shows the sidebar panel (activity bar icon, then the view). */
    async reveal(): Promise<void> {
        await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    }

    private post(state: PanelViewState): void {
        this.lastState = state;
        void this.view?.webview.postMessage({ type: 'state', state });
        // The picker follows the IDs box while it is valid.
        if (!state.ids.error && state.ids.text !== this.lastPickerIds) {
            this.lastPickerIds = state.ids.text;
            PickerPanel.syncSelection(state.ids.text);
        }
    }

    private createEnv(): PanelEnv {
        return {
            isDirectory,
            isFile,
            exists: p => fs.existsSync(p),
            realpath,
            now: () => new Date(),
            getRunner: signal => this.runnerContext(signal),
            pythonStatus: async () => {
                try {
                    const python = await this.python.resolve();
                    return { ok: true, text: `Python: ${python.version} (${python.command})` };
                } catch (error) {
                    return { ok: false, text: error instanceof Error ? error.message : String(error) };
                }
            },
            selector: {
                isAvailable: async () => selectorAvailable({
                    extensionInstalled: vscode.extensions.getExtension(SELECTOR_EXTENSION_ID) !== undefined,
                    commandRegistered: (await vscode.commands.getCommands(true)).includes(SELECTOR_COMMAND)
                }),
                getDataset: async () => {
                    // Its command exists once it has activated; asking activates it first.
                    const extension = vscode.extensions.getExtension(SELECTOR_EXTENSION_ID);
                    if (extension && !extension.isActive) {
                        await extension.activate();
                    }
                    return vscode.commands.executeCommand<string | undefined>(SELECTOR_COMMAND);
                }
            },
            pickFolder: async options => {
                const picked = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: options.openLabel,
                    title: options.title,
                    defaultUri: options.defaultPath ? vscode.Uri.file(options.defaultPath) : undefined
                });
                return picked?.[0]?.fsPath;
            },
            confirmDelete: async folder => {
                const choice = await vscode.window.showWarningMessage(
                    'Delete the partly made subset folder?',
                    { modal: true, detail: `${folder}\n\nOnly this folder is deleted. The dataset is not touched.` },
                    'Delete'
                );
                return choice === 'Delete';
            },
            openFolder: async folder => {
                await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folder), { forceNewWindow: true });
            },
            reveal: async folder => {
                await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(folder));
            },
            openPicker: args => {
                PickerPanel.show(this.context, this, args, ids => {
                    this.controller.applyPickedIds(ids);
                    void this.reveal();
                });
            },
            showLog: () => this.log.show(true),
            log: text => this.log.append(text),
            clearLog: () => this.log.clear(),
            store: {
                get: <T>(key: string) => this.context.workspaceState.get<T>(`swatHruSubset.${key}`),
                set: (key, value) => {
                    void this.context.workspaceState.update(`swatHruSubset.${key}`, value);
                }
            },
            schedule: (fn, ms) => {
                const timer = setTimeout(fn, ms);
                return () => clearTimeout(timer);
            },
            post: state => this.post(state),
            tool: { name: 'swat-hru-subset', version: String(this.context.extension.packageJSON.version) }
        };
    }
}
