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

        // Group by file
        const diagnosticsByFile = new Map<string, vscode.Diagnostic[]>();

        for (const ref of unresolvedRefs) {
            if (!diagnosticsByFile.has(ref.sourceFile)) {
                diagnosticsByFile.set(ref.sourceFile, []);
            }

            // Create diagnostic for this unresolved FK
            const line = ref.sourceLine - 1; // Convert to 0-based
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(line, 0, line, 1000),
                `Unresolved foreign key: ${ref.sourceColumn} = "${ref.fkValue}" ` +
                `(expected in ${ref.targetTable})`,
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
