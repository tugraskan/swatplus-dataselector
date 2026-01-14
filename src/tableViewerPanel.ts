/**
 * SWAT+ Table Viewer Panel
 * 
 * Provides a webview panel that displays indexed SWAT+ input tables in a grid format
 * with clickable FK and file pointer navigation.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { SwatIndexer } from './indexer';
import { SwatSingleTableViewerPanel } from './singleTableViewerPanel';

export class SwatTableViewerPanel {
    public static currentPanel: SwatTableViewerPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _focusedTable: string | undefined; // Table to auto-expand and scroll to

    private constructor(
        panel: vscode.WebviewPanel,
        private indexer: SwatIndexer,
        focusedTable?: string
    ) {
        this._panel = panel;
        this._focusedTable = focusedTable;

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
                    case 'getFKRowData':
                        if (message.tableName && message.fkValue) {
                            this.sendFKRowData(message.tableName, message.fkValue);
                        }
                        break;
                    case 'openTableInNewTab':
                        if (message.tableName) {
                            this.openTableInNewTab(message.tableName);
                        }
                        break;
                    case 'openInputFile':
                        if (message.file) {
                            this.openFileInEditor(message.file);
                        }
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(indexer: SwatIndexer, focusedTable?: string) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it and update with the new focused table
        if (SwatTableViewerPanel.currentPanel) {
            SwatTableViewerPanel.currentPanel._focusedTable = focusedTable;
            SwatTableViewerPanel.currentPanel._panel.reveal(column);
            SwatTableViewerPanel.currentPanel._update();
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'swatTableViewer',
            'SWAT+ Table Viewer',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        SwatTableViewerPanel.currentPanel = new SwatTableViewerPanel(panel, indexer, focusedTable);
    }

    public dispose() {
        SwatTableViewerPanel.currentPanel = undefined;

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
            const document = await vscode.workspace.openTextDocument(file);
            const editor = await vscode.window.showTextDocument(document);
            const position = new vscode.Position(line - 1, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position));
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to navigate to ${file}:${line}`);
        }
    }

    private sendFKRowData(tableName: string, fkValue: string) {
        try {
            const schema = this.indexer.getSchema();
            const indexData = this.indexer.getIndexData();
            
            if (!schema || !indexData) {
                return;
            }
            
            // Get the target table data
            const targetTableData = indexData.get(tableName);
            if (!targetTableData) {
                return;
            }
            
            // Find the row with the matching FK value
            const targetRow = this.indexer.resolveFKTarget(tableName, fkValue);
            if (!targetRow) {
                return;
            }
            
            // Get schema for the target table to get column names
            const fileName = this.indexer.getFileNameForTable(tableName);
            const schemaTable = fileName && schema.tables[fileName] ? schema.tables[fileName] : undefined;
            
            // Get columns from actual indexed data (not schema)
            let columns: string[] = [];
            columns = Object.keys(targetRow.values || {});
            
            // Send the row data back to the webview
            this._panel.webview.postMessage({
                command: 'showFKRowData',
                tableName: tableName,
                fkValue: fkValue,
                fileName: fileName || tableName,
                columns: columns,
                rowData: targetRow.values,
                lineNumber: targetRow.lineNumber
            });
        } catch (error) {
            console.error('Failed to get FK row data', error);
        }
    }

    private openTableInNewTab(tableName: string) {
        // Create a new table viewer panel for this specific table
        SwatTableViewerPanel.createOrShow(this.indexer, tableName);
    }

    private async openFileByName(fileName: string) {
        try {
            // Map the file name to a table name using the indexer
            let tableName = this.indexer.getTableNameFromFile(fileName);
            
            // If not found, try deriving table name from file name
            if (!tableName) {
                // Replace dots with underscores (e.g., pcp.cli -> pcp_cli)
                const tableNameFromFile = fileName.replace(/\./g, '_');
                if (this.indexer.isTableIndexed(tableNameFromFile)) {
                    tableName = tableNameFromFile;
                }
            }
            
            // Even if we found a table name in the schema mapping, we need to verify
            // that the table actually has data in the index
            if (!tableName || !this.indexer.isTableIndexed(tableName)) {
                vscode.window.showWarningMessage(`Table for file "${fileName}" is not indexed. This file is listed in file.cio but was not found in your dataset. It may be optional for your SWAT+ configuration.`);
                return;
            }
            
            // Open the table in a new viewer panel
            SwatSingleTableViewerPanel.createOrShow(this.indexer, tableName);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open table for ${fileName}: ${error}`);
        }
    }

    private async openFileInEditor(file: string) {
        try {
            const document = await vscode.workspace.openTextDocument(file);
            await vscode.window.showTextDocument(document, { preview: false });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open file ${file}`);
        }
    }

    /**
     * Check if a file can be opened (exists in index)
     */
    private canOpenFile(fileName: string): boolean {
        if (!fileName || fileName === 'null' || !fileName.includes('.')) {
            return false;
        }
        
        // Check if it maps to a table
        let tableName = this.indexer.getTableNameFromFile(fileName);
        
        // If not found, try deriving table name from file name
        if (!tableName) {
            // Replace dots with underscores (e.g., pcp.cli -> pcp_cli)
            const tableNameFromFile = fileName.replace(/\./g, '_');
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

    public refresh() {
        this._update();
    }

    private _update() {
        const webview = this._panel.webview;
        this._panel.title = 'SWAT+ Table Viewer';
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        if (!this.indexer.isIndexBuilt()) {
            return this._getNoIndexHtml();
        }

        const stats = this.indexer.getIndexStats();
        const schema = this.indexer.getSchema();
        
        if (!schema) {
            return this._getNoSchemaHtml();
        }

        // Get all indexed data
        const indexData = this.indexer.getIndexData();
        
        // Create table list
        let tablesHtml = '';
        const tables = Array.from(indexData.keys()).sort();
        
        for (const tableName of tables) {
            const tableData = indexData.get(tableName);
            if (!tableData || tableData.size === 0) {
                continue;
            }

            const schemaTable = schema.tables[this.indexer.getFileNameForTable(tableName) || ''];
            const rowCount = tableData.size;
            
            // Check if this is the focused table
            const isFocused = this._focusedTable && tableName === this._focusedTable;
            const collapsedClass = isFocused ? '' : 'collapsed';
            const fileName = this.indexer.getFileNameForTable(tableName) || '';
            
            tablesHtml += `
                <div class="table-section" ${isFocused ? 'id="focused-table"' : ''}>
                    <h3 class="table-header ${collapsedClass}" data-action="toggle-table" data-table-id="${this._escapeHtml(tableName)}">
                        <span class="toggle-icon">▼</span>
                        ${tableName}
                        <span class="badge">${rowCount} rows</span>
                        ${schemaTable ? `<span class="file-badge">${schemaTable.file_name}</span>` : ''}
                        ${this._getGitbookLink(fileName)}
                    </h3>
                    <div id="${tableName}" class="table-content ${collapsedClass}">
                        ${this._getTableHtml(tableName, tableData, schemaTable)}
                    </div>
                </div>
            `;
        }

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>SWAT+ Table Viewer</title>
            <style>
                ${this._getStyles()}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>SWAT+ Table Viewer</h1>
                <div class="stats">
                    <span class="stat-item">Tables: ${stats.tableCount}</span>
                    <span class="stat-item">Rows: ${stats.rowCount}</span>
                    <span class="stat-item">FK References: ${stats.fkCount}</span>
                </div>
            </div>
            <div class="content">
                ${tablesHtml}
            </div>
            <script>
                ${this._getScript()}
            </script>
        </body>
        </html>`;
    }

    private _getTableHtml(tableName: string, tableData: Map<string, any>, schemaTable: any): string {
        const rows = Array.from(tableData.values());
        if (rows.length === 0) {
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
        if (schemaTable && schemaTable.foreign_keys && tableName !== 'file_cio') {
            schemaTable.foreign_keys.forEach((fk: any) => {
                fkColumns.set(fk.column, fk);
            });
        }

        // Get file pointer columns from metadata
        const metadata = this.indexer.getMetadata();
        const fileName = this.indexer.getFileNameForTable(tableName);
        const filePointers = metadata?.file_pointer_columns?.[fileName || ''] || {};
        const fileMetadata = metadata?.file_metadata?.[fileName || ''];

        // Add file description if available
        let descriptionHtml = '';
        if (fileMetadata && fileMetadata.description) {
            descriptionHtml = `<div class="file-description">${this._escapeHtml(fileMetadata.description)}</div>`;
        }

        let tableHtml = `
            ${descriptionHtml}
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th class="line-col">Line</th>
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
                                    const pointerDesc = filePointers[col];
                                    if (pointerDesc && pointerDesc !== 'description') {
                                        tooltip += `\n${pointerDesc}`;
                                    }
                                }
                                
                                return `
                                <th class="${fkInfo ? 'fk-col' : ''}" title="${this._escapeHtml(tooltip)}">
                                    ${col}
                                    ${fkInfo ? '<span class="fk-indicator" title="Foreign Key">🔗</span>' : ''}
                                    ${isFilePointer ? '<span class="file-pointer-indicator" title="File Pointer">📄</span>' : ''}
                                </th>
                            `;
                            }).join('')}
                        </tr>
                    </thead>
                    <tbody>
        `;

        for (const row of rows.slice(0, 1000)) { // Limit to 1000 rows for performance
            tableHtml += `<tr>`;
            tableHtml += `<td class="line-col"><a href="#" data-action="navigate" data-file="${this._escapeHtml(row.file)}" data-line="${row.lineNumber}">${row.lineNumber}</a></td>`;
            
            for (const col of columns) {
                const value = row.values[col] || '';
                const fkInfo = fkColumns.get(col);
                
                // Special handling for file.cio file_name column - make it a clickable file link
                if (tableName === 'file_cio' && col === 'file_name' && value && value !== 'null' && value.includes('.')) {
                    const canOpen = this.canOpenFile(value);
                    const linkClass = canOpen ? 'file-link' : 'file-link broken-link';
                    const title = canOpen ? `Click to open ${this._escapeHtml(value)}` : `${this._escapeHtml(value)} - Not indexed (may not exist in dataset)`;
                    tableHtml += `<td class="file-link-cell"><a href="#" data-action="open-file" data-file="${this._escapeHtml(value)}" class="${linkClass}" title="${title}">${this._escapeHtml(value)}</a></td>`;
                } else if (fkInfo && value) {
                    // Try to resolve FK
                    const targetRow = this.indexer.resolveFKTarget(fkInfo.references.table, value);
                    if (targetRow) {
                        // Embed the FK row data as JSON in data attributes
                        const fileName = this.indexer.getFileNameForTable(fkInfo.references.table) || fkInfo.references.table;
                        tableHtml += `<td class="fk-cell" data-fk-context="true" data-fk-table="${this._escapeHtml(fkInfo.references.table)}" data-fk-value="${this._escapeHtml(value)}" data-fk-file="${this._escapeHtml(targetRow.file)}" data-fk-line="${targetRow.lineNumber}" data-fk-filename="${this._escapeHtml(fileName)}"><a href="#" data-action="toggle-fk" data-fk-context="true" data-fk-table="${this._escapeHtml(fkInfo.references.table)}" data-fk-value="${this._escapeHtml(value)}" data-fk-file="${this._escapeHtml(targetRow.file)}" data-fk-line="${targetRow.lineNumber}" class="fk-link" title="Click to peek, right-click for options">${this._escapeHtml(value)}</a></td>`;
                    } else {
                        tableHtml += `<td class="fk-cell unresolved" title="Unresolved FK to ${this._escapeHtml(fkInfo.references.table)}">${this._escapeHtml(value)}</td>`;
                    }
                } else {
                    tableHtml += `<td>${this._escapeHtml(value)}</td>`;
                }
            }
            
            tableHtml += `</tr>`;
        }

        if (rows.length > 1000) {
            tableHtml += `
                <tr>
                    <td colspan="${columns.length + 1}" class="truncated-message">
                        Showing first 1000 of ${rows.length} rows
                    </td>
                </tr>
            `;
        }

        tableHtml += `
                    </tbody>
                </table>
            </div>
        `;

        return tableHtml;
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
        if (!fileName) {
            return '';
        }
        
        const url = this.indexer.getGitbookUrl(fileName);
        if (!url) {
            return '';
        }
        
        return `<a href="${this._escapeHtml(url)}" target="_blank" rel="noopener" data-action="external-link" class="gitbook-link" title="View documentation on GitBook (Click or Ctrl+Right Click)">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="vertical-align: middle; margin-left: 6px;">
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
            .table-section {
                margin-bottom: 30px;
                border: 1px solid var(--vscode-panel-border);
                border-radius: 4px;
                overflow: hidden;
            }
            .table-header {
                padding: 12px 15px;
                margin: 0;
                background-color: var(--vscode-editorGroupHeader-tabsBackground);
                cursor: pointer;
                user-select: none;
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 1.1em;
                font-weight: 600;
            }
            .table-header:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            .toggle-icon {
                font-size: 0.8em;
                transition: transform 0.2s;
                display: inline-block;
                width: 16px;
            }
            .table-header.collapsed .toggle-icon {
                transform: rotate(-90deg);
            }
            .badge {
                font-size: 0.75em;
                padding: 3px 8px;
                background-color: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
                border-radius: 10px;
                font-weight: normal;
            }
            .file-badge {
                font-size: 0.75em;
                padding: 3px 8px;
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border-radius: 3px;
                font-weight: normal;
            }
            .gitbook-link {
                color: var(--vscode-textLink-foreground);
                text-decoration: none;
                display: inline-flex;
                align-items: center;
                opacity: 0.7;
                transition: opacity 0.2s;
                margin-left: auto;
            }
            .gitbook-link:hover {
                opacity: 1;
                color: var(--vscode-textLink-activeForeground);
            }
            .table-content {
                padding: 0;
                overflow-x: auto;
            }
            .table-content.collapsed {
                display: none;
            }
            .table-wrapper {
                overflow-x: auto;
            }
            .data-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 0.9em;
            }
            .data-table th {
                background-color: var(--vscode-editorGroupHeader-tabsBackground);
                padding: 8px 12px;
                text-align: left;
                font-weight: 600;
                border-bottom: 2px solid var(--vscode-panel-border);
                position: sticky;
                top: 0;
                z-index: 10;
            }
            .data-table th.fk-col {
                background-color: var(--vscode-inputOption-activeBackground);
            }
            .data-table td {
                padding: 6px 12px;
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            .data-table tbody tr:hover {
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
            .empty-message, .truncated-message {
                padding: 20px;
                text-align: center;
                color: var(--vscode-descriptionForeground);
                font-style: italic;
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
                width: 100%;
                border-collapse: collapse;
            }
            .fk-peek-table th {
                text-align: left;
                padding: 4px 8px;
                background-color: var(--vscode-editorGroupHeader-tabsBackground);
                font-weight: 600;
                font-size: 0.9em;
            }
            .fk-peek-table td {
                padding: 4px 8px;
                border-bottom: 1px solid var(--vscode-panel-border);
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

            document.addEventListener('click', event => {
                const target = event.target.closest('[data-action]');
                if (!target) {
                    return;
                }

                const action = target.getAttribute('data-action');
                switch (action) {
                    case 'toggle-table':
                        event.preventDefault();
                        toggleTable(target.getAttribute('data-table-id'));
                        break;
                    case 'navigate':
                        event.preventDefault();
                        navigateToFile(target.getAttribute('data-file'), Number(target.getAttribute('data-line')));
                        break;
                    case 'open-file':
                        event.preventDefault();
                        openFileByName(target.getAttribute('data-file'));
                        break;
                    case 'toggle-fk':
                        event.preventDefault();
                        toggleFKPeek(target, target.getAttribute('data-fk-table'), target.getAttribute('data-fk-value'));
                        break;
                    case 'external-link':
                        // Allow default navigation for external links.
                        break;
                }
            });

            document.addEventListener('contextmenu', event => {
                if (!(event.target instanceof Element)) {
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
                    target.getAttribute('data-fk-table')
                );
            });

            function toggleTable(tableId) {
                const content = document.getElementById(tableId);
                const header = content.previousElementSibling;
                
                if (content.classList.contains('collapsed')) {
                    content.classList.remove('collapsed');
                    header.classList.remove('collapsed');
                } else {
                    content.classList.add('collapsed');
                    header.classList.add('collapsed');
                }
            }

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
                    vscode.postMessage({
                        command: 'getFKRowData',
                        tableName: tableName,
                        fkValue: fkValue
                    });
                }
            }

            function showFKContextMenu(event, file, line, tableName) {
                event.preventDefault();
                event.stopPropagation();
                
                // Remove any existing context menu
                const existing = document.getElementById('fk-context-menu');
                if (existing) {
                    existing.remove();
                }
                
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
                                tableName: tableName
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

            // Listen for FK row data from extension
            window.addEventListener('message', event => {
                const message = event.data;
                if (message.command === 'showFKRowData') {
                    displayFKPeek(message.tableName, message.fkValue, message.fileName, message.columns, message.rowData, message.lineNumber);
                }
            });

            function displayFKPeek(tableName, fkValue, fileName, columns, rowData, lineNumber) {
                // Find the specific FK cell that matches both table name AND FK value
                const fkCells = document.querySelectorAll(\`td.fk-cell[data-fk-table="\${tableName}"][data-fk-value="\${fkValue}"]\`);
                
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
                    header.textContent = \`\${tableName} (File: \${fileName}, Line: \${lineNumber})\`;
                    
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
                    columns.forEach(col => {
                        const th = document.createElement('th');
                        th.textContent = col;
                        headerRow.appendChild(th);
                    });
                    thead.appendChild(headerRow);
                    table.appendChild(thead);
                    
                    const tbody = document.createElement('tbody');
                    const dataRow = document.createElement('tr');
                    columns.forEach(col => {
                        const td = document.createElement('td');
                        td.textContent = rowData[col] || '';
                        dataRow.appendChild(td);
                    });
                    tbody.appendChild(dataRow);
                    table.appendChild(tbody);
                    
                    peekDiv.appendChild(table);
                    
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

            // Scroll to focused table on load
            document.addEventListener('DOMContentLoaded', function() {
                const focusedTable = document.getElementById('focused-table');
                if (focusedTable) {
                    // Use setTimeout to ensure rendering is complete
                    setTimeout(function() {
                        focusedTable.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                }
            });
        `;
    }
}
