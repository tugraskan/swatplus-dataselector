import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';

export class ImportHelper {
    private pythonPath: string;
    private apiPath: string;

    constructor(private context: vscode.ExtensionContext) {
        const config = vscode.workspace.getConfiguration('swat-dataset-selector');
        this.pythonPath = config.get('pythonPath', 'python');
        
        // Use bundled standalone script
        this.apiPath = path.join(
            context.extensionPath, 
            'src',
            'python-scripts', 
            'swatplus_api_standalone.py'
        );
    }

    async importTextFiles(txtinoutDir: string): Promise<void> {
        // Ask user where to save the database
        const dbUri = await vscode.window.showSaveDialog({
            filters: { 'SQLite Database': ['sqlite', 'db'] },
            saveLabel: 'Create Database',
            defaultUri: vscode.Uri.file(path.join(txtinoutDir, 'project.sqlite'))
        });
        
        if (!dbUri) {
            return; // User cancelled
        }

        const dbPath = dbUri.fsPath;

        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Importing SWAT+ text files",
            cancellable: false
        }, async (progress) => {
            const args = [
                this.apiPath,
                'import_text_files',
                '--project_db_file', dbPath,
                '--txtinout_dir', txtinoutDir
            ];

            const pythonCwd = path.join(this.context.extensionPath, 'src', 'python-scripts');
            const outputChannel = vscode.window.createOutputChannel('SWAT Import');

            return new Promise<void>((resolve, reject) => {
                progress.report({ message: 'Starting import...' });
                
                const proc = spawn(this.pythonPath, args, { cwd: pythonCwd });

                // Real-time progress updates
                proc.stdout.on('data', (data) => {
                    const msg = data.toString().trim();
                    outputChannel.appendLine(`[stdout] ${msg}`);
                    console.log('[Import]', msg);
                    progress.report({ message: msg });
                });

                let stderrBuffer = '';
                proc.stderr.on('data', (data) => {
                    const errMsg = data.toString();
                    stderrBuffer += errMsg;
                    outputChannel.appendLine(`[stderr] ${errMsg}`);
                    console.error('[Import Error]', errMsg);
                });

                proc.on('close', (code) => {
                    if (code === 0) {
                        outputChannel.appendLine(`Import finished with exit code 0. DB: ${dbPath}`);
                        vscode.window.showInformationMessage(
                            `Database created successfully: ${dbPath}`
                        );
                        resolve();
                    } else {
                        const shortMsg = `Import failed with exit code ${code}`;
                        outputChannel.appendLine(shortMsg);
                        if (stderrBuffer) {
                            outputChannel.appendLine('--- STDERR ---');
                            outputChannel.appendLine(stderrBuffer);
                        }

                        // Show error with option to view details
                        vscode.window.showErrorMessage(shortMsg, 'Show details').then((sel) => {
                            if (sel === 'Show details') {
                                outputChannel.show(true);
                            }
                        });

                        reject(new Error(`${shortMsg}\n${stderrBuffer}`));
                    }
                });

                proc.on('error', (err) => {
                    const errorMsg = `Failed to start Python process: ${err.message}`;
                    outputChannel.appendLine(errorMsg);
                    vscode.window.showErrorMessage(errorMsg, 'Show details').then((sel) => {
                        if (sel === 'Show details') {
                            outputChannel.show(true);
                        }
                    });
                    reject(err);
                });
            });
        });
    }
}
