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
            vscode.window.showErrorMessage(`Error loading table: ${error}`);
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
                    }
                </style>
            </head>
            <body>
                <div class="empty-state">
                    <h2>No records found</h2>
                    <p>Table: ${tableName}</p>
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
