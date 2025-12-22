import * as vscode from 'vscode';
import * as path from 'path';
import { SwatDatabaseHelper } from './swatDatabaseHelper';
import { parseLineTokens, findTokenAtPosition, findHeaderLine, MAX_HOVER_FIELDS, PREVIEW_FIELDS_COUNT } from './swatFileParser';

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
        
        // Header with the relationship
        markdown.appendMarkdown(`### 🔗 ${this.getDisplayName(columnName)}\n\n`);
        markdown.appendMarkdown(`**Value**: \`${value}\`\n\n`);
        markdown.appendMarkdown(`**Referenced Table**: ${this.formatTableName(targetTable)}\n\n`);
        markdown.appendMarkdown('---\n\n');
        
        // Display fields in a more organized way
        const allFields = Object.keys(record).filter(k => k !== 'id');
        
        // Priority fields to show first
        const priorityFields = ['name', 'description'];
        const shownFields: string[] = [];
        
        // Show priority fields
        markdown.appendMarkdown('**Key Information:**\n\n');
        priorityFields.forEach(field => {
            if (record[field] !== undefined && record[field] !== null) {
                const displayValue = this.formatFieldValue(record[field]);
                markdown.appendMarkdown(`• **${this.formatFieldName(field)}**: ${displayValue}\n`);
                shownFields.push(field);
            }
        });
        
        // Show other important fields
        const otherFields = allFields.filter(f => !priorityFields.includes(f));
        const fieldsToShow = otherFields.slice(0, PREVIEW_FIELDS_COUNT);
        
        if (fieldsToShow.length > 0) {
            markdown.appendMarkdown('\n**Additional Fields:**\n\n');
            fieldsToShow.forEach(field => {
                const val = record[field];
                if (val !== undefined && val !== null) {
                    const displayValue = this.formatFieldValue(val);
                    markdown.appendMarkdown(`• **${this.formatFieldName(field)}**: ${displayValue}\n`);
                    shownFields.push(field);
                }
            });
        }
        
        // Show remaining field count
        const remainingFields = allFields.length - shownFields.length;
        if (remainingFields > 0) {
            markdown.appendMarkdown(`\n*...and ${remainingFields} more field${remainingFields === 1 ? '' : 's'}*\n`);
        }
        
        // Add helpful actions
        markdown.appendMarkdown('\n---\n\n');
        markdown.appendMarkdown('**Actions:**\n');
        markdown.appendMarkdown('• Press **F12** to go to definition\n');
        markdown.appendMarkdown('• Press **Alt+F12** (Peek Definition) to view inline\n');
        markdown.appendMarkdown('• Right-click for more options\n');
        
        return new vscode.Hover(markdown);
    }

    /**
     * Format field name for display
     */
    private formatFieldName(fieldName: string): string {
        // Convert snake_case to Title Case
        return fieldName
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    /**
     * Format field value for display
     */
    private formatFieldValue(value: any): string {
        if (typeof value === 'number') {
            // Format numbers with appropriate precision
            if (Number.isInteger(value)) {
                return value.toString();
            } else {
                return value.toFixed(4).replace(/\.?0+$/, '');
            }
        }
        return String(value);
    }

    /**
     * Get a friendly display name for a column
     */
    private getDisplayName(columnName: string): string {
        const nameMap: { [key: string]: string } = {
            'hydro': 'Hydrology',
            'topo': 'Topography',
            'field': 'Field',
            'soil': 'Soil',
            'lu_mgt': 'Land Use Management',
            'soil_plant_init': 'Soil Plant Initialization',
            'surf_stor': 'Surface Storage',
            'snow': 'Snow',
            'plnt_typ': 'Plant Type',
            'soil_text': 'Soil Texture',
            'aquifer': 'Aquifer',
            'aqu': 'Aquifer'
        };
        
        return nameMap[columnName] || this.formatFieldName(columnName);
    }

    /**
     * Format table name for display
     */
    private formatTableName(tableName: string): string {
        // Remove _hyd, _fld, etc. suffixes and format
        const baseName = tableName.replace(/_(hyd|fld|sol|lum|ini|wet|sno|plt|dtl|hru|aqu)$/, '');
        return this.formatFieldName(baseName);
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
            'soil_text': 'soils_lte_sol',
            'aquifer': 'aquifer_aqu',
            'aqu': 'aquifer_aqu'
        };

        return columnTableMap[columnName];
    }
}
