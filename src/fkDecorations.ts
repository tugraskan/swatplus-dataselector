/**
 * SWAT+ Foreign Key Decoration Provider
 * 
 * Provides visual decorations for foreign key columns in SWAT+ input files.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { SwatIndexer } from './indexer';

export class SwatFKDecorationProvider {
    private fkDecorationType: vscode.TextEditorDecorationType;
    private unresolvedFkDecorationType: vscode.TextEditorDecorationType;

    constructor(
        private indexer: SwatIndexer,
        private context: vscode.ExtensionContext
    ) {
        // Create decoration types
        this.fkDecorationType = vscode.window.createTextEditorDecorationType({
            textDecoration: 'underline',
            cursor: 'pointer',
            color: new vscode.ThemeColor('textLink.foreground')
        });

        this.unresolvedFkDecorationType = vscode.window.createTextEditorDecorationType({
            textDecoration: 'underline wavy',
            cursor: 'pointer',
            color: new vscode.ThemeColor('errorForeground')
        });

        // Register for document changes
        vscode.window.onDidChangeActiveTextEditor(
            editor => this.updateDecorations(editor),
            null,
            context.subscriptions
        );

        vscode.workspace.onDidChangeTextDocument(
            event => {
                const editor = vscode.window.activeTextEditor;
                if (editor && event.document === editor.document) {
                    this.updateDecorations(editor);
                }
            },
            null,
            context.subscriptions
        );

        // Initial decoration
        if (vscode.window.activeTextEditor) {
            this.updateDecorations(vscode.window.activeTextEditor);
        }
    }

    /**
     * Update decorations for the given editor
     */
    public updateDecorations(editor: vscode.TextEditor | undefined): void {
        if (!editor) {
            return;
        }

        if (!this.indexer.isIndexBuilt()) {
            return;
        }

        const schema = this.indexer.getSchema();
        if (!schema) {
            return;
        }

        const datasetPath = this.indexer.getDatasetPath();
        if (!datasetPath) {
            return;
        }

        // Check if document is in TxtInOut
        const txtInOutPath = path.join(datasetPath, 'TxtInOut');
        if (!editor.document.fileName.startsWith(txtInOutPath)) {
            return;
        }

        // Get the file's schema table
        const fileName = path.basename(editor.document.fileName);
        const table = schema.tables[fileName];
        if (!table) {
            return;
        }

        // Parse header to identify FK columns
        const headerLineIndex = table.has_metadata_line ? 1 : 0;
        if (editor.document.lineCount <= headerLineIndex) {
            return;
        }

        const headerLine = editor.document.lineAt(headerLineIndex).text.trim();
        const headers = headerLine.split(/\s+/);

        // Find FK column indices
        const fkColumnIndices: number[] = [];
        for (let i = 0; i < headers.length; i++) {
            const columnName = headers[i];
            const column = table.columns.find(col => col.name === columnName);
            if (column?.is_foreign_key) {
                fkColumnIndices.push(i);
            }
        }

        if (fkColumnIndices.length === 0) {
            return;
        }

        // Collect decorations
        const resolvedDecorations: vscode.DecorationOptions[] = [];
        const unresolvedDecorations: vscode.DecorationOptions[] = [];

        const dataStartLine = table.data_starts_after;
        for (let lineNum = dataStartLine; lineNum < editor.document.lineCount; lineNum++) {
            const line = editor.document.lineAt(lineNum);
            const lineText = line.text.trim();
            if (!lineText) {continue;}

            const values = lineText.split(/\s+/);

            // Find FK values and check if resolved
            const fkRefs = this.indexer.getFKReferencesForLine(
                editor.document.fileName,
                lineNum + 1  // 1-based
            );

            for (const fkRef of fkRefs) {
                // Find the column index
                const columnIndex = headers.indexOf(fkRef.sourceColumn);
                if (columnIndex < 0 || columnIndex >= values.length) {
                    continue;
                }

                // Calculate position of the FK value in the line
                const valuesBefore = values.slice(0, columnIndex);
                const startChar = valuesBefore.join(' ').length + valuesBefore.length;
                const endChar = startChar + values[columnIndex].length;

                const range = new vscode.Range(
                    lineNum,
                    startChar,
                    lineNum,
                    endChar
                );

                const decoration: vscode.DecorationOptions = {
                    range,
                    hoverMessage: fkRef.resolved
                        ? `FK → ${fkRef.targetTable}: ${fkRef.fkValue}`
                        : `⚠️ Unresolved FK: ${fkRef.fkValue} not found in ${fkRef.targetTable}`
                };

                if (fkRef.resolved) {
                    resolvedDecorations.push(decoration);
                } else {
                    unresolvedDecorations.push(decoration);
                }
            }
        }

        // Apply decorations
        editor.setDecorations(this.fkDecorationType, resolvedDecorations);
        editor.setDecorations(this.unresolvedFkDecorationType, unresolvedDecorations);
    }

    /**
     * Clear all decorations
     */
    public clear(): void {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            editor.setDecorations(this.fkDecorationType, []);
            editor.setDecorations(this.unresolvedFkDecorationType, []);
        }
    }

    /**
     * Refresh decorations
     */
    public refresh(): void {
        this.updateDecorations(vscode.window.activeTextEditor);
    }
}
