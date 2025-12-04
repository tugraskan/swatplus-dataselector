import * as vscode from 'vscode';
import * as path from 'path';

export class SwatDatasetWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'swatDatasetView';

    private _view?: vscode.WebviewView;
    private selectedDataset: string | undefined;
    private recentDatasets: string[] = [];

    constructor(private readonly context: vscode.ExtensionContext) {
        // Load recent datasets from storage
        this.recentDatasets = this.context.globalState.get('recentDatasets', []);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(data => {
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
                    this.setSelectedDataset(data.path);
                    vscode.window.showInformationMessage(`SWAT+ Dataset folder selected: ${data.path}`);
                    break;
                case 'removeRecentDataset':
                    this.removeRecentDataset(data.path);
                    break;
            }
        });
    }

    public setSelectedDataset(dataset: string): void {
        this.selectedDataset = dataset;

        // Add to recent datasets
        this.recentDatasets = [dataset, ...this.recentDatasets.filter(d => d !== dataset)].slice(0, 10);
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
        const selectedHtml = this.selectedDataset
            ? `<div class="section">
                <div class="section-header">
                    <span class="codicon codicon-folder-active"></span>
                    <span class="section-title">Current Dataset</span>
                </div>
                <div class="selected-dataset">
                    <div class="dataset-name">${path.basename(this.selectedDataset)}</div>
                    <div class="dataset-path" title="${this.selectedDataset}">${this.selectedDataset}</div>
                </div>
               </div>`
            : `<div class="section">
                <div class="section-header">
                    <span class="codicon codicon-folder"></span>
                    <span class="section-title">Current Dataset</span>
                </div>
                <div class="no-dataset">
                    <span class="codicon codicon-info"></span>
                    <span>No dataset selected</span>
                </div>
               </div>`;

        const recentDatasetsHtml = this.recentDatasets.length > 0
            ? `<div class="section">
                <div class="section-header collapsible" data-section="recent">
                    <span class="codicon codicon-chevron-down collapse-icon"></span>
                    <span class="codicon codicon-history"></span>
                    <span class="section-title">Recent Datasets</span>
                    <span class="badge">${this.recentDatasets.length}</span>
                </div>
                <div class="section-content" id="recent-content">
                    ${this.recentDatasets.slice(0, 5).map(dataset => `
                        <div class="recent-item" data-path="${dataset}">
                            <span class="codicon codicon-folder"></span>
                            <div class="recent-item-info">
                                <div class="recent-item-name">${path.basename(dataset)}</div>
                                <div class="recent-item-path" title="${dataset}">${dataset}</div>
                            </div>
                            <button class="icon-button remove-btn" data-path="${dataset}" title="Remove from recent">
                                <span class="codicon codicon-close"></span>
                            </button>
                        </div>
                    `).join('')}
                </div>
               </div>`
            : '';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource};">
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
                <span class="codicon codicon-debug-start"></span>
                Select Dataset & Debug
            </button>
            <div class="button-row">
                <button class="action-button secondary" id="selectDatasetBtn">
                    <span class="codicon codicon-folder-opened"></span>
                    Select Folder
                </button>
                <button class="action-button secondary" id="launchDebugBtn" ${!this.selectedDataset ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
                    <span class="codicon codicon-debug-alt"></span>
                    Debug
                </button>
            </div>
        </div>

        <div class="divider"></div>

        ${selectedHtml}

        ${recentDatasetsHtml}

        <div class="divider"></div>

        <div class="help-text">
            Select a SWAT+ dataset folder to use as the working directory for debugging. 
            The debug session will use CMake Tools to launch the target.
        </div>
    </div>

    <script>
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
        })();
    </script>
</body>
</html>`;
    }
}
