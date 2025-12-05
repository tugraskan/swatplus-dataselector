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
    if (value == null) return undefined;
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
        if (typeof (value as any).path === 'string') return (value as any).path;
        if (typeof (value as any).fsPath === 'string') return (value as any).fsPath;
        if (typeof (value as any).uri === 'string') return (value as any).uri;
        if ((value as any).toString && typeof (value as any).toString === 'function') return (value as any).toString();
    }
    return String(value);
}

export class SwatDatasetWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'swatDatasetView';

    private _view?: vscode.WebviewView;
    private selectedDataset: string | undefined;
    private recentDatasets: string[] = [];

    constructor(private readonly context: vscode.ExtensionContext) {
        // Load recent datasets from storage
        const raw = this.context.globalState.get('recentDatasets', []) || [];
        try {
            this.recentDatasets = (Array.isArray(raw) ? raw : []).map(item => normalizeToPath(item)).filter(Boolean) as string[];
        } catch (e) {
            this.recentDatasets = [];
        }
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        try {
            this._view = webviewView;

            webviewView.webview.options = {
                enableScripts: true,
                localResourceRoots: [this.context.extensionUri]
            };

            webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

            // Handle messages from the webview
            webviewView.webview.onDidReceiveMessage(data => {
                try {
                    if (!data || !data.type) {
                        return;
                    }
                    switch (data.type) {
                        case 'selectDataset':
                            vscode.commands.executeCommand('swat-dataset-selector.selectDataset');
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

        const selectedHtml = this.selectedDataset
            ? `<div class="section">
                <div class="section-header">
                    ${svgs.folder}
                    <span class="section-title">Current Dataset</span>
                </div>
                <div class="selected-dataset">
                    <div class="dataset-name">${escapeHtml(path.basename(this.selectedDataset))}</div>
                    <div class="dataset-path" title="${escapeHtml(this.selectedDataset)}">${escapeHtml(this.selectedDataset)}</div>
                </div>
               </div>`
            : `<div class="section">
                <div class="section-header">
                    ${svgs.folder}
                    <span class="section-title">Current Dataset</span>
                </div>
                <div class="no-dataset">
                    ${svgs.info}
                    <span>No dataset selected</span>
                </div>
               </div>`;

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

        // TXTINOUT section: check for File.cio in selected dataset and render an explorer if present
        let txtSectionHtml = '';
        if (!this.selectedDataset) {
            txtSectionHtml = `<div class="section">
                <div class="section-header">
                    ${svgs.folder}
                    <span class="section-title">TXTINOUT</span>
                </div>
                <div class="no-dataset">
                    ${svgs.info}
                    <span>No dataset selected</span>
                </div>
               </div>`;
        } else {
            try {
                const fileCioPath = path.join(this.selectedDataset, 'File.cio');
                if (!fs.existsSync(fileCioPath)) {
                    txtSectionHtml = `<div class="section">
                        <div class="section-header">
                            ${svgs.folder}
                            <span class="section-title">TXTINOUT</span>
                        </div>
                        <div class="no-dataset">
                            ${svgs.info}
                            <span>File.cio not found in selected dataset</span>
                        </div>
                       </div>`;
                } else {
                    const entries = fs.readdirSync(this.selectedDataset, { withFileTypes: true });
                    const itemsHtml = entries.map(ent => {
                        const full = path.join(this.selectedDataset || '', ent.name);
                        const icon = ent.isDirectory() ? svgs.folder : svgs.file;
                        return `
                            <div class="txt-item" data-path="${escapeHtml(full)}">
                                    ${icon}
                                    <div class="recent-item-info">
                                        <div class="recent-item-name">${escapeHtml(ent.name)}</div>
                                        <div class="recent-item-path" title="${escapeHtml(full)}">${escapeHtml(full)}</div>
                                    </div>
                                    <button class="icon-button txt-close-btn" data-path="${escapeHtml(full)}" title="Close file">
                                        ${svgs.close}
                                    </button>
                                </div>
                        `;
                    }).join('');

                    txtSectionHtml = `<div class="section">
                        <div class="section-header collapsible" data-section="txtinout">
                            ${svgs.chevronDown}
                            ${svgs.file}
                            <span class="section-title">TXTINOUT</span>
                            <button class="icon-button close-txt-btn" title="Close TXTINOUT">
                                ${svgs.close}
                            </button>
                        </div>
                        <div class="section-content" id="txtinout-content">
                            ${itemsHtml}
                        </div>
                       </div>`;
                }
            } catch (e) {
                txtSectionHtml = `<div class="section">
                    <div class="section-header">
                        ${svgs.folder}
                        <span class="section-title">TXTINOUT</span>
                    </div>
                    <div class="no-dataset">
                        ${svgs.info}
                        <span>Error reading dataset folder</span>
                    </div>
                   </div>`;
            }
        }

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
        }

        /* TXTINOUT specific content area — make scrollable when large */
        #txtinout-content {
            overflow: auto;
            padding-right: 6px;
        }

        /* Recent fixed height for ~4 items */
        #recent-content {
            height: 168px; /* ~4 items */
            overflow: auto;
        }

        /* Small static area below TXTINOUT */
        .small-static .section-content {
            height: 84px; /* half of recent */
            overflow: auto;
        }

        /* Close button in section header (hidden when collapsed) */
        .close-txt-btn {
            margin-left: auto;
            opacity: 0.9;
            display: none;
        }

        .section-header:not(.collapsed) .close-txt-btn {
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

        .divider-toggle { cursor: pointer; }
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
            opacity: 0;
            transition: opacity 0.1s ease, background-color 0.1s ease;
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
    </style>
</head>
<body>
    <div class="container">
        <div class="actions">
            <button class="action-button primary" id="selectAndDebugBtn">
                ${svgs.debugPlay}
                Select Dataset & Debug
            </button>
            <div class="button-row">
                <button class="action-button secondary" id="selectDatasetBtn">
                    ${svgs.folderOpened}
                    Select Folder
                </button>
                <button class="action-button secondary${!this.selectedDataset ? ' disabled' : ''}" id="launchDebugBtn" ${!this.selectedDataset ? 'disabled' : ''}>
                    ${svgs.debugPlay}
                    Debug
                </button>
            </div>
        </div>

        <div class="divider"></div>

        <div class="middle">
            ${selectedHtml}

            ${recentDatasetsHtml}

            <!-- Divider that toggles Recent Datasets (click) and separates Recent from TXTINOUT -->
            <div class="divider divider-toggle" id="recent-toggle-divider" title="Drag to resize TXTINOUT or click to toggle Recent"><div class="handle"></div></div>

            ${txtSectionHtml}

            <!-- Small static section below TXTINOUT (half the height of Recent) -->
            <div class="section small-static" id="post-txt-static">
                <div class="section-header">
                    ${svgs.folder}
                    <span class="section-title">Info</span>
                </div>
                <div class="section-content" id="post-txt-content">
                    <div style="padding:8px; font-size:11px; color:var(--vscode-descriptionForeground);">Additional static area</div>
                </div>
            </div>
        </div>

        <div class="help-text">
            Select a SWAT+ dataset folder to use as the working directory for debugging. 
            The debug session will use CMake Tools to launch the target.
        </div>
    </div>

    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();

            // Button click handlers
            document.getElementById('selectDatasetBtn').addEventListener('click', () => {
                vscode.postMessage({ type: 'selectDataset' });
            });

            document.getElementById('selectAndDebugBtn').addEventListener('click', () => {
                vscode.postMessage({ type: 'selectAndDebug' });
            });

            document.getElementById('launchDebugBtn').addEventListener('click', () => {
                vscode.postMessage({ type: 'launchDebug' });
            });

            // Recent dataset click handlers
            document.querySelectorAll('.recent-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    // Don't trigger if clicking the remove button
                    if (e.target.closest('.remove-btn')) return;
                    const path = item.dataset.path;
                    vscode.postMessage({ type: 'selectRecentDataset', path });
                });
            });

            // Remove button handlers
            document.querySelectorAll('.remove-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const path = btn.dataset.path;
                    vscode.postMessage({ type: 'removeRecentDataset', path });
                });
            });

            // TXT explorer item handlers
            document.querySelectorAll('.txt-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    const p = item.dataset.path;
                    if (p) {
                        vscode.postMessage({ type: 'openFile', path: p });
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
                    vscode.postMessage({ type: 'closeAllDatasetFiles' });
                    // collapse the section in the UI
                    const header = btn.closest('.section-header');
                    if (header && !header.classList.contains('collapsed')) {
                        header.classList.add('collapsed');
                        const sectionId = header.dataset.section;
                        const content = document.getElementById(sectionId + '-content');
                        if (content) content.classList.add('hidden');
                    }
                });
            });

            // Per-file close buttons: close a single file in the editor (if open)
            document.querySelectorAll('.txt-close-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const p = btn.dataset.path;
                    if (p) {
                        vscode.postMessage({ type: 'closeFile', path: p });
                    }
                });
            });

            // Divider between Recent and TXTINOUT: supports click-to-toggle Recent and drag-to-resize TXT only (Recent is fixed)
            const recentToggle = document.getElementById('recent-toggle-divider');
            if (recentToggle) {
                recentToggle.addEventListener('mousedown', (e) => {
                    let dragging = false;
                    const startY = e.clientY;
                    const container = document.querySelector('.middle');
                    const recentContent = document.getElementById('recent-content');
                    const txtContentLocal = document.getElementById('txtinout-content');
                    const postStatic = document.getElementById('post-txt-content');
                    if (!container || !recentContent || !txtContentLocal || !postStatic) return;

                    const recentH = recentContent.clientHeight; // fixed
                    const staticH = postStatic.clientHeight; // fixed small area
                    const startTxtH = txtContentLocal.clientHeight;

                    const parentH = container.clientHeight;
                    const maxTxt = parentH - recentH - staticH - 20; // leave some padding
                    const minTxt = 40;

                    const onMove = (ev) => {
                        dragging = true;
                        const delta = ev.clientY - startY; // positive -> mouse moved down -> increase TXT
                        let desired = startTxtH + delta;
                        desired = Math.max(minTxt, Math.min(maxTxt, desired));
                        txtContentLocal.style.height = desired + 'px';
                    };

                    const onUp = () => {
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                        if (!dragging) {
                            // treat as click: toggle recent section
                            const recentHeader = document.querySelector('.section-header[data-section="recent"]');
                            if (recentHeader) {
                                recentHeader.classList.toggle('collapsed');
                                const content = document.getElementById('recent-content');
                                if (content) content.classList.toggle('hidden');
                            }
                        }
                    };

                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                });
            }

            // Set initial heights: recent fixed (~4 items), small static half of recent, txt fills remaining
            function setInitialMiddleHeights() {
                const container = document.querySelector('.middle');
                const recentContent = document.getElementById('recent-content');
                const txtContentLocal = document.getElementById('txtinout-content');
                const postStatic = document.getElementById('post-txt-content');
                if (!container || !recentContent || !txtContentLocal || !postStatic) return;
                const total = container.clientHeight;
                if (total <= 0) return;
                const recentH = 168; // fixed
                const staticH = Math.floor(recentH / 2);
                const txtH = Math.max(40, total - recentH - staticH - 20);
                recentContent.style.height = recentH + 'px';
                postStatic.style.height = staticH + 'px';
                txtContentLocal.style.height = txtH + 'px';
            }

            // Apply initial heights now and on resize
            setInitialMiddleHeights();
            window.addEventListener('resize', () => setInitialMiddleHeights());

            // (Bottom resize handle removed) top divider handles TXT resizing now.
        })();
    </script>
</body>
</html>`;
    }
}
