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
                    case 'openFileWithHighlight':
                        if (message.fileName) {
                            this.openFileByName(message.fileName, message.highlightValue);
                        }
                        break;
                    case 'getFKRowData':
                        if (message.tableName && message.fkValue) {
                            this.sendFKRowData(message.tableName, message.fkValue, message.sourceFile, message.sourceLine);
                        }
                        break;
                    case 'openTableInNewTab':
                        if (message.tableName) {
                            this.openTableInNewTab(message.tableName);
                        }
                        break;
                    case 'openSingleTable':
                        if (message.tableName) {
                            this.openSingleTable(message.tableName);
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

    public static closeAll(): void {
        if (SwatTableViewerPanel.currentPanel) {
            SwatTableViewerPanel.currentPanel.dispose();
        }
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

    private sendFKRowData(tableName: string, fkValue: string, sourceFile?: string, sourceLine?: number) {
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
                lineNumber: targetRow.lineNumber,
                childRows: Array.isArray(targetRow.childRows) ? targetRow.childRows : [],
                sourceFile: sourceFile,
                sourceLine: sourceLine
            });
        } catch (error) {
            console.error('Failed to get FK row data', error);
        }
    }

    private openTableInNewTab(tableName: string) {
        // Create a new table viewer panel for this specific table
        SwatTableViewerPanel.createOrShow(this.indexer, tableName);
    }

    private openSingleTable(tableName: string) {
        SwatSingleTableViewerPanel.createOrShow(this.indexer, tableName);
    }

    private async openFileByName(fileName: string, highlightValue?: string) {
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
            SwatSingleTableViewerPanel.createOrShow(this.indexer, tableName, highlightValue);
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
            const txtInOutPath = this.indexer.getTxtInOutPath();
            const filePath = fileName && txtInOutPath ? path.join(txtInOutPath, fileName) : '';
            const fileBadge = schemaTable
                ? (filePath
                    ? `<a href="#" class="file-badge file-badge-link" data-action="open-input-file" data-file-path="${this._escapeHtml(filePath)}" title="Open ${this._escapeHtml(fileName)}">${this._escapeHtml(schemaTable.file_name)}</a>`
                    : `<span class="file-badge">${this._escapeHtml(schemaTable.file_name)}</span>`)
                : '';
            
            tablesHtml += `
                <div class="table-section" ${isFocused ? 'id="focused-table"' : ''}>
                    <h3 class="table-header ${collapsedClass}">
                        <button type="button" class="toggle-button" data-action="toggle-table" data-table-id="${this._escapeHtml(tableName)}" title="Toggle details">
                            <span class="toggle-icon">▼</span>
                        </button>
                        <a href="#" class="table-name-link" data-action="open-table" data-table-name="${this._escapeHtml(tableName)}" title="Open ${this._escapeHtml(tableName)}">
                            ${tableName}
                        </a>
                        <span class="badge">${rowCount} rows</span>
                        ${fileBadge}
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

        const columnMetadata = new Map<string, any>();
        if (schemaTable && schemaTable.columns) {
            schemaTable.columns.forEach((col: any) => {
                columnMetadata.set(col.name, col);
            });
        }

        const fkColumns = new Map<string, any>();
        if (schemaTable && schemaTable.foreign_keys && tableName !== 'file_cio') {
            schemaTable.foreign_keys.forEach((fk: any) => {
                fkColumns.set(fk.column, fk);
            });
        }

        const metadata = this.indexer.getMetadata();
        const fileName = this.indexer.getFileNameForTable(tableName);
        const filePointers = metadata?.file_pointer_columns?.[fileName || ''] || {};
        const fileMetadata = metadata?.file_metadata?.[fileName || ''];

        let descriptionHtml = '';
        if (fileMetadata && fileMetadata.description) {
            descriptionHtml = `<div class="file-description">${this._escapeHtml(fileMetadata.description)}</div>`;
        }

        const issueCounts = new Map<string, { column: string; targetTable: string; count: number }>();
        for (const row of rows) {
            for (const [column, fkInfo] of fkColumns.entries()) {
                const value = row.values[column];
                if (!value) {
                    continue;
                }
                const targetRow = this.indexer.resolveFKTarget(fkInfo.references.table, value);
                if (!targetRow) {
                    const issueKey = `${column}::${fkInfo.references.table}`;
                    const existing = issueCounts.get(issueKey);
                    if (existing) {
                        existing.count += 1;
                    } else {
                        issueCounts.set(issueKey, { column, targetTable: fkInfo.references.table, count: 1 });
                    }
                }
            }
        }

        const pointerColumns = typeof filePointers === 'object'
            ? Object.keys(filePointers).filter(key => key !== 'description')
            : [];
        const relationshipSummary = `
            <div class="relationship-summary">
                <div class="relationship-meta">
                    ${schemaTable ? `
                        <div><strong>Structure:</strong> ${this._escapeHtml(fileMetadata?.metadata_structure || 'Standard')}</div>
                        <div><strong>Title line:</strong> ${schemaTable.has_metadata_line ? 'Yes' : 'No'}</div>
                        <div><strong>Header line:</strong> ${schemaTable.has_header_line ? 'Yes' : 'No'}</div>
                        <div><strong>Data starts after line:</strong> ${schemaTable.data_starts_after}</div>
                        <div><strong>Table name:</strong> ${this._escapeHtml(schemaTable.table_name)}</div>
                        <div><strong>Relationships:</strong> ${fkColumns.size} FK column(s), ${pointerColumns.length} file pointer column(s)</div>
                    ` : ''}
                </div>
                ${(fileMetadata as any)?.format ? `
                    <div class="relationship-meta">
                        <div><strong>Format:</strong> ${this._escapeHtml(((fileMetadata as any).format?.type) || 'Standard')}</div>
                        ${((fileMetadata as any).format?.description) ? `<div>${this._escapeHtml((fileMetadata as any).format.description)}</div>` : ''}
                    </div>
                ` : ''}
            </div>
        `;

        const columnRows = (schemaTable?.columns || []).map((col: any) => {
            const fkInfo = fkColumns.get(col.name);
            const pointerConfig = typeof filePointers === 'object' ? filePointers[col.name] : undefined;
            const pointerText = pointerConfig
                ? (typeof pointerConfig === 'string'
                    ? pointerConfig
                    : pointerConfig.target_file || pointerConfig.description || '')
                : '';
            const notes = col.nullable ? 'nullable' : '';
            return `
                <tr>
                    <td>${this._escapeHtml(col.name)}</td>
                    <td>${this._escapeHtml(col.type)}</td>
                    <td>${col.is_primary_key ? 'Key' : (fkInfo ? `FK → ${this._escapeHtml(fkInfo.references.table)}.${this._escapeHtml(fkInfo.references.column)}` : '')}</td>
                    <td>${fkInfo ? this._escapeHtml(fkInfo.references.table) : ''}</td>
                    <td>${pointerText ? this._escapeHtml(pointerText) : ''}</td>
                    <td>${this._escapeHtml(notes)}</td>
                </tr>
            `;
        }).join('');

        const relationshipTable = `
            <div class="relationship-table">
                <div class="relationship-title">Input Schema Relationships</div>
                <table>
                    <thead>
                        <tr>
                            <th>Column</th>
                            <th>Type</th>
                            <th>Key / References</th>
                            <th>FK Target</th>
                            <th>File Pointer</th>
                            <th>Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${columnRows || '<tr><td colspan="6">No schema information available.</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;

        let issuesHtml = '';
        if (issueCounts.size > 0) {
            const issueItems = Array.from(issueCounts.values()).sort((a, b) => {
                const columnSort = a.column.localeCompare(b.column);
                if (columnSort !== 0) {
                    return columnSort;
                }
                return a.targetTable.localeCompare(b.targetTable);
            });
            issuesHtml = `
                <div class="issue-summary">
                    <div class="issue-title">Issues</div>
                    <ul>
                        ${issueItems.map(issue => `
                            <li>
                                Unresolved foreign key values in <strong>${this._escapeHtml(issue.column)}</strong>
                                → ${this._escapeHtml(issue.targetTable)} (${issue.count})
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
        }

        return `
            ${descriptionHtml}
            ${relationshipSummary}
            ${relationshipTable}
            ${issuesHtml}
        `;
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
            .toggle-button {
                border: none;
                background: transparent;
                cursor: pointer;
                padding: 0;
                display: inline-flex;
                align-items: center;
                color: inherit;
            }
            .toggle-button:hover .toggle-icon {
                opacity: 1;
            }
            .toggle-icon {
                font-size: 0.8em;
                transition: transform 0.2s;
                display: inline-block;
                width: 16px;
                opacity: 0.75;
            }
            .table-header.collapsed .toggle-icon {
                transform: rotate(-90deg);
            }
            .table-name-link {
                color: var(--vscode-textLink-foreground);
                text-decoration: none;
            }
            .table-name-link:hover {
                text-decoration: underline;
                color: var(--vscode-textLink-activeForeground);
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
            .file-badge-link {
                text-decoration: none;
                display: inline-flex;
                align-items: center;
            }
            .file-badge-link:hover {
                background-color: var(--vscode-button-hoverBackground);
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
            .issue-summary {
                padding: 12px 16px;
                border-bottom: 1px solid var(--vscode-panel-border);
                background-color: var(--vscode-sideBar-background);
            }
            .issue-title {
                font-weight: 600;
                margin-bottom: 6px;
            }
            .issue-summary ul {
                margin: 0;
                padding-left: 20px;
            }
            .issue-summary li {
                margin: 4px 0;
            }
            .table-wrapper {
                overflow-x: auto;
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
                position: sticky;
                top: 0;
                z-index: 10;
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
            .relationship-summary {
                padding: 12px 16px;
                margin-bottom: 12px;
                background-color: var(--vscode-sideBar-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 4px;
                display: grid;
                gap: 10px;
            }
            .relationship-meta {
                display: grid;
                gap: 4px;
                font-size: 0.9em;
                color: var(--vscode-descriptionForeground);
            }
            .relationship-table {
                margin-bottom: 12px;
                border: 1px solid var(--vscode-panel-border);
                border-radius: 4px;
                overflow: hidden;
            }
            .relationship-table table {
                width: 100%;
                border-collapse: collapse;
                font-size: 0.9em;
            }
            .relationship-table th,
            .relationship-table td {
                padding: 6px 10px;
                border-bottom: 1px solid var(--vscode-panel-border);
                text-align: left;
            }
            .relationship-table th {
                background-color: var(--vscode-editorGroupHeader-tabsBackground);
                font-weight: 600;
            }
            .relationship-title {
                padding: 10px 12px;
                background-color: var(--vscode-sideBar-background);
                font-weight: 600;
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            .empty-message {
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
                    case 'toggle-table':
                        event.preventDefault();
                        toggleTable(target.getAttribute('data-table-id'));
                        break;
                    case 'open-table':
                        event.preventDefault();
                        openTable(target.getAttribute('data-table-name'));
                        break;
                    case 'navigate':
                        event.preventDefault();
                        navigateToFile(target.getAttribute('data-file'), Number(target.getAttribute('data-line')));
                        break;
                    case 'open-input-file':
                        event.preventDefault();
                        openInputFile(target.getAttribute('data-file-path'));
                        break;
                    case 'open-file':
                        event.preventDefault();
                        openFileByName(target.getAttribute('data-file'));
                        break;
                    case 'toggle-fk':
                        event.preventDefault();
                        toggleFKPeek(target, target.getAttribute('data-fk-table'), target.getAttribute('data-fk-value'));
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

            function openTable(tableName) {
                if (!tableName) {
                    return;
                }
                vscode.postMessage({
                    command: 'openSingleTable',
                    tableName: tableName
                });
            }

            function openFileByName(fileName) {
                vscode.postMessage({
                    command: 'openFile',
                    fileName: fileName
                });
            }

            function openInputFile(filePath) {
                if (!filePath) {
                    return;
                }
                vscode.postMessage({
                    command: 'openInputFile',
                    file: filePath
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
                    vscode.postMessage({
                        command: 'getFKRowData',
                        tableName: tableName,
                        fkValue: fkValue,
                        sourceFile: sourceFile,
                        sourceLine: sourceLine
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
                    displayFKPeek(
                        message.tableName,
                        message.fkValue,
                        message.fileName,
                        message.columns,
                        message.rowData,
                        message.lineNumber,
                        message.childRows,
                        message.sourceFile,
                        message.sourceLine
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

            function displayFKPeek(tableName, fkValue, fileName, columns, rowData, lineNumber, childRows, sourceFile, sourceLine) {
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

                    const childTable = buildChildRowsTable(childRows, fileName);
                    if (childTable) {
                        peekDiv.appendChild(childTable);
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

            // Scroll to focused table on load
            document.addEventListener('DOMContentLoaded', function() {
                const focusedTable = document.getElementById('focused-table');
                document.querySelectorAll('.table-controls').forEach(control => {
                    const tableName = control.getAttribute('data-table') || '';
                    if (tableName) {
                        syncFilterMode(tableName);
                    }
                });
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
