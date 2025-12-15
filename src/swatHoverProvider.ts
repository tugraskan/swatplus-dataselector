import * as vscode from 'vscode';
import * as path from 'path';
import { SwatDatabaseHelper } from './swatDatabaseHelper';
import { parseLineTokens, findTokenAtPosition, findHeaderLine, MAX_HOVER_FIELDS } from './swatFileParser';

/**
 * Provides hover information for SWAT+ text files
 * Shows details about linked records when hovering over foreign key references
 */
export class SwatHoverProvider implements vscode.HoverProvider {
    constructor(
        private dbHelper: SwatDatabaseHelper,
        private getSelectedDataset: () => string | undefined
    ) {}

    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
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
        const result = this.parseSwatFileLine(document, position, word, tableName, dbPath);
        
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
        dbPath: string
    ): vscode.Hover | undefined {
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

            // Try to find the record by name in the target table
            const result = this.dbHelper.resolveForeignKey(dbPath, tableName, columnName, columnValue);
            
            if (!result) {
                // Try looking up by name
                const targetTable = this.guessTargetTable(columnName);
                if (targetTable) {
                    const record = this.dbHelper.findRecordByName(dbPath, targetTable, columnValue);
                    if (record) {
                        return this.createHover(columnName, columnValue, targetTable, record);
                    }
                }
                return undefined;
            }

            return this.createHover(columnName, columnValue, result.targetTable, result.record);

        } catch (error) {
            console.error('Error creating hover:', error);
            return undefined;
        }
    }

    /**
     * Create a hover markdown message with record details
     */
    private createHover(
        columnName: string,
        value: string,
        targetTable: string,
        record: any
    ): vscode.Hover {
        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;
        
        markdown.appendMarkdown(`**${columnName}**: \`${value}\`\n\n`);
        markdown.appendMarkdown(`*Linked to: ${targetTable}*\n\n`);
        markdown.appendMarkdown('---\n\n');
        
        // Display key fields from the record
        const displayFields = ['name', 'description'];
        const allFields = Object.keys(record).filter(k => k !== 'id');
        
        // Count how many fields we've shown
        let fieldsShown = 0;
        
        // Show name and description first if they exist
        displayFields.forEach(field => {
            if (record[field] !== undefined && record[field] !== null) {
                markdown.appendMarkdown(`**${field}**: ${record[field]}\n\n`);
                fieldsShown++;
            }
        });
        
        // Show a few other fields (limit to MAX_HOVER_FIELDS total)
        const remainingSlots = MAX_HOVER_FIELDS - fieldsShown;
        const otherFields = allFields.filter(f => !displayFields.includes(f)).slice(0, remainingSlots);
        otherFields.forEach(field => {
            const val = record[field];
            if (val !== undefined && val !== null) {
                markdown.appendMarkdown(`**${field}**: ${val}\n\n`);
                fieldsShown++;
            }
        });
        
        // Calculate remaining fields
        const remainingFields = allFields.length - fieldsShown;
        if (remainingFields > 0) {
            markdown.appendMarkdown(`\n*...and ${remainingFields} more field${remainingFields === 1 ? '' : 's'}*\n\n`);
        }
        
        markdown.appendMarkdown('\n---\n\n');
        markdown.appendMarkdown('*Click to go to definition (F12)*');
        
        return new vscode.Hover(markdown);
    }

    /**
     * Guess the target table name from the column name
     */
    private guessTargetTable(columnName: string): string | undefined {
        const columnTableMap: { [key: string]: string } = {
            'hydro': 'hydrology_hyd',
            'topo': 'topography_hyd',
            'field': 'field_fld',
            'soil': 'soils_sol',
            'lu_mgt': 'landuse_lum',
            'soil_plant_init': 'soil_plant_ini',
            'surf_stor': 'wetland_wet',
            'snow': 'snow_sno',
            'plnt_typ': 'plants_plt',
            'soil_text': 'soils_lte_sol'
        };

        return columnTableMap[columnName];
    }
}
