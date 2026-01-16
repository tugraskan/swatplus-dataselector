/**
 * SWAT+ Single Table Viewer Panel
 * 
 * Provides a webview panel that displays a single indexed SWAT+ input table
 * with clickable FK and file pointer navigation.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SwatIndexer } from './indexer';

export class SwatSingleTableViewerPanel {
    private static panels: Map<string, SwatSingleTableViewerPanel> = new Map();
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private highlightValue?: string; // Optional value to highlight/expand in hierarchical views

    private constructor(
        panel: vscode.WebviewPanel,
        private indexer: SwatIndexer,
        private tableName: string,
        highlightValue?: string
    ) {
        this._panel = panel;
        this.highlightValue = highlightValue;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'navigateToFile':
                        this.navigateToLocation(message.file, message.line);
                        break;
                    case 'navigateToTarget':
                        if (message.file && message.line) {
                            this.navigateToLocation(message.file, message.line);
                        }
                        break;
                    case 'openFile':
                        if (message.fileName) {
                            this.openFileByName(message.fileName);
                        }
                        break;
                    case 'openFileWithHighlight':
                        if (message.fileName) {
                            this.openFileByName(message.fileName, message.highlightValue);
                        }
                        break;
                    case 'getFKRowData':
                        if (message.tableName && message.fkValue) {
                            this.sendFKRowData(
                                message.tableName,
                                message.fkValue,
                                message.sourceFile,
                                message.sourceLine,
                                message.sourceTable,
                                message.sourceColumn
                            );
                        }
                        break;
                    case 'openTableInNewTab':
                        if (message.tableName) {
                            this.openTableInNewTab(message.tableName, message.fkValue);
                        }
                        break;
                    case 'openInputFile':
                        if (message.file) {
                            this.openFileInEditor(message.file);
                        }
                        break;
                    case 'openFileForTable':
                        if (message.tableName) {
                            this.openFileForTable(message.tableName);
                        }
                        break;
                    case 'openFilePointer':
                        if (message.fileName) {
                            this.openFilePointer(message.fileName);
                        }
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(indexer: SwatIndexer, tableName: string, highlightValue?: string) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        const resolvedTableName = SwatSingleTableViewerPanel.resolveTableName(indexer, tableName);

        // If we already have a panel for this table, show it and update highlight
        if (SwatSingleTableViewerPanel.panels.has(resolvedTableName)) {
            const existingPanel = SwatSingleTableViewerPanel.panels.get(resolvedTableName)!;
            existingPanel._panel.reveal(column);
            existingPanel.highlightValue = highlightValue; // Update highlight value
            existingPanel._update();
            return;
        }

        // Otherwise, create a new panel for this table
        const fileName = indexer.getFileNameForTable(resolvedTableName) || resolvedTableName;
        const panel = vscode.window.createWebviewPanel(
            'swatSingleTableViewer',
            `SWAT+ Table: ${fileName}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        const newPanel = new SwatSingleTableViewerPanel(panel, indexer, resolvedTableName, highlightValue);
        SwatSingleTableViewerPanel.panels.set(resolvedTableName, newPanel);
    }

    public static closeAll(): void {
        for (const panel of SwatSingleTableViewerPanel.panels.values()) {
            panel.dispose();
        }
        SwatSingleTableViewerPanel.panels.clear();
    }

    private static resolveTableName(indexer: SwatIndexer, tableName: string): string {
        if (indexer.isTableIndexed(tableName)) {
            return tableName;
        }

        const mappedTableName = indexer.getTableNameFromFile(tableName);
        if (mappedTableName && indexer.isTableIndexed(mappedTableName)) {
            return mappedTableName;
        }

        const normalizedTableName = tableName.replace(/[.-]/g, '_').toLowerCase();
        if (indexer.isTableIndexed(normalizedTableName)) {
            return normalizedTableName;
        }

        return tableName;
    }

    public dispose() {
        SwatSingleTableViewerPanel.panels.delete(this.tableName);

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private async navigateToLocation(file: string, line: number) {
        try {
            // Resolve the file path if it's relative
            let filePath = file;
            if (!path.isAbsolute(file)) {
                // Get the workspace folder
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (workspaceFolders && workspaceFolders.length > 0) {
                    filePath = path.join(workspaceFolders[0].uri.fsPath, file);
                }
            }
            
            const document = await vscode.workspace.openTextDocument(filePath);
            const editor = await vscode.window.showTextDocument(document);
            const position = new vscode.Position(line - 1, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position));
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to navigate to ${file}:${line}`);
        }
    }

    private sendFKRowData(
        tableName: string,
        fkValue: string,
        sourceFile?: string,
        sourceLine?: number,
        sourceTable?: string,
        sourceColumn?: string
    ) {
        try {
            const schema = this.indexer.getSchema();
            const indexData = this.indexer.getIndexData();
            
            if (!schema || !indexData) {
                return;
            }

            // Find the row with the matching FK value
            const targetRow = this.indexer.resolveFKTarget(tableName, fkValue);
            if (!targetRow) {
                return;
            }
            
            // Get schema for the target table to get column names
            const resolvedTableName = targetRow.tableName || tableName;
            const fileName = this.indexer.getFileNameForTable(resolvedTableName) || resolvedTableName;
            const schemaTable = schema.tables[fileName];
            const metadata = this.indexer.getMetadata();
            const filePointers = metadata?.file_pointer_columns?.[fileName || ''] || {};
            const fkColumns: Record<string, { targetTable: string; targetFile: string }> = {};
            if (schemaTable && schemaTable.foreign_keys) {
                schemaTable.foreign_keys.forEach((fk: any) => {
                    const targetTable = fk.references.table;
                    const targetFile = this.indexer.getFileNameForTable(targetTable) || targetTable;
                    fkColumns[fk.column] = { targetTable, targetFile };
                });
            }
            
            // Get columns from actual indexed data (not schema)
            let columns: string[] = [];
            columns = Object.keys(targetRow.values || {});
            
            const showRelated = false;
            const relatedRows: Array<{ lineNumber: number; file: string; values: Record<string, string> }> = [];
            let relatedColumns: string[] = [];
            let relatedTotal = 0;
            let relatedTableName: string | undefined;
            let relatedColumnName: string | undefined;

            if (showRelated && sourceTable && sourceColumn) {
                const sourceTableData = indexData.get(sourceTable);
                if (sourceTableData) {
                    const firstRow = sourceTableData.values().next().value;
                    relatedColumns = firstRow?.values ? Object.keys(firstRow.values) : [];
                    for (const row of sourceTableData.values()) {
                        if ((row.values?.[sourceColumn] || '') === fkValue) {
                            relatedTotal += 1;
                            relatedRows.push({
                                lineNumber: row.lineNumber,
                                file: row.file,
                                values: row.values
                            });
                        }
                    }
                    relatedTableName = sourceTable;
                    relatedColumnName = sourceColumn;
                }
            }

            // Send the row data back to the webview
            this._panel.webview.postMessage({
                command: 'showFKRowData',
                tableName: tableName,
                fkValue: fkValue,
                fileName: fileName || tableName,
                columns: columns,
                rowData: targetRow.values,
                lineNumber: targetRow.lineNumber,
                isDecisionTable: tableName.includes('dtl'),
                childRows: Array.isArray(targetRow.childRows) ? targetRow.childRows : [],
                filePointers: filePointers,
                fkColumns: fkColumns,
                sourceFile: sourceFile,
                sourceLine: sourceLine,
                showRelated: showRelated,
                relatedRows: relatedRows,
                relatedColumns: relatedColumns,
                relatedTotal: relatedTotal,
                relatedTableName: relatedTableName,
                relatedColumnName: relatedColumnName
            });
        } catch (error) {
            console.error('Failed to get FK row data', error);
        }
    }

    private openTableInNewTab(tableName: string, fkValue?: string) {
        // Create a new table viewer panel for this specific table with optional highlight
        SwatSingleTableViewerPanel.createOrShow(this.indexer, tableName, fkValue);
    }

    private async openFileByName(fileName: string, highlightValue?: string) {
        try {
            const resolvedFileName = this.normalizeFileName(fileName);
            // Map the file name to a table name using the indexer
            let tableName = this.indexer.getTableNameFromFile(resolvedFileName);
            
            // If not found, try deriving table name from file name
            if (!tableName) {
                // Replace dots with underscores (e.g., pcp.cli -> pcp_cli)
                const tableNameFromFile = resolvedFileName.replace(/\./g, '_');
                if (this.indexer.isTableIndexed(tableNameFromFile)) {
                    tableName = tableNameFromFile;
                }
            }
            
            // Even if we found a table name in the schema mapping, we need to verify
            // that the table actually has data in the index
            if (!tableName || !this.indexer.isTableIndexed(tableName)) {
                vscode.window.showWarningMessage(`Table for file "${resolvedFileName}" is not indexed. This file is listed in file.cio but was not found in your dataset. It may be optional for your SWAT+ configuration.`);
                return;
            }
            
            // Open the table in a new viewer panel
            SwatSingleTableViewerPanel.createOrShow(this.indexer, tableName, highlightValue);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open table for ${fileName}: ${error}`);
        }
    }

    private async openFilePointer(fileName: string) {
        try {
            const filePath = this.resolveFilePointerPath(fileName);
            if (!filePath) {
                vscode.window.showErrorMessage(`Could not resolve file pointer: ${fileName}`);
                return;
            }

            if (!fs.existsSync(filePath)) {
                vscode.window.showErrorMessage(`File does not exist: ${fileName}`);
                return;
            }

            await this.openFileInEditor(filePath);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open file pointer ${fileName}: ${error}`);
        }
    }

    private resolveFilePointerPath(fileName: string): string | null {
        if (!fileName) {
            return null;
        }

        if (path.isAbsolute(fileName)) {
            return fileName;
        }

        const txtInOutPath = this.indexer.getTxtInOutPath();
        if (!txtInOutPath) {
            return null;
        }

        return path.join(txtInOutPath, fileName);
    }

    private canOpenFilePointer(fileName: string): { canOpen: boolean; filePath?: string } {
        const filePath = this.resolveFilePointerPath(fileName);
        if (!filePath) {
            return { canOpen: false };
        }

        return { canOpen: fs.existsSync(filePath), filePath };
    }

    /**
     * Check if a file can be opened (exists in index)
     */
    private canOpenFile(fileName: string): boolean {
        if (!fileName || fileName === 'null' || !fileName.includes('.')) {
            return false;
        }

        const resolvedFileName = this.normalizeFileName(fileName);
        
        // Check if the file actually exists on disk
        const txtInOutPath = this.indexer.getTxtInOutPath();
        if (txtInOutPath) {
            const filePath = path.join(txtInOutPath, resolvedFileName);
            if (!fs.existsSync(filePath)) {
                return false;
            }
        }
        
        // Check if it maps to a table
        let tableName = this.indexer.getTableNameFromFile(resolvedFileName);
        
        // If not found, try deriving table name from file name
        if (!tableName) {
            // Replace dots with underscores (e.g., pcp.cli -> pcp_cli)
            const tableNameFromFile = resolvedFileName.replace(/\./g, '_');
            if (this.indexer.isTableIndexed(tableNameFromFile)) {
                tableName = tableNameFromFile;
            }
        }
        
        // Even if we found a table name in the schema mapping, we need to verify
        // that the table actually has data in the index
        if (tableName) {
            return this.indexer.isTableIndexed(tableName);
        }
        
        return false;
    }

    private normalizeFileName(fileName: string): string {
        if (!fileName) {
            return fileName;
        }

        if (fileName.includes('/') || fileName.includes('\\')) {
            return path.basename(fileName);
        }

        return fileName;
    }

    private async openFileInEditor(file: string) {
        try {
            const document = await vscode.workspace.openTextDocument(file);
            await vscode.window.showTextDocument(document, { preview: false });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open file ${file}`);
        }
    }

    private async openFileForTable(tableName: string) {
        try {
            const fileName = this.indexer.getFileNameForTable(tableName);
            if (!fileName) {
                vscode.window.showErrorMessage(`Could not find file for table: ${tableName}`);
                return;
            }
            
            // Construct file path using txtInOutPath
            const txtInOutPath = this.indexer.getTxtInOutPath();
            if (!txtInOutPath) {
                vscode.window.showErrorMessage(`Could not determine TxtInOut directory for table: ${tableName}`);
                return;
            }
            
            const filePath = path.join(txtInOutPath, fileName);
            
            // Check if file exists
            if (!fs.existsSync(filePath)) {
                vscode.window.showErrorMessage(`File does not exist: ${fileName}`);
                return;
            }
            
            // Open the file
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document, { preview: false });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open file for table ${tableName}: ${error}`);
        }
    }

    public refresh() {
        this._update();
    }

    private _update() {
        const webview = this._panel.webview;
        const resolvedFileName = this.indexer.getFileNameForTable(this.tableName) || this.tableName;
        this._panel.title = `SWAT+ Table: ${resolvedFileName}`;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        if (!this.indexer.isIndexBuilt()) {
            return this._getNoIndexHtml();
        }

        const schema = this.indexer.getSchema();
        if (!schema) {
            return this._getNoSchemaHtml();
        }

        // Get data for this specific table
        const indexData = this.indexer.getIndexData();
        const tableData = indexData.get(this.tableName) || new Map<string, any>();
        
        // Allow empty tables to render with their structure
        const resolvedFileName = this.indexer.getFileNameForTable(this.tableName) || this.tableName;
        const schemaTable = resolvedFileName && schema.tables[resolvedFileName] ? schema.tables[resolvedFileName] : undefined;
        const rowCount = tableData.size;

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>SWAT+ Table: ${resolvedFileName}</title>
            <style>
                ${this._getStyles()}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>
                    ${this.tableName}
                    ${this._getGitbookLink(resolvedFileName)}
                </h1>
                <div class="stats">
                    <span class="stat-item">File: <a href="#" data-action="open-file-for-table" data-table-name="${this._escapeHtml(this.tableName)}" class="file-link" title="Click to open file">${resolvedFileName}</a></span>
                    ${this.tableName !== 'file_cio' ? `<span class="stat-item">Rows: ${rowCount}</span>` : ''}
                </div>
            </div>
            <div class="content">
                ${this._getTableHtml(tableData, schemaTable)}
            </div>
            <script>
                ${this._getScript()}
            </script>
        </body>
        </html>`;
    }

    private _getTableHtml(tableData: Map<string, any>, schemaTable: any): string {
        const rows = Array.from(tableData.values());
        const resolvedFileName = this.indexer.getFileNameForTable(this.tableName) || this.tableName;
        
        // Special rendering for file.cio - use classification-based sub-table view
        if (this.tableName === 'file_cio') {
            if (rows.length === 0) {
                return '<p class="empty-message">No data</p>';
            }
            return this._getFileCioSubTableHtml(rows);
        }

        // Special rendering for weather-wgn.cli - use station-based sub-table view with monthly data
        if (this.tableName === 'weather_wgn_cli') {
            if (rows.length === 0) {
                return '<p class="empty-message">No data</p>';
            }
            return this._getWeatherWgnSubTableHtml(rows);
        }

        // Special rendering for atmo.cli - use station-based sub-table view with deposition data
        if (this.tableName === 'atmo_cli') {
            if (rows.length === 0) {
                return '<p class="empty-message">No data</p>';
            }
            return this._getAtmoCliSubTableHtml(rows);
        }

        // Special rendering for soils.sol - use soil-profile sub-table view with layer data
        if (this.tableName === 'soils_sol') {
            if (rows.length === 0) {
                return '<p class="empty-message">No data</p>';
            }
            return this._getSoilsSolSubTableHtml(rows);
        }

        // Special rendering for plant.ini - use plant community sub-table view with plant member data
        if (this.tableName === 'plant_ini') {
            if (rows.length === 0) {
                return '<p class="empty-message">No data</p>';
            }
            return this._getPlantIniSubTableHtml(rows);
        }

        // Special rendering for management.sch - use schedule-based sub-table view with auto/op detail data
        if (this.tableName === 'management_sch') {
            if (rows.length === 0) {
                return '<p class="empty-message">No data</p>';
            }
            return this._getManagementSchSubTableHtml(rows);
        }
        // Special rendering for decision table files (*.dtl) - use profile-based sub-table view
        if (resolvedFileName.endsWith('.dtl')) {
            if (rows.length === 0) {
                return '<p class="empty-message">No data</p>';
            }
            return this._getDecisionTableSubTableHtml(rows, resolvedFileName);
        }

        // For empty tables, show table structure with headers from schema
        if (rows.length === 0) {
            if (schemaTable && schemaTable.columns) {
                return this._getEmptyTableHtml(schemaTable);
            }
            return '<p class="empty-message">No data</p>';
        }

        // Get columns from actual indexed data (not schema)
        // This ensures we only show columns that exist in the actual input files
        let columns: string[] = [];
        const columnMetadata = new Map<string, any>();
        columns = Object.keys(rows[0].values || {});
        
        // Build metadata map from schema if available
        if (schemaTable && schemaTable.columns) {
            schemaTable.columns.forEach((col: any) => {
                columnMetadata.set(col.name, col);
            });
        }

        // Get FK columns and their targets
        const fkColumns = new Map<string, any>();
        // Skip FK detection for file.cio - it has a special format that doesn't match the database schema
        if (schemaTable && schemaTable.foreign_keys && this.tableName !== 'file_cio') {
            schemaTable.foreign_keys.forEach((fk: any) => {
                fkColumns.set(fk.column, fk);
            });
        }

        const numericTypeIndicators = ['int', 'integer', 'num', 'numeric', 'decimal', 'float', 'double', 'real', 'dbl'];
        const filterableColumns = columns.filter(col => {
            const colMeta = columnMetadata.get(col);
            if (!colMeta || !colMeta.type) {
                return true;
            }
            const type = String(colMeta.type).toLowerCase();
            const isText = type.includes('char') || type.includes('text') || type.includes('string');
            const isNumeric = numericTypeIndicators.some(indicator => type.includes(indicator));
            return isText || isNumeric || fkColumns.has(col);
        });
        const filterColumns = filterableColumns.length > 0 ? filterableColumns : columns;
        const getFilterMode = (colName: string) => {
            const colMeta = columnMetadata.get(colName);
            const type = colMeta && colMeta.type ? String(colMeta.type).toLowerCase() : '';
            const isText = type.includes('char') || type.includes('text') || type.includes('string');
            return fkColumns.has(colName) || isText ? 'text' : 'numeric';
        };

        // Get file pointer columns from metadata
        const metadata = this.indexer.getMetadata();
        const fileName = this.indexer.getFileNameForTable(this.tableName);
        const filePointers = metadata?.file_pointer_columns?.[fileName || ''] || {};
        const fileMetadata = metadata?.file_metadata?.[fileName || ''];

        // Add file description if available
        let descriptionHtml = '';
        if (fileMetadata && fileMetadata.description) {
            descriptionHtml = `<div class="file-description">${this._escapeHtml(fileMetadata.description)}</div>`;
        }

        const controlsHtml = `
            <div class="table-controls" data-table="${this._escapeHtml(this.tableName)}">
                <label>
                    Column
                    <select class="table-filter-column" data-table="${this._escapeHtml(this.tableName)}">
                        <option value="__all" data-filter-mode="text">All columns</option>
                        <option value="__line" data-filter-mode="numeric">Line</option>
                        ${filterColumns.map((col, index) => `<option value="${this._escapeHtml(col)}" data-filter-mode="${getFilterMode(col)}"${index === 0 ? ' selected' : ''}>${this._escapeHtml(col)}</option>`).join('')}
                    </select>
                </label>
                <label class="table-filter-operator" data-table="${this._escapeHtml(this.tableName)}">
                    Operator
                    <select class="table-filter-operator-select" data-table="${this._escapeHtml(this.tableName)}">
                        <option value="=" selected>=</option>
                        <option value="!=">!=</option>
                        <option value=">">></option>
                        <option value=">=">>=</option>
                        <option value="<"><</option>
                        <option value="<="><=</option>
                    </select>
                </label>
                <label>
                    Filter
                    <input type="text" class="table-filter-input" data-table="${this._escapeHtml(this.tableName)}" placeholder="Type to filter rows" />
                </label>
                <button type="button" class="table-filter-clear" data-action="clear-filter" data-table="${this._escapeHtml(this.tableName)}">Clear</button>
            </div>
        `;

        let tableHtml = `
            ${descriptionHtml}
            ${controlsHtml}
            <div class="table-wrapper">
                <table class="data-table" data-table-name="${this._escapeHtml(this.tableName)}">
                    <thead>
                        <tr>
                            <th class="line-col sortable" data-col-name="__line" data-sortable="true" title="Line">
                                Line
                                <span class="sort-indicator"></span>
                            </th>
                            ${columns.map(col => {
                                const colMeta = columnMetadata.get(col);
                                const fkInfo = fkColumns.get(col);
                                const isFilePointer = typeof filePointers === 'object' && col in filePointers;
                                
                                // Build tooltip text
                                let tooltip = col;
                                if (colMeta) {
                                    tooltip += `\nType: ${colMeta.type}`;
                                    if (colMeta.nullable) {
                                        tooltip += ' (nullable)';
                                    }
                                }
                                if (fkInfo) {
                                    tooltip += `\nForeign Key → ${fkInfo.references.table}`;
                                }
                                if (isFilePointer && typeof filePointers === 'object') {
                                    const pointerConfig = filePointers[col];
                                    if (pointerConfig && pointerConfig !== 'description') {
                                        if (typeof pointerConfig === 'string') {
                                            tooltip += `\n${pointerConfig}`;
                                        } else if (typeof pointerConfig === 'object') {
                                            if (pointerConfig.description) {
                                                tooltip += `\n${pointerConfig.description}`;
                                            }
                                            if (pointerConfig.target_file) {
                                                tooltip += `\nFile Pointer → ${pointerConfig.target_file}`;
                                            }
                                            if (pointerConfig.file_pattern) {
                                                tooltip += `\nPattern: ${pointerConfig.file_pattern}`;
                                            }
                                        }
                                    }
                                }
                                
                                return `
                                <th class="${fkInfo ? 'fk-col' : ''} sortable" data-col-name="${this._escapeHtml(col)}" data-sortable="true" title="${this._escapeHtml(tooltip)}">
                                    ${col}
                                    ${fkInfo ? '<span class="fk-indicator" title="Foreign Key">🔗</span>' : ''}
                                    ${isFilePointer ? '<span class="file-pointer-indicator" title="File Pointer">📄</span>' : ''}
                                    <span class="sort-indicator"></span>
                                </th>
                            `;
                            }).join('')}
                        </tr>
                    </thead>
                    <tbody>
        `;

        for (const row of rows) {
            tableHtml += `<tr>`;
            tableHtml += `<td class="line-col" data-col-name="__line"><a href="#" data-action="navigate" data-file="${this._escapeHtml(row.file)}" data-line="${row.lineNumber}">${row.lineNumber}</a></td>`;
            
            for (const col of columns) {
                const value = row.values[col] || '';
                const fkInfo = fkColumns.get(col);
                const pointerConfig = typeof filePointers === 'object' ? filePointers[col] : undefined;
                const isFilePointer = typeof filePointers === 'object' && col in filePointers;
                
                // Special handling for file.cio file_name column - make it a clickable file link
                if (this.tableName === 'file_cio' && col === 'file_name' && value && value !== 'null' && value.includes('.')) {
                    const canOpen = this.canOpenFile(value);
                    const linkClass = canOpen ? 'file-link' : 'file-link broken-link';
                    const title = canOpen ? `Click to open ${this._escapeHtml(value)}` : `${this._escapeHtml(value)} - Not indexed (may not exist in dataset)`;
                    tableHtml += `<td class="file-link-cell" data-col-name="${this._escapeHtml(col)}"><a href="#" data-action="open-file" data-file="${this._escapeHtml(value)}" class="${linkClass}" title="${title}">${this._escapeHtml(value)}</a></td>`;
                } else if (isFilePointer && value && value !== 'null' && value.includes('.')) {
                    const mappedTableName = this.indexer.getTableNameFromFile(value);
                    const canOpenTable = mappedTableName ? this.indexer.isTableIndexed(mappedTableName) : false;
                    if (canOpenTable) {
                        const canOpen = this.canOpenFile(value);
                        const linkClass = canOpen ? 'file-link' : 'file-link broken-link';
                        const title = canOpen ? `Click to open ${this._escapeHtml(value)}` : `${this._escapeHtml(value)} - Not indexed (may not exist in dataset)`;
                        tableHtml += `<td class="file-link-cell" data-col-name="${this._escapeHtml(col)}"><a href="#" data-action="open-file" data-file="${this._escapeHtml(value)}" class="${linkClass}" title="${title}">${this._escapeHtml(value)}</a></td>`;
                    } else {
                        const { canOpen, filePath } = this.canOpenFilePointer(value);
                        const linkClass = canOpen ? 'file-link' : 'file-link broken-link';
                        const title = canOpen ? `Click to open ${this._escapeHtml(value)}` : `${this._escapeHtml(value)} - File not found in TxtInOut`;
                        if (canOpen && filePath) {
                            tableHtml += `<td class="file-link-cell" data-col-name="${this._escapeHtml(col)}"><a href="#" data-action="open-input-file" data-file="${this._escapeHtml(filePath)}" class="${linkClass}" title="${title}">${this._escapeHtml(value)}</a></td>`;
                        } else {
                            tableHtml += `<td class="file-link-cell" data-col-name="${this._escapeHtml(col)}"><span class="${linkClass}" title="${title}">${this._escapeHtml(value)}</span></td>`;
                        }
                    }
                } else if (fkInfo && value) {
                    // Try to resolve FK
                    const targetRow = this.indexer.resolveFKTarget(fkInfo.references.table, value);
                    if (targetRow) {
                        // Embed the FK row data as JSON in data attributes
                        const fkRowDataJson = JSON.stringify(targetRow.values).replace(/"/g, '&quot;');
                        const fileName = this.indexer.getFileNameForTable(fkInfo.references.table) || fkInfo.references.table;
                        tableHtml += `<td class="fk-cell" data-col-name="${this._escapeHtml(col)}" data-fk-context="true" data-fk-table="${this._escapeHtml(fkInfo.references.table)}" data-fk-value="${this._escapeHtml(value)}" data-fk-file="${this._escapeHtml(targetRow.file)}" data-fk-line="${targetRow.lineNumber}" data-fk-filename="${this._escapeHtml(fileName)}" data-source-table="${this._escapeHtml(this.tableName)}" data-source-column="${this._escapeHtml(col)}" data-source-file="${this._escapeHtml(row.file)}" data-source-line="${row.lineNumber}"><a href="#" data-action="toggle-fk" data-fk-context="true" data-fk-table="${this._escapeHtml(fkInfo.references.table)}" data-fk-value="${this._escapeHtml(value)}" data-fk-file="${this._escapeHtml(targetRow.file)}" data-fk-line="${targetRow.lineNumber}" data-source-table="${this._escapeHtml(this.tableName)}" data-source-column="${this._escapeHtml(col)}" data-source-file="${this._escapeHtml(row.file)}" data-source-line="${row.lineNumber}" class="fk-link" title="Click to peek, right-click for options">${this._escapeHtml(value)}</a></td>`;
                    } else {
                        tableHtml += `<td class="fk-cell unresolved" data-col-name="${this._escapeHtml(col)}" title="Unresolved FK to ${this._escapeHtml(fkInfo.references.table)}">${this._escapeHtml(value)}</td>`;
                    }
                } else if (isFilePointer && value && value !== 'null') {
                    const targetFile = typeof pointerConfig === 'object' ? pointerConfig.target_file : undefined;
                    const lookupFile = targetFile || value;
                    const mappedTableName = this.indexer.getTableNameFromFile(lookupFile);
                    const canOpenTable = mappedTableName ? this.indexer.isTableIndexed(mappedTableName) : false;
                    if (canOpenTable) {
                        const canOpen = this.canOpenFile(lookupFile);
                        const linkClass = canOpen ? 'file-link' : 'file-link broken-link';
                        const title = canOpen ? `Click to open ${this._escapeHtml(lookupFile)}` : `${this._escapeHtml(lookupFile)} - Not indexed (may not exist in dataset)`;
                        const highlightColumn = typeof pointerConfig === 'object' ? pointerConfig.highlight_column : undefined;
                        const highlightValue = highlightColumn ? row.values[highlightColumn] : (lookupFile === 'atmo.cli' ? row.values.name : undefined);
                        if (highlightValue) {
                            tableHtml += `<td class="file-link-cell" data-col-name="${this._escapeHtml(col)}"><a href="#" data-action="open-file-highlight" data-file="${this._escapeHtml(lookupFile)}" data-highlight="${this._escapeHtml(highlightValue)}" class="${linkClass}" title="${title}">${this._escapeHtml(value)}</a></td>`;
                        } else {
                            tableHtml += `<td class="file-link-cell" data-col-name="${this._escapeHtml(col)}"><a href="#" data-action="open-file" data-file="${this._escapeHtml(lookupFile)}" class="${linkClass}" title="${title}">${this._escapeHtml(value)}</a></td>`;
                        }
                    } else {
                        const { canOpen, filePath } = this.canOpenFilePointer(lookupFile);
                        const linkClass = canOpen ? 'file-link' : 'file-link broken-link';
                        const title = canOpen ? `Click to open ${this._escapeHtml(lookupFile)}` : `${this._escapeHtml(lookupFile)} - File not found in TxtInOut`;
                        if (canOpen && filePath) {
                            tableHtml += `<td class="file-link-cell" data-col-name="${this._escapeHtml(col)}"><a href="#" data-action="open-input-file" data-file="${this._escapeHtml(filePath)}" class="${linkClass}" title="${title}">${this._escapeHtml(value)}</a></td>`;
                        } else {
                            tableHtml += `<td class="file-link-cell" data-col-name="${this._escapeHtml(col)}"><span class="${linkClass}" title="${title}">${this._escapeHtml(value)}</span></td>`;
                        }
                    }
                } else {
                    tableHtml += `<td data-col-name="${this._escapeHtml(col)}">${this._escapeHtml(value)}</td>`;
                }
            }
            
            tableHtml += `</tr>`;
        }

        tableHtml += `
                    </tbody>
                </table>
            </div>
        `;

        return tableHtml;
    }

    private _getFileCioSubTableHtml(rows: any[]): string {
        // Define the official file.cio structure from GitBook documentation
        const fileCioStructure: { [key: string]: { displayName: string, files: string[] } } = {
            'simulation': { 
                displayName: 'Simulation',
                files: ['time.sim', 'print.prt', 'object.prt', 'object.cnt', 'constituents.cs']
            },
            'basin': {
                displayName: 'Basin',
                files: ['codes.bsn', 'parameters.bsn']
            },
            'climate': {
                displayName: 'Climate',
                files: ['weather-sta.cli', 'weather-wgn.cli', 'wind-dir.cli', 'pcp.cli', 'tmp.cli', 'slr.cli', 'hmd.cli', 'wnd.cli', 'atmo.cli']
            },
            'connect': {
                displayName: 'Connect',
                files: ['hru.con', 'hru-lte.con', 'rout_unit.con', 'gwflow.con', 'aquifer.con', 'aquifer2d.con', 'channel.con', 'reservoir.con', 'recall.con', 'exco.con', 'delratio.con', 'outlet.con', 'chandeg.con']
            },
            'channel': {
                displayName: 'Channel',
                files: ['initial.cha', 'channel.cha', 'hydrology.cha', 'sediment.cha', 'nutrients.cha', 'sed_nut.cha', 'channel-lte.cha', 'hyd-sed-lte.cha', 'temperature.cha']
            },
            'reservoir': {
                displayName: 'Reservoir',
                files: ['initial.res', 'reservoir.res', 'hydrology.res', 'sediment.res', 'nutrients.res', 'weir.res', 'wetland.wet', 'hydrology.wet']
            },
            'routing_unit': {
                displayName: 'Routing Unit',
                files: ['rout_unit.def', 'rout_unit.ele', 'rout_unit.rtu', 'rout_unit.dr']
            },
            'hru': {
                displayName: 'HRU',
                files: ['hru-data.hru', 'hru-lte.hru']
            },
            'exco': {
                displayName: 'Export Coefficient',
                files: ['exco.exc', 'exco_om.exc', 'exco_pest.exc', 'exco_path.exc', 'exco_hmet.exc', 'exco_salt.exc']
            },
            'recall': {
                displayName: 'Recall',
                files: ['recall.rec']
            },
            'dr': {
                displayName: 'Delivery Ratio',
                files: ['del_ratio.del', 'dr_om.del', 'dr_pest.del', 'dr_path.del', 'dr_hmet.del', 'dr_salt.del']
            },
            'aquifer': {
                displayName: 'Aquifer',
                files: ['initial.aqu', 'aquifer.aqu']
            },
            'herd': {
                displayName: 'Herd',
                files: ['animal.hrd', 'herd.hrd', 'ranch.hrd']
            },
            'water_rights': {
                displayName: 'Water Rights',
                files: ['water_allocation.wro']
            },
            'link': {
                displayName: 'Link',
                files: ['chan-surf.lin', 'aqu_cha.lin']
            },
            'hydrology': {
                displayName: 'Hydrology',
                files: ['hydrology.hyd', 'topography.hyd', 'field.fld']
            },
            'structural': {
                displayName: 'Structural',
                files: ['tiledrain.str', 'septic.str', 'filterstrip.str', 'grassedww.str', 'bmpuser.str']
            },
            'hru_parm_db': {
                displayName: 'HRU Databases',
                files: ['plants.plt', 'fertilizer.frt', 'tillage.til', 'pesticide.pes', 'pathogens.pth', 'metals.mtl', 'salt.slt', 'urban.urb', 'septic.sep', 'snow.sno']
            },
            'ops': {
                displayName: 'Operation Scheduling',
                files: ['harv.ops', 'graze.ops', 'irr.ops', 'chem_app.ops', 'fire.ops', 'sweep.ops']
            },
            'lum': {
                displayName: 'Land Use Management',
                files: ['landuse.lum', 'management.sch', 'cntable.lum', 'cons_practice.lum', 'ovn_table.lum']
            },
            'chg': {
                displayName: 'Change',
                files: ['cal_parms.cal', 'calibration.cal', 'codes.sft', 'wb_parms.sft', 'water_balance.sft', 'ch_sed_budget.sft', 'ch_sed_parms.sft', 'plant_parms.sft', 'plant_gro.sft']
            },
            'init': {
                displayName: 'Initial',
                files: ['plant.ini', 'soil_plant.ini', 'om_water.ini', 'pest_hru.ini', 'pest_water.ini', 'path_hru.ini', 'path_water.ini', 'hmet_hru.ini', 'hmet_water.ini', 'salt_hru.ini', 'salt_water.ini']
            },
            'soils': {
                displayName: 'Soils',
                files: ['soils.sol', 'nutrients.sol', 'soils_lte.sol']
            },
            'decision_table': {
                displayName: 'Conditional',
                files: ['lum.dtl', 'res_rel.dtl', 'scen_lu.dtl', 'flo_con.dtl']
            },
            'regions': {
                displayName: 'Regions',
                files: ['ls_unit.ele', 'ls_unit.def', 'ls_reg.ele', 'ls_reg.def', 'ls_cal.reg', 'ch_catunit.ele', 'ch_catunit.def', 'ch_reg.def', 'aqu_catunit.ele', 'aqu_catunit.def', 'aqu_reg.def', 'res_catunit.ele', 'res_catunit.def', 'res_reg.def', 'rec_catunit.ele', 'rec_catunit.def', 'rec_reg.def']
            }
        };

        // Group rows by classification to get actual files from file.cio
        const classificationActualFiles = new Map<string, Map<number, string | null>>();
        const classificationMeta = new Map<string, { lineNumber: number, file: string }>();
        
        for (const row of rows) {
            const classification = (row.values.classification || '').toLowerCase(); // Normalize to lowercase
            const fileName = row.values.file_name;
            const orderInClass = parseInt(row.values.order_in_class) || 0;
            
            if (classification) {
                // Store line number and file for classification header link
                if (!classificationMeta.has(classification)) {
                    classificationMeta.set(classification, {
                        lineNumber: row.lineNumber || 0,
                        file: row.file || 'file.cio'
                    });
                }
                
                // Store actual files by order
                if (!classificationActualFiles.has(classification)) {
                    classificationActualFiles.set(classification, new Map());
                }
                const filesMap = classificationActualFiles.get(classification)!;
                filesMap.set(orderInClass, fileName === 'null' || !fileName ? null : fileName);
            }
        }

        const metadata = this.indexer.getMetadata();
        const fileMetadata = metadata?.file_metadata?.['file.cio'];
        
        let html = '';
        
        // Add file description if available
        if (fileMetadata && fileMetadata.description) {
            html += `<div class="file-description">${this._escapeHtml(fileMetadata.description)}</div>`;
        }

        html += `<div class="file-cio-subtables">`;

        // Render each classification in the defined order
        for (const [classificationKey, classificationData] of Object.entries(fileCioStructure)) {
            const meta = classificationMeta.get(classificationKey);
            const lineNumber = meta?.lineNumber || 0;
            const file = meta?.file || 'file.cio';
            const displayName = classificationData.displayName;
            const expectedFiles = classificationData.files;
            
            // Get actual files from file.cio
            const actualFilesMap = classificationActualFiles.get(classificationKey) || new Map();
            const actualFiles: (string | null)[] = [];
            for (let i = 1; i <= expectedFiles.length; i++) {
                actualFiles.push(actualFilesMap.get(i) || null);
            }
            
            // Count active files (that exist in the index)
            const activeFiles = actualFiles.filter(fileName => fileName && this.canOpenFile(fileName));
            const activeCount = activeFiles.length;
            const totalCount = expectedFiles.length;

            html += `
                <div class="classification-section" data-classification="${this._escapeHtml(classificationKey)}">
                    <div class="classification-header" data-action="toggle-classification" data-classification="${this._escapeHtml(classificationKey)}">
                        <span class="toggle-icon">▼</span>
                        <span class="classification-name">
                            <a href="#" data-action="navigate" data-file="${this._escapeHtml(file)}" data-line="${lineNumber}" class="line-link" title="Go to line ${lineNumber}">${this._escapeHtml(displayName)}</a>
                        </span>
                        <span class="classification-stats">
                            ${activeCount} of ${totalCount} file${totalCount !== 1 ? 's' : ''} indexed
                        </span>
                    </div>
                    <div class="classification-content">
                        <div class="classification-files-grid">
                            <div class="files-row files-header" style="grid-template-columns: repeat(${expectedFiles.length}, 160px);">
            `;

            // Row 1: Expected files from GitBook (headers)
            for (const fileName of expectedFiles) {
                html += `<span class="file-header">${this._escapeHtml(fileName)}</span>`;
            }

            html += `
                            </div>
                            <div class="files-row files-actual" style="grid-template-columns: repeat(${expectedFiles.length}, 160px);">
            `;

            // Row 2: Actual files from file.cio (clickable if they exist)
            for (let i = 0; i < expectedFiles.length; i++) {
                const fileName = i < actualFiles.length ? actualFiles[i] : null;
                if (!fileName) {
                    html += `<span class="file-null">null</span>`;
                } else {
                    const canOpen = this.canOpenFile(fileName);
                    const linkClass = canOpen ? 'file-link' : 'file-link broken-link';
                    const title = canOpen ? `Click to open ${this._escapeHtml(fileName)}` : `${this._escapeHtml(fileName)} - Not indexed (may not exist in dataset)`;
                    html += `<a href="#" data-action="open-file" data-file="${this._escapeHtml(fileName)}" class="${linkClass}" title="${title}">${this._escapeHtml(fileName)}</a>`;
                }
            }

            html += `
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        html += `</div>`;
        
        return html;
    }

    private _getWeatherWgnSubTableHtml(rows: any[]): string {
        const metadata = this.indexer.getMetadata();
        const fileMetadata = metadata?.file_metadata?.['weather-wgn.cli'];
        
        let html = '';
        
        // Add file description if available
        if (fileMetadata && fileMetadata.description) {
            html += `<div class="file-description">${this._escapeHtml(fileMetadata.description)}</div>`;
        }

        html += `<div class="weather-wgn-subtables">`;

        // Month names for better readability
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                           'July', 'August', 'September', 'October', 'November', 'December'];

        // Render each weather station as an expandable section
        for (const row of rows) {
            const stationName = row.values.name || 'Unknown Station';
            const lat = row.values.lat || 'N/A';
            const lon = row.values.lon || 'N/A';
            const elev = row.values.elev || 'N/A';
            const rainYrs = row.values.rain_yrs || 'N/A';
            const lineNumber = row.lineNumber || 0;
            const file = row.file || 'weather-wgn.cli';
            
            // Check if this station should be highlighted
            const isHighlighted = this.highlightValue && stationName && stationName.toLowerCase() === this.highlightValue.toLowerCase();
            const highlightClass = isHighlighted ? ' highlighted-station' : '';
            const highlightId = isHighlighted ? ` id="highlighted-station"` : '';

            html += `
                <div class="wgn-station-section${highlightClass}" data-station="${this._escapeHtml(stationName)}"${highlightId}>
                    <div class="wgn-station-header" data-action="toggle-wgn-station" data-station="${this._escapeHtml(stationName)}">
                        <span class="toggle-icon">▼</span>
                        <span class="station-name">
                            <a href="#" data-action="navigate" data-file="${this._escapeHtml(file)}" data-line="${lineNumber}" class="line-link" title="Go to line ${lineNumber}">${this._escapeHtml(stationName)}</a>
                        </span>
                        <span class="station-info">
                            Lat: ${this._escapeHtml(lat)}, Lon: ${this._escapeHtml(lon)}, Elev: ${this._escapeHtml(elev)}m, Years: ${this._escapeHtml(rainYrs)}
                        </span>
                    </div>
                    <div class="wgn-station-content">
            `;

            // Check if we have child rows (monthly data)
            if (row.childRows && Array.isArray(row.childRows) && row.childRows.length > 0) {
                // Monthly data columns
                const monthlyColumns = [
                    { key: 'month', label: 'Month' },
                    { key: 'tmp_max_ave', label: 'Tmp Max Avg (°C)' },
                    { key: 'tmp_min_ave', label: 'Tmp Min Avg (°C)' },
                    { key: 'tmp_max_sd', label: 'Tmp Max SD (°C)' },
                    { key: 'tmp_min_sd', label: 'Tmp Min SD (°C)' },
                    { key: 'pcp_ave', label: 'Pcp Avg (mm)' },
                    { key: 'pcp_sd', label: 'Pcp SD (mm/day)' },
                    { key: 'pcp_skew', label: 'Pcp Skew' },
                    { key: 'wet_dry', label: 'Wet/Dry' },
                    { key: 'wet_wet', label: 'Wet/Wet' },
                    { key: 'pcp_days', label: 'Pcp Days' },
                    { key: 'pcp_hhr', label: 'Pcp 0.5hr (mm)' },
                    { key: 'slr_ave', label: 'Solar Avg (MJ/m²/day)' },
                    { key: 'dew_ave', label: 'Dew Avg (°C)' },
                    { key: 'wnd_ave', label: 'Wind Avg (m/s)' }
                ];

                html += `
                        <div class="table-wrapper">
                            <table class="monthly-data-table">
                                <thead>
                                    <tr>
                                        <th class="line-col">Line</th>
                                        ${monthlyColumns.map(col => `<th title="${this._escapeHtml(col.label)}">${this._escapeHtml(col.key === 'month' ? 'Month' : col.label)}</th>`).join('')}
                                    </tr>
                                </thead>
                                <tbody>
                `;

                for (const childRow of row.childRows) {
                    const monthNum = parseInt(childRow.values.month || '0');
                    const monthName = monthNum > 0 && monthNum <= 12 ? monthNames[monthNum - 1] : `Month ${monthNum}`;
                    
                    html += `<tr>`;
                    html += `<td class="line-col"><a href="#" data-action="navigate" data-file="${this._escapeHtml(file)}" data-line="${childRow.lineNumber}">${childRow.lineNumber}</a></td>`;
                    
                    for (const col of monthlyColumns) {
                        let value = childRow.values[col.key] || '';
                        // Display month name instead of number
                        if (col.key === 'month') {
                            value = monthName;
                        }
                        html += `<td>${this._escapeHtml(value)}</td>`;
                    }
                    
                    html += `</tr>`;
                }

                html += `
                                </tbody>
                            </table>
                        </div>
                `;
            } else {
                html += `<p class="empty-message">No monthly data available</p>`;
            }

            html += `
                    </div>
                </div>
            `;
        }

        html += `</div>`;
        
        return html;
    }

    private _getAtmoCliSubTableHtml(rows: any[]): string {
        const metadata = this.indexer.getMetadata();
        const fileMetadata = metadata?.file_metadata?.['atmo.cli'];
        
        let html = '';
        
        // Add file description if available
        if (fileMetadata && fileMetadata.description) {
            html += `<div class="file-description">${this._escapeHtml(fileMetadata.description)}</div>`;
        }

        // atmo.cli typically has only one main record with metadata
        if (rows.length === 0) {
            return '<p class="empty-message">No data</p>';
        }

        const mainRow = rows[0]; // The metadata row
        const numSta = mainRow.values.num_sta || '0';
        const timestep = mainRow.values.timestep || 'N/A';
        const moInit = mainRow.values.mo_init || '0';
        const yrInit = mainRow.values.yr_init || '0';
        const numAa = mainRow.values.num_aa || '0';

        html += `
            <div class="atmo-cli-header">
                <h3>Atmospheric Deposition Data</h3>
                <div class="atmo-metadata">
                    <span><strong>Stations:</strong> ${this._escapeHtml(numSta)}</span>
                    <span><strong>Timestep:</strong> ${this._escapeHtml(timestep)}</span>
                    <span><strong>First Month:</strong> ${this._escapeHtml(moInit)}</span>
                    <span><strong>First Year:</strong> ${this._escapeHtml(yrInit)}</span>
                    <span><strong>Data Points:</strong> ${this._escapeHtml(numAa)}</span>
                </div>
            </div>
        `;

        html += `<div class="atmo-cli-subtables">`;

        // Deposition types with descriptions
        const depositionTypes = [
            { key: 'nh4_wet', label: 'NH₄ Wet Deposition', unit: 'kg/ha' },
            { key: 'no3_wet', label: 'NO₃ Wet Deposition', unit: 'kg/ha' },
            { key: 'nh4_dry', label: 'NH₄ Dry Deposition', unit: 'kg/ha' },
            { key: 'no3_dry', label: 'NO₃ Dry Deposition', unit: 'kg/ha' }
        ];

        // Render each station as an expandable section
        if (mainRow.childRows && Array.isArray(mainRow.childRows)) {
            for (const childRow of mainRow.childRows) {
                const stationName = childRow.values.station_name || 'Unknown Station';
                const lineNumber = childRow.lineNumber || 0;
                const file = mainRow.file || 'atmo.cli';
                const isHighlighted = this.highlightValue && stationName && stationName.toLowerCase() === this.highlightValue.toLowerCase();
                const highlightClass = isHighlighted ? ' highlighted-station' : '';
                const highlightId = isHighlighted ? ` id="highlighted-atmo-station"` : '';

                html += `
                    <div class="atmo-station-section${highlightClass}" data-station="${this._escapeHtml(stationName)}"${highlightId}>
                        <div class="atmo-station-header" data-action="toggle-atmo-station" data-station="${this._escapeHtml(stationName)}">
                            <span class="toggle-icon">▼</span>
                            <span class="station-name">
                                <a href="#" data-action="navigate" data-file="${this._escapeHtml(file)}" data-line="${lineNumber}" class="line-link" title="Go to line ${lineNumber}">${this._escapeHtml(stationName)}</a>
                            </span>
                        </div>
                        <div class="atmo-station-content">
                `;

                // Display each deposition type
                for (const depType of depositionTypes) {
                    const values = childRow.values[depType.key];
                    const depLineNum = childRow.values[`${depType.key}_line`];
                    
                    if (values && Array.isArray(values)) {
                        html += `
                            <div class="deposition-type">
                                <h4>
                                    ${depType.label} (${depType.unit})
                                    ${depLineNum ? `<a href="#" data-action="navigate" data-file="${this._escapeHtml(file)}" data-line="${depLineNum}" class="line-link" title="Go to line ${depLineNum}">Line ${depLineNum}</a>` : ''}
                                </h4>
                                <div class="deposition-values">
                        `;
                        
                        // Display values in groups of 12 for readability
                        for (let i = 0; i < values.length; i += 12) {
                            const chunk = values.slice(i, i + 12);
                            html += `<div class="value-row">`;
                            chunk.forEach((val, idx) => {
                                html += `<span class="deposition-value" title="Index ${i + idx + 1}">${this._escapeHtml(val)}</span>`;
                            });
                            html += `</div>`;
                        }
                        
                        html += `
                                </div>
                            </div>
                        `;
                    }
                }

                html += `
                        </div>
                    </div>
                `;
            }
        } else {
            html += `<p class="empty-message">No station data available</p>`;
        }

        html += `</div>`;
        
        return html;
    }

    private _getSoilsSolSubTableHtml(rows: any[]): string {
        const metadata = this.indexer.getMetadata();
        const fileMetadata = metadata?.file_metadata?.['soils.sol'];

        let html = '';

        if (fileMetadata && fileMetadata.description) {
            html += `<div class="file-description">${this._escapeHtml(fileMetadata.description)}</div>`;
        }

        html += `<div class="soils-sol-subtables">`;

        const layerColumns = [
            { key: 'layer', label: 'Layer' },
            { key: 'dp', label: 'Depth (mm)' },
            { key: 'bd', label: 'Bulk Density' },
            { key: 'awc', label: 'AWC' },
            { key: 'soil_k', label: 'Ksat' },
            { key: 'carbon', label: 'Carbon' },
            { key: 'clay', label: 'Clay' },
            { key: 'silt', label: 'Silt' },
            { key: 'sand', label: 'Sand' },
            { key: 'rock', label: 'Rock' },
            { key: 'alb', label: 'Albedo' },
            { key: 'usle_k', label: 'USLE K' },
            { key: 'ec', label: 'EC' },
            { key: 'caco3', label: 'CaCO3' },
            { key: 'ph', label: 'pH' }
        ];

        for (const row of rows) {
            const soilName = row.values.name || 'Unknown Soil';
            const hydGrp = row.values.hyd_grp || 'N/A';
            const dpTot = row.values.dp_tot || 'N/A';
            const anionExcl = row.values.anion_excl || 'N/A';
            const percCrk = row.values.perc_crk || 'N/A';
            const texture = row.values.texture || 'N/A';
            const layerCount = row.values.nly || 'N/A';
            const lineNumber = row.lineNumber || 0;
            const file = row.file || 'soils.sol';

            const isHighlighted = this.highlightValue && soilName && soilName.toLowerCase() === this.highlightValue.toLowerCase();
            const highlightClass = isHighlighted ? ' highlighted-soil' : '';
            const highlightId = isHighlighted ? ` id="highlighted-soil"` : '';

            html += `
                <div class="soil-section${highlightClass}" data-soil="${this._escapeHtml(soilName)}"${highlightId}>
                    <div class="soil-header" data-action="toggle-soil" data-soil="${this._escapeHtml(soilName)}">
                        <span class="toggle-icon">▼</span>
                        <span class="soil-name">
                            <a href="#" data-action="navigate" data-file="${this._escapeHtml(file)}" data-line="${lineNumber}" class="line-link" title="Go to line ${lineNumber}">${this._escapeHtml(soilName)}</a>
                        </span>
                        <span class="soil-info">
                            Layers: ${this._escapeHtml(layerCount)}, HydGrp: ${this._escapeHtml(hydGrp)}, Texture: ${this._escapeHtml(texture)}
                        </span>
                    </div>
                    <div class="soil-content">
                        <div class="soil-meta">
                            <span><strong>Rooting Depth:</strong> ${this._escapeHtml(dpTot)}</span>
                            <span><strong>Anion Excl:</strong> ${this._escapeHtml(anionExcl)}</span>
                            <span><strong>Crack Vol:</strong> ${this._escapeHtml(percCrk)}</span>
                        </div>
            `;

            if (row.childRows && Array.isArray(row.childRows) && row.childRows.length > 0) {
                html += `
                        <div class="table-wrapper">
                            <table class="soil-layer-table">
                                <thead>
                                    <tr>
                                        <th class="line-col">Line</th>
                                        ${layerColumns.map(col => `<th title="${this._escapeHtml(col.label)}">${this._escapeHtml(col.label)}</th>`).join('')}
                                    </tr>
                                </thead>
                                <tbody>
                `;

                row.childRows.forEach((childRow: any, index: number) => {
                    html += `<tr>`;
                    html += `<td class="line-col"><a href="#" data-action="navigate" data-file="${this._escapeHtml(file)}" data-line="${childRow.lineNumber}">${childRow.lineNumber}</a></td>`;
                    layerColumns.forEach((col) => {
                        let value = childRow.values[col.key] || '';
                        if (col.key === 'layer' && !value) {
                            value = String(index + 1);
                        }
                        html += `<td>${this._escapeHtml(value)}</td>`;
                    });
                    html += `</tr>`;
                });

                html += `
                                </tbody>
                            </table>
                        </div>
                `;
            } else {
                html += `<p class="empty-message">No layer data available</p>`;
            }

            html += `
                    </div>
                </div>
            `;
        }

        html += `</div>`;

        return html;
    }

    private _getPlantIniSubTableHtml(rows: any[]): string {
        const metadata = this.indexer.getMetadata();
        const fileMetadata = metadata?.file_metadata?.['plant.ini'];
        let html = '';

        if (fileMetadata && fileMetadata.description) {
            html += `<div class="file-description">${this._escapeHtml(fileMetadata.description)}</div>`;
        }

        html += `<div class="plant-ini-subtables">`;

        const plantColumns = [
            { key: 'plnt_name', label: 'Plant Name' },
            { key: 'lc_status', label: 'LC Status' },
            { key: 'lai_init', label: 'LAI Init' },
            { key: 'bm_init', label: 'Biomass Init' },
            { key: 'phu_init', label: 'PHU Init' },
            { key: 'plnt_pop', label: 'Plant Pop' },
            { key: 'yrs_init', label: 'Years Init' },
            { key: 'rsd_init', label: 'Residue Init' }
        ];
        const plantFileName = 'plants.plt';
        const canOpenPlants = this.canOpenFile(plantFileName);

        for (const row of rows) {
            const communityName = row.values.name || 'Unknown Community';
            const plantCount = row.values.plnt_cnt || row.values.plt_cnt || 'N/A';
            const rotationYear = row.values.rot_yr_ini || 'N/A';
            const lineNumber = row.lineNumber || 0;
            const file = row.file || 'plant.ini';

            const isHighlighted = this.highlightValue && communityName && communityName.toLowerCase() === this.highlightValue.toLowerCase();
            const highlightClass = isHighlighted ? ' highlighted-community' : '';
            const highlightId = isHighlighted ? ` id="highlighted-community"` : '';

            html += `
                <div class="plant-community-section${highlightClass}" data-community="${this._escapeHtml(communityName)}"${highlightId}>
                    <div class="plant-community-header" data-action="toggle-plant-community" data-community="${this._escapeHtml(communityName)}">
                        <span class="toggle-icon">▼</span>
                        <span class="community-name">
                            <a href="#" data-action="navigate" data-file="${this._escapeHtml(file)}" data-line="${lineNumber}" class="line-link" title="Go to line ${lineNumber}">${this._escapeHtml(communityName)}</a>
                        </span>
                        <span class="community-info">
                            Plants: ${this._escapeHtml(plantCount)}, Rotation Start: ${this._escapeHtml(rotationYear)}
                        </span>
                    </div>
                    <div class="plant-community-content">
                        <div class="plant-meta">
                            <span><strong>Plant Count:</strong> ${this._escapeHtml(plantCount)}</span>
                            <span><strong>Rotation Year:</strong> ${this._escapeHtml(rotationYear)}</span>
                        </div>
            `;

            if (row.childRows && Array.isArray(row.childRows) && row.childRows.length > 0) {
                html += `
                        <div class="table-wrapper">
                            <table class="plant-detail-table">
                                <thead>
                                    <tr>
                                        <th class="line-col">Line</th>
                                        ${plantColumns.map(col => `<th title="${this._escapeHtml(col.label)}">${this._escapeHtml(col.label)}</th>`).join('')}
                                    </tr>
                                </thead>
                                <tbody>
                `;

                const plantFileName = 'plants.plt';
                const canOpenPlants = this.canOpenFile(plantFileName);

                row.childRows.forEach((childRow: any) => {
                    html += `<tr>`;
                    html += `<td class="line-col"><a href="#" data-action="navigate" data-file="${this._escapeHtml(file)}" data-line="${childRow.lineNumber}">${childRow.lineNumber}</a></td>`;
                    plantColumns.forEach((col) => {
                        const value = childRow.values[col.key] || '';
                        if (col.key === 'plnt_name' && value) {
                            const linkClass = canOpenPlants ? 'fk-link' : 'fk-link broken-link';
                            const title = canOpenPlants
                                ? `Peek plant row from ${plantFileName}`
                                : `${plantFileName} - Not indexed (may not exist in dataset)`;
                            if (canOpenPlants) {
                                html += `<td class="fk-cell" data-fk-table="plants_plt" data-fk-value="${this._escapeHtml(value)}" data-source-table="${this._escapeHtml(this.tableName)}" data-source-column="${this._escapeHtml(col.key)}" data-source-file="${this._escapeHtml(file)}" data-source-line="${childRow.lineNumber}"><a href="#" data-action="toggle-fk" data-fk-table="plants_plt" data-fk-value="${this._escapeHtml(value)}" data-source-table="${this._escapeHtml(this.tableName)}" data-source-column="${this._escapeHtml(col.key)}" data-source-file="${this._escapeHtml(file)}" data-source-line="${childRow.lineNumber}" class="${linkClass}" title="${title}">${this._escapeHtml(value)}</a></td>`;
                            } else {
                                html += `<td class="fk-cell unresolved" data-fk-table="plants_plt" data-fk-value="${this._escapeHtml(value)}"><span class="${linkClass}" title="${title}">${this._escapeHtml(value)}</span></td>`;
                            }
                        } else {
                            html += `<td>${this._escapeHtml(value)}</td>`;
                        }
                    });
                    html += `</tr>`;
                });

                html += `
                                </tbody>
                            </table>
                        </div>
                `;
            } else {
                html += `<p class="empty-message">No plant data available</p>`;
            }

            html += `
                    </div>
                </div>
            `;
        }

        html += `</div>`;

        return html;
    }

    private _getManagementSchSubTableHtml(rows: any[]): string {
        const metadata = this.indexer.getMetadata();
        const fileMetadata = metadata?.file_metadata?.['management.sch'];
        let html = '';

        if (fileMetadata && fileMetadata.description) {
            html += `<div class="file-description">${this._escapeHtml(fileMetadata.description)}</div>`;
        }

        html += `<div class="management-sch-subtables">`;

        const autoColumns = [
            { key: 'name', label: 'Decision Table' },
            { key: 'plant1', label: 'Plant 1' },
            { key: 'plant2', label: 'Plant 2' }
        ];
        const opColumns = [
            { key: 'op_typ', label: 'Op Type' },
            { key: 'mon', label: 'Month' },
            { key: 'day', label: 'Day' },
            { key: 'hu_sch', label: 'HU Sch' },
            { key: 'op_data1', label: 'Op Data 1' },
            { key: 'op_data2', label: 'Op Data 2' },
            { key: 'op_data3', label: 'Op Data 3' }
        ];

        const decisionTableFileName = 'lum.dtl';
        const canOpenDecisionTables = this.canOpenFile(decisionTableFileName);

        for (const row of rows) {
            const scheduleName = row.values.name || 'Unknown Schedule';
            const numbOps = row.values.numb_ops || '0';
            const numbAuto = row.values.numb_auto || '0';
            const lineNumber = row.lineNumber || 0;
            const file = row.file || 'management.sch';

            const isHighlighted = this.highlightValue && scheduleName && scheduleName.toLowerCase() === this.highlightValue.toLowerCase();
            const highlightClass = isHighlighted ? ' highlighted-schedule' : '';
            const highlightId = isHighlighted ? ` id="highlighted-schedule"` : '';

            const childRows = Array.isArray(row.childRows) ? row.childRows : [];
            const autoRows = childRows.filter((childRow: any) => childRow.values?.section === 'auto');
            const opRows = childRows.filter((childRow: any) => childRow.values?.section === 'op');

            html += `
                <div class="management-schedule-section${highlightClass}" data-schedule="${this._escapeHtml(scheduleName)}"${highlightId}>
                    <div class="management-schedule-header" data-action="toggle-management-schedule" data-schedule="${this._escapeHtml(scheduleName)}">
                        <span class="toggle-icon">▼</span>
                        <span class="schedule-name">
                            <a href="#" data-action="navigate" data-file="${this._escapeHtml(file)}" data-line="${lineNumber}" class="line-link" title="Go to line ${lineNumber}">${this._escapeHtml(scheduleName)}</a>
                        </span>
                        <span class="schedule-info">
                            Auto: ${this._escapeHtml(numbAuto)}, Ops: ${this._escapeHtml(numbOps)}
                        </span>
                    </div>
                    <div class="management-schedule-content">
                        <div class="schedule-meta">
                            <span><strong>Auto Tables:</strong> ${this._escapeHtml(numbAuto)}</span>
                            <span><strong>Scheduled Ops:</strong> ${this._escapeHtml(numbOps)}</span>
                        </div>
            `;

            html += `<div class="management-subsection">`;
            html += `<h4>Automatic Decision Tables</h4>`;
            if (autoRows.length > 0) {
                html += `
                        <div class="table-wrapper">
                            <table class="management-detail-table">
                                <thead>
                                    <tr>
                                        <th class="line-col">Line</th>
                                        ${autoColumns.map(col => `<th title="${this._escapeHtml(col.label)}">${this._escapeHtml(col.label)}</th>`).join('')}
                                    </tr>
                                </thead>
                                <tbody>
                `;

                autoRows.forEach((childRow: any) => {
                    html += `<tr>`;
                    html += `<td class="line-col"><a href="#" data-action="navigate" data-file="${this._escapeHtml(file)}" data-line="${childRow.lineNumber}">${childRow.lineNumber}</a></td>`;
                    autoColumns.forEach((col) => {
                        const rawValue = childRow.values[col.key] || '';
                        const value = col.key === 'name' && !rawValue ? (childRow.values.d_table || '') : rawValue;
                        if (col.key === 'name' && value) {
                            const linkClass = canOpenDecisionTables ? 'fk-link' : 'fk-link broken-link';
                            const title = canOpenDecisionTables
                                ? `Peek decision table row from ${decisionTableFileName}`
                                : `${decisionTableFileName} - Not indexed (may not exist in dataset)`;
                            if (canOpenDecisionTables) {
                                html += `<td class="fk-cell" data-fk-table="lum_dtl" data-fk-value="${this._escapeHtml(value)}" data-source-table="${this._escapeHtml(this.tableName)}" data-source-column="${this._escapeHtml(col.key)}" data-source-file="${this._escapeHtml(file)}" data-source-line="${childRow.lineNumber}"><a href="#" data-action="toggle-fk" data-fk-table="lum_dtl" data-fk-value="${this._escapeHtml(value)}" data-source-table="${this._escapeHtml(this.tableName)}" data-source-column="${this._escapeHtml(col.key)}" data-source-file="${this._escapeHtml(file)}" data-source-line="${childRow.lineNumber}" class="${linkClass}" title="${title}">${this._escapeHtml(value)}</a></td>`;
                            } else {
                                html += `<td class="fk-cell unresolved" data-fk-table="lum_dtl" data-fk-value="${this._escapeHtml(value)}"><span class="${linkClass}" title="${title}">${this._escapeHtml(value)}</span></td>`;
                            }
                        } else {
                            html += `<td>${this._escapeHtml(value)}</td>`;
                        }
                    });
                    html += `</tr>`;
                });

                html += `
                                </tbody>
                            </table>
                        </div>
                `;
            } else {
                html += `<p class="empty-message">No automatic decision tables</p>`;
            }
            html += `</div>`;

            html += `<div class="management-subsection">`;
            html += `<h4>Scheduled Operations</h4>`;
            if (opRows.length > 0) {
                html += `
                        <div class="table-wrapper">
                            <table class="management-detail-table">
                                <thead>
                                    <tr>
                                        <th class="line-col">Line</th>
                                        ${opColumns.map(col => `<th title="${this._escapeHtml(col.label)}">${this._escapeHtml(col.label)}</th>`).join('')}
                                    </tr>
                                </thead>
                                <tbody>
                `;

                opRows.forEach((childRow: any) => {
                    html += `<tr>`;
                    html += `<td class="line-col"><a href="#" data-action="navigate" data-file="${this._escapeHtml(file)}" data-line="${childRow.lineNumber}">${childRow.lineNumber}</a></td>`;
                    opColumns.forEach((col) => {
                        const value = childRow.values[col.key] || '';
                        html += `<td>${this._escapeHtml(value)}</td>`;
                    });
                    html += `</tr>`;
                });

                html += `
                                </tbody>
                            </table>
                        </div>
                `;
            } else {
                html += `<p class="empty-message">No scheduled operations</p>`;
            }
            html += `</div>`;

            html += `
                    </div>
                </div>
            `;
        }

        html += `</div>`;

        return html;
    }

    private _getDecisionTableSubTableHtml(rows: any[], fileName: string): string {
        const metadata = this.indexer.getMetadata();
        const fileMetadata = metadata?.file_metadata?.[fileName];

        let html = '';

        if (fileMetadata && fileMetadata.description) {
            html += `<div class="file-description">${this._escapeHtml(fileMetadata.description)}</div>`;
        }

        html += `<div class="dtl-subtables">`;

        for (const row of rows) {
            const tableName = row.values.name || 'Unknown Decision Table';
            const condCount = row.values.conds || '0';
            const altCountRaw = row.values.alts || '0';
            const actCount = row.values.acts || '0';
            const lineNumber = row.lineNumber || 0;
            const file = row.file || fileName;

            const parsedAltCount = Number.parseInt(String(altCountRaw), 10);
            const childRows = Array.isArray(row.childRows) ? row.childRows : [];
            const conditionRows = childRows.filter((childRow: any) => childRow.values?.section === 'condition');
            const actionRows = childRows.filter((childRow: any) => childRow.values?.section === 'action');

            const altCount = Number.isFinite(parsedAltCount) && parsedAltCount > 0
                ? parsedAltCount
                : Math.max(
                    conditionRows.reduce((max: number, childRow: any) => {
                        const altKeys = Object.keys(childRow.values || {}).filter((key) => key.startsWith('alt'));
                        return Math.max(max, altKeys.length);
                    }, 0),
                    actionRows.reduce((max: number, childRow: any) => {
                        const outKeys = Object.keys(childRow.values || {}).filter((key) => key.startsWith('out'));
                        return Math.max(max, outKeys.length);
                    }, 0)
                );

            const altColumns = Array.from({ length: altCount }, (_, idx) => `alt${idx + 1}`);
            const outColumns = Array.from({ length: altCount }, (_, idx) => `out${idx + 1}`);

            const isHighlighted = this.highlightValue && tableName && tableName.toLowerCase() === this.highlightValue.toLowerCase();
            const highlightClass = isHighlighted ? ' highlighted-dtl' : '';
            const highlightId = isHighlighted ? ` id="highlighted-dtl"` : '';

            html += `
                <div class="dtl-section${highlightClass}" data-dtl="${this._escapeHtml(tableName)}"${highlightId}>
                    <div class="dtl-header" data-action="toggle-decision-table" data-dtl="${this._escapeHtml(tableName)}">
                        <span class="toggle-icon">▼</span>
                        <span class="dtl-name">
                            <a href="#" data-action="navigate" data-file="${this._escapeHtml(file)}" data-line="${lineNumber}" class="line-link" title="Go to line ${lineNumber}">${this._escapeHtml(tableName)}</a>
                        </span>
                        <span class="dtl-info">
                            Conditions: ${this._escapeHtml(condCount)}, Alternatives: ${this._escapeHtml(altCountRaw)}, Actions: ${this._escapeHtml(actCount)}
                        </span>
                    </div>
                    <div class="dtl-content">
            `;

            if (conditionRows.length > 0) {
                html += `
                        <h4 class="dtl-section-title">Conditions</h4>
                        <div class="table-wrapper">
                            <table class="dtl-table">
                                <thead>
                                    <tr>
                                        <th class="line-col">Line</th>
                                        <th>Cond Var</th>
                                        <th>Obj</th>
                                        <th>Obj Num</th>
                                        <th>Lim Var</th>
                                        <th>Lim Op</th>
                                        <th>Lim Const</th>
                                        ${altColumns.map((col) => `<th>${this._escapeHtml(col.toUpperCase())}</th>`).join('')}
                                    </tr>
                                </thead>
                                <tbody>
                `;

                conditionRows.forEach((childRow: any) => {
                    html += `<tr>`;
                    html += `<td class="line-col"><a href="#" data-action="navigate" data-file="${this._escapeHtml(file)}" data-line="${childRow.lineNumber}">${childRow.lineNumber}</a></td>`;
                    html += `<td>${this._escapeHtml(childRow.values?.cond_var || '')}</td>`;
                    html += `<td>${this._escapeHtml(childRow.values?.obj || '')}</td>`;
                    html += `<td>${this._escapeHtml(childRow.values?.obj_num || '')}</td>`;
                    html += `<td>${this._escapeHtml(childRow.values?.lim_var || '')}</td>`;
                    html += `<td>${this._escapeHtml(childRow.values?.lim_op || '')}</td>`;
                    html += `<td>${this._escapeHtml(childRow.values?.lim_const || '')}</td>`;
                    altColumns.forEach((altKey) => {
                        html += `<td>${this._escapeHtml(childRow.values?.[altKey] || '')}</td>`;
                    });
                    html += `</tr>`;
                });

                html += `
                                </tbody>
                            </table>
                        </div>
                `;
            } else {
                html += `<p class="empty-message">No condition data available</p>`;
            }

            if (actionRows.length > 0) {
                html += `
                        <h4 class="dtl-section-title">Actions</h4>
                        <div class="table-wrapper">
                            <table class="dtl-table">
                                <thead>
                                    <tr>
                                        <th class="line-col">Line</th>
                                        <th>Act Typ</th>
                                        <th>Obj</th>
                                        <th>Obj Num</th>
                                        <th>Act Name</th>
                                        <th>Option</th>
                                        <th>Const</th>
                                        <th>Const2</th>
                                        <th>FP</th>
                                        ${outColumns.map((col) => `<th>${this._escapeHtml(col.toUpperCase())}</th>`).join('')}
                                    </tr>
                                </thead>
                                <tbody>
                `;
                actionRows.forEach((childRow: any) => {
                    const actName = childRow.values?.act_name || '';
                    const decisionTarget = actName ? this.indexer.resolveDecisionTable(actName) : undefined;
                    const decisionFile = decisionTarget?.file || file;
                    const actNameHtml = decisionTarget
                        ? `<a href="#" data-action="open-file-highlight" data-file="${this._escapeHtml(decisionFile)}" data-highlight="${this._escapeHtml(actName)}" class="fk-link" title="Open decision table ${this._escapeHtml(actName)}">${this._escapeHtml(actName)}</a>`
                        : this._escapeHtml(actName);
                    html += `<tr>`;
                    html += `<td class="line-col"><a href="#" data-action="navigate" data-file="${this._escapeHtml(file)}" data-line="${childRow.lineNumber}">${childRow.lineNumber}</a></td>`;
                    html += `<td>${this._escapeHtml(childRow.values?.act_typ || '')}</td>`;
                    html += `<td>${this._escapeHtml(childRow.values?.obj || '')}</td>`;
                    html += `<td>${this._escapeHtml(childRow.values?.obj_num || '')}</td>`;
                    html += `<td>${actNameHtml}</td>`;
                    html += `<td>${this._escapeHtml(childRow.values?.act_option || '')}</td>`;
                    html += `<td>${this._escapeHtml(childRow.values?.const || '')}</td>`;
                    html += `<td>${this._escapeHtml(childRow.values?.const2 || '')}</td>`;
                    html += `<td>${this._escapeHtml(childRow.values?.fp || '')}</td>`;
                    outColumns.forEach((outKey) => {
                        html += `<td>${this._escapeHtml(childRow.values?.[outKey] || '')}</td>`;
                    });
                    html += `</tr>`;
                });

                html += `
                                </tbody>
                            </table>
                        </div>
                `;
            } else {
                html += `<p class="empty-message">No action data available</p>`;
            }

            html += `
                    </div>
                </div>
            `;
        }

        html += `</div>`;

        return html;
    }

    private _getEmptyTableHtml(schemaTable: any): string {
        const metadata = this.indexer.getMetadata();
        const fileMetadata = metadata?.file_metadata?.[schemaTable.file_name];
        
        let html = '';
        
        // Add file description if available
        if (fileMetadata && fileMetadata.description) {
            html += `<div class="file-description">${this._escapeHtml(fileMetadata.description)}</div>`;
        }

        // Show table structure with headers from schema
        html += `<table class="data-table">`;
        html += `<thead><tr>`;
        
        // Count visible columns and add headers from schema
        let visibleColumnCount = 0;
        if (schemaTable.columns) {
            for (const column of schemaTable.columns) {
                if (column.name !== 'id') {  // Skip auto-generated ID column
                    const displayName = column.name;
                    html += `<th>${this._escapeHtml(displayName)}</th>`;
                    visibleColumnCount++;
                }
            }
        }
        
        html += `</tr></thead>`;
        html += `<tbody>`;
        html += `<tr><td colspan="${visibleColumnCount}" class="empty-cell">No data</td></tr>`;
        html += `</tbody>`;
        html += `</table>`;
        
        return html;
    }

    private _escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    private _getGitbookLink(fileName: string): string {
        const url = this.indexer.getGitbookUrl(fileName);
        if (!url) {
            return '';
        }
        
        return `<a href="${this._escapeHtml(url)}" target="_blank" rel="noopener" data-action="external-link" class="gitbook-link" title="View documentation on GitBook (Click or Ctrl+Right Click)">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="vertical-align: middle; margin-left: 8px;">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
        </a>`;
    }

    private _escapeJs(text: string): string {
        // Escape for use in JavaScript string literals
        return text
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');
    }

    private _getNoIndexHtml(): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>SWAT+ Table Viewer</title>
            <style>${this._getStyles()}</style>
        </head>
        <body>
            <div class="no-index">
                <h1>No Index Built</h1>
                <p>Please build the SWAT+ inputs index first.</p>
                <p>Run the command: <code>SWAT+: Build Inputs Index</code></p>
            </div>
        </body>
        </html>`;
    }

    private _getNoSchemaHtml(): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>SWAT+ Table Viewer</title>
            <style>${this._getStyles()}</style>
        </head>
        <body>
            <div class="no-index">
                <h1>Schema Not Available</h1>
                <p>The SWAT+ schema could not be loaded.</p>
            </div>
        </body>
        </html>`;
    }

    private _getNoDataHtml(): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>SWAT+ Table Viewer</title>
            <style>${this._getStyles()}</style>
        </head>
        <body>
            <div class="no-index">
                <h1>No Data Found</h1>
                <p>No data found for table: <code>${this.tableName}</code></p>
                <p>The table may not be indexed yet or may not exist in the dataset.</p>
            </div>
        </body>
        </html>`;
    }

    private _getStyles(): string {
        return `
            body {
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                padding: 0;
                margin: 0;
                line-height: 1.6;
            }
            .header {
                padding: 20px;
                background-color: var(--vscode-editorGroupHeader-tabsBackground);
                border-bottom: 1px solid var(--vscode-panel-border);
                position: sticky;
                top: 0;
                z-index: 100;
            }
            .header h1 {
                margin: 0 0 10px 0;
                font-size: 1.5em;
                font-weight: 600;
                display: flex;
                align-items: center;
            }
            .gitbook-link {
                color: var(--vscode-textLink-foreground);
                text-decoration: none;
                display: inline-flex;
                align-items: center;
                opacity: 0.7;
                transition: opacity 0.2s;
            }
            .gitbook-link:hover {
                opacity: 1;
                color: var(--vscode-textLink-activeForeground);
            }
            .stats {
                display: flex;
                gap: 20px;
                font-size: 0.9em;
                color: var(--vscode-descriptionForeground);
            }
            .stat-item {
                padding: 4px 8px;
                background-color: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
                border-radius: 3px;
            }
            .content {
                padding: 20px;
            }
            .table-wrapper {
                overflow-x: auto;
            }
            .table-controls {
                display: flex;
                flex-wrap: wrap;
                gap: 12px;
                align-items: center;
                padding: 12px 16px;
                border-bottom: 1px solid var(--vscode-panel-border);
                background-color: var(--vscode-sideBar-background);
            }
            .table-controls label {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 0.85em;
                color: var(--vscode-descriptionForeground);
            }
            .table-controls input,
            .table-controls select {
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                padding: 4px 8px;
                font-size: 0.85em;
            }
            .table-controls button {
                background-color: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
                border: 1px solid transparent;
                border-radius: 4px;
                padding: 4px 10px;
                cursor: pointer;
                font-size: 0.85em;
            }
            .table-controls button:hover {
                background-color: var(--vscode-button-secondaryHoverBackground);
            }
            .data-table {
                width: max-content;
                min-width: 100%;
                border-collapse: separate;
                border-spacing: 0;
                font-size: 0.9em;
            }
            .data-table th {
                background-color: var(--vscode-editorGroupHeader-tabsBackground);
                padding: 8px 12px;
                text-align: left;
                font-weight: 600;
                border: 1px solid var(--vscode-panel-border);
            }
            .data-table th.sortable {
                cursor: pointer;
                user-select: none;
            }
            .data-table th .sort-indicator {
                margin-left: 6px;
                font-size: 0.75em;
                opacity: 0.65;
            }
            .data-table th.sorted-asc .sort-indicator::after {
                content: '▲';
            }
            .data-table th.sorted-desc .sort-indicator::after {
                content: '▼';
            }
            .data-table th.fk-col {
                background-color: var(--vscode-inputOption-activeBackground);
            }
            .data-table td {
                padding: 6px 12px;
                border: 1px solid var(--vscode-panel-border);
                background-color: var(--vscode-editor-background);
            }
            .data-table tbody tr:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            .data-table tbody tr:hover td {
                background-color: var(--vscode-list-hoverBackground);
            }
            .line-col {
                width: 60px;
                text-align: center;
                font-family: var(--vscode-editor-font-family);
            }
            .fk-cell {
                font-weight: 500;
            }
            .fk-cell.unresolved {
                color: var(--vscode-errorForeground);
                font-style: italic;
            }
            .fk-link {
                color: var(--vscode-textLink-foreground);
                text-decoration: none;
                cursor: pointer;
            }
            .fk-link:hover {
                text-decoration: underline;
                color: var(--vscode-textLink-activeForeground);
            }
            .file-link-cell {
                font-weight: 500;
            }
            .file-link {
                color: var(--vscode-textLink-foreground);
                text-decoration: none;
                cursor: pointer;
            }
            .file-link:hover {
                text-decoration: underline;
                color: var(--vscode-textLink-activeForeground);
            }
            .broken-link {
                color: #f48771 !important;
            }
            .broken-link:hover {
                color: #f14c28 !important;
            }
            /* Classification-based sub-table view for file.cio */
            .file-cio-subtables {
                margin: 16px 0;
            }
            .classification-section {
                margin-bottom: 12px;
                border: 1px solid var(--vscode-panel-border);
                border-radius: 4px;
                overflow: hidden;
            }
            .classification-header {
                padding: 12px 16px;
                background-color: var(--vscode-editor-background);
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 12px;
                user-select: none;
                transition: background-color 0.2s;
            }
            .classification-header:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            .toggle-icon {
                font-size: 0.7em;
                transition: transform 0.2s;
                display: inline-block;
                width: 12px;
            }
            .classification-header.collapsed .toggle-icon {
                transform: rotate(-90deg);
            }
            .classification-name {
                font-weight: 600;
                flex: 1;
            }
            .classification-name .line-link {
                color: var(--vscode-foreground);
                text-decoration: none;
            }
            .classification-name .line-link:hover {
                color: var(--vscode-textLink-activeForeground);
                text-decoration: underline;
            }
            .classification-stats {
                font-size: 0.85em;
                color: var(--vscode-descriptionForeground);
            }
            .classification-content {
                max-height: 1000px;
                overflow-y: auto;
                transition: max-height 0.3s ease-out;
                padding: 12px 16px;
            }
            .classification-content.collapsed {
                max-height: 0;
                overflow: hidden;
                padding: 0;
            }
            .classification-files-grid {
                display: grid;
                grid-template-rows: auto auto;
                gap: 0;
                border: 1px solid var(--vscode-panel-border);
                border-radius: 4px;
                overflow: hidden;
            }
            .files-row {
                display: grid;
                gap: 0;
                align-items: center;
                justify-items: stretch;
                text-align: left;
            }
            .files-header {
                margin-bottom: 0;
            }
            .file-cio-subtables .file-header {
                padding: 4px 8px;
                color: var(--vscode-descriptionForeground);
                font-size: 0.8em;
                font-weight: 500;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                min-width: 0;
                width: 100%;
                box-sizing: border-box;
                border-right: 1px solid var(--vscode-panel-border);
                border-bottom: 1px solid var(--vscode-panel-border);
                background-color: var(--vscode-editor-background);
            }
            .file-cio-subtables .file-link {
                display: block;
                text-decoration: none;
                color: var(--vscode-textLink-foreground);
                font-size: 0.85em;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                min-width: 0;
                padding: 4px 8px;
                width: 100%;
                box-sizing: border-box;
                border-right: 1px solid var(--vscode-panel-border);
                border-bottom: 1px solid var(--vscode-panel-border);
                background-color: var(--vscode-editor-background);
            }
            .file-cio-subtables .file-link:hover {
                text-decoration: underline;
                color: var(--vscode-textLink-activeForeground);
                background-color: var(--vscode-list-hoverBackground);
            }
            .file-cio-subtables .file-null {
                font-style: italic;
                opacity: 0.5;
                cursor: default;
                color: var(--vscode-descriptionForeground);
                padding: 4px 8px;
                min-width: 0;
                width: 100%;
                box-sizing: border-box;
                border-right: 1px solid var(--vscode-panel-border);
                border-bottom: 1px solid var(--vscode-panel-border);
                background-color: var(--vscode-editor-background);
            }
            .file-cio-subtables .file-null {
                color: var(--vscode-disabledForeground);
                font-style: italic;
                padding: 4px 8px;
                min-width: 0;
            }
            /* Weather-wgn.cli station-based sub-table view */
            .weather-wgn-subtables {
                margin: 16px 0;
            }
            .wgn-station-section {
                margin-bottom: 12px;
                border: 1px solid var(--vscode-panel-border);
                border-radius: 4px;
                overflow: hidden;
            }
            .wgn-station-section.highlighted-station {
                border: 2px solid var(--vscode-focusBorder);
                box-shadow: 0 0 8px var(--vscode-focusBorder);
            }
            .wgn-station-header {
                padding: 12px 16px;
                background-color: var(--vscode-editor-background);
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 12px;
                user-select: none;
                transition: background-color 0.2s;
            }
            .wgn-station-header:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            .wgn-station-header.collapsed .toggle-icon {
                transform: rotate(-90deg);
            }
            .station-name {
                font-weight: 600;
                flex: 0 0 auto;
            }
            .station-name .line-link {
                color: var(--vscode-foreground);
                text-decoration: none;
            }
            .station-name .line-link:hover {
                color: var(--vscode-textLink-activeForeground);
                text-decoration: underline;
            }
            .station-info {
                font-size: 0.85em;
                color: var(--vscode-descriptionForeground);
                flex: 1;
            }
            .wgn-station-content {
                max-height: 1000px;
                overflow-y: auto;
                transition: max-height 0.3s ease-out;
                padding: 12px 16px;
            }
            .wgn-station-content.collapsed {
                max-height: 0;
                overflow: hidden;
                padding: 0;
            }
            .monthly-data-table {
                width: max-content;
                min-width: 100%;
                border-collapse: separate;
                border-spacing: 0;
                font-size: 0.85em;
            }
            .monthly-data-table th {
                background-color: var(--vscode-editor-background);
                padding: 8px 6px;
                text-align: left;
                border: 1px solid var(--vscode-panel-border);
                font-weight: 600;
                white-space: nowrap;
                font-size: 0.75em;
            }
            .monthly-data-table td {
                padding: 6px;
                border: 1px solid var(--vscode-panel-border);
                background-color: var(--vscode-editor-background);
            }
            .monthly-data-table tr:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            .monthly-data-table tr:hover td {
                background-color: var(--vscode-list-hoverBackground);
            }
            /* Atmo.cli station-based sub-table view */
            .atmo-cli-header {
                margin: 16px 0;
                padding: 12px 16px;
                background-color: var(--vscode-editor-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 4px;
            }
            .atmo-cli-header h3 {
                margin: 0 0 12px 0;
                font-size: 1.1em;
            }
            .atmo-metadata {
                display: flex;
                gap: 16px;
                flex-wrap: wrap;
                font-size: 0.9em;
            }
            .atmo-metadata span {
                color: var(--vscode-descriptionForeground);
            }
            .atmo-cli-subtables {
                margin: 16px 0;
            }
            .atmo-station-section {
                margin-bottom: 12px;
                border: 1px solid var(--vscode-panel-border);
                border-radius: 4px;
                overflow: hidden;
            }
            .atmo-station-section.highlighted-station {
                border: 2px solid var(--vscode-focusBorder);
                box-shadow: 0 0 8px var(--vscode-focusBorder);
            }
            .atmo-station-header {
                padding: 12px 16px;
                background-color: var(--vscode-editor-background);
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 12px;
                user-select: none;
                transition: background-color 0.2s;
            }
            .atmo-station-header:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            .atmo-station-header.collapsed .toggle-icon {
                transform: rotate(-90deg);
            }
            .atmo-station-content {
                max-height: 2000px;
                overflow-y: auto;
                transition: max-height 0.3s ease-out;
                padding: 12px 16px;
            }
            .atmo-station-content.collapsed {
                max-height: 0;
                overflow: hidden;
                padding: 0;
            }
            .deposition-type {
                margin-bottom: 16px;
            }
            .deposition-type h4 {
                margin: 0 0 8px 0;
                font-size: 0.95em;
                color: var(--vscode-foreground);
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .deposition-type h4 .line-link {
                font-size: 0.85em;
                font-weight: normal;
            }
            .deposition-values {
                background-color: var(--vscode-editor-background);
                padding: 8px;
                border-radius: 4px;
                border: 1px solid var(--vscode-panel-border);
            }
            .value-row {
                display: flex;
                gap: 4px;
                margin-bottom: 4px;
                flex-wrap: wrap;
            }
            .deposition-value {
                padding: 4px 8px;
                background-color: var(--vscode-input-background);
                border: 1px solid var(--vscode-input-border);
                border-radius: 3px;
                font-size: 0.85em;
                font-family: monospace;
                min-width: 60px;
                text-align: right;
            }
            /* soils.sol profile-based sub-table view */
            .soils-sol-subtables {
                margin: 16px 0;
            }
            .soil-section {
                margin-bottom: 12px;
                border: 1px solid var(--vscode-panel-border);
                border-radius: 4px;
                overflow: hidden;
            }
            .soil-section.highlighted-soil {
                border: 2px solid var(--vscode-focusBorder);
                box-shadow: 0 0 8px var(--vscode-focusBorder);
            }
            .soil-header {
                padding: 12px 16px;
                background-color: var(--vscode-editor-background);
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 12px;
                user-select: none;
                transition: background-color 0.2s;
            }
            .soil-header:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            .soil-header.collapsed .toggle-icon {
                transform: rotate(-90deg);
            }
            .soil-name {
                font-weight: 600;
                flex: 0 0 auto;
            }
            .soil-name .line-link {
                color: var(--vscode-foreground);
                text-decoration: none;
            }
            .soil-name .line-link:hover {
                color: var(--vscode-textLink-activeForeground);
                text-decoration: underline;
            }
            .soil-info {
                font-size: 0.85em;
                color: var(--vscode-descriptionForeground);
                flex: 1;
            }
            .soil-content {
                max-height: 2000px;
                overflow-y: auto;
                transition: max-height 0.3s ease-out;
                padding: 12px 16px;
            }
            .soil-content.collapsed {
                max-height: 0;
                overflow: hidden;
                padding: 0;
            }
            .soil-meta {
                display: flex;
                gap: 16px;
                flex-wrap: wrap;
                margin-bottom: 12px;
                font-size: 0.9em;
            }
            .soil-meta span {
                color: var(--vscode-descriptionForeground);
            }
            .soil-layer-table {
                width: max-content;
                min-width: 100%;
                border-collapse: separate;
                border-spacing: 0;
                font-size: 0.85em;
            }
            .soil-layer-table th {
                background-color: var(--vscode-editor-background);
                padding: 8px 6px;
                text-align: left;
                border: 1px solid var(--vscode-panel-border);
                font-weight: 600;
                white-space: nowrap;
                font-size: 0.75em;
            }
            .soil-layer-table td {
                padding: 6px;
                border: 1px solid var(--vscode-panel-border);
                background-color: var(--vscode-editor-background);
            }
            .soil-layer-table tr:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            .soil-layer-table tr:hover td {
                background-color: var(--vscode-list-hoverBackground);
            }
            /* plant.ini community-based sub-table view */
            .plant-ini-subtables {
                margin: 16px 0;
            }
            .plant-community-section {
                margin-bottom: 12px;
                border: 1px solid var(--vscode-panel-border);
                border-radius: 4px;
                overflow: hidden;
            }
            .plant-community-section.highlighted-community {
                border: 2px solid var(--vscode-focusBorder);
                box-shadow: 0 0 8px var(--vscode-focusBorder);
            }
            .plant-community-header {
                padding: 12px 16px;
                background-color: var(--vscode-editor-background);
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 12px;
                user-select: none;
                transition: background-color 0.2s;
            }
            .plant-community-header:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            .plant-community-header.collapsed .toggle-icon {
                transform: rotate(-90deg);
            }
            .community-name {
                font-weight: 600;
                flex: 0 0 auto;
            }
            .community-name .line-link {
                color: var(--vscode-foreground);
                text-decoration: none;
            }
            .community-name .line-link:hover {
                color: var(--vscode-textLink-activeForeground);
                text-decoration: underline;
            }
            .community-info {
                font-size: 0.85em;
                color: var(--vscode-descriptionForeground);
                flex: 1;
            }
            /* management.sch schedule-based sub-table view */
            .management-sch-subtables {
                margin: 16px 0;
            }
            .management-schedule-section {
                margin-bottom: 12px;
                border: 1px solid var(--vscode-panel-border);
                border-radius: 4px;
                overflow: hidden;
            }
            .management-schedule-section.highlighted-schedule {
                border: 2px solid var(--vscode-focusBorder);
                box-shadow: 0 0 8px var(--vscode-focusBorder);
            }
            .management-schedule-header {
                padding: 12px 16px;
                background-color: var(--vscode-editor-background);
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 12px;
                user-select: none;
                transition: background-color 0.2s;
            }
            .management-schedule-header:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            .management-schedule-header.collapsed .toggle-icon {
                transform: rotate(-90deg);
            }
            .schedule-name {
                font-weight: 600;
                flex: 0 0 auto;
            }
            .schedule-name .line-link {
                color: var(--vscode-foreground);
                text-decoration: none;
            }
            .schedule-name .line-link:hover {
                color: var(--vscode-textLink-activeForeground);
                text-decoration: underline;
            }
            .schedule-info {
                font-size: 0.85em;
                color: var(--vscode-descriptionForeground);
                flex: 1;
            }
            .management-schedule-content {
                max-height: 2000px;
                overflow-y: auto;
                transition: max-height 0.3s ease-out;
                padding: 12px 16px;
            }
            .management-schedule-content.collapsed {
                max-height: 0;
                overflow: hidden;
                padding: 0;
            }
            .schedule-meta {
                display: flex;
                gap: 16px;
                flex-wrap: wrap;
                margin-bottom: 12px;
                font-size: 0.9em;
            }
            .schedule-meta span {
                color: var(--vscode-descriptionForeground);
            }
            .management-subsection {
                margin-bottom: 16px;
            }
            .management-subsection h4 {
                margin: 0 0 8px 0;
                font-size: 0.95em;
            }
            .management-detail-table {
                width: max-content;
                min-width: 100%;
                border-collapse: separate;
                border-spacing: 0;
                font-size: 0.85em;
            }
            .management-detail-table th {
                background-color: var(--vscode-editor-background);
                padding: 8px 6px;
                text-align: left;
                border: 1px solid var(--vscode-panel-border);
                font-weight: 600;
                white-space: nowrap;
                font-size: 0.75em;
            }
            .management-detail-table td {
                padding: 6px;
                border: 1px solid var(--vscode-panel-border);
                background-color: var(--vscode-editor-background);
            }
            .management-detail-table tr:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            .management-detail-table tr:hover td {
                background-color: var(--vscode-list-hoverBackground);
            }
            /* Decision table profile-based sub-table view */
            .dtl-subtables {
                margin: 16px 0;
            }
            .dtl-section {
                margin-bottom: 12px;
                border: 1px solid var(--vscode-panel-border);
                border-radius: 4px;
                overflow: hidden;
            }
            .dtl-section.highlighted-dtl {
                border: 2px solid var(--vscode-focusBorder);
                box-shadow: 0 0 8px var(--vscode-focusBorder);
            }
            .dtl-header {
                padding: 12px 16px;
                background-color: var(--vscode-editor-background);
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 12px;
                user-select: none;
                transition: background-color 0.2s;
            }
            .dtl-header:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            .dtl-header.collapsed .toggle-icon {
                transform: rotate(-90deg);
            }
            .dtl-name {
                font-weight: 600;
                flex: 0 0 auto;
            }
            .dtl-name .line-link {
                color: var(--vscode-foreground);
                text-decoration: none;
            }
            .dtl-name .line-link:hover {
                color: var(--vscode-textLink-activeForeground);
                text-decoration: underline;
            }
            .dtl-info {
                font-size: 0.85em;
                color: var(--vscode-descriptionForeground);
                flex: 1;
            }
            .plant-community-content {
                max-height: 2000px;
                overflow-y: auto;
                transition: max-height 0.3s ease-out;
                padding: 12px 16px;
            }
            .plant-community-content.collapsed {
                max-height: 0;
                overflow: hidden;
                padding: 0;
            }
            .dtl-content {
                max-height: 2500px;
                overflow-y: auto;
                transition: max-height 0.3s ease-out;
                padding: 12px 16px;
            }
            .dtl-content.collapsed {
                max-height: 0;
                overflow: hidden;
                padding: 0;
            }
            .plant-meta {
                display: flex;
                gap: 16px;
                flex-wrap: wrap;
                margin-bottom: 12px;
                font-size: 0.9em;
            }
            .plant-meta span {
                color: var(--vscode-descriptionForeground);
            }
            .plant-detail-table {
                width: max-content;
                min-width: 100%;
                border-collapse: separate;
                border-spacing: 0;
                font-size: 0.85em;
            }
            .dtl-section-title {
                margin: 4px 0 8px;
                font-size: 0.95em;
            }
            .dtl-table {
                width: max-content;
                min-width: 100%;
                border-collapse: separate;
                border-spacing: 0;
                font-size: 0.85em;
            }
            .plant-detail-table th,
            .dtl-table th {
                background-color: var(--vscode-editor-background);
                padding: 8px 6px;
                text-align: left;
                border: 1px solid var(--vscode-panel-border);
                font-weight: 600;
                white-space: nowrap;
                font-size: 0.75em;
            }
            .plant-detail-table td,
            .dtl-table td {
                padding: 6px;
                border: 1px solid var(--vscode-panel-border);
                background-color: var(--vscode-editor-background);
            }
            .plant-detail-table tr:hover,
            .dtl-table tr:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            .plant-detail-table tr:hover td,
            .dtl-table tr:hover td {
                background-color: var(--vscode-list-hoverBackground);
            }
            .fk-indicator {
                margin-left: 4px;
                font-size: 0.8em;
                opacity: 0.7;
            }
            .file-pointer-indicator {
                margin-left: 4px;
                font-size: 0.8em;
                opacity: 0.7;
            }
            .file-description {
                padding: 12px 16px;
                margin-bottom: 16px;
                background-color: var(--vscode-textBlockQuote-background);
                border-left: 4px solid var(--vscode-textLink-foreground);
                border-radius: 4px;
                color: var(--vscode-descriptionForeground);
                font-size: 0.9em;
                line-height: 1.5;
            }
            .empty-message {
                padding: 20px;
                text-align: center;
                color: var(--vscode-descriptionForeground);
                font-style: italic;
            }
            .empty-table-message {
                padding: 16px;
                margin-bottom: 16px;
                background-color: var(--vscode-textBlockQuote-background);
                border-left: 4px solid var(--vscode-editorInfo-foreground);
                border-radius: 4px;
            }
            .info-message {
                margin: 0;
                color: var(--vscode-foreground);
                font-size: 0.95em;
            }
            .empty-cell {
                text-align: center;
                color: var(--vscode-descriptionForeground);
                font-style: italic;
                padding: 20px;
            }
            .no-index {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                text-align: center;
                padding: 40px;
            }
            .no-index h1 {
                margin-bottom: 10px;
                color: var(--vscode-foreground);
            }
            .no-index p {
                color: var(--vscode-descriptionForeground);
                margin: 5px 0;
            }
            .no-index code {
                background-color: var(--vscode-textCodeBlock-background);
                padding: 2px 6px;
                border-radius: 3px;
                font-family: var(--vscode-editor-font-family);
            }
            a {
                color: var(--vscode-textLink-foreground);
                text-decoration: none;
            }
            a:hover {
                text-decoration: underline;
                color: var(--vscode-textLink-activeForeground);
            }
            .file-link {
                color: var(--vscode-textLink-foreground);
                text-decoration: none;
                cursor: pointer;
            }
            .file-link:hover {
                text-decoration: underline;
                color: var(--vscode-textLink-activeForeground);
            }
            /* FK Peek Row Display */
            .fk-peek-row {
                margin: 8px 0;
                padding: 12px;
                background-color: var(--vscode-editor-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 4px;
                font-size: 0.85em;
            }
            .fk-peek-header {
                font-weight: 600;
                margin-bottom: 8px;
                padding-bottom: 6px;
                border-bottom: 1px solid var(--vscode-panel-border);
                color: var(--vscode-foreground);
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
            }
            .fk-peek-header-text {
                display: flex;
                align-items: center;
                gap: 4px;
                flex: 1;
                min-width: 0;
                white-space: normal;
            }
            .fk-peek-close-btn {
                background: transparent;
                border: none;
                color: var(--vscode-foreground);
                font-size: 20px;
                line-height: 1;
                cursor: pointer;
                padding: 0;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                opacity: 0.7;
            }
            .fk-peek-close-btn:hover {
                background-color: var(--vscode-toolbar-hoverBackground);
                opacity: 1;
            }
            .fk-peek-table {
                width: max-content;
                min-width: 100%;
                border-collapse: separate;
                border-spacing: 0;
            }
            .fk-peek-table th {
                text-align: left;
                padding: 4px 8px;
                background-color: var(--vscode-editorGroupHeader-tabsBackground);
                font-weight: 600;
                font-size: 0.9em;
                border: 1px solid var(--vscode-panel-border);
            }
            .fk-peek-table td {
                padding: 4px 8px;
                border: 1px solid var(--vscode-panel-border);
                background-color: var(--vscode-editor-background);
            }
            .fk-peek-subtable {
                margin-top: 10px;
            }
            .fk-peek-subtable-title {
                font-weight: 600;
                margin-bottom: 6px;
            }
            /* FK Context Menu Styles */
            .fk-context-menu {
                position: fixed;
                background-color: var(--vscode-menu-background);
                border: 1px solid var(--vscode-menu-border);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                z-index: 10000;
                min-width: 200px;
                border-radius: 4px;
                overflow: hidden;
            }
            .fk-context-menu-item {
                padding: 8px 16px;
                cursor: pointer;
                font-size: 12px;
                color: var(--vscode-menu-foreground);
                transition: background-color 0.1s ease;
            }
            .fk-context-menu-item:hover {
                background-color: var(--vscode-menu-selectionBackground);
                color: var(--vscode-menu-selectionForeground);
            }
        `;
    }

    private _getScript(): string {
        return `
            const vscode = acquireVsCodeApi();
            const escapeSelectorValue = (value) => {
                if (value === null || value === undefined) {
                    return '';
                }
                const text = String(value);
                if (typeof CSS !== 'undefined' && CSS.escape) {
                    return CSS.escape(text);
                }
                return text.replace(/["\\\\]/g, '\\\\$&');
            };

            document.addEventListener('click', event => {
                const target = event.target.closest('[data-action]');
                if (!target) {
                    return;
                }

                const action = target.getAttribute('data-action');
                switch (action) {
                    case 'navigate':
                        event.preventDefault();
                        navigateToFile(target.getAttribute('data-file'), Number(target.getAttribute('data-line')));
                        break;
                    case 'open-file':
                        event.preventDefault();
                        openFileByName(target.getAttribute('data-file'));
                        break;
                    case 'open-file-highlight':
                        event.preventDefault();
                        openFileByNameWithHighlight(
                            target.getAttribute('data-file'),
                            target.getAttribute('data-highlight')
                        );
                        break;
                    case 'open-input-file':
                        event.preventDefault();
                        openInputFile(target.getAttribute('data-file'));
                        break;
                    case 'open-file-for-table':
                        event.preventDefault();
                        openFileForTable(target.getAttribute('data-table-name'));
                        break;
                    case 'toggle-fk':
                        event.preventDefault();
                        toggleFKPeek(target, target.getAttribute('data-fk-table'), target.getAttribute('data-fk-value'));
                        break;
                    case 'toggle-classification':
                        event.preventDefault();
                        toggleClassificationSection(target.getAttribute('data-classification'));
                        break;
                    case 'toggle-wgn-station':
                        event.preventDefault();
                        toggleWgnStationSection(target.getAttribute('data-station'));
                        break;
                    case 'toggle-atmo-station':
                        event.preventDefault();
                        toggleAtmoStationSection(target.getAttribute('data-station'));
                        break;
                    case 'toggle-soil':
                        event.preventDefault();
                        toggleSoilSection(target.getAttribute('data-soil'));
                        break;
                    case 'toggle-plant-community':
                        event.preventDefault();
                        togglePlantCommunitySection(target.getAttribute('data-community'));
                        break;
                    case 'toggle-management-schedule':
                        event.preventDefault();
                        toggleManagementScheduleSection(target.getAttribute('data-schedule'));
                        break;
                    case 'toggle-decision-table':
                        event.preventDefault();
                        toggleDecisionTableSection(target.getAttribute('data-dtl'));
                        break;
                    case 'clear-filter':
                        event.preventDefault();
                        clearFilter(target.getAttribute('data-table'));
                        break;
                    case 'external-link':
                        // Allow default navigation for external links.
                        break;
                }
            });

            document.addEventListener('click', event => {
                if (!(event.target instanceof Element)) {
                    return;
                }
                const header = event.target.closest('th[data-sortable="true"]');
                if (!header) {
                    return;
                }
                const table = header.closest('table');
                if (!table) {
                    return;
                }
                event.preventDefault();
                const tableName = table.getAttribute('data-table-name') || '';
                const columnName = header.getAttribute('data-col-name') || '';
                if (!tableName || !columnName) {
                    return;
                }
                sortTable(tableName, columnName);
            });

            const filterTimers = new Map();

            document.addEventListener('input', event => {
                if (!(event.target instanceof Element)) {
                    return;
                }
                if (event.target.matches('.table-filter-input')) {
                    const tableName = event.target.getAttribute('data-table') || '';
                    if (tableName) {
                        scheduleFilter(tableName);
                    }
                }
            });

            document.addEventListener('change', event => {
                if (!(event.target instanceof Element)) {
                    return;
                }
                if (event.target.matches('.table-filter-column')) {
                    const tableName = event.target.getAttribute('data-table') || '';
                    if (tableName) {
                        syncFilterMode(tableName);
                        applyFilter(tableName);
                    }
                }
                if (event.target.matches('.table-filter-operator-select')) {
                    const tableName = event.target.getAttribute('data-table') || '';
                    if (tableName) {
                        applyFilter(tableName);
                    }
                }
            });

            document.addEventListener('contextmenu', event => {
                if (!(event.target instanceof Element)) {
                    return;
                }
                const fileTarget = event.target.closest('[data-file-context]');
                if (fileTarget) {
                    showFileContextMenu(
                        event,
                        fileTarget.getAttribute('data-file')
                    );
                    return;
                }
                const target = event.target.closest('[data-fk-context]');
                if (!target) {
                    return;
                }
                showFKContextMenu(
                    event,
                    target.getAttribute('data-fk-file'),
                    Number(target.getAttribute('data-fk-line')),
                    target.getAttribute('data-fk-table'),
                    target.getAttribute('data-fk-value')
                );
            });

            function navigateToFile(file, line) {
                vscode.postMessage({
                    command: 'navigateToFile',
                    file: file,
                    line: line
                });
            }

            function navigateToTarget(file, line) {
                vscode.postMessage({
                    command: 'navigateToTarget',
                    file: file,
                    line: line
                });
            }

            function openFileByName(fileName) {
                vscode.postMessage({
                    command: 'openFile',
                    fileName: fileName
                });
            }

            function openFileByNameWithHighlight(fileName, highlightValue) {
                vscode.postMessage({
                    command: 'openFileWithHighlight',
                    fileName: fileName,
                    highlightValue: highlightValue
                });
            }

            function shouldOpenFileWithHighlight(tableName) {
                if (!tableName) {
                    return false;
                }
                const normalized = tableName.toLowerCase();
                return normalized === 'file_cio'
                    || normalized === 'weather_wgn'
                    || normalized === 'atmo_cli'
                    || normalized === 'soils_sol'
                    || normalized === 'plant_ini'
                    || normalized === 'management_sch'
                    || normalized.includes('dtl');
            }

            function openTableInNewTab(tableName, fkValue) {
                vscode.postMessage({
                    command: 'openTableInNewTab',
                    tableName: tableName,
                    fkValue: fkValue
                });
            }

            function openFilePointer(fileName) {
                vscode.postMessage({
                    command: 'openFilePointer',
                    fileName: fileName
                });
            }

            function openInputFile(file) {
                vscode.postMessage({
                    command: 'openInputFile',
                    file: file
                });
            }

            function clearFilter(tableName) {
                const input = document.querySelector(\`.table-filter-input[data-table="\${escapeSelectorValue(tableName)}"]\`);
                const select = document.querySelector(\`.table-filter-column[data-table="\${escapeSelectorValue(tableName)}"]\`);
                const operatorSelect = document.querySelector(\`.table-filter-operator-select[data-table="\${escapeSelectorValue(tableName)}"]\`);
                if (input) {
                    input.value = '';
                }
                if (select) {
                    select.value = '__all';
                }
                if (operatorSelect) {
                    operatorSelect.value = '=';
                }
                syncFilterMode(tableName);
                applyFilter(tableName);
            }

            function scheduleFilter(tableName) {
                if (filterTimers.has(tableName)) {
                    clearTimeout(filterTimers.get(tableName));
                }
                const timer = setTimeout(() => {
                    filterTimers.delete(tableName);
                    applyFilter(tableName);
                }, 250);
                filterTimers.set(tableName, timer);
            }

            function compareNumeric(value, operator, target) {
                switch (operator) {
                    case '<':
                        return value < target;
                    case '<=':
                        return value <= target;
                    case '>':
                        return value > target;
                    case '>=':
                        return value >= target;
                    case '=':
                        return value === target;
                    case '!=':
                        return value !== target;
                    default:
                        return false;
                }
            }

            function removePeekRows(table) {
                table.querySelectorAll('tr.peek-row-container').forEach(row => row.remove());
            }

            function getColumnIndex(table, columnName) {
                const headers = Array.from(table.tHead?.rows[0]?.cells || []);
                for (let i = 0; i < headers.length; i += 1) {
                    const header = headers[i];
                    if (header.getAttribute('data-col-name') === columnName) {
                        return i;
                    }
                }
                return -1;
            }

            function getSelectedFilterMode(tableName) {
                const select = document.querySelector(\`.table-filter-column[data-table="\${escapeSelectorValue(tableName)}"]\`);
                if (!select || !('selectedOptions' in select)) {
                    return 'text';
                }
                const option = select.selectedOptions[0];
                return option && option.dataset ? option.dataset.filterMode || 'text' : 'text';
            }

            function syncFilterMode(tableName) {
                const mode = getSelectedFilterMode(tableName);
                const operatorWrap = document.querySelector(\`.table-filter-operator[data-table="\${escapeSelectorValue(tableName)}"]\`);
                if (operatorWrap) {
                    operatorWrap.style.display = mode === 'numeric' ? 'inline-flex' : 'none';
                }
                const input = document.querySelector(\`.table-filter-input[data-table="\${escapeSelectorValue(tableName)}"]\`);
                if (input && 'placeholder' in input) {
                    input.placeholder = mode === 'numeric' ? 'Enter numeric value' : 'Type to filter rows';
                }
            }

            function applyFilter(tableName) {
                const table = document.querySelector(\`table[data-table-name="\${escapeSelectorValue(tableName)}"]\`);
                if (!table || !table.tBodies[0]) {
                    return;
                }
                removePeekRows(table);
                const input = document.querySelector(\`.table-filter-input[data-table="\${escapeSelectorValue(tableName)}"]\`);
                const select = document.querySelector(\`.table-filter-column[data-table="\${escapeSelectorValue(tableName)}"]\`);
                const operatorSelect = document.querySelector(\`.table-filter-operator-select[data-table="\${escapeSelectorValue(tableName)}"]\`);
                const rawFilterValue = (input && 'value' in input ? input.value : '').toString().trim();
                const filterValue = rawFilterValue.toLowerCase();
                const columnName = select && 'value' in select ? select.value : '__all';
                const rows = Array.from(table.tBodies[0].rows);
                const columnIndex = columnName === '__all' ? -1 : getColumnIndex(table, columnName);
                const filterMode = getSelectedFilterMode(tableName);
                const numericOperator = operatorSelect && 'value' in operatorSelect ? operatorSelect.value : '=';
                const filterNumericValue = Number(rawFilterValue);

                rows.forEach(row => {
                    if (row.classList.contains('peek-row-container')) {
                        row.remove();
                        return;
                    }
                    if (!filterValue) {
                        row.hidden = false;
                        return;
                    }
                    if (filterMode === 'numeric' && columnIndex !== -1) {
                        if (!Number.isFinite(filterNumericValue)) {
                            row.hidden = true;
                            return;
                        }
                        const cell = row.cells[columnIndex];
                        const valueText = cell ? (cell.textContent || '').trim() : '';
                        const cellNumericValue = Number(valueText);
                        if (!Number.isFinite(cellNumericValue)) {
                            row.hidden = true;
                            return;
                        }
                        row.hidden = !compareNumeric(cellNumericValue, numericOperator, filterNumericValue);
                        return;
                    }
                    let text = '';
                    if (columnIndex === -1) {
                        text = row.textContent || '';
                    } else {
                        const cell = row.cells[columnIndex];
                        text = cell ? cell.textContent || '' : '';
                    }
                    row.hidden = !text.toLowerCase().includes(filterValue);
                });
            }

            function sortTable(tableName, columnName) {
                const table = document.querySelector(\`table[data-table-name="\${escapeSelectorValue(tableName)}"]\`);
                if (!table || !table.tBodies[0]) {
                    return;
                }
                removePeekRows(table);
                const columnIndex = getColumnIndex(table, columnName);
                if (columnIndex === -1) {
                    return;
                }
                const currentCol = table.getAttribute('data-sort-col');
                const currentDir = table.getAttribute('data-sort-dir') || 'asc';
                const nextDir = currentCol === columnName && currentDir === 'asc' ? 'desc' : 'asc';
                table.setAttribute('data-sort-col', columnName);
                table.setAttribute('data-sort-dir', nextDir);

                const rows = Array.from(table.tBodies[0].rows);
                const getValue = (row) => {
                    const cell = row.cells[columnIndex];
                    return cell ? (cell.textContent || '').trim() : '';
                };
                rows.sort((a, b) => {
                    const valueA = getValue(a);
                    const valueB = getValue(b);
                    const numA = Number(valueA);
                    const numB = Number(valueB);
                    const bothNumeric = valueA !== '' && valueB !== '' && Number.isFinite(numA) && Number.isFinite(numB);
                    let comparison = 0;
                    if (bothNumeric) {
                        comparison = numA - numB;
                    } else {
                        comparison = valueA.localeCompare(valueB, undefined, { numeric: true, sensitivity: 'base' });
                    }
                    return nextDir === 'asc' ? comparison : -comparison;
                });
                rows.forEach(row => table.tBodies[0].appendChild(row));

                const headers = Array.from(table.tHead?.rows[0]?.cells || []);
                headers.forEach(header => {
                    header.classList.remove('sorted-asc', 'sorted-desc');
                    if (header.getAttribute('data-col-name') === columnName) {
                        header.classList.add(nextDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
                    }
                });

                applyFilter(tableName);
            }

            function toggleClassificationSection(classification) {
                const section = document.querySelector('[data-classification="' + classification + '"]');
                if (!section) return;
                
                const header = section.querySelector('.classification-header');
                const content = section.querySelector('.classification-content');
                
                if (content.classList.contains('collapsed')) {
                    content.classList.remove('collapsed');
                    header.classList.remove('collapsed');
                } else {
                    content.classList.add('collapsed');
                    header.classList.add('collapsed');
                }
            }

            function toggleWgnStationSection(station) {
                // Escape the station name for safe use in CSS selector
                const escapedStation = station.replace(/"/g, '\\"');
                const section = document.querySelector('[data-station="' + escapedStation + '"]');
                if (!section) return;
                
                const header = section.querySelector('.wgn-station-header');
                const content = section.querySelector('.wgn-station-content');
                
                if (content.classList.contains('collapsed')) {
                    content.classList.remove('collapsed');
                    header.classList.remove('collapsed');
                } else {
                    content.classList.add('collapsed');
                    header.classList.add('collapsed');
                }
            }

            function toggleAtmoStationSection(station) {
                // Escape the station name for safe use in CSS selector
                const escapedStation = station.replace(/"/g, '\\"');
                const section = document.querySelector('[data-station="' + escapedStation + '"]');
                if (!section) return;
                
                const header = section.querySelector('.atmo-station-header');
                const content = section.querySelector('.atmo-station-content');
                
                if (content.classList.contains('collapsed')) {
                    content.classList.remove('collapsed');
                    header.classList.remove('collapsed');
                } else {
                    content.classList.add('collapsed');
                    header.classList.add('collapsed');
                }
            }

            function toggleSoilSection(soilName) {
                const escapedSoil = soilName.replace(/"/g, '\\"');
                const section = document.querySelector('[data-soil="' + escapedSoil + '"]');
                if (!section) return;

                const header = section.querySelector('.soil-header');
                const content = section.querySelector('.soil-content');

                if (content.classList.contains('collapsed')) {
                    content.classList.remove('collapsed');
                    header.classList.remove('collapsed');
                } else {
                    content.classList.add('collapsed');
                    header.classList.add('collapsed');
                }
            }

            function togglePlantCommunitySection(communityName) {
                const escapedCommunity = communityName.replace(/"/g, '\\"');
                const section = document.querySelector('[data-community="' + escapedCommunity + '"]');
                if (!section) return;

                const header = section.querySelector('.plant-community-header');
                const content = section.querySelector('.plant-community-content');
                
                if (content.classList.contains('collapsed')) {
                    content.classList.remove('collapsed');
                    header.classList.remove('collapsed');
                } else {
                    content.classList.add('collapsed');
                    header.classList.add('collapsed');
                }
            }
            function toggleManagementScheduleSection(scheduleName) {
                const escapedSchedule = scheduleName.replace(/"/g, '\\"');
                const section = document.querySelector('[data-schedule="' + escapedSchedule + '"]');
                if (!section) return;

                const header = section.querySelector('.management-schedule-header');
                const content = section.querySelector('.management-schedule-content');

                if (content.classList.contains('collapsed')) {
                    content.classList.remove('collapsed');
                    header.classList.remove('collapsed');
                } else {
                    content.classList.add('collapsed');
                    header.classList.add('collapsed');
                }
            }
            function toggleDecisionTableSection(tableName) {
                const escapedTable = tableName.replace(/"/g, '\\"');
                const section = document.querySelector('[data-dtl="' + escapedTable + '"]');
                if (!section) return;

                const header = section.querySelector('.dtl-header');
                const content = section.querySelector('.dtl-content');

                if (content.classList.contains('collapsed')) {
                    content.classList.remove('collapsed');
                    header.classList.remove('collapsed');
                } else {
                    content.classList.add('collapsed');
                    header.classList.add('collapsed');
                }
            }

            function openFileForTable(tableName) {
                vscode.postMessage({
                    command: 'openFileForTable',
                    tableName: tableName
                });
            }

            function toggleFKPeek(element, tableName, fkValue) {
                const cell = element.closest('td');
                const currentRow = cell.closest('tr');
                const nextRow = currentRow.nextElementSibling;
                
                // Check if the next row is already a peek row
                if (nextRow && nextRow.classList.contains('peek-row-container')) {
                    // Remove existing peek
                    nextRow.remove();
                } else {
                    // Request FK row data from extension
                    const sourceFile = cell.dataset.sourceFile || '';
                    const sourceLine = Number(cell.dataset.sourceLine || 0);
                    const sourceTable = cell.dataset.sourceTable || '';
                    const sourceColumn = cell.dataset.sourceColumn || '';
                    vscode.postMessage({
                        command: 'getFKRowData',
                        tableName: tableName,
                        fkValue: fkValue,
                        sourceFile: sourceFile,
                        sourceLine: sourceLine,
                        sourceTable: sourceTable,
                        sourceColumn: sourceColumn
                    });
                }
            }

            function showFKContextMenu(event, file, line, tableName, fkValue) {
                event.preventDefault();
                event.stopPropagation();
                
                removeExistingContextMenus();
                
                const menu = document.createElement('div');
                menu.id = 'fk-context-menu';
                menu.className = 'fk-context-menu';
                menu.style.left = event.clientX + 'px';
                menu.style.top = event.clientY + 'px';
                
                const menuItems = [
                    {
                        label: 'Peek Row (default)',
                        action: () => {
                            const link = event.target.closest('a');
                            if (link) {
                                link.click();
                            }
                            menu.remove();
                        }
                    },
                    {
                        label: 'Open Table in New Tab',
                        action: () => {
                            vscode.postMessage({
                                command: 'openTableInNewTab',
                                tableName: tableName,
                                fkValue: fkValue
                            });
                            menu.remove();
                        }
                    },
                    {
                        label: 'Open Input File',
                        action: () => {
                            vscode.postMessage({
                                command: 'openInputFile',
                                file: file
                            });
                            menu.remove();
                        }
                    }
                ];
                
                menuItems.forEach(item => {
                    const menuItem = document.createElement('div');
                    menuItem.className = 'fk-context-menu-item';
                    menuItem.textContent = item.label;
                    menuItem.addEventListener('click', item.action);
                    menu.appendChild(menuItem);
                });
                
                document.body.appendChild(menu);
                
                // Close menu on click outside
                const closeMenu = (e) => {
                    if (!menu.contains(e.target)) {
                        menu.remove();
                        document.removeEventListener('click', closeMenu);
                    }
                };
                setTimeout(() => {
                    document.addEventListener('click', closeMenu);
                }, 0);
            }

            function showFileContextMenu(event, fileName) {
                event.preventDefault();
                event.stopPropagation();

                removeExistingContextMenus();

                const menu = document.createElement('div');
                menu.id = 'file-context-menu';
                menu.className = 'fk-context-menu';
                menu.style.left = event.clientX + 'px';
                menu.style.top = event.clientY + 'px';

                const menuItems = [
                    {
                        label: 'Open Raw File',
                        action: () => {
                            if (fileName) {
                                openFilePointer(fileName);
                            }
                            menu.remove();
                        }
                    },
                    {
                        label: 'Open Table (default)',
                        action: () => {
                            const link = event.target.closest('a');
                            if (link) {
                                link.click();
                            }
                            menu.remove();
                        }
                    }
                ];

                menuItems.forEach(item => {
                    const menuItem = document.createElement('div');
                    menuItem.className = 'fk-context-menu-item';
                    menuItem.textContent = item.label;
                    menuItem.addEventListener('click', item.action);
                    menu.appendChild(menuItem);
                });

                document.body.appendChild(menu);

                const closeMenu = (e) => {
                    if (!menu.contains(e.target)) {
                        menu.remove();
                        document.removeEventListener('click', closeMenu);
                    }
                };
                setTimeout(() => {
                    document.addEventListener('click', closeMenu);
                }, 0);
            }

            function removeExistingContextMenus() {
                const existingFK = document.getElementById('fk-context-menu');
                if (existingFK) {
                    existingFK.remove();
                }
                const existingFile = document.getElementById('file-context-menu');
                if (existingFile) {
                    existingFile.remove();
                }
            }

            // Listen for FK row data from extension
            window.addEventListener('message', event => {
                const message = event.data;
                if (message.command === 'showFKRowData') {
                    displayFKPeek(
                        message.tableName,
                        message.fkValue,
                        message.fileName,
                        message.columns,
                        message.rowData,
                        message.lineNumber,
                        message.isDecisionTable,
                        message.childRows,
                        message.filePointers,
                        message.fkColumns,
                        message.sourceFile,
                        message.sourceLine,
                        message.showRelated,
                        message.relatedRows,
                        message.relatedColumns,
                        message.relatedTotal,
                        message.relatedTableName,
                        message.relatedColumnName
                    );
                }
            });
            
            function buildChildRowsTable(childRows, fileName) {
                if (!Array.isArray(childRows) || childRows.length === 0) {
                    return null;
                }

                const firstRow = childRows.find(row => row && row.values) || childRows[0];
                const childColumns = firstRow && firstRow.values ? Object.keys(firstRow.values) : [];
                if (childColumns.length === 0) {
                    return null;
                }

                const wrapper = document.createElement('div');
                wrapper.className = 'fk-peek-subtable';

                const title = document.createElement('div');
                title.className = 'fk-peek-subtable-title';
                title.textContent = 'Subtable rows';
                wrapper.appendChild(title);

                const table = document.createElement('table');
                table.className = 'fk-peek-table';
                const thead = document.createElement('thead');
                const headerRow = document.createElement('tr');
                const lineHeader = document.createElement('th');
                lineHeader.textContent = 'Line';
                headerRow.appendChild(lineHeader);
                childColumns.forEach(col => {
                    const th = document.createElement('th');
                    th.textContent = col;
                    headerRow.appendChild(th);
                });
                thead.appendChild(headerRow);
                table.appendChild(thead);

                const tbody = document.createElement('tbody');
                childRows.forEach(childRow => {
                    const dataRow = document.createElement('tr');
                    const lineCell = document.createElement('td');
                    if (childRow && childRow.lineNumber) {
                        const link = document.createElement('a');
                        link.href = '#';
                        link.textContent = childRow.lineNumber;
                        link.addEventListener('click', (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            navigateToFile(childRow.file || fileName, childRow.lineNumber);
                        });
                        lineCell.appendChild(link);
                    }
                    dataRow.appendChild(lineCell);
                    childColumns.forEach(col => {
                        const td = document.createElement('td');
                        td.textContent = (childRow.values && childRow.values[col]) || '';
                        dataRow.appendChild(td);
                    });
                    tbody.appendChild(dataRow);
                });
                table.appendChild(tbody);
                wrapper.appendChild(table);

                return wrapper;
            }

            function displayFKPeek(tableName, fkValue, fileName, columns, rowData, lineNumber, isDecisionTable, childRows, filePointers, fkColumns, sourceFile, sourceLine, showRelated, relatedRows, relatedColumns, relatedTotal, relatedTableName, relatedColumnName) {
                const sourceSelector = sourceFile ? \`[data-source-file="\${escapeSelectorValue(sourceFile)}"]\` : '';
                const sourceLineSelector = sourceLine ? \`[data-source-line="\${escapeSelectorValue(sourceLine)}"]\` : '';
                const selector = \`td.fk-cell[data-fk-table="\${escapeSelectorValue(tableName)}"][data-fk-value="\${escapeSelectorValue(fkValue)}"]\${sourceSelector}\${sourceLineSelector}\`;
                const fkCells = document.querySelectorAll(selector);
                
                fkCells.forEach(cell => {
                    const currentRow = cell.closest('tr');
                    const nextRow = currentRow.nextElementSibling;
                    
                    // Remove any existing peek rows for this cell
                    if (nextRow && nextRow.classList.contains('peek-row-container')) {
                        nextRow.remove();
                    }
                    
                    // Create peek display
                    const peekDiv = document.createElement('div');
                    peekDiv.className = 'fk-peek-row';
                    
                    const header = document.createElement('div');
                    header.className = 'fk-peek-header';
                    const headerText = document.createElement('span');
                    headerText.className = 'fk-peek-header-text';
                    if (showRelated && Array.isArray(relatedRows) && relatedTableName && relatedColumnName) {
                        const summaryText = document.createElement('span');
                        const totalCount = typeof relatedTotal === 'number' ? relatedTotal : relatedRows.length;
                        const shownCount = relatedRows.length;
                        const countSuffix = totalCount > shownCount ? \` (showing \${shownCount} of \${totalCount})\` : \` (\${shownCount})\`;
                        summaryText.textContent = \`\${relatedTableName} rows where \${relatedColumnName} = \${fkValue}\${countSuffix}\`;
                        headerText.appendChild(summaryText);
                    } else {
                        const headerLabel = document.createElement('span');
                        headerLabel.textContent = \`\${tableName} (File: \`;
                        const fileLink = document.createElement('a');
                        fileLink.href = '#';
                        fileLink.className = 'file-link';
                        fileLink.textContent = fileName;
                        fileLink.title = \`Click to open \${fileName}\`;
                        fileLink.addEventListener('click', (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (shouldOpenFileWithHighlight(tableName) && fkValue && fkValue !== 'null') {
                                openFileByNameWithHighlight(fileName, fkValue);
                            } else {
                                openFileByName(fileName);
                            }
                        });
                        const headerSuffix = document.createElement('span');
                        headerSuffix.textContent = \`, Line: \${lineNumber})\`;
                        headerText.appendChild(headerLabel);
                        headerText.appendChild(fileLink);
                        headerText.appendChild(headerSuffix);
                    }
                    header.appendChild(headerText);
                    
                    // Add close button to header
                    const closeBtn = document.createElement('button');
                    closeBtn.className = 'fk-peek-close-btn';
                    closeBtn.textContent = '×';
                    closeBtn.title = 'Close peek';
                    closeBtn.onclick = function() {
                        const peekRow = this.closest('.peek-row-container');
                        if (peekRow) {
                            peekRow.remove();
                        }
                    };
                    header.appendChild(closeBtn);
                    
                    peekDiv.appendChild(header);
                    
                    const table = document.createElement('table');
                    table.className = 'fk-peek-table';
                    
                    const thead = document.createElement('thead');
                    const headerRow = document.createElement('tr');
                    const showRelatedRows = showRelated && Array.isArray(relatedRows) && relatedTableName && relatedColumnName;
                    const displayColumns = showRelatedRows ? ['Line', ...(relatedColumns || [])] : columns;
                    displayColumns.forEach(col => {
                        const th = document.createElement('th');
                        th.textContent = col;
                        headerRow.appendChild(th);
                    });
                    thead.appendChild(headerRow);
                    table.appendChild(thead);
                    
                    const tbody = document.createElement('tbody');
                    if (showRelatedRows) {
                        if (relatedRows.length === 0) {
                            const emptyRow = document.createElement('tr');
                            const emptyCell = document.createElement('td');
                            emptyCell.colSpan = displayColumns.length;
                            emptyCell.textContent = 'No related rows found.';
                            emptyRow.appendChild(emptyCell);
                            tbody.appendChild(emptyRow);
                        } else {
                            relatedRows.forEach(relatedRow => {
                                const dataRow = document.createElement('tr');
                                displayColumns.forEach(col => {
                                    const td = document.createElement('td');
                                    if (col === 'Line') {
                                        const link = document.createElement('a');
                                        link.href = '#';
                                        link.textContent = relatedRow.lineNumber;
                                        link.addEventListener('click', (event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            navigateToFile(relatedRow.file, relatedRow.lineNumber);
                                        });
                                        td.appendChild(link);
                                    } else {
                                        td.textContent = (relatedRow.values && relatedRow.values[col]) || '';
                                    }
                                    dataRow.appendChild(td);
                                });
                                tbody.appendChild(dataRow);
                            });
                        }
                    } else {
                        const dataRow = document.createElement('tr');
                        columns.forEach(col => {
                            const td = document.createElement('td');
                            const value = rowData[col] || '';
                            if (fkColumns && Object.prototype.hasOwnProperty.call(fkColumns, col) && value && value !== 'null') {
                                const fkInfo = fkColumns[col];
                                const link = document.createElement('a');
                                link.href = '#';
                                link.className = 'fk-link';
                                link.textContent = value;
                                link.title = 'Open ' + fkInfo.targetTable + ' for ' + value;
                                link.addEventListener('click', (event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    openTableInNewTab(fkInfo.targetTable, value);
                                });
                                td.appendChild(link);
                            } else if (filePointers && Object.prototype.hasOwnProperty.call(filePointers, col) && value && value !== 'null') {
                                const link = document.createElement('a');
                                link.href = '#';
                                link.className = 'file-link';
                                link.textContent = value;
                                link.title = 'Click to open ' + value;
                                link.addEventListener('click', (event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    openFilePointer(value);
                                });
                                td.appendChild(link);
                            } else {
                                td.textContent = value;
                            }
                            dataRow.appendChild(td);
                        });
                        tbody.appendChild(dataRow);
                    }
                    table.appendChild(tbody);
                    
                    peekDiv.appendChild(table);

                    if (isDecisionTable && Array.isArray(childRows) && childRows.length > 0) {
                        const decisionDetails = buildDecisionTablePeekDetails(childRows, rowData, fileName);
                        if (decisionDetails) {
                            peekDiv.appendChild(decisionDetails);
                        }
                    } else {
                        const childTable = buildChildRowsTable(childRows, fileName);
                        if (childTable) {
                            peekDiv.appendChild(childTable);
                        }
                    }
                    
                    // Insert the peek row after the current row in the main table
                    const newRow = document.createElement('tr');
                    newRow.className = 'peek-row-container';
                    const newCell = document.createElement('td');
                    newCell.colSpan = currentRow.children.length;
                    newCell.appendChild(peekDiv);
                    newRow.appendChild(newCell);
                    currentRow.after(newRow);
                });
            }

            function buildDecisionTablePeekDetails(childRows, rowData, fileName) {
                const conditionRows = childRows.filter((childRow) => childRow.values && childRow.values.section === 'condition');
                const actionRows = childRows.filter((childRow) => childRow.values && childRow.values.section === 'action');
                if (conditionRows.length === 0 && actionRows.length === 0) {
                    return null;
                }

                const rawAltCount = rowData && rowData.alts ? rowData.alts : '0';
                const parsedAltCount = Number.parseInt(String(rawAltCount), 10);
                const altCount = Number.isFinite(parsedAltCount) && parsedAltCount > 0
                    ? parsedAltCount
                    : Math.max(
                        conditionRows.reduce((max, childRow) => {
                            const altKeys = Object.keys(childRow.values || {}).filter((key) => key.startsWith('alt'));
                            return Math.max(max, altKeys.length);
                        }, 0),
                        actionRows.reduce((max, childRow) => {
                            const outKeys = Object.keys(childRow.values || {}).filter((key) => key.startsWith('out'));
                            return Math.max(max, outKeys.length);
                        }, 0)
                    );

                const altColumns = Array.from({ length: altCount }, (_, idx) => 'alt' + (idx + 1));
                const outColumns = Array.from({ length: altCount }, (_, idx) => 'out' + (idx + 1));

                const container = document.createElement('div');

                if (conditionRows.length > 0) {
                    const conditionTitle = document.createElement('h4');
                    conditionTitle.className = 'dtl-section-title';
                    conditionTitle.textContent = 'Conditions';
                    container.appendChild(conditionTitle);

                    const conditionWrapper = document.createElement('div');
                    conditionWrapper.className = 'table-wrapper';
                    const conditionTable = document.createElement('table');
                    conditionTable.className = 'dtl-table';
                    const conditionHeader = document.createElement('thead');
                    const conditionHeaderRow = document.createElement('tr');
                    ['Line', 'Cond Var', 'Obj', 'Obj Num', 'Lim Var', 'Lim Op', 'Lim Const', ...altColumns.map((col) => col.toUpperCase())].forEach((label) => {
                        const th = document.createElement('th');
                        th.textContent = label;
                        conditionHeaderRow.appendChild(th);
                    });
                    conditionHeader.appendChild(conditionHeaderRow);
                    conditionTable.appendChild(conditionHeader);
                    const conditionBody = document.createElement('tbody');
                    conditionRows.forEach((childRow) => {
                        const row = document.createElement('tr');
                        const lineCell = document.createElement('td');
                        const lineLink = document.createElement('a');
                        lineLink.href = '#';
                        lineLink.textContent = childRow.lineNumber;
                        lineLink.addEventListener('click', (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            navigateToFile(fileName, childRow.lineNumber);
                        });
                        lineCell.appendChild(lineLink);
                        row.appendChild(lineCell);

                        ['cond_var', 'obj', 'obj_num', 'lim_var', 'lim_op', 'lim_const'].forEach((key) => {
                            const cell = document.createElement('td');
                            cell.textContent = (childRow.values && childRow.values[key]) || '';
                            row.appendChild(cell);
                        });

                        altColumns.forEach((altKey) => {
                            const cell = document.createElement('td');
                            cell.textContent = (childRow.values && childRow.values[altKey]) || '';
                            row.appendChild(cell);
                        });
                        conditionBody.appendChild(row);
                    });
                    conditionTable.appendChild(conditionBody);
                    conditionWrapper.appendChild(conditionTable);
                    container.appendChild(conditionWrapper);
                }

                if (actionRows.length > 0) {
                    const actionTitle = document.createElement('h4');
                    actionTitle.className = 'dtl-section-title';
                    actionTitle.textContent = 'Actions';
                    container.appendChild(actionTitle);

                    const actionWrapper = document.createElement('div');
                    actionWrapper.className = 'table-wrapper';
                    const actionTable = document.createElement('table');
                    actionTable.className = 'dtl-table';
                    const actionHeader = document.createElement('thead');
                    const actionHeaderRow = document.createElement('tr');
                    ['Line', 'Act Typ', 'Obj', 'Obj Num', 'Act Name', 'Option', 'Const', 'Const2', 'FP', ...outColumns.map((col) => col.toUpperCase())].forEach((label) => {
                        const th = document.createElement('th');
                        th.textContent = label;
                        actionHeaderRow.appendChild(th);
                    });
                    actionHeader.appendChild(actionHeaderRow);
                    actionTable.appendChild(actionHeader);
                    const actionBody = document.createElement('tbody');
                    actionRows.forEach((childRow) => {
                        const row = document.createElement('tr');
                        const lineCell = document.createElement('td');
                        const lineLink = document.createElement('a');
                        lineLink.href = '#';
                        lineLink.textContent = childRow.lineNumber;
                        lineLink.addEventListener('click', (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            navigateToFile(fileName, childRow.lineNumber);
                        });
                        lineCell.appendChild(lineLink);
                        row.appendChild(lineCell);

                        ['act_typ', 'obj', 'obj_num', 'act_name', 'act_option', 'const', 'const2', 'fp'].forEach((key) => {
                            const cell = document.createElement('td');
                            cell.textContent = (childRow.values && childRow.values[key]) || '';
                            row.appendChild(cell);
                        });

                        outColumns.forEach((outKey) => {
                            const cell = document.createElement('td');
                            cell.textContent = (childRow.values && childRow.values[outKey]) || '';
                            row.appendChild(cell);
                        });
                        actionBody.appendChild(row);
                    });
                    actionTable.appendChild(actionBody);
                    actionWrapper.appendChild(actionTable);
                    container.appendChild(actionWrapper);
                }

                return container;
            }
            
            // Auto-expand and scroll to highlighted station for weather-wgn.cli
            window.addEventListener('load', function() {
                document.querySelectorAll('.table-controls').forEach(control => {
                    const tableName = control.getAttribute('data-table') || '';
                    if (tableName) {
                        syncFilterMode(tableName);
                    }
                });
                const highlightedStation = document.getElementById('highlighted-station');
                if (highlightedStation) {
                    // Expand the highlighted station
                    const header = highlightedStation.querySelector('.wgn-station-header');
                    const content = highlightedStation.querySelector('.wgn-station-content');
                    if (header && content && content.classList.contains('collapsed')) {
                        content.classList.remove('collapsed');
                        header.classList.remove('collapsed');
                    }
                    
                    // Scroll to the highlighted station
                    setTimeout(function() {
                        highlightedStation.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                }

                const highlightedAtmoStation = document.getElementById('highlighted-atmo-station');
                if (highlightedAtmoStation) {
                    const header = highlightedAtmoStation.querySelector('.atmo-station-header');
                    const content = highlightedAtmoStation.querySelector('.atmo-station-content');
                    if (header && content && content.classList.contains('collapsed')) {
                        content.classList.remove('collapsed');
                        header.classList.remove('collapsed');
                    }

                    setTimeout(function() {
                        highlightedAtmoStation.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                }

                const highlightedSoil = document.getElementById('highlighted-soil');
                if (highlightedSoil) {
                    const header = highlightedSoil.querySelector('.soil-header');
                    const content = highlightedSoil.querySelector('.soil-content');
                    if (header && content && content.classList.contains('collapsed')) {
                        content.classList.remove('collapsed');
                        header.classList.remove('collapsed');
                    }

                    setTimeout(function() {
                        highlightedSoil.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                }

                const highlightedCommunity = document.getElementById('highlighted-community');
                if (highlightedCommunity) {
                    const header = highlightedCommunity.querySelector('.plant-community-header');
                    const content = highlightedCommunity.querySelector('.plant-community-content');
                    if (header && content && content.classList.contains('collapsed')) {
                        content.classList.remove('collapsed');
                        header.classList.remove('collapsed');
                    }

                    setTimeout(function() {
                        highlightedCommunity.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                }

                const highlightedSchedule = document.getElementById('highlighted-schedule');
                if (highlightedSchedule) {
                    const header = highlightedSchedule.querySelector('.management-schedule-header');
                    const content = highlightedSchedule.querySelector('.management-schedule-content');
                    if (header && content && content.classList.contains('collapsed')) {
                        content.classList.remove('collapsed');
                        header.classList.remove('collapsed');
                    }

                    setTimeout(function() {
                        highlightedSchedule.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                }

                const highlightedDecisionTable = document.getElementById('highlighted-dtl');
                if (highlightedDecisionTable) {
                    const header = highlightedDecisionTable.querySelector('.dtl-header');
                    const content = highlightedDecisionTable.querySelector('.dtl-content');
                    if (header && content && content.classList.contains('collapsed')) {
                        content.classList.remove('collapsed');
                        header.classList.remove('collapsed');
                    }

                    setTimeout(function() {
                        highlightedDecisionTable.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                }
            });
        `;
    }
}
