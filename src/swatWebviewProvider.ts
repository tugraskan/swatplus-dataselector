import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs';

/**
 * Escapes HTML special characters to prevent XSS attacks
 */
function escapeHtml(text: string): string {
    const s = text == null ? '' : String(text);
    const map: { [key: string]: string } = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return s.replace(/[&<>"']/g, char => map[char]);
}

function normalizeToPath(value: any): string | undefined {
    if (value == null) {return undefined;}
    if (typeof value === 'string') {return value;}
    if (typeof value === 'object') {
        if (typeof (value as any).path === 'string') {return (value as any).path;}
        if (typeof (value as any).fsPath === 'string') {return (value as any).fsPath;}
        if (typeof (value as any).uri === 'string') {return (value as any).uri;}
        if ((value as any).toString && typeof (value as any).toString === 'function') {return (value as any).toString();}
    }
    return String(value);
}

export class SwatDatasetWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'swatDatasetView';

    private _view?: vscode.WebviewView;
    private selectedDataset: string | undefined;
    private recentDatasets: string[] = [];
    private selectedDatabase: string | undefined;

    constructor(private readonly context: vscode.ExtensionContext) {
        // Load recent datasets from storage
        const raw = this.context.globalState.get('recentDatasets', []) || [];
        try {
            this.recentDatasets = (Array.isArray(raw) ? raw : []).map(item => normalizeToPath(item)).filter(Boolean) as string[];
        } catch (e) {
            this.recentDatasets = [];
        }
        // restore selected database if persisted
        try {
            const db = this.context.globalState.get('selectedDatabase');
            if (db && typeof db === 'string') this.selectedDatabase = db;
        } catch (e) {}
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        try {
            console.log('SWAT: resolveWebviewView called');
            this._view = webviewView;

            webviewView.webview.options = {
                enableScripts: true,
                localResourceRoots: [this.context.extensionUri]
            };

            webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

            // Handle messages from the webview
            webviewView.webview.onDidReceiveMessage(data => {
                console.log('SWAT: webview message received', data);
                try {
                    if (!data || !data.type) {
                        return;
                    }
                    switch (data.type) {
                        case 'selectDataset':
                            vscode.commands.executeCommand('swat-dataset-selector.selectDataset');
                            break;
                        case 'importTextFiles':
                            vscode.commands.executeCommand('swat-dataset-selector.importTextFiles');
                            break;
                        case 'selectAndDebug':
                            vscode.commands.executeCommand('swat-dataset-selector.selectAndDebug');
                            break;
                        case 'launchDebug':
                            vscode.commands.executeCommand('swat-dataset-selector.launchDebug');
                            break;
                        case 'selectRecentDataset':
                            if (data.path && typeof data.path === 'string') {
                                this.setSelectedDataset(data.path);
                                vscode.window.showInformationMessage(`SWAT+ Dataset folder selected: ${data.path}`);
                            }
                            break;
                        case 'openFile':
                            if (data.path && typeof data.path === 'string') {
                                // Ask host to open the file in an editor
                                vscode.commands.executeCommand('swat-dataset-selector.openFile', data.path);
                            }
                            break;
                        case 'setSelectedDatabase':
                            if (data.path && typeof data.path === 'string') {
                                vscode.commands.executeCommand('swat-dataset-selector.setSelectedDatabase', data.path);
                            }
                            break;
                        case 'openDbWithViewer':
                            if (data.path && typeof data.path === 'string') {
                                vscode.commands.executeCommand('swat-dataset-selector.openDbWithViewer', data.path);
                            }
                            break;
                        case 'closeFile':
                            if (data.path && typeof data.path === 'string') {
                                vscode.commands.executeCommand('swat-dataset-selector.closeFile', data.path);
                            }
                            break;
                        case 'closeAllDatasetFiles':
                            // close all open files for the currently selected dataset
                            vscode.commands.executeCommand('swat-dataset-selector.closeAllDatasetFiles', this.selectedDataset);
                            break;
                        case 'removeRecentDataset':
                            if (data.path && typeof data.path === 'string') {
                                this.removeRecentDataset(data.path);
                            }
                            break;
                        default:
                            console.warn('swat webview unknown message', data);
                    }
                } catch (msgErr) {
                    console.error('Error handling webview message', msgErr);
                    vscode.window.showErrorMessage('SWAT+ Dataset webview message handler error: ' + (msgErr instanceof Error ? msgErr.message : String(msgErr)));
                }
            });
        } catch (err) {
            console.error('Failed to resolve SWAT dataset webview', err);
            vscode.window.showErrorMessage('Failed to load SWAT+ Dataset view: ' + (err instanceof Error ? err.message : String(err)));
        }
    }

    public setSelectedDataset(dataset: string): void {
        const p = normalizeToPath(dataset);
        if (!p) {
            return;
        }
        this.selectedDataset = p;

        // Add to recent datasets
        this.recentDatasets = [p, ...this.recentDatasets.filter(d => d !== p)].slice(0, 10);
        this.context.globalState.update('recentDatasets', this.recentDatasets);

        this._updateWebview();
    }

    public setSelectedDatabase(dbPath: string): void {
        const p = normalizeToPath(dbPath);
        if (!p) return;
        this.selectedDatabase = p;
        try { this.context.globalState.update('selectedDatabase', this.selectedDatabase); } catch (e) {}
        this._updateWebview();
    }

    public getSelectedDatabase(): string | undefined {
        return this.selectedDatabase;
    }

    public getSelectedDataset(): string | undefined {
        return this.selectedDataset;
    }

    private removeRecentDataset(datasetPath: string): void {
        this.recentDatasets = this.recentDatasets.filter(d => d !== datasetPath);
        this.context.globalState.update('recentDatasets', this.recentDatasets);
        this._updateWebview();
    }

    private _updateWebview(): void {
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Generate nonce for CSP
        const nonce = crypto.randomBytes(16).toString('base64');

        const svgs: { [key: string]: string } = {
            folder: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 4C1.44772 4 1 4.44772 1 5V12C1 12.5523 1.44772 13 2 13H14C14.5523 13 15 12.5523 15 12V6C15 5.44772 14.5523 5 14 5H8L6 3H2Z" fill="currentColor"/></svg>`,
            info: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1"/><rect x="7.2" y="6" width="0.8" height="4" fill="currentColor"/><rect x="7.2" y="4" width="0.8" height="0.8" fill="currentColor"/></svg>`,
            chevronDown: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
            history: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 3v5l3 1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.05 6.05A6 6 0 1 0 8 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
            close: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
            debugPlay: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 3v18l15-9L5 3z" fill="currentColor"/></svg>`,
            debugAlt: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2v20M2 12h20" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
            folderOpened: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 5h4l2 2h6v6H2z" fill="currentColor"/></svg>`,
            file: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" stroke-width="1" fill="none"/></svg>`,
            star: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 .587l3.668 7.431L23 9.75l-5.5 5.367L18.335 24 12 20.202 5.665 24l1.835-8.883L1 9.75l7.332-1.732L12 .587z" fill="currentColor"/></svg>`
        };
        let combinedHtml = '';
        if (!this.selectedDataset) {
            combinedHtml = `<div class="section">
                <div class="section-header">
                    ${svgs.folder}
                    <span class="section-title">Selected dataset: </span>
                    <div class="dataset-header-path">No dataset selected</div>
                </div>
                <div class="no-dataset">
                    ${svgs.info}
                    <span>No dataset selected</span>
                </div>
               </div>`;
        } else {
            try {
                const fileCioPath = path.join(this.selectedDataset, 'File.cio');
                // If File.cio is missing, show a friendly message instead of the directory listing
                if (!fs.existsSync(fileCioPath)) {
                    combinedHtml = `<div class="selected-window">
                        <div class="selected-window-header">
                            <div class="selected-window-header-left">
                                ${svgs.folder}
                                <div style="display:flex;flex-direction:column;gap:2px;width:100%">
                                    <span class="section-title">Selected dataset:</span>
                                    <div class="dataset-header-info">
                                        <div class="dataset-header-name">${escapeHtml(path.basename(this.selectedDataset))}</div>
                                    </div>
                                </div>
                            </div>
                            <button class="icon-button close-txt-btn close-all-btn" title="Close all files">
                                ${svgs.close}
                            </button>
                        </div>
                        <div class="selected-window-path-scroll" title="${escapeHtml(this.selectedDataset)}">
                            <div class="dataset-header-path">${escapeHtml(this.selectedDataset)}</div>
                        </div>
                        <div class="selected-window-body">
                            <div class="section-content" id="selected-files-content">
                                <div class="no-dataset">
                                    ${svgs.info}
                                    <span>No file.cio found in dir</span>
                                </div>
                            </div>
                        </div>
                       </div>`;
                } else {
                    const entries = fs.existsSync(this.selectedDataset) ? fs.readdirSync(this.selectedDataset, { withFileTypes: true }) : [];
                    const itemsHtml = entries.map(ent => {
                    const full = path.join(this.selectedDataset || '', ent.name);
                    const ext = path.extname(ent.name).toLowerCase();
                    const isDb = ext === '.db' || ext === '.sqlite' || ext === '.sqlite3';
                    const icon = ent.isDirectory() ? svgs.folder : (isDb ? `<span class="db-badge">DB</span>` : svgs.file);
                    const selectedClass = (this.selectedDatabase && this.selectedDatabase === full) ? ' selected-db' : '';
                    return `
                            <div class="txt-item${selectedClass}" data-path="${escapeHtml(full)}" data-ext="${escapeHtml(ext)}" data-isdb="${isDb ? '1' : ''}">
                                    <button class="icon-button txt-close-btn" data-path="${escapeHtml(full)}" title="Close file">
                                        ${svgs.close}
                                    </button>
                                    ${icon}
                                    <div class="recent-item-info">
                                        <div class="recent-item-name">${escapeHtml(ent.name)}</div>
                                    </div>
                                </div>
                        `;
                }).join('');

                    combinedHtml = `<div class="selected-window">
                        <div class="selected-window-header">
                            <div class="selected-window-header-left">
                                ${svgs.folder}
                                <div style="display:flex;flex-direction:column;gap:2px;width:100%">
                                    <span class="section-title">Selected dataset:</span>
                                    <div class="dataset-header-info">
                                        <div class="dataset-header-name">${escapeHtml(path.basename(this.selectedDataset))}</div>
                                    </div>
                                </div>
                            </div>
                            <button class="icon-button close-txt-btn close-all-btn" title="Close all files">
                                ${svgs.close}
                            </button>
                        </div>
                        <!-- Dedicated horizontal scroller for the full dataset path -->
                        <div class="selected-window-path-scroll" title="${escapeHtml(this.selectedDataset)}">
                            <div class="dataset-header-path">${escapeHtml(this.selectedDataset)}</div>
                        </div>
                        <div class="selected-window-body">
                            <div class="section-content" id="selected-files-content">
                                ${itemsHtml}
                            </div>
                            <div class="filter-toolbar" id="selected-filter-toolbar">
                                <label><input type="checkbox" id="filter-model" class="filter-checkbox" data-cat="model"> Model setup/control (.bsn, .con, .ini)</label>
                                <label><input type="checkbox" id="filter-climate" class="filter-checkbox" data-cat="climate"> Climate/forcing (.cli, .pcp, .tmp, .wnd)</label>
                                <label><input type="checkbox" id="filter-land" class="filter-checkbox" data-cat="land"> Land/HRU definitions (.lum, .ele, .sol, .hru)</label>
                                <label><input type="checkbox" id="filter-mgmt" class="filter-checkbox" data-cat="mgmt"> Management/operations (.ops, .sch)</label>
                                <label><input type="checkbox" id="filter-routing" class="filter-checkbox" data-cat="routing"> Routing/structures (.str, .hyd, .swf, .res)</label>
                                <div class="filter-toggle">
                                    <div>No Outputs (exclude .txt, .out)</div>
                                    <label class="toggle"><input type="checkbox" id="filter-no-outputs" class="filter-checkbox" data-cat="no-outputs" checked /> <span class="slider"></span></label>
                                </div>
                            </div>
                        </div>
                       </div>`;
                }
            } catch (e) {
                combinedHtml = `<div class="section">
                    <div class="section-header">
                        ${svgs.folder}
                        <span class="section-title">Selected dataset</span>
                    </div>
                    <div class="no-dataset">
                        ${svgs.info}
                        <span>Error reading dataset folder</span>
                    </div>
                   </div>`;
            }
        }

        // If a project DB exists inside the selected dataset, show a small 'Selected Database' section
        let dbHtml = '';
        if (this.selectedDataset) {
            try {
                const dbPath = path.join(this.selectedDataset, 'project.db');
                if (fs.existsSync(dbPath)) {
                    dbHtml = `
                    <div class="section">
                        <div class="section-header">
                            ${svgs.info}
                            <span class="section-title">Selected Database</span>
                            <span class="badge">DB</span>
                        </div>
                        <div class="section-content">
                            <div style="display:flex;flex-direction:column;gap:8px;padding:8px 4px">
                                <div id="selectedDbPath" class="dataset-path" data-path="${escapeHtml(dbPath)}" title="${escapeHtml(dbPath)}">${escapeHtml(dbPath)}</div>
                                <div style="display:flex;gap:8px">
                                    <button class="action-button secondary" id="openDbBtn" data-path="${escapeHtml(dbPath)}">Open DB</button>
                                    <button class="action-button secondary" id="copyDbBtn" data-path="${escapeHtml(dbPath)}">Copy Path</button>
                                </div>
                            </div>
                        </div>
                    </div>`;
                }
            } catch (e) {
                // ignore filesystem errors and don't show DB block
            }
        }

        const recentDatasetsHtml = this.recentDatasets.length > 0
            ? `<div class="section">
                <div class="section-header collapsible" data-section="recent">
                    ${svgs.chevronDown}
                    ${svgs.history}
                    <span class="section-title">Recent Datasets</span>
                    <span class="badge">${this.recentDatasets.length}</span>
                </div>
                <div class="section-content" id="recent-content">
                    ${this.recentDatasets.slice(0, 5).map(dataset => `
                        <div class="recent-item" data-path="${escapeHtml(dataset)}">
                            ${svgs.folder}
                            <div class="recent-item-info">
                                <div class="recent-item-name">${escapeHtml(path.basename(dataset))}</div>
                                <div class="recent-item-path" title="${escapeHtml(dataset)}">${escapeHtml(dataset)}</div>
                            </div>
                            <button class="icon-button remove-btn" data-path="${escapeHtml(dataset)}" title="Remove from recent">
                                ${svgs.close}
                            </button>
                        </div>
                    `).join('')}
                </div>
               </div>`
            : '';

        // The combinedHtml above now replaces the separate TXTINOUT block.

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
    <title>SWAT+ Dataset Selector</title>
    <style>
        :root {
            --container-padding: 12px;
            --section-spacing: 16px;
            --button-padding: 8px 12px;
        }

        body {
            padding: 0;
            margin: 0;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
        }

        .container {
            padding: var(--container-padding);
        }

        /* Section styles */
        .section {
            margin-bottom: var(--section-spacing);
        }

        .section-header {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 0;
            font-weight: 600;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--vscode-sideBarSectionHeader-foreground);
            background-color: var(--vscode-sideBarSectionHeader-background);
            border-radius: 4px;
            padding: 6px 8px;
            margin-bottom: 8px;
        }

        .section-header.collapsible {
            cursor: pointer;
            user-select: none;
        }

        .section-header.collapsible:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .collapse-icon {
            transition: transform 0.2s ease;
        }

        .section-header.collapsed .collapse-icon {
            transform: rotate(-90deg);
        }

        .section-content.hidden {
            display: none;
        }

        .badge {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 10px;
            margin-left: auto;
        }

        /* Button styles */
        .actions {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-bottom: var(--section-spacing);
        }

        .action-button {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: var(--button-padding);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: background-color 0.1s ease;
        }

        .action-button.primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .action-button.primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .action-button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .action-button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .action-button.disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .action-button.disabled:hover {
            background-color: var(--vscode-button-secondaryBackground);
        }

        .button-row {
            display: flex;
            gap: 8px;
        }

        .button-row .action-button {
            flex: 1;
        }

        /* Restyle specific buttons: Select Folder (blue) and Debug (green) */
        #selectDatasetBtn {
            background-color: #0A84FF;
            color: white;
        }

        #launchDebugBtn {
            background-color: #16a34a;
            color: white;
        }

        /* Selected dataset */
        .selected-dataset {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 10px 12px;
            border-left: 3px solid var(--vscode-activityBarBadge-background);
        }

        .dataset-name {
            font-weight: 600;
            font-size: 13px;
            margin-bottom: 4px;
            color: var(--vscode-foreground);
        }

        .dataset-path {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            word-break: break-all;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
        }

        .no-dataset {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px;
            background-color: var(--vscode-editor-background);
            border: 1px dashed var(--vscode-panel-border);
            border-radius: 6px;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }

        /* Selected-window: visually distinct subsection that contains header and scrollable body */
        .selected-window {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 0 1px 0 rgba(0,0,0,0.04);
        }

        .selected-window-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 8px 10px;
            background-color: var(--vscode-sideBarSectionHeader-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            position: relative;
        }

        .selected-window-header-left {
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
            flex: 1;
        }

        .dataset-header-path {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            white-space: nowrap; /* keep path on a single line */
            overflow: hidden;
            text-overflow: ellipsis;
            display: inline-block;
        }

        .selected-window-path-scroll {
            overflow-x: auto;
            overflow-y: hidden;
            padding: 6px 10px;
            background-color: var(--vscode-editor-background);
            border-top: 1px solid var(--vscode-panel-border);
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .selected-window-path-scroll .dataset-header-path {
            display: inline-block;
            min-width: 100%;
            white-space: nowrap;
        }

        .dataset-header-name {
            font-weight: 700;
            font-size: 12px;
            color: var(--vscode-foreground);
        }

        .dataset-header-info { max-width: calc(100% - 120px); }

        .close-all-btn {
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            background-color: #b91c1c;
            color: white;
            border: none;
            padding: 8px 10px;
            border-radius: 6px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            z-index: 50;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            opacity: 1 !important; /* ensure always visible even though .icon-button defaults to hidden */
            pointer-events: auto !important;
        }

        .dataset-header-path-wrap {
            overflow-x: hidden; /* hide header scrollbar; files area controls scrolling */
            max-width: 100%;
        }

        .selected-window-body {
            padding: 8px;
            max-height: 432px; /* increased 20% from 360px */
            display: flex;
            flex-direction: column;
            overflow: hidden;
            position: relative; /* for absolute overlay positioning */
        }

        /* Per-row close button: positioned at the right edge of each row */
        .txt-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 10px;
            border-radius: 4px;
            cursor: pointer;
            transition: background-color 0.1s ease;
            justify-content: flex-start;
        }

        .txt-item .recent-item-info { flex: 1; min-width: 0; }

        .txt-close-btn {
            opacity: 1 !important;
            pointer-events: auto !important;
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            margin-right: 8px;
            margin-left: 0;
        }

        /* Recent items */
        .recent-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 10px;
            border-radius: 4px;
            cursor: pointer;
            transition: background-color 0.1s ease;
        }

        .txt-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 10px;
            border-radius: 4px;
            cursor: pointer;
            transition: background-color 0.1s ease;
            min-width: 480px; /* allow horizontal scrolling when names/paths are long */
        }

        /* Selected files specific content area — make scrollable when large */
        #selected-files-content {
            overflow-x: auto; /* horizontal scrollbar used to scroll header path */
            overflow-y: auto;
            padding-right: 6px;
            white-space: normal;
            flex: 1 1 auto;
        }

        /* Recent fixed height for ~4 items (reduced ~20%) */
        #recent-content {
            height: 136px; /* ~4 items, slightly smaller */
            overflow: auto;
        }

        /* Close button in section header */
        .close-txt-btn {
            margin-left: auto;
            opacity: 0.9;
            display: inline-flex;
        }

        /* Divider visuals for draggable and toggle dividers */
        .divider {
            height: 10px;
            margin: 6px 0;
            position: relative;
            display: flex;
            align-items: center;
        }

        /* thin visible rule centered in the divider */
        .divider::before {
            content: '';
            position: absolute;
            left: 8px;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            height: 1px;
            background-color: var(--vscode-panel-border);
            opacity: 0.9;
            border-radius: 1px;
        }

        /* small grab handle like source control */
        .divider .handle {
            width: 20px;
            height: 6px;
            border-radius: 3px;
            background: linear-gradient(180deg, rgba(128,128,128,0.12), rgba(0,0,0,0.02));
            margin: 0 auto;
            z-index: 2;
        }

        .divider:hover .handle { background-color: rgba(128,128,128,0.18); }

        .divider-toggle { cursor: default; }
        .drag-divider { cursor: row-resize; }

        /* Middle area: contains Recent and TXTINOUT; constrained height so sections don't overlap */
        .middle {
            display: flex;
            flex-direction: column;
            overflow: hidden;
            /* leave space for header/actions and help-text; adjust if needed */
            max-height: calc(100vh - 220px);
        }

        /* section-content becomes a flexible pane with its own scroll */
        .section-content {
            overflow: auto;
            height: auto;
        }

        .recent-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .recent-item-info {
            flex: 1;
            min-width: 0;
        }

        .recent-item-name {
            font-size: 12px;
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .db-badge {
            display: inline-block;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
        }

        .txt-item.selected-db {
            outline: 2px solid var(--vscode-list-activeSelectionBackground);
            background-color: var(--vscode-list-hoverBackground);
        }

        .recent-item-path {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }


        .icon-button {
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            color: var(--vscode-foreground);
            opacity: 0; /* default hidden for general toolbar buttons */
            transition: opacity 0.1s ease, background-color 0.1s ease;
        }

        /* Always show per-file close buttons and recent remove buttons */
        .txt-close-btn, .remove-btn {
            opacity: 1 !important;
            display: inline-flex;
        }

        .recent-item:hover .icon-button {
            opacity: 0.7;
        }

        .icon-button:hover {
            opacity: 1 !important;
            background-color: var(--vscode-toolbar-hoverBackground);
        }

        .remove-btn:hover {
            color: var(--vscode-errorForeground);
        }

        /* Codicon styles - using VS Code's built-in icons */
        .codicon {
            font-family: 'codicon';
            font-size: 16px;
        }

        .codicon-folder::before { content: "\\eb60"; }
        .codicon-folder-active::before { content: "\\eb63"; }
        .codicon-folder-opened::before { content: "\\eb62"; }
        .codicon-debug-start::before { content: "\\eb91"; }
        .codicon-debug-alt::before { content: "\\eb92"; }
        .codicon-history::before { content: "\\ea82"; }
        .codicon-close::before { content: "\\ea76"; }
        .codicon-info::before { content: "\\ea74"; }
        .codicon-chevron-down::before { content: "\\eab4"; }
        .codicon-add::before { content: "\\ea60"; }

        /* Divider */
        .divider {
            height: 1px;
            background-color: var(--vscode-panel-border);
            margin: var(--section-spacing) 0;
        }

        /* Help section */
        .help-text {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            line-height: 1.5;
            padding: 8px 0;
        }

        .help-text a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
        }

        .help-text a:hover {
            text-decoration: underline;
        }

        /* Filter toolbar at the bottom of the selected-window */
        .filter-toolbar {
            display: flex;
            gap: 12px;
            align-items: center;
            padding: 8px 10px;
            border-top: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-editor-background);
            flex-wrap: wrap;
        }

        .filter-toolbar label {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            color: var(--vscode-foreground);
        }

        .filter-toggle {
            display: flex;
            align-items: center;
            gap: 10px;
            width: 100%;
            justify-content: space-between;
            margin-top: 6px;
            padding-top: 6px;
            border-top: 1px dashed var(--vscode-panel-border);
        }

        /* simple toggle switch */
        .toggle { display: inline-block; position: relative; width: 46px; height: 24px; }
        .toggle input { display: none; }
        .toggle .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: var(--vscode-input-background); border-radius: 24px; border: 1px solid var(--vscode-panel-border); }
        .toggle .slider:before { content: ''; position: absolute; height: 20px; width: 20px; left: 2px; top: 1px; background: var(--vscode-sideBar-background); border-radius: 50%; transition: transform 0.12s ease; }
        .toggle input:checked + .slider { background: var(--vscode-button-background); border-color: var(--vscode-button-hoverBackground); }
        .toggle input:checked + .slider:before { transform: translateX(22px); }

        .filter-checkbox {
            width: 14px;
            height: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="actions">
            <div class="button-row">
                <button class="action-button secondary" id="selectDatasetBtn">
                    ${svgs.folderOpened}
                    Select Folder
                </button>
                <button class="action-button primary${!this.selectedDataset ? ' disabled' : ''}" id="importConvertBtn" ${!this.selectedDataset ? 'disabled' : ''} title="Import/Convert dataset to project DB">
                    ${svgs.star}
                    Import / Convert DB
                </button>
                <button class="action-button secondary${!this.selectedDataset ? ' disabled' : ''}" id="launchDebugBtn" ${!this.selectedDataset ? 'disabled' : ''}>
                    ${svgs.debugPlay}
                    Debug
                </button>
            </div>
        </div>

        <div class="divider"></div>

        <div class="middle">
            ${recentDatasetsHtml}

            <!-- Divider separating Recent Datasets from Selected dataset window -->
            <div class="divider" id="recent-divider" title="Recent / Selected separator"><div class="handle"></div></div>

            ${combinedHtml}
            ${dbHtml}
        </div>

        <div class="help-text">
            Select a SWAT+ dataset folder to use as the working directory for debugging. 
            The debug session will use CMake Tools to launch the target.
        </div>
    </div>

    <script nonce="${nonce}">
        (function() {
            document.addEventListener('DOMContentLoaded', () => {
                try {
                    const vscode = acquireVsCodeApi();
                    // Wrapper that logs outgoing messages so we can trace them in the webview console
                    const swatHost = {
                        postMessage: (msg) => {
                            try { console.log('SWAT webview: sending', msg); } catch (e) { }
                            try { vscode.postMessage(msg); } catch (e) { try { console.error('SWAT webview: failed to postMessage', e); } catch (ee) {} }
                        }
                    };

                    try { console.log('SWAT webview: DOMContentLoaded - init'); } catch (e) { }

                    // Log any messages sent from the extension host into the webview
                    try {
                        window.addEventListener('message', (ev) => {
                            try { console.log('SWAT webview: received message from host', ev && ev.data); } catch (e) { }
                        });
                    } catch (e) { }

            // Safe lookup to avoid null errors in webview script
            const $ = id => document.getElementById(id);

            // Button click handlers (guarded)
            const selectBtn = $('selectDatasetBtn');
            if (selectBtn) selectBtn.addEventListener('click', () => {
                swatHost.postMessage({ type: 'selectDataset' });
            });

            const importBtn = $('importConvertBtn');
            if (importBtn) importBtn.addEventListener('click', () => {
                swatHost.postMessage({ type: 'importTextFiles' });
            });

            // 'Select Dataset & Debug' button removed; no handler required.

            const launchBtn = $('launchDebugBtn');
            if (launchBtn) launchBtn.addEventListener('click', () => {
                swatHost.postMessage({ type: 'launchDebug' });
            });

            // Open / Copy DB buttons (if present)
            const openDbBtn = $('openDbBtn');
            if (openDbBtn) openDbBtn.addEventListener('click', () => {
                const p = openDbBtn.dataset.path;
                if (p) swatHost.postMessage({ type: 'openDbWithViewer', path: p });
            });

            const selectedDbPathEl = $('selectedDbPath');
            if (selectedDbPathEl) selectedDbPathEl.addEventListener('click', () => {
                const p = selectedDbPathEl.dataset.path;
                if (p) swatHost.postMessage({ type: 'openDbWithViewer', path: p });
            });

            const copyDbBtn = $('copyDbBtn');
            if (copyDbBtn) copyDbBtn.addEventListener('click', async () => {
                const p = copyDbBtn.dataset.path;
                if (!p) return;
                try {
                    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(p);
                        const prev = copyDbBtn.textContent;
                        copyDbBtn.textContent = 'Copied';
                        setTimeout(() => { copyDbBtn.textContent = prev; }, 1500);
                    } else {
                        // fallback: send to host (host may not handle copy but it's a fallback)
                        swatHost.postMessage({ type: 'openFile', path: p });
                    }
                } catch (err) {
                    swatHost.postMessage({ type: 'openFile', path: p });
                }
            });

            // Recent dataset click handlers
            document.querySelectorAll('.recent-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    // Don't trigger if clicking the remove button (guard for text nodes)
                    const tgt = e.target;
                    if (tgt && typeof tgt.closest === 'function' && tgt.closest('.remove-btn')) return;
                    const path = item.dataset.path;
                    try { console.log('SWAT webview: recent-item clicked', path); } catch (e) {}
                    swatHost.postMessage({ type: 'selectRecentDataset', path });
                });
            });

            // Remove button handlers
            document.querySelectorAll('.remove-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const path = btn.dataset.path;
                    try { console.log('SWAT webview: remove-btn clicked', path); } catch (e) {}
                    swatHost.postMessage({ type: 'removeRecentDataset', path });
                });
            });

            // TXT explorer item handlers
            document.querySelectorAll('.txt-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    const p = item.dataset.path;
                    const isDb = item.dataset.isdb === '1';
                    if (p) {
                        try { console.log('SWAT webview: txt-item clicked', p, 'isDb=', isDb); } catch (e) {}
                        if (isDb) {
                            // select as active database (mimic Solution Explorer selection)
                            swatHost.postMessage({ type: 'setSelectedDatabase', path: p });
                        } else {
                            swatHost.postMessage({ type: 'openFile', path: p });
                        }
                    }
                });
                // double-click opens DB with viewer (or opens text file normally)
                item.addEventListener('dblclick', (e) => {
                    const p = item.dataset.path;
                    const isDb = item.dataset.isdb === '1';
                    if (p) {
                        try { console.log('SWAT webview: txt-item dblclick', p, 'isDb=', isDb); } catch (e) {}
                        if (isDb) {
                            swatHost.postMessage({ type: 'openDbWithViewer', path: p });
                        } else {
                            swatHost.postMessage({ type: 'openFile', path: p });
                        }
                    }
                });
            });

            // Collapsible section handlers
            document.querySelectorAll('.section-header.collapsible').forEach(header => {
                header.addEventListener('click', () => {
                    header.classList.toggle('collapsed');
                    const sectionId = header.dataset.section;
                    const content = document.getElementById(sectionId + '-content');
                    if (content) {
                        content.classList.toggle('hidden');
                    }
                });
            });

            // Close button for TXTINOUT header: close all open files for the selected dataset
            document.querySelectorAll('.close-txt-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // ask host to close all open files for the current dataset
                    try { console.log('SWAT webview: close-all clicked'); } catch (e) {}
                    swatHost.postMessage({ type: 'closeAllDatasetFiles' });
                });
            });

            // Per-file close buttons: use inline buttons present in each row (left-most now)
            document.querySelectorAll('.txt-close-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const p = btn.dataset.path;
                    if (p) {
                        try { console.log('SWAT webview: txt-close clicked', p); } catch (e) {}
                        swatHost.postMessage({ type: 'closeFile', path: p });
                    }
                });
            });

            // Delegated click handler fallback so clicks are handled even if direct listeners fail
            document.addEventListener('click', (e) => {
                try {
                    const tgt = e.target;
                    if (!tgt) return;
                    const closest = (sel) => (tgt.closest ? tgt.closest(sel) : null);

                    if (closest && closest('#selectDatasetBtn')) {
                        try { console.log('SWAT webview: delegated selectDataset click'); } catch (e) {}
                        swatHost.postMessage({ type: 'selectDataset' });
                        return;
                    }
                    if (closest && closest('#launchDebugBtn')) {
                        try { console.log('SWAT webview: delegated launchDebug click'); } catch (e) {}
                        swatHost.postMessage({ type: 'launchDebug' });
                        return;
                    }
                    if (closest && closest('.remove-btn')) {
                        const container = tgt.closest('.recent-item');
                        const path = container ? container.dataset.path : (tgt.closest('.remove-btn')?.dataset?.path);
                        try { console.log('SWAT webview: delegated remove click', path); } catch (e) {}
                        swatHost.postMessage({ type: 'removeRecentDataset', path });
                        return;
                    }
                    if (closest && closest('.txt-close-btn')) {
                        const btn = tgt.closest('.txt-close-btn');
                        const p = btn ? btn.dataset.path : undefined;
                        try { console.log('SWAT webview: delegated txt-close click', p); } catch (e) {}
                        if (p) swatHost.postMessage({ type: 'closeFile', path: p });
                        e.stopPropagation();
                        return;
                    }
                    if (closest && closest('.close-txt-btn')) {
                        try { console.log('SWAT webview: delegated close-all click'); } catch (e) {}
                        swatHost.postMessage({ type: 'closeAllDatasetFiles' });
                        return;
                    }
                    if (closest && closest('.recent-item')) {
                        if (tgt && typeof tgt.closest === 'function' && tgt.closest('.remove-btn')) return;
                        const container = tgt.closest('.recent-item');
                        const path = container ? container.dataset.path : undefined;
                        try { console.log('SWAT webview: delegated recent-item click', path); } catch (e) {}
                        if (path) swatHost.postMessage({ type: 'selectRecentDataset', path });
                        return;
                    }
                    if (closest && closest('.txt-item')) {
                        const container = tgt.closest('.txt-item');
                        const p = container ? container.dataset.path : undefined;
                        const isDb = container ? container.dataset.isdb === '1' : false;
                        if (p) {
                            try { console.log('SWAT webview: delegated txt-item click', p, 'isDb=', isDb); } catch (e) {}
                            if (isDb) swatHost.postMessage({ type: 'setSelectedDatabase', path: p });
                            else swatHost.postMessage({ type: 'openFile', path: p });
                        }
                        return;
                    }
                } catch (dd) {
                    try { console.error('SWAT delegated click error', dd); } catch (e) { }
                }
            });

            // Non-interactive divider between Recent and TXTINOUT: intentionally no click handler

            // Set initial heights: recent fixed (~4 items), txt fills remaining
            function setInitialMiddleHeights() {
                const container = document.querySelector('.middle');
                const recentContent = document.getElementById('recent-content');
                const txtContentLocal = document.getElementById('selected-files-content');
                if (!container || !recentContent || !txtContentLocal) return;
                const total = container.clientHeight;
                if (total <= 0) return;
                const recentH = 136; // fixed (~20% smaller than previous 168)
                // leave the files pane flexible via CSS flexbox; only set recent pane height
                recentContent.style.height = recentH + 'px';
                // Ensure files pane flexes naturally - clear any previously assigned height
                try { txtContentLocal.style.height = ''; } catch (e) { }
            }

            // Apply initial heights now and on resize
            setInitialMiddleHeights();
            window.addEventListener('resize', () => setInitialMiddleHeights());

            // Filter toolbar behavior: map extensions to categories and filter displayed rows
            (function setupFilterToolbar() {
                const extToCategory = {
                    '.bsn': 'model', '.con': 'model', '.ini': 'model',
                    '.cli': 'climate', '.pcp': 'climate', '.tmp': 'climate', '.wnd': 'climate',
                    '.lum': 'land', '.ele': 'land', '.sol': 'land', '.hru': 'land',
                    '.ops': 'mgmt', '.sch': 'mgmt',
                    '.str': 'routing', '.hyd': 'routing', '.swf': 'routing', '.res': 'routing'
                };

                const filterNoOutputs = document.getElementById('filter-no-outputs');
                const checkboxes = Array.from(document.querySelectorAll('.filter-checkbox'));
                if (!checkboxes.length) return;

                function applyFilter() {
                    const noOutputsChecked = filterNoOutputs && filterNoOutputs.checked;
                    const activeCats = checkboxes.filter(cb => cb.id !== 'filter-no-outputs' && cb.checked)
                        .map(cb => cb.dataset.cat);

                    document.querySelectorAll('.txt-item').forEach(it => {
                        const item = it;
                        const ext = (item.dataset.ext || '').toLowerCase();
                        const cat = extToCategory[ext] || null;
                        // If 'No Outputs' is checked, hide .txt and .out files regardless of category selection
                        if (noOutputsChecked && (ext === '.txt' || ext === '.out')) {
                            item.style.display = 'none';
                            return;
                        }
                        if (activeCats.length === 0) {
                            // no specific categories selected -> show all (unless noTxt hides .txt)
                            item.style.display = '';
                        } else {
                            item.style.display = (cat && activeCats.indexOf(cat) >= 0) ? '' : 'none';
                        }
                    });
                }

                // Wire up events: categories are independent; 'No txt' toggles exclusion of .txt files
                checkboxes.forEach(cb => {
                    cb.addEventListener('change', () => {
                        applyFilter();
                    });
                });

                // ensure starting state
                applyFilter();
            })();

                    // No bottom draggable divider in the simplified layout; nothing to resize here.
                } catch (err) {
                    // Catch any initialization errors in the webview script so they don't stop other handlers
                    try { console.error('SWAT webview script error', err); } catch (e) { /* ignore */ }
                }
            });
        })();
    </script>
</body>
</html>`;
    }
}
