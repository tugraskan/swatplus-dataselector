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

        const txtInOutPath = path.join(datasetPath, 'TxtInOut');
        if (!document.fileName.startsWith(txtInOutPath)) {
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
        const lineUpToCursor = line.text.substring(0, position.character);
        const valuesUpToCursor = lineUpToCursor.trim().split(/\s+/);
        const columnIndex = valuesUpToCursor.length - 1;

        if (columnIndex < 0 || columnIndex >= headers.length) {
            return undefined;
        }

        const columnName = headers[columnIndex];
        const fkValue = values[columnIndex];

        // Check if this column is a FK
        const fkColumn = table.columns.find(
            col => col.name === columnName && col.is_foreign_key
        );

        if (!fkColumn || !fkColumn.fk_target) {
            return undefined;
        }

        // Look up the target row
        const targetRow = this.indexer.resolveFKTarget(
            fkColumn.fk_target.table,
            fkValue
        );

        if (!targetRow) {
            return undefined;
        }

        // Create location pointing to target row
        const targetUri = vscode.Uri.file(targetRow.file);
        const targetPosition = new vscode.Position(targetRow.lineNumber - 1, 0);
        
        return new vscode.Location(targetUri, targetPosition);
    }
}
