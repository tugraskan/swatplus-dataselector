/**
 * SWAT+ Foreign Key Hover Provider
 * 
 * Provides hover information for foreign key values in SWAT+ input files,
 * including file purposes and target information.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SwatIndexer } from './indexer';
import { pathStartsWith } from './pathUtils';

export class SwatFKHoverProvider implements vscode.HoverProvider {
    constructor(private indexer: SwatIndexer) {}

    public async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        // Only provide hover if index is built
        if (!this.indexer.isIndexBuilt()) {
            return undefined;
        }

        const schema = this.indexer.getSchema();
        if (!schema) {
            return undefined;
        }

        // Check if document is in the indexed folder
        const txtInOutPath = this.indexer.getTxtInOutPath();
        if (!txtInOutPath || !pathStartsWith(document.fileName, txtInOutPath)) {
            return undefined;
        }

        // Get the file's schema table
        const fileName = path.basename(document.fileName);
        
        // Special handling for file.cio - it has a unique format
        // Line 1: Title/description
        // Line 2+: File references (one per line)
        // No actual header line despite what schema says
        if (fileName === 'file.cio') {
            const line = document.lineAt(position.line);
            const lineText = line.text.trim();
            
            // Skip title line (line 0) and empty lines
            if (position.line === 0 || !lineText) {
                return undefined;
            }
            
            // Extract the filename from the line
            const parts = lineText.split(/\s+/);
            let targetFileName: string | undefined;
            
            for (const part of parts) {
                if (part.includes('.') && !part.startsWith('.')) {
                    targetFileName = part;
                    break;
                }
            }
            
            if (targetFileName) {
                const markdown = new vscode.MarkdownString();
                markdown.isTrusted = true;
                
                markdown.appendMarkdown(`**File Reference**\n\n`);
                
                // Make the filename clickable if the file exists
                const txtInOutPath = this.indexer.getTxtInOutPath();
                if (txtInOutPath) {
                    const targetFilePath = path.join(txtInOutPath, targetFileName);
                    if (fs.existsSync(targetFilePath)) {
                        const commandUri = vscode.Uri.parse(`command:vscode.open?${encodeURIComponent(JSON.stringify([vscode.Uri.file(targetFilePath)]))}`);
                        markdown.appendMarkdown(`Points to: [${targetFileName}](${commandUri})\n\n`);
                    } else {
                        markdown.appendMarkdown(`Points to: \`${targetFileName}\` _(file not found)_\n\n`);
                    }
                } else {
                    markdown.appendMarkdown(`Points to: \`${targetFileName}\`\n\n`);
                }
                
                const targetPurpose = this.indexer.getFilePurpose(targetFileName);
                if (targetPurpose) {
                    markdown.appendMarkdown(`*${targetPurpose}*\n\n`);
                }
                
                markdown.appendMarkdown(`_Click filename above to navigate_`);
                return new vscode.Hover(markdown);
            }
        }
        
        const table = schema.tables[fileName];
        if (!table) {
            return undefined;
        }

        // Parse the line to identify column
        const line = document.lineAt(position.line);
        const lineText = line.text.trim();
        const values = lineText.split(/\s+/);

        // Get header line to map column positions
        const headerLineIndex = table.has_metadata_line ? 1 : 0;
        const headerLine = document.lineAt(headerLineIndex).text.trim();
        const headers = headerLine.split(/\s+/);

        // Find which column the cursor is on
        let columnIndex = -1;
        let currentPos = 0;
        
        const trimmedLine = line.text.trimStart();
        const leadingSpaces = line.text.length - trimmedLine.length;
        
        if (position.character < leadingSpaces) {
            return undefined;
        }
        
        for (let i = 0; i < values.length; i++) {
            const valueStart = line.text.indexOf(values[i], currentPos);
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
            return undefined;
        }

        const columnName = headers[columnIndex];
        const cellValue = values[columnIndex];

        // Build hover content
        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;

        // Check if this column is a FK
        const fkColumn = table.columns.find(
            col => col.name === columnName && col.is_foreign_key
        );

        if (fkColumn && fkColumn.fk_target) {
            // This is a FK column
            const targetFileName = this.indexer.getFileNameForTable(fkColumn.fk_target.table);
            const targetPurpose = targetFileName ? this.indexer.getFilePurpose(targetFileName) : undefined;
            
            markdown.appendMarkdown(`**Foreign Key: \`${columnName}\`**\n\n`);
            
            if (targetFileName) {
                // Make the filename clickable if the file exists
                const txtInOutPath = this.indexer.getTxtInOutPath();
                if (txtInOutPath) {
                    const targetFilePath = path.join(txtInOutPath, targetFileName);
                    if (fs.existsSync(targetFilePath)) {
                        const commandUri = vscode.Uri.parse(`command:vscode.open?${encodeURIComponent(JSON.stringify([vscode.Uri.file(targetFilePath)]))}`);
                        markdown.appendMarkdown(`Points to: [${targetFileName}](${commandUri})\n\n`);
                    } else {
                        markdown.appendMarkdown(`Points to: \`${targetFileName}\`\n\n`);
                    }
                } else {
                    markdown.appendMarkdown(`Points to: \`${targetFileName}\`\n\n`);
                }
            }
            
            if (targetPurpose) {
                markdown.appendMarkdown(`*${targetPurpose}*\n\n`);
            }
            
            // Check if the FK is resolved
            const targetRow = this.indexer.resolveFKTarget(fkColumn.fk_target.table, cellValue);
            if (targetRow) {
                markdown.appendMarkdown(`✓ Reference found: \`${cellValue}\`\n\n`);
                markdown.appendMarkdown(`_Click to navigate to ${targetFileName}_`);
            } else {
                markdown.appendMarkdown(`⚠ Unresolved reference: \`${cellValue}\`\n\n`);
                if (targetFileName) {
                    markdown.appendMarkdown(`_Value not found in ${targetFileName}_`);
                }
            }
        } else {
            // Regular column - just show basic info
            markdown.appendMarkdown(`**Column: \`${columnName}\`**\n\n`);
            markdown.appendMarkdown(`Value: \`${cellValue}\``);
        }

        return new vscode.Hover(markdown);
    }
}
