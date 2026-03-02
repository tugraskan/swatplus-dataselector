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

// file.cio format: classification_name  file1  file2  file3  ...
// Column 0 is classification name, columns 1+ are filenames
const FILE_NAME_COLUMN_INDEX = 1;

export class SwatFKDefinitionProvider implements vscode.DefinitionProvider {
    private outputChannel: vscode.OutputChannel;
    
    constructor(private indexer: SwatIndexer) {
        this.outputChannel = vscode.window.createOutputChannel('SWAT+ FK Navigation');
    }

    /**
     * Find the column index for a cursor position, considering both direct hits and whitespace after values
     */
    private findColumnIndex(
        cursorPosition: number,
        positions: Array<{ index: number; start: number; end: number }>,
        lineLength: number
    ): number {
        // First, check if cursor is directly within a value
        const directMatch = positions.find(pos => 
            cursorPosition >= pos.start && cursorPosition <= pos.end
        );
        if (directMatch) {
            return directMatch.index;
        }
        
        // If not directly on a value, check if cursor is in whitespace after a value
        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            const nextPos = i < positions.length - 1 ? positions[i + 1] : null;
            const whitespaceEnd = nextPos ? nextPos.start : lineLength;
            if (cursorPosition > pos.end && cursorPosition < whitespaceEnd) {
                return pos.index;
            }
        }
        
        return -1; // Not found
    }

    private normalizeHeaders(headers: string[], table: any): string[] {
        if (!table?.columns) {
            return headers;
        }
        const schemaColumns = new Set((table.columns || []).map((col: any) => col.name));
        const schemaColumnsLower = new Set((table.columns || []).map((col: any) => col.name.toLowerCase()));
        return headers.map(header => {
            if (schemaColumns.has(header)) {
                return header;
            }
            const lowerHeader = header.toLowerCase();
            if (schemaColumnsLower.has(lowerHeader)) {
                return lowerHeader;
            }
            return header;
        });
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
        // Actual format:
        // Line 0: Metadata line
        // Line 1+: classification_name  file1  file2  file3  ...
        // Column 0 is classification name, columns 1+ are filenames
        if (fileName === 'file.cio') {
            const line = document.lineAt(position.line);
            const lineText = line.text.trim();
            
            // Skip metadata line (line 0) and empty lines
            if (position.line < 1 || !lineText || lineText.startsWith('#')) {
                return undefined;
            }
            
            // Split the line into columns
            const parts = lineText.split(/\s+/);
            
            // Need at least classification name + one file
            if (parts.length < 2) {
                return undefined;
            }
            
            const targetFileName = parts[FILE_NAME_COLUMN_INDEX];
            
            // Check if cursor is on the file_name column
            let currentPos = 0;
            
            // Build an array of value positions
            const partPositions: Array<{ index: number; start: number; end: number }> = [];
            for (let i = 0; i < parts.length; i++) {
                const valueStart = line.text.indexOf(parts[i], currentPos);
                if (valueStart === -1) {
                    continue;
                }
                const valueEnd = valueStart + parts[i].length;
                partPositions.push({ index: i, start: valueStart, end: valueEnd });
                currentPos = valueEnd;
            }
            
            // Find which column the cursor is in or closest to
            const columnIndex = this.findColumnIndex(position.character, partPositions, line.text.length);
            
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
        const headers = this.normalizeHeaders(headerLine.split(/\s+/), table);

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
        
        // Build an array of value positions for better cursor detection
        const valuePositions: Array<{ index: number; start: number; end: number; value: string }> = [];
        
        for (let i = 0; i < values.length; i++) {
            const valueStart = line.text.indexOf(values[i], currentPos);
            
            // Handle case where value is not found
            if (valueStart === -1) {
                // Value not found from current position, trying to continue but log warning
                this.outputChannel.appendLine(`[FK Definition] Warning: value "${values[i]}" not found from position ${currentPos}`);
                continue;
            }
            
            const valueEnd = valueStart + values[i].length;
            valuePositions.push({ index: i, start: valueStart, end: valueEnd, value: values[i] });
            
            currentPos = valueEnd;
        }
        
        // Find which value/column the cursor is in or closest to
        columnIndex = this.findColumnIndex(
            position.character, 
            valuePositions.map(vp => ({ index: vp.index, start: vp.start, end: vp.end })),
            line.text.length
        );
        
        // Log details about the match
        if (columnIndex >= 0 && columnIndex < valuePositions.length) {
            const matchedPos = valuePositions[columnIndex];
            if (position.character >= matchedPos.start && position.character <= matchedPos.end) {
                this.outputChannel.appendLine(`[FK Definition] Cursor at ${position.character} is within value "${matchedPos.value}" at [${matchedPos.start}, ${matchedPos.end}]`);
            } else {
                this.outputChannel.appendLine(`[FK Definition] Cursor at ${position.character} is in whitespace after value "${matchedPos.value}" at [${matchedPos.start}, ${matchedPos.end}], treating as column ${columnIndex}`);
            }
        }

        if (columnIndex < 0) {
            this.outputChannel.appendLine(`[FK Definition] Cursor not on a valid column (columnIndex: ${columnIndex}, likely in leading whitespace or before first value)`);
            return undefined;
        }
        
        if (columnIndex >= headers.length) {
            this.outputChannel.appendLine(`[FK Definition] Column index ${columnIndex} exceeds number of headers ${headers.length}`);
            return undefined;
        }

        const columnName = headers[columnIndex];
        const fkValue = values[columnIndex];
        
        this.outputChannel.appendLine(`[FK Definition] columnIndex: ${columnIndex}, columnName: ${columnName}, fkValue: ${fkValue}`);

        // Special handling for management.sch child lines (auto operations and explicit operations)
        if (fileName === 'management.sch' && position.line > table.data_starts_after) {
            // Check if this is a child line by looking for parent schedule in previous lines
            // Child lines are indented and appear after a main schedule record
            // We can detect them by checking if they start with whitespace
            if (line.text.match(/^\s+\S/)) {
                this.outputChannel.appendLine(`[FK Definition] Detected management.sch child line (indented)`);
                
                // Find the parent schedule by scanning backwards
                let parentScheduleLine = -1;
                for (let i = position.line - 1; i >= table.data_starts_after; i--) {
                    const prevLine = document.lineAt(i).text.trim();
                    if (prevLine && !document.lineAt(i).text.match(/^\s+\S/)) {
                        // Found a non-indented line - this is the parent schedule
                        parentScheduleLine = i;
                        break;
                    }
                }
                
                if (parentScheduleLine >= 0) {
                    const parentLineText = document.lineAt(parentScheduleLine).text.trim();
                    const parentValues = parentLineText.split(/\s+/);
                    const numb_ops = parseInt(parentValues[1] || '0', 10);
                    const numb_auto = parseInt(parentValues[2] || '0', 10);
                    
                    this.outputChannel.appendLine(`[FK Definition] Parent schedule at line ${parentScheduleLine + 1}, numb_ops=${numb_ops}, numb_auto=${numb_auto}`);
                    
                    // Count how many child lines down we are
                    let childLineOffset = 0;
                    for (let i = parentScheduleLine + 1; i < position.line; i++) {
                        const childLine = document.lineAt(i).text.trim();
                        if (childLine) {
                            childLineOffset++;
                        }
                    }
                    
                    // Add current line
                    childLineOffset++;
                    
                    this.outputChannel.appendLine(`[FK Definition] Child line offset: ${childLineOffset}`);
                    
                    // Determine if this is an auto operation (decision table ref) or explicit operation
                    if (childLineOffset <= numb_auto) {
                        // This is an auto operation - decision table reference
                        this.outputChannel.appendLine(`[FK Definition] Auto operation (decision table reference) -> decision table files`);
                        const dtlName = fkValue;
                        
                        // Look up the decision table across all DTL files
                        const targetRow = this.indexer.resolveDecisionTable(dtlName);
                        
                        if (!targetRow) {
                            this.outputChannel.appendLine(`[FK Definition] Decision table not found: ${dtlName}`);
                            this.outputChannel.show(true);
                            return undefined;
                        }
                        
                        this.outputChannel.appendLine(`[FK Definition] Decision table found: ${targetRow.file}:${targetRow.lineNumber}`);
                        this.outputChannel.appendLine('[FK Definition] Success - navigating to decision table\n');
                        
                        const targetUri = vscode.Uri.file(targetRow.file);
                        const targetPosition = new vscode.Position(targetRow.lineNumber - 1, 0);
                        return new vscode.Location(targetUri, targetPosition);
                    } else if (childLineOffset <= numb_auto + numb_ops) {
                        // This is an explicit operation
                        this.outputChannel.appendLine(`[FK Definition] Explicit operation line`);
                        
                        // Operation type is in first column (columnIndex 0)
                        // op_data1 is in 7th column (columnIndex 6) for most operations
                        const opType = values[0];
                        const opData1 = values.length > 6 ? values[6] : null;
                        
                        // Map operation type to target table
                        const opTypeToTable: { [opType: string]: string } = {
                            'plnt': 'plant_ini',
                            'harv': 'harv_ops',
                            'hvkl': 'plant_ini',
                            'kill': 'plant_ini',
                            'till': 'tillage_til',
                            'irrm': 'irr_ops',
                            'irra': 'irr_ops',
                            'fert': 'fertilizer_frt',
                            'frta': 'fertilizer_frt',
                            'frtc': 'fertilizer_frt',
                            'pest': 'pesticide_pes',
                            'pstc': 'pesticide_pes',
                            'graz': 'graze_ops'
                        };
                        
                        if (opType && opTypeToTable[opType] && opData1 && columnIndex === 6) {
                            // Cursor is on op_data1 column
                            const targetTable = opTypeToTable[opType];
                            this.outputChannel.appendLine(`[FK Definition] Operation ${opType} references ${targetTable}, value: ${opData1}`);
                            
                            const targetRow = this.indexer.resolveFKTarget(targetTable, opData1);
                            
                            if (!targetRow) {
                                this.outputChannel.appendLine(`[FK Definition] Operation target not found: table=${targetTable}, value=${opData1}`);
                                this.outputChannel.show(true);
                                return undefined;
                            }
                            
                            this.outputChannel.appendLine(`[FK Definition] Operation target found: ${targetRow.file}:${targetRow.lineNumber}`);
                            this.outputChannel.appendLine('[FK Definition] Success - navigating to operation target\n');
                            
                            const targetUri = vscode.Uri.file(targetRow.file);
                            const targetPosition = new vscode.Position(targetRow.lineNumber - 1, 0);
                            return new vscode.Location(targetUri, targetPosition);
                        }
                    }
                }
            }
        }

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
