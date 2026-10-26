import * as vscode from 'vscode';
import { createSubsetCommand } from './command';

export function activate(context: vscode.ExtensionContext): void {
    const log = vscode.window.createOutputChannel('SWAT+ HRU Subset');
    context.subscriptions.push(
        log,
        vscode.commands.registerCommand('swatHruSubset.createSubset', async () => {
            try {
                await createSubsetCommand(context, log);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                log.appendLine(`Unexpected error: ${message}`);
                vscode.window.showErrorMessage(`SWAT+ HRU Subset: ${message}`);
            }
        })
    );
}

export function deactivate(): void {
    // Nothing to clean up: the output channel and command are disposed with the context.
}
