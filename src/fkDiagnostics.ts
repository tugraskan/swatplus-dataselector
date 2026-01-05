/**
 * SWAT+ Foreign Key Diagnostics Provider
 * 
 * Provides diagnostics (warnings) for unresolved foreign key references.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { SwatIndexer } from './indexer';

export class SwatFKDiagnosticsProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;

    constructor(
        private indexer: SwatIndexer,
        context: vscode.ExtensionContext
    ) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('swat-fk');
        context.subscriptions.push(this.diagnosticCollection);
    }

    /**
     * Update diagnostics for all open documents
     */
    public updateDiagnostics(): void {
        if (!this.indexer.isIndexBuilt()) {
            this.diagnosticCollection.clear();
            return;
        }

        // Clear existing diagnostics
        this.diagnosticCollection.clear();

        // Get unresolved FK references
        const unresolvedRefs = this.indexer.getUnresolvedFKReferences();

        // Get metadata to check for file pointer columns
        const metadata = this.indexer.getMetadata();

        // Group by file
        const diagnosticsByFile = new Map<string, vscode.Diagnostic[]>();

        for (const ref of unresolvedRefs) {
            // Skip diagnostics for file pointer columns (not true FK references)
            const sourceFileName = path.basename(ref.sourceFile);
            const filePointerConfig = metadata?.file_pointer_columns?.[sourceFileName];
            if (filePointerConfig && typeof filePointerConfig === 'object' && filePointerConfig[ref.sourceColumn]) {
                continue; // Skip file pointer columns
            }

            if (!diagnosticsByFile.has(ref.sourceFile)) {
                diagnosticsByFile.set(ref.sourceFile, []);
            }

            // Create diagnostic for this unresolved FK
            const line = ref.sourceLine - 1; // Convert to 0-based
            
            // Get the file name for the target table (for better UX)
            const targetFileName = this.indexer.getFileNameForTable(ref.targetTable) || ref.targetTable;
            
            // Check if target file is indexed
            const isTargetFileIndexed = this.indexer.isTableIndexed(ref.targetTable);
            
            // Get file purpose from metadata for additional context
            const filePurpose = this.indexer.getFilePurpose(targetFileName);
            const purposeText = filePurpose ? ` (${filePurpose})` : '';
            
            let message: string;
            if (!isTargetFileIndexed) {
                // Target file doesn't exist or wasn't indexed
                message = `Unresolved foreign key: ${ref.sourceColumn} = "${ref.fkValue}" ` +
                    `- target file ${targetFileName} not found in dataset`;
            } else {
                // Target file exists but value not found
                message = `Unresolved foreign key: ${ref.sourceColumn} = "${ref.fkValue}" ` +
                    `(value not found in ${targetFileName}${purposeText})`;
            }
            
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(line, 0, line, 1000),
                message,
                vscode.DiagnosticSeverity.Warning
            );

            diagnostic.source = 'SWAT+ FK';
            diagnostic.code = 'unresolved-fk';
            
            diagnosticsByFile.get(ref.sourceFile)!.push(diagnostic);
        }

        // Set diagnostics for each file
        for (const [filePath, diagnostics] of diagnosticsByFile) {
            this.diagnosticCollection.set(vscode.Uri.file(filePath), diagnostics);
        }
    }

    /**
     * Clear all diagnostics
     */
    public clear(): void {
        this.diagnosticCollection.clear();
    }
}
