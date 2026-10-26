// The HRU picker: an editor tab with a table of every HRU in the dataset. It
// reads the table through `--hru-table` (so the parsing stays in Python) and
// hands the user's selection back to the sidebar panel as compact ID text.
// One of the few files that import vscode.

import * as path from 'path';
import * as vscode from 'vscode';
import { makeNonce, pickerHtml } from './html';
import { isPickerInbound, PickerOutbound } from './protocol';
import { inspectHruTable, RunnerContext } from './runner';

export interface PickerArgs {
    datasetPath: string;
    initialIds: string;
}

export interface RunnerSource {
    runnerContext(signal?: AbortSignal): Promise<RunnerContext>;
}

export class PickerPanel {
    private static current: PickerPanel | undefined;

    /** The last thing the picker reported on screen; the smoke test reads it. */
    static lastRendered: { rows: number; shown: number } | undefined;

    static show(
        context: vscode.ExtensionContext,
        runner: RunnerSource,
        args: PickerArgs,
        onUseSelection: (ids: string) => void
    ): PickerPanel {
        if (PickerPanel.current) {
            PickerPanel.current.panel.reveal(vscode.ViewColumn.Active);
            PickerPanel.current.onUseSelection = onUseSelection;
            void PickerPanel.current.load(args);
            return PickerPanel.current;
        }
        const distUri = vscode.Uri.joinPath(context.extensionUri, 'dist');
        const panel = vscode.window.createWebviewPanel(
            'swatHruSubset.picker',
            `HRU Picker: ${path.basename(args.datasetPath)}`,
            vscode.ViewColumn.Active,
            { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [distUri] }
        );
        panel.webview.html = pickerHtml({
            nonce: makeNonce(),
            scriptUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'picker.js')).toString(),
            title: 'SWAT+ HRU Picker'
        });
        PickerPanel.current = new PickerPanel(panel, runner, args, onUseSelection);
        return PickerPanel.current;
    }

    /** The IDs box changed in the sidebar panel; the picker's selection follows. */
    static syncSelection(ids: string): void {
        void PickerPanel.current?.post({ type: 'selection', ids });
    }

    private abort?: AbortController;
    private loadedFor?: string;
    private ready = false;

    private constructor(
        private readonly panel: vscode.WebviewPanel,
        private readonly runner: RunnerSource,
        private args: PickerArgs,
        private onUseSelection: (ids: string) => void
    ) {
        panel.webview.onDidReceiveMessage((message: unknown) => {
            if (!isPickerInbound(message)) {
                return;
            }
            if (message.type === 'ready') {
                this.ready = true;
                void this.load(this.args);
            } else if (message.type === 'useSelection') {
                this.onUseSelection(message.ids);
            } else if (message.type === 'rendered') {
                PickerPanel.lastRendered = { rows: message.rows, shown: message.shown };
            }
        });
        panel.onDidDispose(() => {
            this.abort?.abort();
            if (PickerPanel.current === this) {
                PickerPanel.current = undefined;
            }
        });
    }

    private post(message: PickerOutbound): Thenable<boolean> {
        return this.panel.webview.postMessage(message);
    }

    private async load(args: PickerArgs): Promise<void> {
        this.args = args;
        this.panel.title = `HRU Picker: ${path.basename(args.datasetPath)}`;
        if (!this.ready) {
            return;
        }
        this.abort?.abort();
        const abort = new AbortController();
        this.abort = abort;
        void this.post({ type: 'loading', datasetPath: args.datasetPath });
        try {
            const context = await this.runner.runnerContext(abort.signal);
            const table = await inspectHruTable(context, args.datasetPath);
            if (abort.signal.aborted) {
                return;
            }
            this.loadedFor = args.datasetPath;
            await this.post({ type: 'table', table, initialIds: args.initialIds, datasetPath: args.datasetPath });
        } catch (error) {
            if (abort.signal.aborted) {
                return;
            }
            await this.post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
        }
    }
}
