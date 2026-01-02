/**
 * SWAT+ Foreign Key Definition Provider
 * 
 * Provides Go-to-Definition and Peek-Definition for foreign key values
 * in SWAT+ input files.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SwatIndexer } from './indexer';
import { pathStartsWith } from './pathUtils';

export class SwatFKDefinitionProvider implements vscode.DefinitionProvider {
    private outputChannel: vscode.OutputChannel;
    
    constructor(private indexer: SwatIndexer) {
        this.outputChannel = vscode.window.createOutputChannel('SWAT+ FK Navigation');
    }

    public async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | undefined> {
        this.outputChannel.appendLine(`\n[FK Definition] Triggered at ${document.fileName}:${position.line}:${position.character}`);
        
        // Only provide definitions if index is built
        if (!this.indexer.isIndexBuilt()) {
            this.outputChannel.appendLine('[FK Definition] Index not built - skipping');
            vscode.window.showWarningMessage('Please build the SWAT+ inputs index first (Command: SWAT+: Build Inputs Index)');
            return undefined;
        }

        const schema = this.indexer.getSchema();
        if (!schema) {
            this.outputChannel.appendLine('[FK Definition] Schema not loaded');
            return undefined;
        }

        // Check if document is in the correct folder
        const datasetPath = this.indexer.getDatasetPath();
        if (!datasetPath) {
            this.outputChannel.appendLine('[FK Definition] No dataset path set');
            return undefined;
        }

        // Get the actual TxtInOut path (could be datasetPath/TxtInOut or datasetPath itself)
        const txtInOutPath = this.indexer.getTxtInOutPath();
        if (!txtInOutPath) {
            this.outputChannel.appendLine('[FK Definition] TxtInOut path not set - index may not be built');
            return undefined;
        }

        // Check if document is in the indexed folder
        // Uses platform-appropriate path comparison (case-insensitive on Windows)
        this.outputChannel.appendLine(`[FK Definition] Checking if ${document.fileName} is in ${txtInOutPath}`);
        
        if (!pathStartsWith(document.fileName, txtInOutPath)) {
            this.outputChannel.appendLine('[FK Definition] File not in indexed folder - skipping');
            return undefined;
        }

        // Get the file's schema table
        const fileName = path.basename(document.fileName);
        this.outputChannel.appendLine(`[FK Definition] File: ${fileName}`);
        
        // Special handling for file.cio - it has a unique format
        // Based on schema:
        // Line 0: Metadata line
        // Line 1: Header (id classification order_in_class file_name customization)
        // Line 2+: Data rows
        // Column 3 (index 3) contains the file_name
        if (fileName === 'file.cio') {
            const line = document.lineAt(position.line);
            const lineText = line.text.trim();
            
            // Skip metadata line (line 0), header line (line 1), and empty lines
            if (position.line < 2 || !lineText) {
                return undefined;
            }
            
            // Extract the filename from column 3 (file_name column)
            const parts = lineText.split(/\s+/);
            const FILE_NAME_COLUMN_INDEX = 3;
            
            if (parts.length <= FILE_NAME_COLUMN_INDEX) {
                return undefined;
            }
            
            const targetFileName = parts[FILE_NAME_COLUMN_INDEX];
            
            // Check if cursor is on the file_name column
            let columnIndex = -1;
            let currentPos = 0;
            
            for (let i = 0; i < parts.length; i++) {
                const valueStart = line.text.indexOf(parts[i], currentPos);
                if (valueStart === -1) {
                    continue;
                }
                
                const valueEnd = valueStart + parts[i].length;
                if (position.character >= valueStart && position.character <= valueEnd) {
                    columnIndex = i;
                    break;
                }
                
                currentPos = valueEnd;
            }
            
            // Only provide definition if cursor is on the file_name column
            if (columnIndex === FILE_NAME_COLUMN_INDEX) {
                this.outputChannel.appendLine(`[FK Definition] file.cio special handling - target: ${targetFileName}`);
                
                const txtInOutPath = this.indexer.getTxtInOutPath();
                if (txtInOutPath) {
                    const targetFilePath = path.join(txtInOutPath, targetFileName);
                    if (fs.existsSync(targetFilePath)) {
                        this.outputChannel.appendLine(`[FK Definition] File found: ${targetFilePath}`);
                        const targetUri = vscode.Uri.file(targetFilePath);
                        const targetPosition = new vscode.Position(0, 0);
                        this.outputChannel.appendLine('[FK Definition] Success - navigating to file\n');
                        return new vscode.Location(targetUri, targetPosition);
                    } else {
                        this.outputChannel.appendLine(`[FK Definition] File not found: ${targetFilePath}`);
                    }
                }
            }
            
            // If we're still here, file.cio handling didn't work, continue with normal flow
        }
        
        const table = schema.tables[fileName];
        if (!table) {
            this.outputChannel.appendLine(`[FK Definition] No schema found for file: ${fileName}`);
            return undefined;
        }

        // Parse the line to identify FK column
        const line = document.lineAt(position.line);
        const lineText = line.text.trim();
        const values = lineText.split(/\s+/);

        // Get header line to map column positions
        const headerLineIndex = table.has_metadata_line ? 1 : 0;
        const headerLine = document.lineAt(headerLineIndex).text.trim();
        const headers = headerLine.split(/\s+/);

        // Find which column the cursor is on
        // Use actual character position instead of parsing trimmed text
        let columnIndex = -1;
        let currentPos = 0;
        
        // Skip leading whitespace in the line
        const trimmedLine = line.text.trimStart();
        const leadingSpaces = line.text.length - trimmedLine.length;
        
        if (position.character < leadingSpaces) {
            return undefined; // Cursor is in leading whitespace
        }
        
        // Find which value the cursor is in
        for (let i = 0; i < values.length; i++) {
            const valueStart = line.text.indexOf(values[i], currentPos);
            
            // Handle case where value is not found
            if (valueStart === -1) {
                continue;
            }
            
            const valueEnd = valueStart + values[i].length;
            
            if (position.character >= valueStart && position.character <= valueEnd) {
                columnIndex = i;
                break;
            }
            
            currentPos = valueEnd;
        }

        if (columnIndex < 0 || columnIndex >= headers.length) {
            this.outputChannel.appendLine(`[FK Definition] Column index out of bounds: ${columnIndex}, headers.length: ${headers.length}`);
            return undefined;
        }

        const columnName = headers[columnIndex];
        const fkValue = values[columnIndex];
        
        this.outputChannel.appendLine(`[FK Definition] columnIndex: ${columnIndex}, columnName: ${columnName}, fkValue: ${fkValue}`);

        // Check if this column is a FK
        const fkColumn = table.columns.find(
            col => col.name === columnName && col.is_foreign_key
        );

        if (!fkColumn || !fkColumn.fk_target) {
            this.outputChannel.appendLine(`[FK Definition] Not a FK column: ${columnName}`);
            return undefined;
        }
        
        this.outputChannel.appendLine(`[FK Definition] FK column found: ${columnName} -> ${fkColumn.fk_target.table}`);

        // Look up the target row
        const targetRow = this.indexer.resolveFKTarget(
            fkColumn.fk_target.table,
            fkValue
        );

        if (!targetRow) {
            this.outputChannel.appendLine(`[FK Definition] Target row not found: table=${fkColumn.fk_target.table}, value=${fkValue}`);
            this.outputChannel.show(true); // Show the output channel
            return undefined;
        }
        
        this.outputChannel.appendLine(`[FK Definition] Target row found: ${targetRow.file}:${targetRow.lineNumber}`);
        this.outputChannel.appendLine('[FK Definition] Success - navigating to target\n');

        // Create location pointing to target row
        const targetUri = vscode.Uri.file(targetRow.file);
        const targetPosition = new vscode.Position(targetRow.lineNumber - 1, 0);
        
        return new vscode.Location(targetUri, targetPosition);
    }
}
