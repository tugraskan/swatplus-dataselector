import * as vscode from 'vscode';
import * as path from 'path';
import { SwatDatabaseHelper } from './swatDatabaseHelper';
import { parseLineTokens, findHeaderLine } from './swatFileParser';

/**
 * Provides CodeLens (inline action links) for SWAT+ text files
 * Shows "Go to..." links above lines with foreign key references
 */
export class SwatCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor(
        private dbHelper: SwatDatabaseHelper,
        private getSelectedDataset: () => string | undefined
    ) {}

    async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        const codeLenses: vscode.CodeLens[] = [];
        
        const datasetPath = this.getSelectedDataset();
        if (!datasetPath) {
            return codeLenses;
        }

        const dbPath = this.dbHelper.getProjectDbPath(datasetPath);
        if (!dbPath || !this.dbHelper.isAvailable()) {
            return codeLenses;
        }

        // Get the file name and determine the table
        const fileName = path.basename(document.fileName);
        const tableName = this.dbHelper.getTableNameForFile(fileName);
        if (!tableName) {
            return codeLenses;
        }

        // Get foreign key columns for this table
        const foreignKeys = this.dbHelper.getForeignKeyColumns(dbPath, tableName);
        if (foreignKeys.length === 0) {
            return codeLenses;
        }

        const fileContent = document.getText();
        const lines = fileContent.split('\n');
        
        // Find the header line
        const headerLineIndex = findHeaderLine(lines);
        if (headerLineIndex === -1) {
            return codeLenses;
        }

        const headerLine = lines[headerLineIndex];
        const headerTokens = parseLineTokens(headerLine);
        
        // Find column indices for foreign keys
        const foreignKeyIndices = foreignKeys
            .map(fk => headerTokens.findIndex(t => t.value === fk))
            .filter(idx => idx !== -1);
        
        if (foreignKeyIndices.length === 0) {
            return codeLenses;
        }

        // Process each data line
        for (let lineNum = headerLineIndex + 1; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum].trim();
            if (line.length === 0 || line.startsWith('#')) {
                continue;
            }

            const valueTokens = parseLineTokens(lines[lineNum]);
            
            // Check if this line has foreign key values
            const hasForeignKeys = foreignKeyIndices.some(idx => idx < valueTokens.length);
            if (!hasForeignKeys) {
                continue;
            }

            // Create CodeLens for lines with foreign keys
            const range = new vscode.Range(lineNum, 0, lineNum, 0);
            const foreignKeyLinks: string[] = [];
            
            foreignKeyIndices.forEach(colIdx => {
                if (colIdx < valueTokens.length && colIdx < headerTokens.length) {
                    const columnName = headerTokens[colIdx].value;
                    const columnValue = valueTokens[colIdx].value;
                    const displayName = this.getDisplayName(columnName);
                    foreignKeyLinks.push(`${displayName}: ${columnValue}`);
                }
            });

            if (foreignKeyLinks.length > 0) {
                const codeLens = new vscode.CodeLens(range, {
                    title: `🔗 Referenced: ${foreignKeyLinks.join(' | ')}`,
                    tooltip: 'Click values in this row to navigate to referenced records (F12)',
                    command: ''
                });
                codeLenses.push(codeLens);
            }
        }

        return codeLenses;
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
            'lu_mgt': 'Land Use',
            'soil_plant_init': 'Soil Plant Init',
            'surf_stor': 'Surface Storage',
            'snow': 'Snow',
            'plnt_typ': 'Plant Type',
            'soil_text': 'Soil Texture'
        };
        
        return nameMap[columnName] || columnName;
    }

    public refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }
}
