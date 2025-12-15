import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SwatDatabaseHelper } from './swatDatabaseHelper';
import { parseLineTokens, findTokenAtPosition, findHeaderLine } from './swatFileParser';

/**
 * Provides "Go to Definition" functionality for SWAT+ text files
 * Allows clicking on foreign key references to navigate to linked records
 */
export class SwatDefinitionProvider implements vscode.DefinitionProvider {
    constructor(
        private dbHelper: SwatDatabaseHelper,
        private getSelectedDataset: () => string | undefined
    ) {}

    async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | undefined> {
        const datasetPath = this.getSelectedDataset();
        if (!datasetPath) {
            return undefined;
        }

        const dbPath = this.dbHelper.getProjectDbPath(datasetPath);
        if (!dbPath || !this.dbHelper.isAvailable()) {
            return undefined;
        }

        // Get the file name and determine the table
        const fileName = path.basename(document.fileName);
        const tableName = this.dbHelper.getTableNameForFile(fileName);
        if (!tableName) {
            return undefined;
        }

        // Get the word at the cursor position
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) {
            return undefined;
        }

        const word = document.getText(wordRange);
        
        // Parse the current line to determine context
        const result = this.parseSwatFileLine(document, position, word, tableName, dbPath, datasetPath);
        
        return result;
    }

    /**
     * Parse a SWAT+ file line to extract the column and value
     */
    private parseSwatFileLine(
        document: vscode.TextDocument,
        position: vscode.Position,
        word: string,
        tableName: string,
        dbPath: string,
        datasetPath: string
    ): vscode.Location | undefined {
        try {
            // Read the entire file to get the header
            const fileContent = document.getText();
            const lines = fileContent.split('\n');
            
            // Find the header line
            const headerLineIndex = findHeaderLine(lines);
            if (headerLineIndex === -1) {
                return undefined;
            }

            const headerLine = lines[headerLineIndex];
            const currentLine = lines[position.line];
            
            // Parse header and current line using improved tokenizer
            const headerTokens = parseLineTokens(headerLine);
            const valueTokens = parseLineTokens(currentLine);
            
            // Find which token the cursor is on
            const cursorToken = findTokenAtPosition(valueTokens, position.character);
            if (!cursorToken) {
                return undefined;
            }

            const columnIndex = cursorToken.index;
            if (columnIndex >= headerTokens.length) {
                return undefined;
            }

            const columnName = headerTokens[columnIndex].value;
            const columnValue = cursorToken.token.value;

            // Check if this column is a foreign key
            const foreignKeys = this.dbHelper.getForeignKeyColumns(dbPath, tableName);
            if (!foreignKeys.includes(columnName)) {
                return undefined;
            }

            // Try to resolve the foreign key reference by name
            // SWAT+ files use names, not IDs
            const result = this.dbHelper.resolveForeignKey(dbPath, tableName, columnName, columnValue);
            
            if (!result) {
                // Try alternate approach: look up by name directly in target table
                return this.findByNameInFiles(datasetPath, columnName, columnValue);
            }

            // Navigate to the target file
            const targetFile = path.join(datasetPath, result.fileName);
            if (!fs.existsSync(targetFile)) {
                return undefined;
            }

            // Find the line in the target file that contains this record
            const targetLineNumber = this.findRecordLineInFile(targetFile, result.record.name || columnValue);
            
            if (targetLineNumber !== -1) {
                return new vscode.Location(
                    vscode.Uri.file(targetFile),
                    new vscode.Position(targetLineNumber, 0)
                );
            }

            // If we can't find the specific line, just open the file
            return new vscode.Location(
                vscode.Uri.file(targetFile),
                new vscode.Position(0, 0)
            );

        } catch (error) {
            console.error('Error parsing SWAT+ file:', error);
            return undefined;
        }
    }

    /**
     * Find a record in a target file by searching for the name
     */
    private findByNameInFiles(
        datasetPath: string,
        columnName: string,
        value: string
    ): vscode.Location | undefined {
        // Map column names to likely file names
        const columnFileMap: { [key: string]: string } = {
            'hydro': 'hydrology.hyd',
            'topo': 'topography.hyd',
            'field': 'field.fld',
            'soil': 'soils.sol',
            'lu_mgt': 'landuse.lum',
            'soil_plant_init': 'soil_plant.ini',
            'surf_stor': 'wetland.wet',
            'snow': 'snow.sno'
        };

        const targetFileName = columnFileMap[columnName];
        if (!targetFileName) {
            return undefined;
        }

        const targetFile = path.join(datasetPath, targetFileName);
        if (!fs.existsSync(targetFile)) {
            return undefined;
        }

        const lineNumber = this.findRecordLineInFile(targetFile, value);
        if (lineNumber !== -1) {
            return new vscode.Location(
                vscode.Uri.file(targetFile),
                new vscode.Position(lineNumber, 0)
            );
        }

        return undefined;
    }

    /**
     * Find the line number in a file where a record with the given name is defined
     */
    private findRecordLineInFile(filePath: string, name: string): number {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');
            
            // Skip header lines and find the data section
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.length === 0 || line.startsWith('#')) {
                    continue;
                }
                
                // Parse the line to get the first column value
                const tokens = parseLineTokens(line);
                if (tokens.length > 0 && tokens[0].value === name) {
                    return i;
                }
            }
            
            return -1;
        } catch (error) {
            console.error('Error reading file:', error);
            return -1;
        }
    }
}
