import * as vscode from 'vscode';
import { HruSubsetViewProvider, VIEW_ID } from './panelProvider';
import { PickerPanel } from './pickerPanel';
import type { PanelMessage, PanelViewState } from './protocol';

/** What the smoke test (scripts/smoke-vscode.js) reads from a running extension. Not a public API. */
export interface SmokeApi {
    panelState(): PanelViewState | undefined;
    renderedRevision(): number;
    readyCount(): number;
    pickerRendered(): { rows: number; shown: number } | undefined;
    handle(message: PanelMessage): Promise<void>;
}

export function activate(context: vscode.ExtensionContext): SmokeApi {
    const log = vscode.window.createOutputChannel('SWAT+ HRU Subset');
    const provider = new HruSubsetViewProvider(context, log);

    context.subscriptions.push(
        log,
        provider,
        // The sidebar panel. Kept alive while hidden so a half-filled form survives switching views.
        vscode.window.registerWebviewViewProvider(VIEW_ID, provider, { webviewOptions: { retainContextWhenHidden: true } }),
        // Command Palette: show the panel.
        vscode.commands.registerCommand('swatHruSubset.createSubset', () => provider.reveal()),
        // Explorer: right-click a folder. The panel opens with that folder as the dataset.
        vscode.commands.registerCommand('swatHruSubset.createSubsetFromFolder', async (resource?: vscode.Uri) => {
            await provider.reveal();
            if (resource && resource.scheme === 'file') {
                await provider.controller.openDataset(resource.fsPath);
            }
        }),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('swatHruSubset.pythonPath')) {
                provider.python.invalidate();
                void provider.controller.refreshPython();
            }
        })
    );

    return {
        panelState: () => provider.lastState,
        renderedRevision: () => provider.renderedRevision,
        readyCount: () => provider.readyCount,
        pickerRendered: () => PickerPanel.lastRendered,
        handle: message => provider.controller.handle(message)
    };
}

export function deactivate(): void {
    // Nothing to clean up: the output channel, commands and views are disposed with the context.
}
