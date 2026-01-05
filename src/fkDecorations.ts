/**
 * SWAT+ Foreign Key Decoration Provider
 * 
 * Provides visual decorations for foreign key columns in SWAT+ input files.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SwatIndexer } from './indexer';
import { pathStartsWith } from './pathUtils';

/**
 * Calculate the character position of a column value in a whitespace-separated line
 * by finding its actual position in the original line text.
 */
function calculateColumnPosition(lineText: string, values: string[], columnIndex: number): { start: number; end: number } {
    let currentPos = 0;
    
    // Find the actual position of the value at columnIndex in the original line
    for (let i = 0; i <= columnIndex && i < values.length; i++) {
        const valueStart = lineText.indexOf(values[i], currentPos);
        
        // Handle case where value is not found (should not happen in normal cases)
        if (valueStart === -1) {
            // Fallback: return position 0
            return { start: 0, end: 0 };
        }
        
        if (i === columnIndex) {
            return {
                start: valueStart,
                end: valueStart + values[i].length
            };
        }
        currentPos = valueStart + values[i].length;
    }
    
    // Fallback (should not reach here)
    return { start: 0, end: 0 };
}

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

        // Get the indexed folder path and check if document is in it
        // Uses platform-appropriate path comparison (case-insensitive on Windows)
        const txtInOutPath = this.indexer.getTxtInOutPath();
        if (!txtInOutPath || !pathStartsWith(editor.document.fileName, txtInOutPath)) {
            return;
        }

        // Get the file's schema table
        const fileName = path.basename(editor.document.fileName);
        
        // Special handling for file.cio - decorate file references
        if (fileName === 'file.cio') {
            this.decorateFileCio(editor, txtInOutPath);
            return;
        }
        
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

                // Calculate position of the FK value in the line using actual line text
                const pos = calculateColumnPosition(line.text, values, columnIndex);

                const range = new vscode.Range(
                    lineNum,
                    pos.start,
                    lineNum,
                    pos.end
                );

                // Get the file name for the target table (for better UX)
                const targetFileName = this.indexer.getFileNameForTable(fkRef.targetTable) || fkRef.targetTable;

                const decoration: vscode.DecorationOptions = {
                    range,
                    hoverMessage: fkRef.resolved
                        ? `FK → ${targetFileName}: ${fkRef.fkValue}`
                        : `⚠️ Unresolved FK: ${fkRef.fkValue} not found in ${targetFileName}`
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
     * Decorate file references in file.cio
     */
    private decorateFileCio(editor: vscode.TextEditor, txtInOutPath: string): void {
        const resolvedDecorations: vscode.DecorationOptions[] = [];
        const unresolvedDecorations: vscode.DecorationOptions[] = [];

        // file.cio format (based on schema):
        // Line 0: Title/description (metadata line)
        // Line 1: Header (id classification order_in_class file_name customization)
        // Line 2+: Data rows
        // Column 3 (index 3) contains the file_name
        const FILE_NAME_COLUMN_INDEX = 3;
        
        for (let lineNum = 2; lineNum < editor.document.lineCount; lineNum++) {
            const line = editor.document.lineAt(lineNum);
            const lineText = line.text.trim();
            
            if (!lineText) {
                continue;
            }

            // Extract filename from column 3 (file_name column)
            const parts = lineText.split(/\s+/);
            
            if (parts.length <= FILE_NAME_COLUMN_INDEX) {
                continue;
            }
            
            const targetFileName = parts[FILE_NAME_COLUMN_INDEX];
            
            // Find position in original line
            let currentPos = 0;
            let filenameStart = -1;
            for (let i = 0; i <= FILE_NAME_COLUMN_INDEX && i < parts.length; i++) {
                const valueStart = line.text.indexOf(parts[i], currentPos);
                if (valueStart === -1) {
                    break;
                }
                if (i === FILE_NAME_COLUMN_INDEX) {
                    filenameStart = valueStart;
                    break;
                }
                currentPos = valueStart + parts[i].length;
            }

            if (filenameStart === -1) {
                continue;
            }

            // Check if file exists
            const targetFilePath = path.join(txtInOutPath, targetFileName);
            const fileExists = fs.existsSync(targetFilePath);

            const range = new vscode.Range(
                lineNum,
                filenameStart,
                lineNum,
                filenameStart + targetFileName.length
            );

            const filePurpose = this.indexer.getFilePurpose(targetFileName);
            const decoration: vscode.DecorationOptions = {
                range,
                hoverMessage: fileExists
                    ? `File reference → ${targetFileName}${filePurpose ? '\n' + filePurpose : ''}`
                    : `⚠️ File not found: ${targetFileName}`
            };

            if (fileExists) {
                resolvedDecorations.push(decoration);
            } else {
                unresolvedDecorations.push(decoration);
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
