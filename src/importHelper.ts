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

            return new Promise<void>((resolve, reject) => {
                progress.report({ message: 'Starting import...' });
                
                const proc = spawn(this.pythonPath, args);
                
                // Real-time progress updates
                proc.stdout.on('data', (data) => {
                    const msg = data.toString().trim();
                    console.log('[Import]', msg);
                    progress.report({ message: msg });
                });

                proc.stderr.on('data', (data) => {
                    const errMsg = data.toString();
                    console.error('[Import Error]', errMsg);
                    // Some libraries output warnings to stderr, so we just log them
                });

                proc.on('close', (code) => {
                    if (code === 0) {
                        vscode.window.showInformationMessage(
                            `Database created successfully: ${dbPath}`
                        );
                        resolve();
                    } else {
                        const errorMsg = `Import failed with exit code ${code}`;
                        vscode.window.showErrorMessage(errorMsg);
                        reject(new Error(errorMsg));
                    }
                });

                proc.on('error', (err) => {
                    const errorMsg = `Failed to start Python process: ${err.message}`;
                    vscode.window.showErrorMessage(errorMsg);
                    reject(err);
                });
            });
        });
    }
}
