import * as vscode from 'vscode';
import { createSubsetCommand } from './command';

export function activate(context: vscode.ExtensionContext): void {
    const log = vscode.window.createOutputChannel('SWAT+ HRU Subset');

    const run = async (datasetFolder?: string) => {
        try {
            await createSubsetCommand(context, log, datasetFolder);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log.appendLine(`Unexpected error: ${message}`);
            vscode.window.showErrorMessage(`SWAT+ HRU Subset: ${message}`);
        }
    };

    context.subscriptions.push(
        log,
        // Command Palette, and the button in the activity bar view.
        vscode.commands.registerCommand('swatHruSubset.createSubset', () => run()),
        // Explorer: right-click a folder. The folder is the dataset; the first step is skipped.
        vscode.commands.registerCommand('swatHruSubset.createSubsetFromFolder', (resource?: vscode.Uri) =>
            run(resource && resource.scheme === 'file' ? resource.fsPath : undefined)
        ),
        // The view has no items; registering a provider is what lets VS Code show
        // its welcome text (with the Create Subset… button) instead of an error.
        vscode.window.registerTreeDataProvider('swatHruSubsetView', {
            getTreeItem: element => element,
            getChildren: () => []
        })
    );
}

export function deactivate(): void {
    // Nothing to clean up: the output channel, commands and view are disposed with the context.
}
