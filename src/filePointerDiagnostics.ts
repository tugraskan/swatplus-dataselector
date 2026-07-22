/**
 * SWAT+ File Pointer Diagnostics Provider
 *
 * Provides diagnostics (warnings) for file pointer columns that reference
 * files which do not exist on disk in the TxtInOut dataset directory.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { SwatIndexer } from './indexer';
import { getSharedEnrichedSchema } from './enrichedSchema';

export class SwatFilePointerDiagnosticsProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;

    constructor(
        private indexer: SwatIndexer,
        context: vscode.ExtensionContext
    ) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('swat-file-pointer');
        context.subscriptions.push(this.diagnosticCollection);
    }

    /**
     * Update diagnostics for all indexed files with file pointer columns.
     * Reports a warning for every file pointer whose target file does not exist.
     */
    public updateDiagnostics(): void {
        if (!this.indexer.isIndexBuilt()) {
            this.diagnosticCollection.clear();
            return;
        }

        this.diagnosticCollection.clear();

        const issues = this.indexer.getFilePointerIssues();

        // Group by source file
        const diagnosticsByFile = new Map<string, vscode.Diagnostic[]>();

        for (const issue of issues) {
            if (!diagnosticsByFile.has(issue.sourceFile)) {
                diagnosticsByFile.set(issue.sourceFile, []);
            }

            const line = issue.sourceLine - 1; // Convert to 0-based

            // Prefer the metadata description; fall back to the source-backed
            // enriched-schema description when metadata has none.
            const enrichedDescription = getSharedEnrichedSchema()
                ?.getColumnDoc(path.basename(issue.sourceFile), issue.sourceColumn)?.description;
            const columnDescription = issue.columnDescription || enrichedDescription;
            const descriptionPart = columnDescription
                ? ` (${columnDescription})`
                : '';

            const message =
                `Missing file pointer: ${issue.sourceColumn}${descriptionPart} references ` +
                `"${issue.referencedFile}" which does not exist in the dataset folder`;

            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(line, 0, line, 1000),
                message,
                vscode.DiagnosticSeverity.Warning
            );

            diagnostic.source = 'SWAT+ File Pointer';
            diagnostic.code = 'missing-file-pointer';

            diagnosticsByFile.get(issue.sourceFile)!.push(diagnostic);
        }

        for (const [filePath, diagnostics] of diagnosticsByFile) {
            // sourceFile may be relative when it came from file.cio; resolve it
            // against the dataset/TxtInOut path for reliability
            let absPath: string;
            if (path.isAbsolute(filePath)) {
                absPath = filePath;
            } else {
                const basePath = this.indexer.getTxtInOutPath() ??
                    this.indexer.getDatasetPath() ??
                    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
                absPath = path.join(basePath, filePath);
            }
            this.diagnosticCollection.set(vscode.Uri.file(absPath), diagnostics);
        }
    }

    /**
     * Clear all file pointer diagnostics.
     */
    public clear(): void {
        this.diagnosticCollection.clear();
    }
}
