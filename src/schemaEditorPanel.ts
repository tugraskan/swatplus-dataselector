/**
 * SWAT+ Schema Editor Panel
 *
 * Provides a webview panel to view, create, modify, and save SWAT+ schema JSON files.
 * Users can browse tables, edit column definitions, add/remove tables and columns,
 * and save the result as a new file or overwrite an existing one.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

/** Escapes HTML special characters to prevent XSS attacks */
function escapeHtml(text: string): string {
    if (text === null || text === undefined) { return ''; }
    const s = String(text);
    const map: { [key: string]: string } = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return s.replace(/[&<>"']/g, char => map[char]);
}

export class SchemaEditorPanel {
    public static currentPanel: SchemaEditorPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _schemaPath: string | undefined;
    private _schemaData: any;

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly context: vscode.ExtensionContext,
        schemaPath?: string
    ) {
        this._panel = panel;
        this._schemaPath = schemaPath;
        this._loadSchema();
        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'saveSchema':
                        await this._saveSchema(message.schemaJson, false);
                        break;
                    case 'saveSchemaAs':
                        await this._saveSchema(message.schemaJson, true);
                        break;
                    case 'openFile':
                        if (message.filePath) {
                            try {
                                const doc = await vscode.workspace.openTextDocument(message.filePath);
                                await vscode.window.showTextDocument(doc);
                            } catch { /* ignore */ }
                        }
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    /** Create or reveal the schema editor panel, loading the given schema file. */
    public static createOrShow(context: vscode.ExtensionContext, schemaPath?: string): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (SchemaEditorPanel.currentPanel) {
            SchemaEditorPanel.currentPanel._schemaPath = schemaPath;
            SchemaEditorPanel.currentPanel._loadSchema();
            SchemaEditorPanel.currentPanel._update();
            SchemaEditorPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'swatSchemaEditor',
            'SWAT+ Schema Editor',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [context.extensionUri]
            }
        );

        SchemaEditorPanel.currentPanel = new SchemaEditorPanel(panel, context, schemaPath);
    }

    private _loadSchema(): void {
        if (this._schemaPath && fs.existsSync(this._schemaPath)) {
            try {
                const raw = fs.readFileSync(this._schemaPath, 'utf-8');
                this._schemaData = JSON.parse(raw);
            } catch (err) {
                vscode.window.showErrorMessage(
                    `Failed to parse schema: ${err instanceof Error ? err.message : String(err)}`
                );
                this._schemaData = this._emptySchema();
            }
        } else {
            this._schemaData = this._emptySchema();
        }
    }

    private _emptySchema(): any {
        return {
            schema_version: '1.0.0',
            source: { generated_on: new Date().toISOString() },
            tables: {}
        };
    }

    private async _saveSchema(schemaJson: string, saveAs: boolean): Promise<void> {
        let targetPath: string | undefined;

        if (!saveAs && this._schemaPath) {
            // Overwrite only files in global storage (user-uploaded schemas)
            const globalSchemasDir = path.join(this.context.globalStorageUri.fsPath, 'schemas');
            if (this._schemaPath.startsWith(globalSchemasDir)) {
                targetPath = this._schemaPath;
            } else {
                // Built-in schemas are read-only — force Save As
                const answer = await vscode.window.showWarningMessage(
                    'Built-in schemas cannot be overwritten. Save as a new file?',
                    'Save As', 'Cancel'
                );
                if (answer !== 'Save As') { return; }
                saveAs = true;
            }
        }

        if (saveAs || !targetPath) {
            const defaultUri = this._schemaPath
                ? vscode.Uri.file(path.dirname(this._schemaPath))
                : this.context.globalStorageUri;

            const picked = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.joinPath(defaultUri, 'my-schema.json'),
                filters: { 'JSON Schema': ['json'] },
                title: 'Save SWAT+ Schema As'
            });
            if (!picked) { return; }
            targetPath = picked.fsPath;
        }

        try {
            // Validate JSON before saving
            const parsed = JSON.parse(schemaJson);
            if (!parsed.schema_version || !parsed.tables) {
                throw new Error('Schema must have "schema_version" and "tables" fields.');
            }
            const pretty = JSON.stringify(parsed, null, 2);
            const dir = path.dirname(targetPath);
            if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
            fs.writeFileSync(targetPath, pretty, 'utf-8');
            this._schemaPath = targetPath;
            vscode.window.showInformationMessage(`Schema saved: ${path.basename(targetPath)}`);
            this._panel.title = `SWAT+ Schema Editor — ${path.basename(targetPath)}`;
        } catch (err) {
            vscode.window.showErrorMessage(
                `Failed to save schema: ${err instanceof Error ? err.message : String(err)}`
            );
        }
    }

    private _update(): void {
        this._panel.title = this._schemaPath
            ? `SWAT+ Schema Editor — ${path.basename(this._schemaPath)}`
            : 'SWAT+ Schema Editor — New Schema';
        this._panel.webview.html = this._getHtml(this._panel.webview);
    }

    public dispose(): void {
        SchemaEditorPanel.currentPanel = undefined;
        this._panel.dispose();
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
    }

    // ── HTML ────────────────────────────────────────────────────────────────────

    private _getHtml(webview: vscode.Webview): string {
        const nonce = crypto.randomBytes(16).toString('base64');
        const tables = this._schemaData?.tables ?? {};
        const schemaVersion = this._schemaData?.schema_version ?? '';
        const schemaPath = this._schemaPath ?? '';
        const tableCount = Object.keys(tables).length;

        // Pre-serialise schema for inline script (safely escaped)
        const schemaJsonSafe = JSON.stringify(this._schemaData ?? {})
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026');

        // Build initial table list HTML for SSR (faster first paint)
        const tableListHtml = Object.keys(tables).sort().map(key => {
            const tbl = tables[key];
            const colCount = Array.isArray(tbl.columns) ? tbl.columns.length : 0;
            return `<div class="table-item" data-key="${escapeHtml(key)}" title="${escapeHtml(key)}">
                <span class="table-icon">📄</span>
                <div class="table-item-info">
                    <div class="table-item-name">${escapeHtml(key)}</div>
                    <div class="table-item-meta">${escapeHtml(tbl.table_name ?? '')} · ${colCount} col${colCount !== 1 ? 's' : ''}</div>
                </div>
            </div>`;
        }).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>SWAT+ Schema Editor</title>
    <style>
        * { box-sizing: border-box; }
        body {
            margin: 0; padding: 0;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        /* ── Toolbar ──────────────────────────────── */
        .toolbar {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            flex-shrink: 0;
            flex-wrap: wrap;
        }
        .toolbar-title {
            font-weight: 600;
            font-size: 13px;
            flex: 1 1 auto;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .toolbar-meta {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .btn {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 5px 10px;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-family: var(--vscode-font-family);
            white-space: nowrap;
        }
        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .btn-danger {
            background: var(--vscode-inputValidation-errorBackground, #5a1d1d);
            color: var(--vscode-errorForeground, #f48771);
            border: 1px solid var(--vscode-inputValidation-errorBorder, #be1100);
        }
        .btn-danger:hover { opacity: 0.85; }
        /* ── Layout ───────────────────────────────── */
        .layout {
            display: flex;
            flex: 1;
            overflow: hidden;
        }
        /* ── Left: table list ─────────────────────── */
        .left-panel {
            width: 240px;
            min-width: 160px;
            display: flex;
            flex-direction: column;
            border-right: 1px solid var(--vscode-panel-border);
            overflow: hidden;
        }
        .left-header {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px;
            background: var(--vscode-sideBarSectionHeader-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            flex-shrink: 0;
        }
        .left-header-title {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            flex: 1;
        }
        .badge {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 1px 6px;
            border-radius: 10px;
            font-size: 10px;
        }
        .search-box {
            margin: 6px;
            padding: 4px 8px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: var(--vscode-font-family);
            font-size: 12px;
            width: calc(100% - 12px);
        }
        .search-box:focus { outline: 1px solid var(--vscode-focusBorder); }
        .table-list {
            flex: 1;
            overflow-y: auto;
            padding: 4px 0;
        }
        .table-item {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 5px 10px;
            cursor: pointer;
            border-left: 2px solid transparent;
        }
        .table-item:hover  { background: var(--vscode-list-hoverBackground); }
        .table-item.active {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
            border-left-color: var(--vscode-focusBorder);
        }
        .table-icon { font-size: 13px; flex-shrink: 0; }
        .table-item-info { overflow: hidden; }
        .table-item-name { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .table-item-meta { font-size: 10px; color: var(--vscode-descriptionForeground); }
        .left-actions {
            display: flex;
            gap: 4px;
            padding: 6px;
            border-top: 1px solid var(--vscode-panel-border);
            flex-shrink: 0;
        }
        .left-actions .btn { flex: 1; justify-content: center; font-size: 11px; padding: 4px 6px; }
        /* ── Right: table editor ──────────────────── */
        .right-panel {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .right-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: var(--vscode-sideBarSectionHeader-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            flex-shrink: 0;
            flex-wrap: wrap;
        }
        .right-header-title {
            font-weight: 600;
            font-size: 13px;
            flex: 1;
        }
        .right-body {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
        }
        /* ── No-selection placeholder ────────────── */
        .placeholder {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            gap: 12px;
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
        }
        .placeholder svg { opacity: 0.3; }
        /* ── Table metadata fields ────────────────── */
        .meta-grid {
            display: grid;
            grid-template-columns: 170px 1fr;
            gap: 6px 12px;
            margin-bottom: 20px;
            align-items: center;
        }
        .meta-label {
            font-size: 12px;
            font-weight: 500;
            color: var(--vscode-descriptionForeground);
            text-align: right;
        }
        .meta-input {
            padding: 4px 8px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: var(--vscode-font-family);
            font-size: 12px;
        }
        .meta-input:focus { outline: 1px solid var(--vscode-focusBorder); }
        .meta-checkbox { width: 16px; height: 16px; cursor: pointer; }
        .meta-number { width: 80px; }
        /* ── Columns section ─────────────────────── */
        .section-title {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--vscode-sideBarSectionHeader-foreground);
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        /* ── Columns table ───────────────────────── */
        .columns-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            margin-bottom: 12px;
        }
        .columns-table th {
            text-align: left;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            color: var(--vscode-descriptionForeground);
            padding: 4px 8px;
            background: var(--vscode-sideBarSectionHeader-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            position: sticky;
            top: 0;
        }
        .col-row td {
            padding: 3px 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
            vertical-align: middle;
        }
        .col-row:hover td { background: var(--vscode-list-hoverBackground); }
        .col-input {
            width: 100%;
            padding: 2px 6px;
            border: 1px solid transparent;
            border-radius: 2px;
            background: transparent;
            color: var(--vscode-foreground);
            font-family: var(--vscode-font-family);
            font-size: 12px;
        }
        .col-input:focus {
            border-color: var(--vscode-focusBorder);
            background: var(--vscode-input-background);
            outline: none;
        }
        .col-select {
            padding: 2px 4px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: var(--vscode-font-family);
            font-size: 12px;
        }
        .col-checkbox { width: 14px; height: 14px; cursor: pointer; }
        .fk-target-row td { padding: 2px 8px 6px 8px; }
        .fk-target-fields {
            display: flex;
            gap: 6px;
            align-items: center;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .fk-target-fields .col-input { font-size: 11px; }
        .col-del-btn {
            background: none;
            border: none;
            cursor: pointer;
            color: var(--vscode-errorForeground);
            opacity: 0.5;
            padding: 2px 4px;
            font-size: 14px;
            line-height: 1;
        }
        .col-del-btn:hover { opacity: 1; }
        .col-move-btn {
            background: none;
            border: none;
            cursor: pointer;
            color: var(--vscode-foreground);
            opacity: 0.4;
            padding: 2px 2px;
            font-size: 12px;
            line-height: 1;
        }
        .col-move-btn:hover { opacity: 0.9; }
        /* ── Version input in toolbar ────────────── */
        .version-input {
            padding: 3px 8px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: var(--vscode-font-family);
            font-size: 12px;
            width: 90px;
        }
        .version-input:focus { outline: 1px solid var(--vscode-focusBorder); }
        /* ── Path display ─────────────────────────── */
        .path-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 400px;
        }
        /* ── JSON preview toggle ─────────────────── */
        #json-preview-section {
            margin-top: 16px;
        }
        #json-preview {
            width: 100%;
            height: 300px;
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 12px;
            background: var(--vscode-textCodeBlock-background);
            color: var(--vscode-foreground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 3px;
            padding: 8px;
            resize: vertical;
            display: none;
        }
        /* ── Scrollbar ───────────────────────────── */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--vscode-scrollbarSlider-hoverBackground); }
    </style>
</head>
<body>

<!-- ── Top Toolbar ─────────────────────────────────────────────── -->
<div class="toolbar">
    <div class="toolbar-title" id="toolbar-title">
        ${escapeHtml(this._schemaPath ? path.basename(this._schemaPath) : 'New Schema')}
    </div>
    <div class="toolbar-meta">v</div>
    <input class="version-input" id="schema-version" type="text" value="${escapeHtml(schemaVersion)}" placeholder="e.g. 2.0.0" title="Schema version">
    ${schemaPath ? `<span class="path-label" title="${escapeHtml(schemaPath)}">${escapeHtml(schemaPath)}</span>` : ''}
    <button class="btn btn-secondary" id="newSchemaBtn" title="Create a blank new schema">＋ New</button>
    <button class="btn btn-secondary" id="openSchemaBtn" title="Open an existing schema file">📂 Open</button>
    <button class="btn btn-primary" id="saveSchemaBtn" title="Save schema (overwrite if editable)">💾 Save</button>
    <button class="btn btn-primary" id="saveAsSchemaBtn" title="Save schema as a new file">💾 Save As…</button>
</div>

<!-- ── Main Layout ─────────────────────────────────────────────── -->
<div class="layout">

    <!-- Left panel: table list -->
    <div class="left-panel">
        <div class="left-header">
            <span class="left-header-title">Tables</span>
            <span class="badge" id="table-count-badge">${tableCount}</span>
        </div>
        <input class="search-box" id="table-search" type="text" placeholder="Filter tables…" autocomplete="off">
        <div class="table-list" id="table-list">
            ${tableListHtml || '<div style="padding:12px;font-size:12px;color:var(--vscode-descriptionForeground)">No tables yet</div>'}
        </div>
        <div class="left-actions">
            <button class="btn btn-secondary" id="addTableBtn" title="Add a new table">＋ Add Table</button>
            <button class="btn btn-danger" id="deleteTableBtn" title="Delete selected table" disabled>🗑</button>
        </div>
    </div>

    <!-- Right panel: editor -->
    <div class="right-panel">
        <div class="right-header" id="right-header">
            <span class="right-header-title" id="right-header-title">Select a table to edit</span>
            <button class="btn btn-secondary" id="addColumnBtn" title="Add a column" style="display:none">＋ Column</button>
            <button class="btn btn-secondary" id="toggleJsonBtn" title="Toggle raw JSON view" style="display:none">{ } JSON</button>
        </div>
        <div class="right-body" id="right-body">
            <div class="placeholder" id="placeholder">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 2H6C4.9 2 4 2.9 4 4v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z" stroke="currentColor" stroke-width="1" fill="none"/>
                    <path d="M14 2v6h6M8 13h8M8 17h5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
                </svg>
                <span>Select a table from the left to view and edit its definition</span>
                <span style="font-size:11px">Or click <strong>＋ Add Table</strong> to create one</span>
            </div>
            <div id="editor-area" style="display:none">
                <!-- Meta fields -->
                <div class="section-title">📋 Table Properties</div>
                <div class="meta-grid" id="meta-grid"></div>
                <!-- Columns -->
                <div class="section-title" style="margin-top:4px">
                    📊 Columns
                    <span class="badge" id="col-count-badge">0</span>
                </div>
                <table class="columns-table" id="columns-table">
                    <thead>
                        <tr>
                            <th style="width:24px"></th>
                            <th>Name</th>
                            <th>DB Column</th>
                            <th>Type</th>
                            <th style="width:50px" title="Nullable">Nul</th>
                            <th style="width:50px" title="Primary Key">PK</th>
                            <th style="width:50px" title="Foreign Key">FK</th>
                            <th style="width:28px"></th>
                        </tr>
                    </thead>
                    <tbody id="columns-tbody"></tbody>
                </table>
                <!-- JSON raw view -->
                <div id="json-preview-section">
                    <div class="section-title">{ } Raw JSON (table only)</div>
                    <textarea id="json-preview" readonly></textarea>
                </div>
            </div>
        </div>
    </div>
</div>

<script nonce="${nonce}">
(function() {
    'use strict';

    const vscode = acquireVsCodeApi();

    // ── State ──────────────────────────────────────────────────────────────────
    let schema = ${schemaJsonSafe};
    let selectedKey = null;   // currently selected table key (filename)
    let jsonPreviewVisible = false;

    // ── Helpers ────────────────────────────────────────────────────────────────
    function $(id) { return document.getElementById(id); }

    function escHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function getSchema() {
        // Sync the version field back into schema before returning
        schema.schema_version = $('schema-version').value.trim() || '1.0.0';
        return schema;
    }

    // ── Table list rendering ───────────────────────────────────────────────────
    function renderTableList(filter) {
        const list = $('table-list');
        const keys = Object.keys(schema.tables || {}).sort();
        const filtered = filter
            ? keys.filter(k => k.toLowerCase().includes(filter.toLowerCase()))
            : keys;

        if (filtered.length === 0) {
            list.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--vscode-descriptionForeground)">' +
                (keys.length === 0 ? 'No tables yet' : 'No match') + '</div>';
        } else {
            list.innerHTML = filtered.map(key => {
                const tbl = schema.tables[key];
                const colCount = Array.isArray(tbl.columns) ? tbl.columns.length : 0;
                return '<div class="table-item' + (key === selectedKey ? ' active' : '') + '" data-key="' + escHtml(key) + '" title="' + escHtml(key) + '">' +
                    '<span class="table-icon">📄</span>' +
                    '<div class="table-item-info">' +
                        '<div class="table-item-name">' + escHtml(key) + '</div>' +
                        '<div class="table-item-meta">' + escHtml(tbl.table_name || '') + ' · ' + colCount + ' col' + (colCount !== 1 ? 's' : '') + '</div>' +
                    '</div></div>';
            }).join('');
        }

        $('table-count-badge').textContent = keys.length;
        $('deleteTableBtn').disabled = !selectedKey;

        // Re-attach click handlers
        list.querySelectorAll('.table-item').forEach(item => {
            item.addEventListener('click', () => selectTable(item.dataset.key));
        });
    }

    // ── Column type options ────────────────────────────────────────────────────
    const COLUMN_TYPES = [
        'AutoField', 'BigAutoField', 'BigIntegerField', 'BooleanField',
        'CharField', 'DateField', 'DateTimeField', 'DecimalField',
        'FloatField', 'IntegerField', 'PositiveIntegerField',
        'PositiveSmallIntegerField', 'SmallIntegerField', 'TextField',
        'ForeignKeyField'
    ];

    function typeOptions(selected) {
        return COLUMN_TYPES.map(t =>
            '<option value="' + t + '"' + (t === selected ? ' selected' : '') + '>' + t + '</option>'
        ).join('');
    }

    // ── Table editor ───────────────────────────────────────────────────────────
    function selectTable(key) {
        selectedKey = key;
        renderTableList($('table-search').value);
        renderEditor();
        $('deleteTableBtn').disabled = false;
    }

    function renderEditor() {
        if (!selectedKey || !schema.tables[selectedKey]) {
            $('placeholder').style.display = '';
            $('editor-area').style.display = 'none';
            $('addColumnBtn').style.display = 'none';
            $('toggleJsonBtn').style.display = 'none';
            $('right-header-title').textContent = 'Select a table to edit';
            return;
        }

        const tbl = schema.tables[selectedKey];
        $('placeholder').style.display = 'none';
        $('editor-area').style.display = '';
        $('addColumnBtn').style.display = '';
        $('toggleJsonBtn').style.display = '';
        $('right-header-title').textContent = selectedKey;

        // Meta grid
        const metaGrid = $('meta-grid');
        metaGrid.innerHTML = [
            metaField('file_name', 'File Name', tbl.file_name || selectedKey, 'text'),
            metaField('table_name', 'Table Name', tbl.table_name || '', 'text'),
            metaField('model_class', 'Model Class', tbl.model_class || '', 'text'),
            metaField('source_file', 'Source File', tbl.source_file || '', 'text'),
            metaField('has_metadata_line', 'Has Metadata Line', tbl.has_metadata_line, 'checkbox'),
            metaField('has_header_line', 'Has Header Line', tbl.has_header_line, 'checkbox'),
            metaField('data_starts_after', 'Data Starts After', tbl.data_starts_after !== undefined ? tbl.data_starts_after : 2, 'number'),
        ].join('');

        // Attach change listeners for meta fields
        metaGrid.querySelectorAll('.meta-input, .meta-checkbox, .meta-number').forEach(el => {
            el.addEventListener('change', () => syncMetaToSchema());
        });

        // Columns
        const columns = Array.isArray(tbl.columns) ? tbl.columns : [];
        $('col-count-badge').textContent = columns.length;
        renderColumnsTable(columns);

        updateJsonPreview();
    }

    function metaField(name, label, value, type) {
        let input;
        if (type === 'checkbox') {
            input = '<input class="meta-checkbox" type="checkbox" id="meta-' + name + '" data-field="' + name + '"' + (value ? ' checked' : '') + '>';
        } else if (type === 'number') {
            input = '<input class="meta-input meta-number" type="number" id="meta-' + name + '" data-field="' + name + '" value="' + escHtml(String(value !== undefined ? value : '')) + '" min="0">';
        } else {
            input = '<input class="meta-input" type="text" id="meta-' + name + '" data-field="' + name + '" value="' + escHtml(String(value !== undefined && value !== null ? value : '')) + '">';
        }
        return '<div class="meta-label">' + escHtml(label) + '</div><div>' + input + '</div>';
    }

    function syncMetaToSchema() {
        if (!selectedKey || !schema.tables[selectedKey]) return;
        const tbl = schema.tables[selectedKey];
        document.querySelectorAll('[data-field]').forEach(el => {
            const field = el.dataset.field;
            if (!field) return;
            if (el.type === 'checkbox') {
                tbl[field] = el.checked;
            } else if (el.type === 'number') {
                const v = parseInt(el.value, 10);
                tbl[field] = isNaN(v) ? 0 : v;
            } else {
                tbl[field] = el.value;
            }
        });
        // Also sync file_name into the new key if changed
        const newFileName = tbl.file_name;
        if (newFileName && newFileName !== selectedKey) {
            schema.tables[newFileName] = tbl;
            delete schema.tables[selectedKey];
            selectedKey = newFileName;
            renderTableList($('table-search').value);
            $('right-header-title').textContent = selectedKey;
        }
        updateJsonPreview();
        // Refresh table list item to update column count label
        renderTableList($('table-search').value);
    }

    // ── Columns table ──────────────────────────────────────────────────────────
    function renderColumnsTable(columns) {
        const tbody = $('columns-tbody');
        tbody.innerHTML = columns.map((col, idx) => colRowHtml(col, idx)).join('');

        // Attach change / input listeners
        tbody.querySelectorAll('input, select').forEach(el => {
            el.addEventListener('change', () => syncColumnsToSchema());
            el.addEventListener('input', () => syncColumnsToSchema());
        });

        // Delete buttons
        tbody.querySelectorAll('.col-del-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx, 10);
                if (!isNaN(idx)) deleteColumn(idx);
            });
        });

        // Move up/down buttons
        tbody.querySelectorAll('.col-move-up').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx, 10);
                if (!isNaN(idx) && idx > 0) moveColumn(idx, idx - 1);
            });
        });
        tbody.querySelectorAll('.col-move-down').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx, 10);
                const cols = schema.tables[selectedKey]?.columns || [];
                if (!isNaN(idx) && idx < cols.length - 1) moveColumn(idx, idx + 1);
            });
        });
    }

    function colRowHtml(col, idx) {
        const isFk = col.is_foreign_key || col.type === 'ForeignKeyField';
        const fkTarget = col.fk_target || {};
        return '<tr class="col-row" data-idx="' + idx + '">' +
            '<td>' +
                '<button class="col-move-btn col-move-up" data-idx="' + idx + '" title="Move up">▲</button>' +
                '<button class="col-move-btn col-move-down" data-idx="' + idx + '" title="Move down">▼</button>' +
            '</td>' +
            '<td><input class="col-input" data-col="name" data-idx="' + idx + '" type="text" value="' + escHtml(col.name || '') + '" placeholder="field_name"></td>' +
            '<td><input class="col-input" data-col="db_column" data-idx="' + idx + '" type="text" value="' + escHtml(col.db_column || '') + '" placeholder="db_column"></td>' +
            '<td><select class="col-select" data-col="type" data-idx="' + idx + '">' + typeOptions(col.type || 'CharField') + '</select></td>' +
            '<td style="text-align:center"><input class="col-checkbox" type="checkbox" data-col="nullable" data-idx="' + idx + '"' + (col.nullable ? ' checked' : '') + '></td>' +
            '<td style="text-align:center"><input class="col-checkbox" type="checkbox" data-col="is_primary_key" data-idx="' + idx + '"' + (col.is_primary_key ? ' checked' : '') + '></td>' +
            '<td style="text-align:center"><input class="col-checkbox" type="checkbox" data-col="is_foreign_key" data-idx="' + idx + '"' + (isFk ? ' checked' : '') + '></td>' +
            '<td><button class="col-del-btn" data-idx="' + idx + '" title="Delete column">✕</button></td>' +
        '</tr>' +
        (isFk ? '<tr class="fk-target-row" data-idx="' + idx + '">' +
            '<td colspan="1"></td>' +
            '<td colspan="7"><div class="fk-target-fields">↳ FK target:' +
                '<input class="col-input" style="width:140px" data-col="fk_table" data-idx="' + idx + '" type="text" value="' + escHtml((fkTarget.table) || '') + '" placeholder="target table">' +
                '<span style="opacity:.6">col:</span>' +
                '<input class="col-input" style="width:80px" data-col="fk_column" data-idx="' + idx + '" type="text" value="' + escHtml((fkTarget.column) || '') + '" placeholder="col (id)">' +
            '</div></td>' +
        '</tr>' : '');
    }

    function syncColumnsToSchema() {
        if (!selectedKey || !schema.tables[selectedKey]) return;
        const tbl = schema.tables[selectedKey];
        const columns = tbl.columns || [];
        const maxIdx = Math.max(...Array.from(document.querySelectorAll('[data-idx]')).map(el => parseInt(el.dataset.idx, 10)), -1);

        for (let i = 0; i <= maxIdx; i++) {
            if (!columns[i]) continue;
            document.querySelectorAll('[data-idx="' + i + '"]').forEach(el => {
                const col = el.dataset.col;
                if (!col) return;
                if (col === 'nullable' || col === 'is_primary_key' || col === 'is_foreign_key') {
                    columns[i][col] = el.checked;
                    if (col === 'is_foreign_key') {
                        columns[i].type = el.checked ? 'ForeignKeyField' : (columns[i].type === 'ForeignKeyField' ? 'CharField' : columns[i].type);
                        // Re-render to show/hide FK target rows
                        setTimeout(() => renderColumnsTable(columns), 0);
                    }
                } else if (col === 'fk_table') {
                    if (!columns[i].fk_target) columns[i].fk_target = {};
                    columns[i].fk_target.table = el.value;
                } else if (col === 'fk_column') {
                    if (!columns[i].fk_target) columns[i].fk_target = {};
                    columns[i].fk_target.column = el.value;
                } else {
                    columns[i][col] = el.value;
                }
            });
        }
        tbl.columns = columns;
        $('col-count-badge').textContent = columns.length;
        updateJsonPreview();
        renderTableList($('table-search').value);
    }

    function deleteColumn(idx) {
        if (!selectedKey || !schema.tables[selectedKey]) return;
        const cols = schema.tables[selectedKey].columns || [];
        cols.splice(idx, 1);
        schema.tables[selectedKey].columns = cols;
        $('col-count-badge').textContent = cols.length;
        renderColumnsTable(cols);
        updateJsonPreview();
        renderTableList($('table-search').value);
    }

    function moveColumn(fromIdx, toIdx) {
        if (!selectedKey || !schema.tables[selectedKey]) return;
        const cols = schema.tables[selectedKey].columns || [];
        const [item] = cols.splice(fromIdx, 1);
        cols.splice(toIdx, 0, item);
        schema.tables[selectedKey].columns = cols;
        renderColumnsTable(cols);
        updateJsonPreview();
    }

    // ── JSON Preview ───────────────────────────────────────────────────────────
    function updateJsonPreview() {
        if (!jsonPreviewVisible || !selectedKey || !schema.tables[selectedKey]) return;
        try {
            $('json-preview').value = JSON.stringify(schema.tables[selectedKey], null, 2);
        } catch { /* ignore */ }
    }

    // ── Button handlers ────────────────────────────────────────────────────────
    $('newSchemaBtn').addEventListener('click', () => {
        if (!confirm('Create a new blank schema? Unsaved changes will be lost.')) return;
        schema = { schema_version: '1.0.0', source: { generated_on: new Date().toISOString() }, tables: {} };
        selectedKey = null;
        $('schema-version').value = '1.0.0';
        $('toolbar-title').textContent = 'New Schema';
        renderTableList('');
        renderEditor();
    });

    $('openSchemaBtn').addEventListener('click', () => {
        // Ask the host to let the user pick a file; handled via save flow reuse
        vscode.postMessage({ command: 'openFile', filePath: null });
    });

    $('saveSchemaBtn').addEventListener('click', () => {
        vscode.postMessage({ command: 'saveSchema', schemaJson: JSON.stringify(getSchema(), null, 2) });
    });

    $('saveAsSchemaBtn').addEventListener('click', () => {
        vscode.postMessage({ command: 'saveSchemaAs', schemaJson: JSON.stringify(getSchema(), null, 2) });
    });

    $('addTableBtn').addEventListener('click', () => {
        const name = prompt('Enter the file name for the new table (e.g. myfile.dat):');
        if (!name || !name.trim()) return;
        const key = name.trim();
        if (schema.tables[key]) {
            alert('A table with that file name already exists.');
            return;
        }
        schema.tables[key] = {
            file_name: key,
            table_name: key.replace(/\.\w+$/, '').replace(/[^a-zA-Z0-9]/g, '_'),
            model_class: '',
            source_file: '',
            has_metadata_line: false,
            has_header_line: true,
            data_starts_after: 1,
            columns: [
                { name: 'id', db_column: 'id', type: 'AutoField', nullable: false, is_primary_key: true, is_foreign_key: false }
            ]
        };
        renderTableList($('table-search').value);
        selectTable(key);
    });

    $('deleteTableBtn').addEventListener('click', () => {
        if (!selectedKey) return;
        if (!confirm('Delete table "' + selectedKey + '"? This cannot be undone.')) return;
        delete schema.tables[selectedKey];
        selectedKey = null;
        renderTableList($('table-search').value);
        renderEditor();
    });

    $('addColumnBtn').addEventListener('click', () => {
        if (!selectedKey || !schema.tables[selectedKey]) return;
        const cols = schema.tables[selectedKey].columns || [];
        cols.push({ name: 'new_field', db_column: 'new_field', type: 'CharField', nullable: true, is_primary_key: false, is_foreign_key: false });
        schema.tables[selectedKey].columns = cols;
        $('col-count-badge').textContent = cols.length;
        renderColumnsTable(cols);
        updateJsonPreview();
        renderTableList($('table-search').value);
    });

    $('toggleJsonBtn').addEventListener('click', () => {
        jsonPreviewVisible = !jsonPreviewVisible;
        const preview = $('json-preview');
        preview.style.display = jsonPreviewVisible ? 'block' : 'none';
        $('toggleJsonBtn').textContent = jsonPreviewVisible ? '✕ Hide JSON' : '{ } JSON';
        if (jsonPreviewVisible) updateJsonPreview();
    });

    $('table-search').addEventListener('input', () => {
        renderTableList($('table-search').value);
    });

    // ── Initial render ─────────────────────────────────────────────────────────
    renderTableList('');
    if (selectedKey) renderEditor();

})();
</script>
</body>
</html>`;
    }
}
