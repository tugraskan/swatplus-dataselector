import * as vscode from 'vscode';
import * as path from 'path';
import { SwatDatabaseHelper } from './swatDatabaseHelper';
import { parseLineTokens, findTokenAtPosition, findHeaderLine } from './swatFileParser';
import { SwatDatabaseBrowserProvider } from './swatDatabaseBrowserProvider';

/**
 * Provides code actions for SWAT+ text files
 * Adds "Open referenced record" action for foreign key values
 */
export class SwatCodeActionProvider implements vscode.CodeActionProvider {
    constructor(
        private dbHelper: SwatDatabaseHelper,
        private getSelectedDataset: () => string | undefined,
        private browserProvider: SwatDatabaseBrowserProvider
    ) {}

    async provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeAction[]> {
        const actions: vscode.CodeAction[] = [];

        const datasetPath = this.getSelectedDataset();
        if (!datasetPath) {
            return actions;
        }

        const dbPath = this.dbHelper.getProjectDbPath(datasetPath);
        if (!dbPath || !this.dbHelper.isAvailable()) {
            return actions;
        }

        // Get the file name and determine the table
        const fileName = path.basename(document.fileName);
        const tableName = this.dbHelper.getTableNameForFile(fileName);
        if (!tableName) {
            return actions;
        }

        // Get the position
        const position = range.start;
        
        // Parse the current line to determine context
        const fileContent = document.getText();
        const lines = fileContent.split('\n');
        
        // Find the header line
        const headerLineIndex = findHeaderLine(lines);
        if (headerLineIndex === -1) {
            return actions;
        }

        const headerLine = lines[headerLineIndex];
        const currentLine = lines[position.line];
        
        // Parse header and current line using improved tokenizer
        const headerTokens = parseLineTokens(headerLine);
        const valueTokens = parseLineTokens(currentLine);
        
        // Find which token the cursor is on
        const cursorToken = findTokenAtPosition(valueTokens, position.character);
        if (!cursorToken) {
            return actions;
        }

        const columnIndex = cursorToken.index;
        if (columnIndex >= headerTokens.length) {
            return actions;
        }

        const columnName = headerTokens[columnIndex].value;
        const columnValue = cursorToken.token.value;

        // Check if this column is a foreign key
        const foreignKeys = this.dbHelper.getForeignKeyColumns(dbPath, tableName);
        if (!foreignKeys.includes(columnName)) {
            return actions;
        }

        // Try to resolve the foreign key to get target table
        const result = this.dbHelper.resolveForeignKey(dbPath, tableName, columnName, columnValue);
        
        let targetTable: string | undefined;
        if (result) {
            targetTable = result.targetTable;
        } else {
            // Try guessing the target table
            targetTable = this.guessTargetTable(columnName);
        }

        if (targetTable) {
            // Create code action to open the database browser
            const action = new vscode.CodeAction(
                `🔍 Open "${columnValue}" in Database Browser`,
                vscode.CodeActionKind.RefactorInline
            );
            action.command = {
                title: 'Open in Database Browser',
                command: 'swat-dataset-selector.openDatabaseBrowser',
                arguments: [targetTable, columnValue]
            };
            actions.push(action);
        }

        return actions;
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
