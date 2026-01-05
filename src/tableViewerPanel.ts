/**
 * SWAT+ Table Viewer Panel
 * 
 * Provides a webview panel that displays indexed SWAT+ input tables in a grid format
 * with clickable FK and file pointer navigation.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { SwatIndexer } from './indexer';

export class SwatTableViewerPanel {
    public static currentPanel: SwatTableViewerPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(
        panel: vscode.WebviewPanel,
        private indexer: SwatIndexer
    ) {
        this._panel = panel;

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
                }
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(indexer: SwatIndexer) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (SwatTableViewerPanel.currentPanel) {
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

        SwatTableViewerPanel.currentPanel = new SwatTableViewerPanel(panel, indexer);
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
            
            tablesHtml += `
                <div class="table-section">
                    <h3 class="table-header" onclick="toggleTable('${tableName}')">
                        <span class="toggle-icon">▼</span>
                        ${tableName}
                        <span class="badge">${rowCount} rows</span>
                        ${schemaTable ? `<span class="file-badge">${schemaTable.file_name}</span>` : ''}
                    </h3>
                    <div id="${tableName}" class="table-content">
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

        // Get columns from schema or first row
        let columns: string[] = [];
        if (schemaTable && schemaTable.columns) {
            columns = schemaTable.columns.map((col: any) => col.name);
        } else {
            columns = Object.keys(rows[0].values || {});
        }

        // Get FK columns
        const fkColumns = new Set<string>();
        if (schemaTable && schemaTable.foreign_keys) {
            schemaTable.foreign_keys.forEach((fk: any) => {
                fkColumns.add(fk.column);
            });
        }

        let tableHtml = `
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th class="line-col">Line</th>
                            ${columns.map(col => `
                                <th class="${fkColumns.has(col) ? 'fk-col' : ''}">
                                    ${col}
                                    ${fkColumns.has(col) ? '<span class="fk-indicator" title="Foreign Key">🔗</span>' : ''}
                                </th>
                            `).join('')}
                        </tr>
                    </thead>
                    <tbody>
        `;

        for (const row of rows.slice(0, 1000)) { // Limit to 1000 rows for performance
            tableHtml += `<tr>`;
            tableHtml += `<td class="line-col"><a href="#" onclick="navigateToFile('${this._escapeJs(row.file)}', ${row.lineNumber})">${row.lineNumber}</a></td>`;
            
            for (const col of columns) {
                const value = row.values[col] || '';
                const isFk = fkColumns.has(col);
                
                if (isFk && value) {
                    // Try to resolve FK
                    const fkInfo = schemaTable.foreign_keys.find((fk: any) => fk.column === col);
                    if (fkInfo) {
                        const targetRow = this.indexer.resolveFKTarget(fkInfo.references.table, value);
                        if (targetRow) {
                            tableHtml += `<td class="fk-cell"><a href="#" onclick="navigateToTarget('${this._escapeJs(targetRow.file)}', ${targetRow.lineNumber})" class="fk-link" title="Navigate to ${this._escapeHtml(fkInfo.references.table)}">${this._escapeHtml(value)}</a></td>`;
                        } else {
                            tableHtml += `<td class="fk-cell unresolved" title="Unresolved FK to ${this._escapeHtml(fkInfo.references.table)}">${this._escapeHtml(value)}</td>`;
                        }
                    } else {
                        tableHtml += `<td>${this._escapeHtml(value)}</td>`;
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
            .fk-indicator {
                margin-left: 4px;
                font-size: 0.8em;
                opacity: 0.7;
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
        `;
    }

    private _getScript(): string {
        return `
            const vscode = acquireVsCodeApi();

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
        `;
    }
}
