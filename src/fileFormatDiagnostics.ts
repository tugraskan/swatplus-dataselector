/**
 * SWAT+ File Format Diagnostics Provider
 *
 * Provides VS Code diagnostics (warnings) for SWAT+ input files that have
 * structural or data-type format issues such as:
 *   - Empty files
 *   - Missing title/metadata line
 *   - Missing or mismatched column-header line
 *   - Data rows with too few columns
 *   - Invalid values for integer, decimal, or boolean columns
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { SwatIndexer, FileFormatIssueKind } from './indexer';

/** Maps each issue kind to a human-readable diagnostic source tag. */
const KIND_SOURCE: Record<FileFormatIssueKind, string> = {
    empty_file: 'SWAT+ Format',
    missing_metadata_line: 'SWAT+ Format',
    missing_header_line: 'SWAT+ Format',
    header_column_mismatch: 'SWAT+ Format',
    wrong_column_count: 'SWAT+ Format',
    invalid_integer: 'SWAT+ Data Type',
    invalid_decimal: 'SWAT+ Data Type',
    invalid_boolean: 'SWAT+ Data Type'
};

export class SwatFileFormatDiagnosticsProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;

    constructor(
        private indexer: SwatIndexer,
        context: vscode.ExtensionContext
    ) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('swat-file-format');
        context.subscriptions.push(this.diagnosticCollection);
    }

    /**
     * Scan all schema-covered files in the current dataset and surface format
     * issues as VS Code warnings in the Problems panel.
     */
    public updateDiagnostics(): void {
        if (!this.indexer.isIndexBuilt()) {
            this.diagnosticCollection.clear();
            return;
        }

        this.diagnosticCollection.clear();

        const issues = this.indexer.getFileFormatIssues();

        // Group by file so we can set diagnostics in one call per file
        const diagnosticsByFile = new Map<string, vscode.Diagnostic[]>();

        for (const issue of issues) {
            if (!diagnosticsByFile.has(issue.file)) {
                diagnosticsByFile.set(issue.file, []);
            }

            // Convert 1-based line to 0-based; file-level issues (line 0) show on line 0
            const lineZeroBased = Math.max(issue.line - 1, 0);

            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(lineZeroBased, 0, lineZeroBased, Number.MAX_SAFE_INTEGER),
                issue.message,
                vscode.DiagnosticSeverity.Warning
            );

            diagnostic.source = KIND_SOURCE[issue.kind];
            diagnostic.code = issue.kind;

            diagnosticsByFile.get(issue.file)!.push(diagnostic);
        }

        for (const [filePath, diagnostics] of diagnosticsByFile) {
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
     * Clear all file format diagnostics.
     */
    public clear(): void {
        this.diagnosticCollection.clear();
    }
}
