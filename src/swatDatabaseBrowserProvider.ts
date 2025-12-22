import * as vscode from 'vscode';
import * as path from 'path';
import { SwatDatabaseHelper } from './swatDatabaseHelper';

/**
 * Provides a database table browser webview for SWAT+ project databases
 * Allows browsing tables and clicking on foreign keys to navigate to referenced records
 */
export class SwatDatabaseBrowserProvider {
    private panel: vscode.WebviewPanel | undefined;
    
    constructor(
        private context: vscode.ExtensionContext,
        private dbHelper: SwatDatabaseHelper,
        private getSelectedDataset: () => string | undefined
    ) {}

    /**
     * Open the database browser for a specific table and optionally filter to a specific record
     */
    public async openTable(tableName: string, filterRecordName?: string) {
        const datasetPath = this.getSelectedDataset();
        if (!datasetPath) {
            vscode.window.showErrorMessage('Please select a SWAT+ dataset first');
            return;
        }

        const dbPath = this.dbHelper.getProjectDbPath(datasetPath);
        if (!dbPath || !this.dbHelper.isAvailable()) {
            vscode.window.showErrorMessage('Database not found or better-sqlite3 not available');
            return;
        }

        // Validate table name
        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(tableName)) {
            vscode.window.showErrorMessage(`Invalid table name: ${tableName}`);
            return;
        }

        // Check if table exists
        if (!this.dbHelper.tableExists(dbPath, tableName)) {
            const availableTables = this.dbHelper.getAvailableTables(dbPath);
            const tablesMsg = availableTables.length > 0 
                ? `Available tables: ${availableTables.join(', ')}`
                : 'No tables found in database';
            vscode.window.showWarningMessage(`Table "${tableName}" not found. ${tablesMsg}`);
            // Still show the error page in the browser
        }

        // Create or show the panel
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'swatDatabaseBrowser',
                'SWAT+ Database Browser',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });

            // Handle messages from the webview
            this.panel.webview.onDidReceiveMessage(async (message) => {
                switch (message.type) {
                    case 'openReference':
                        await this.openTable(message.tableName, message.recordName);
                        break;
                    case 'loadTable':
                        this.loadTableData(message.tableName, message.filterRecordName);
                        break;
                }
            });
        }

        // Load the table data
        this.loadTableData(tableName, filterRecordName);
    }

    /**
     * Load and display table data
     */
    private loadTableData(tableName: string, filterRecordName?: string) {
        const datasetPath = this.getSelectedDataset();
        if (!datasetPath || !this.panel) {
            return;
        }

        const dbPath = this.dbHelper.getProjectDbPath(datasetPath);
        if (!dbPath) {
            return;
        }

        try {
            const sqlite3 = require('better-sqlite3');
            const db = sqlite3(dbPath, { readonly: true, fileMustExist: true });

            // Validate table name to prevent SQL injection
            if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(tableName)) {
                vscode.window.showErrorMessage(`Invalid table name: ${tableName}`);
                db.close();
                return;
            }

            // Check if table exists
            const tableCheckStmt = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`);
            const tableExists = tableCheckStmt.get(tableName);
            
            if (!tableExists) {
                // Get list of available tables
                const availableTablesStmt = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`);
                const availableTables = availableTablesStmt.all().map((t: any) => t.name);
                
                this.panel.webview.html = this.getErrorHtml(
                    tableName,
                    `Table "${tableName}" not found in database`,
                    'The table may not exist or the database may need to be regenerated.',
                    availableTables
                );
                db.close();
                return;
            }

            // Get table data
            let query = `SELECT * FROM ${tableName}`;
            const params: any[] = [];
            
            if (filterRecordName) {
                query += ' WHERE name = ?';
                params.push(filterRecordName);
            }
            
            query += ' LIMIT 100'; // Limit for performance
            
            const stmt = db.prepare(query);
            const rows = params.length > 0 ? stmt.all(...params) : stmt.all();

            // Get foreign key information
            const pragmaStmt = db.prepare(`PRAGMA foreign_key_list(${tableName})`);
            const foreignKeys = pragmaStmt.all();

            db.close();

            // Update the webview
            this.panel.webview.html = this.getHtmlForWebview(
                tableName,
                rows,
                foreignKeys,
                filterRecordName
            );

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Error loading table: ${errorMessage}`);
            if (this.panel) {
                // Get available tables for error message
                let availableTables: string[] = [];
                try {
                    availableTables = this.dbHelper.getAvailableTables(dbPath);
                } catch (e) {
                    // ignore
                }
                
                this.panel.webview.html = this.getErrorHtml(
                    tableName,
                    'Error loading table',
                    errorMessage,
                    availableTables
                );
            }
        }
    }

    /**
     * Get HTML for the webview
     */
    private getHtmlForWebview(
        tableName: string,
        rows: any[],
        foreignKeys: any[],
        filterRecordName?: string
    ): string {
        if (rows.length === 0) {
            return this.getEmptyStateHtml(tableName);
        }

        const columns = Object.keys(rows[0]);
        const fkMap = new Map<string, { table: string, to: string }>();
        
        foreignKeys.forEach((fk: any) => {
            fkMap.set(fk.from, { table: fk.table, to: fk.to || 'id' });
        });

        let tableHtml = `
            <table>
                <thead>
                    <tr>
                        ${columns.map(col => {
                            const isFk = fkMap.has(col);
                            const fkInfo = isFk ? fkMap.get(col) : null;
                            return `<th title="${isFk ? `Foreign key → ${fkInfo?.table}` : ''}">${col}${isFk ? ' 🔗' : ''}</th>`;
                        }).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(row => `
                        <tr>
                            ${columns.map(col => {
                                const value = row[col];
                                const isFk = fkMap.has(col);
                                const fkInfo = isFk ? fkMap.get(col) : null;
                                
                                if (isFk && value) {
                                    return `<td><a href="#" class="fk-link" data-table="${fkInfo?.table}" data-record="${value}">${value}</a></td>`;
                                } else {
                                    return `<td>${value !== null && value !== undefined ? value : '<em>null</em>'}</td>`;
                                }
                            }).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>SWAT+ Database Browser</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                        padding: 20px;
                    }
                    h1 {
                        color: var(--vscode-titleBar-activeForeground);
                        margin-top: 0;
                    }
                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 20px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        padding-bottom: 10px;
                    }
                    .filter-info {
                        color: var(--vscode-descriptionForeground);
                        font-style: italic;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 10px;
                    }
                    th {
                        background-color: var(--vscode-editorWidget-background);
                        color: var(--vscode-editorWidget-foreground);
                        padding: 10px;
                        text-align: left;
                        font-weight: bold;
                        border: 1px solid var(--vscode-panel-border);
                        position: sticky;
                        top: 0;
                    }
                    td {
                        padding: 8px 10px;
                        border: 1px solid var(--vscode-panel-border);
                    }
                    tr:hover {
                        background-color: var(--vscode-list-hoverBackground);
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
                    em {
                        color: var(--vscode-descriptionForeground);
                    }
                    .record-count {
                        color: var(--vscode-descriptionForeground);
                        font-size: 0.9em;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <h1>📊 ${this.formatTableName(tableName)}</h1>
                        ${filterRecordName ? `<div class="filter-info">Filtered to: <strong>${filterRecordName}</strong></div>` : ''}
                    </div>
                    <div class="record-count">${rows.length} record${rows.length === 1 ? '' : 's'}</div>
                </div>
                ${tableHtml}
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    // Handle foreign key link clicks
                    document.addEventListener('click', (e) => {
                        const target = e.target;
                        if (target.classList.contains('fk-link')) {
                            e.preventDefault();
                            const tableName = target.getAttribute('data-table');
                            const recordName = target.getAttribute('data-record');
                            
                            vscode.postMessage({
                                type: 'openReference',
                                tableName: tableName,
                                recordName: recordName
                            });
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }

    /**
     * Get HTML for empty state
     */
    private getEmptyStateHtml(tableName: string): string {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>SWAT+ Database Browser</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                        padding: 20px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                    }
                    .empty-state {
                        text-align: center;
                        color: var(--vscode-descriptionForeground);
                        max-width: 500px;
                    }
                    .empty-state h2 {
                        color: var(--vscode-foreground);
                    }
                    .empty-state p {
                        margin: 10px 0;
                    }
                    .info-box {
                        background-color: var(--vscode-textBlockQuote-background);
                        border-left: 4px solid var(--vscode-textLink-foreground);
                        padding: 15px;
                        margin-top: 20px;
                        text-align: left;
                    }
                </style>
            </head>
            <body>
                <div class="empty-state">
                    <h2>📭 No Records Found</h2>
                    <p><strong>Table:</strong> ${this.formatTableName(tableName)}</p>
                    <p>This table exists but contains no data.</p>
                    <div class="info-box">
                        <strong>💡 Possible reasons:</strong>
                        <ul style="text-align: left; margin: 10px 0;">
                            <li>The table hasn't been populated with data yet</li>
                            <li>The filter criteria didn't match any records</li>
                            <li>The database may need to be regenerated from text files</li>
                        </ul>
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    /**
     * Get HTML for error state
     */
    private getErrorHtml(tableName: string, errorTitle: string, errorDetails: string, availableTables?: string[]): string {
        let tablesListHtml = '';
        if (availableTables && availableTables.length > 0) {
            tablesListHtml = `
                <div class="suggestion-box">
                    <strong>📋 Available Tables in Database:</strong>
                    <ul style="margin: 10px 0; max-height: 200px; overflow-y: auto;">
                        ${availableTables.map(t => `<li><code>${t}</code></li>`).join('')}
                    </ul>
                </div>
            `;
        }
        
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>SWAT+ Database Browser - Error</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                        padding: 20px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 100vh;
                    }
                    .error-state {
                        text-align: center;
                        max-width: 700px;
                        width: 100%;
                    }
                    .error-state h2 {
                        color: var(--vscode-errorForeground);
                    }
                    .error-details {
                        background-color: var(--vscode-inputValidation-errorBackground);
                        border: 1px solid var(--vscode-inputValidation-errorBorder);
                        padding: 15px;
                        margin-top: 20px;
                        text-align: left;
                        border-radius: 4px;
                    }
                    .suggestion-box {
                        background-color: var(--vscode-textBlockQuote-background);
                        border-left: 4px solid var(--vscode-textLink-foreground);
                        padding: 15px;
                        margin-top: 20px;
                        text-align: left;
                    }
                    code {
                        background-color: var(--vscode-textPreformat-background);
                        padding: 2px 6px;
                        border-radius: 3px;
                        font-family: var(--vscode-editor-font-family);
                        font-size: 0.9em;
                    }
                    ul {
                        padding-left: 20px;
                    }
                    li {
                        margin: 5px 0;
                    }
                </style>
            </head>
            <body>
                <div class="error-state">
                    <h2>⚠️ ${errorTitle}</h2>
                    <p><strong>Table:</strong> ${tableName}</p>
                    <div class="error-details">
                        <strong>Error Details:</strong>
                        <p>${errorDetails}</p>
                    </div>
                    ${tablesListHtml}
                    <div class="suggestion-box">
                        <strong>💡 Suggestions:</strong>
                        <ul style="margin: 10px 0;">
                            <li>Check if the database file exists and is accessible</li>
                            <li>Verify the table name matches one from the list above</li>
                            <li>Try regenerating the database from SWAT+ text files using the <strong>Import/Convert DB</strong> button</li>
                            <li>Make sure you've selected a SWAT+ dataset folder that contains a valid <code>project.db</code></li>
                        </ul>
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    /**
     * Format table name for display
     */
    private formatTableName(tableName: string): string {
        // Remove _hyd, _fld, etc. suffixes and format
        const baseName = tableName.replace(/_(hyd|fld|sol|lum|ini|wet|sno|plt|dtl|hru)$/, '');
        return baseName.split('_').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }
}
