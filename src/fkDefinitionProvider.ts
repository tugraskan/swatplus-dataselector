/**
 * SWAT+ Foreign Key Definition Provider
 * 
 * Provides Go-to-Definition and Peek-Definition for foreign key values
 * in SWAT+ input files.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { SwatIndexer } from './indexer';

export class SwatFKDefinitionProvider implements vscode.DefinitionProvider {
    constructor(private indexer: SwatIndexer) {}

    public async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | undefined> {
        // Only provide definitions if index is built
        if (!this.indexer.isIndexBuilt()) {
            return undefined;
        }

        const schema = this.indexer.getSchema();
        if (!schema) {
            return undefined;
        }

        // Check if document is in TxtInOut
        const datasetPath = this.indexer.getDatasetPath();
        if (!datasetPath) {
            return undefined;
        }

        // Normalize paths for cross-platform compatibility
        const txtInOutPath = path.join(datasetPath, 'TxtInOut');
        const normalizedDocPath = path.normalize(document.fileName);
        const normalizedTxtInOutPath = path.normalize(txtInOutPath);
        
        if (!normalizedDocPath.startsWith(normalizedTxtInOutPath)) {
            return undefined;
        }

        // Get the file's schema table
        const fileName = path.basename(document.fileName);
        const table = schema.tables[fileName];
        if (!table) {
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
            const valueEnd = valueStart + values[i].length;
            
            if (position.character >= valueStart && position.character <= valueEnd) {
                columnIndex = i;
                break;
            }
            
            currentPos = valueEnd;
        }

        if (columnIndex < 0 || columnIndex >= headers.length) {
            console.log(`[FK Definition] Column index out of bounds: ${columnIndex}, headers.length: ${headers.length}`);
            return undefined;
        }

        const columnName = headers[columnIndex];
        const fkValue = values[columnIndex];
        
        console.log(`[FK Definition] columnIndex: ${columnIndex}, columnName: ${columnName}, fkValue: ${fkValue}`);

        // Check if this column is a FK
        const fkColumn = table.columns.find(
            col => col.name === columnName && col.is_foreign_key
        );

        if (!fkColumn || !fkColumn.fk_target) {
            console.log(`[FK Definition] Not a FK column: ${columnName}`);
            return undefined;
        }
        
        console.log(`[FK Definition] FK column found: ${columnName} -> ${fkColumn.fk_target.table}`);

        // Look up the target row
        const targetRow = this.indexer.resolveFKTarget(
            fkColumn.fk_target.table,
            fkValue
        );

        if (!targetRow) {
            console.log(`[FK Definition] Target row not found: table=${fkColumn.fk_target.table}, value=${fkValue}`);
            return undefined;
        }
        
        console.log(`[FK Definition] Target row found: ${targetRow.file}:${targetRow.lineNumber}`);

        // Create location pointing to target row
        const targetUri = vscode.Uri.file(targetRow.file);
        const targetPosition = new vscode.Position(targetRow.lineNumber - 1, 0);
        
        return new vscode.Location(targetUri, targetPosition);
    }
}
