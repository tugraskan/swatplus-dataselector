import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { SwatIndexer } from './indexer';
import { resolveFileCioPath, wslPathToWindows } from './pathUtils';
import { detectEnvironment, hasWorkspace, isCmakeToolsInstalled, EnvironmentInfo } from './environmentUtils';

/**
 * Escapes HTML special characters to prevent XSS attacks
 */
function escapeHtml(text: string): string {
    const s = text === null || text === undefined ? '' : String(text);
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
    if (value === null || value === undefined) {return undefined;}
    if (typeof value === 'string') {return value;}
    if (typeof value === 'object') {
        if (typeof (value as any).path === 'string') {return (value as any).path;}
        if (typeof (value as any).fsPath === 'string') {return (value as any).fsPath;}
        if (typeof (value as any).uri === 'string') {return (value as any).uri;}
        if ((value as any).toString && typeof (value as any).toString === 'function') {return (value as any).toString();}
    }
    return String(value);
}

interface SchemaOption {
    path: string;
    label: string;
    version?: string;
}

export class SwatDatasetWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'swatDatasetView';

    private _view?: vscode.WebviewView;
    private selectedDataset: string | undefined;
    private currentDirectoryInputs: string | undefined; // Current directory being viewed in inputs section
    private currentDirectoryOutputs: string | undefined; // Current directory being viewed in outputs section
    private recentDatasets: string[] = [];
    private _onChangeCallback?: (dataset: string | undefined) => void;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly indexer: SwatIndexer
    ) {
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
            console.log('SWAT: resolveWebviewView called');
            this._view = webviewView;

            webviewView.webview.options = {
                enableScripts: true,
                localResourceRoots: [this.context.extensionUri]
            };

            webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

            // Handle messages from the webview
            webviewView.webview.onDidReceiveMessage(async data => {
                console.log('SWAT: webview message received', data);
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
                                const section = data.section || 'outputs'; // Default to outputs for backward compatibility
                                if (section === 'inputs') {
                                    // For input files, show table viewer with the specific file focused
                                    vscode.commands.executeCommand('swat-dataset-selector.showTableViewer', data.path);
                                } else {
                                    // For output files, open the file in an editor
                                    vscode.commands.executeCommand('swat-dataset-selector.openFile', data.path);
                                }
                            }
                            break;
                        case 'openInputInEditor':
                            if (data.path && typeof data.path === 'string') {
                                // Open the actual input file in an editor
                                vscode.commands.executeCommand('swat-dataset-selector.openFile', data.path);
                            }
                            break;
                        case 'navigateToDirectory':
                            if (data.path && typeof data.path === 'string') {
                                const section = data.section || 'inputs'; // Default to inputs for backward compatibility
                                if (section === 'outputs') {
                                    this.currentDirectoryOutputs = data.path;
                                } else {
                                    this.currentDirectoryInputs = data.path;
                                }
                                this._updateWebview();
                            }
                            break;
                        case 'navigateUp':
                            const navSection = data.section || 'inputs'; // Default to inputs for backward compatibility
                            if (navSection === 'outputs') {
                                if (this.currentDirectoryOutputs && this.selectedDataset) {
                                    const parent = path.dirname(this.currentDirectoryOutputs);
                                    // Only navigate up if we're still within the selected dataset
                                    if (parent.startsWith(this.selectedDataset)) {
                                        this.currentDirectoryOutputs = parent;
                                    } else {
                                        this.currentDirectoryOutputs = undefined;
                                    }
                                    this._updateWebview();
                                }
                            } else {
                                if (this.currentDirectoryInputs && this.selectedDataset) {
                                    const parent = path.dirname(this.currentDirectoryInputs);
                                    // Only navigate up if we're still within the selected dataset
                                    if (parent.startsWith(this.selectedDataset)) {
                                        this.currentDirectoryInputs = parent;
                                    } else {
                                        this.currentDirectoryInputs = undefined;
                                    }
                                    this._updateWebview();
                                }
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
                        case 'buildIndex':
                            vscode.commands.executeCommand('swat-dataset-selector.buildIndex');
                            break;
                        case 'rebuildIndex':
                            vscode.commands.executeCommand('swat-dataset-selector.rebuildIndex');
                            break;
                        case 'loadIndex':
                            vscode.commands.executeCommand('swat-dataset-selector.loadIndex');
                            break;
                        case 'schemaSelectionChanged':
                            if (typeof data.path === 'string') {
                                this.indexer.setSchemaPath(data.path || null);
                                vscode.window.showInformationMessage(`SWAT+ schema set to: ${data.path || 'default'}`);
                                this._updateWebview();
                            }
                            break;
                        case 'uploadDataset':
                            vscode.commands.executeCommand('swat-dataset-selector.uploadDataset');
                            break;
                        case 'dropDataset':
                            if (data.path && typeof data.path === 'string') {
                                this._handleDroppedDataset(data.path.trim()).catch(err => {
                                    vscode.window.showErrorMessage('Failed to add dropped dataset: ' + (err instanceof Error ? err.message : String(err)));
                                });
                            }
                            break;
                        case 'selectWorkdataDataset':
                            if (data.path && typeof data.path === 'string') {
                                this.setSelectedDataset(data.path);
                                vscode.window.showInformationMessage(`SWAT+ Dataset selected: ${data.path}`);
                            }
                            break;
                        case 'refreshWorkdata':
                            this._updateWebview();
                            break;
                        case 'revealWorkdataFolder':
                            vscode.commands.executeCommand('swat-dataset-selector.revealWorkdataFolder');
                            break;
                        case 'selectDatasetDirectory': {
                            // Let the user pick the directory that contains dataset folders
                            const result = await vscode.window.showOpenDialog({
                                canSelectFiles: false,
                                canSelectFolders: true,
                                canSelectMany: false,
                                openLabel: 'Select Dataset Folder',
                                title: 'Select the directory that contains your SWAT+ dataset folders'
                            });
                            if (result && result.length > 0) {
                                const chosen = result[0].fsPath;
                                this.context.workspaceState.update('datasetDirectory', chosen);
                                this._updateWebview();
                            }
                            break;
                        }
                        case 'revealSelectedDataset': {
                            if (this.selectedDataset) {
                                await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(this.selectedDataset));
                            }
                            break;
                        }
                        case 'openFolder':
                            vscode.commands.executeCommand('vscode.openFolder');
                            break;
                        case 'showError':
                            if (typeof data.message === 'string') {
                                vscode.window.showErrorMessage(data.message);
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
        this.indexer.updateFileCioHeader(p);
        this.currentDirectoryInputs = undefined; // Reset to root when selecting new dataset
        this.currentDirectoryOutputs = undefined; // Reset to root when selecting new dataset

        // Add to recent datasets
        this.recentDatasets = [p, ...this.recentDatasets.filter(d => d !== p)].slice(0, 10);
        this.context.globalState.update('recentDatasets', this.recentDatasets);

        this._onChangeCallback?.(p);
        this._updateWebview();
    }

    public getSelectedDataset(): string | undefined {
        return this.selectedDataset;
    }

    /** Register a callback invoked whenever the active dataset changes. */
    public setOnChangeCallback(cb: (dataset: string | undefined) => void): void {
        this._onChangeCallback = cb;
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

    private async _handleDroppedDataset(droppedPath: string): Promise<void> {
        if (!droppedPath) {
            return;
        }
        // Validate it's a directory
        let stat: fs.Stats;
        try {
            stat = fs.statSync(droppedPath);
        } catch {
            vscode.window.showErrorMessage(`Dropped path not found: ${droppedPath}`);
            return;
        }
        if (!stat.isDirectory()) {
            vscode.window.showWarningMessage('Please drop a folder, not a file.');
            return;
        }

        const folderName = path.basename(droppedPath);
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const workdataDir = this._resolveDatasetDirectory();
        const datasetDirName = workdataDir ? path.basename(workdataDir) : 'workdata';
        // Use path.relative to robustly detect containment (handles separator differences)
        const isAlreadyInWorkdata = workdataDir
            ? !path.relative(workdataDir, droppedPath).startsWith('..')
            : false;

        let finalPath = droppedPath;

        if (workspaceRoot && workdataDir && !isAlreadyInWorkdata) {
            const choice = await vscode.window.showInformationMessage(
                `Add "${folderName}" as a SWAT+ dataset?`,
                'Add as-is',
                `Copy to ${datasetDirName}/`
            );
            if (!choice) {
                return;
            }
            if (choice === `Copy to ${datasetDirName}/`) {
                if (!fs.existsSync(workdataDir)) {
                    fs.mkdirSync(workdataDir, { recursive: true });
                }
                const targetPath = path.join(workdataDir, folderName);
                if (fs.existsSync(targetPath)) {
                    const confirm = await vscode.window.showWarningMessage(
                        `"${folderName}" already exists in ${datasetDirName}/. Overwrite?`,
                        { modal: true },
                        'Overwrite'
                    );
                    if (confirm !== 'Overwrite') {
                        return;
                    }
                }
                await vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Notification, title: `Copying "${folderName}" to ${datasetDirName}/...`, cancellable: false },
                    async () => { await fs.promises.cp(droppedPath, targetPath, { recursive: true }); }
                );
                finalPath = targetPath;
            }
        }

        this.setSelectedDataset(finalPath);
        vscode.window.showInformationMessage(`Dataset added: ${path.basename(finalPath)}`);
    }

    /**
     * Resolve the configured dataset directory to an absolute path.
     * Priority: workspace-state override → `swatplus.datasetDirectory` setting → `'workdata'` fallback.
     * Returns `undefined` when no workspace folder is open.
     */
    private _resolveDatasetDirectory(): string | undefined {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            return undefined;
        }
        const stored = this.context.workspaceState.get<string>('datasetDirectory');
        const configured = vscode.workspace.getConfiguration('swatplus').get<string>('datasetDirectory') || 'workdata';
        const raw = stored || configured;
        return path.isAbsolute(raw) ? raw : path.join(workspaceRoot, raw);
    }

    private getSchemaDirectories(): string[] {
        const config = vscode.workspace.getConfiguration('swatplus');
        const configured = config.get<string[]>('schemaDirectories', []);
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const normalized = configured
            .map(dir => {
                if (!dir) {
                    return '';
                }
                if (workspaceFolder) {
                    return dir.replace(/\$\{workspaceFolder\}/g, workspaceFolder);
                }
                return dir;
            })
            .filter(Boolean);

        const unique = new Set<string>();
        for (const dir of normalized) {
            unique.add(dir);
        }

        return Array.from(unique);
    }

    private getAvailableSchemas(): SchemaOption[] {
        const schemaOptions: SchemaOption[] = [];
        const seen = new Set<string>();
        const schemaDirs = [
            path.join(this.context.extensionPath, 'resources', 'schema'),
            ...this.getSchemaDirectories()
        ];

        for (const dir of schemaDirs) {
            if (!dir || !fs.existsSync(dir)) {
                continue;
            }
            let entries: string[] = [];
            try {
                entries = fs.readdirSync(dir);
            } catch (error) {
                console.warn(`Failed to read schema directory ${dir}:`, error);
                continue;
            }

            for (const entry of entries) {
                if (!entry.toLowerCase().endsWith('.json')) {
                    continue;
                }
                const filePath = path.join(dir, entry);
                if (seen.has(filePath)) {
                    continue;
                }
                try {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    const data = JSON.parse(content);
                    if (!data || !data.schema_version || !data.tables) {
                        continue;
                    }
                    const version = String(data.schema_version);
                    const label = version ? `v${version} (${entry})` : entry;
                    schemaOptions.push({ path: filePath, label, version });
                    seen.add(filePath);
                } catch (error) {
                    console.warn(`Skipping invalid schema file ${filePath}:`, error);
                }
            }
        }

        schemaOptions.sort((a, b) => a.label.localeCompare(b.label));
        return schemaOptions;
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Generate nonce for CSP
        const nonce = crypto.randomBytes(16).toString('base64');

        // Detect the current VS Code environment for display and path hints
        const env: EnvironmentInfo = detectEnvironment();

        // CMake Tools detection: Debug features are only meaningful when CMake Tools is present
        const cmakeAvailable = isCmakeToolsInstalled();

        const svgs: { [key: string]: string } = {
            folder: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 4C1.44772 4 1 4.44772 1 5V12C1 12.5523 1.44772 13 2 13H14C14.5523 13 15 12.5523 15 12V6C15 5.44772 14.5523 5 14 5H8L6 3H2Z" fill="currentColor"/></svg>`,
            info: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1"/><rect x="7.2" y="6" width="0.8" height="4" fill="currentColor"/><rect x="7.2" y="4" width="0.8" height="0.8" fill="currentColor"/></svg>`,
            cloudUpload: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 16V8M8 12l4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 104 16.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
            chevronDown: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
            history: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 3v5l3 1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.05 6.05A6 6 0 1 0 8 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
            close: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
            debugPlay: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 3v18l15-9L5 3z" fill="currentColor"/></svg>`,
            debugAlt: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2v20M2 12h20" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
            folderOpened: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 5h4l2 2h6v6H2z" fill="currentColor"/></svg>`,
            database: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="12" cy="5" rx="9" ry="3" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`,
            file: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" stroke-width="1" fill="none"/></svg>`,
            star: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 .587l3.668 7.431L23 9.75l-5.5 5.367L18.335 24 12 20.202 5.665 24l1.835-8.883L1 9.75l7.332-1.732L12 .587z" fill="currentColor"/></svg>`,
            refresh: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 4v6h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 20v-6h-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 10a8 8 0 0 0-14.14-4.95L4 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 14a8 8 0 0 0 14.14 4.95L20 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        };
        const availableSchemas = this.getAvailableSchemas();
        const selectedSchemaPath = this.indexer.getSchemaPath();
        if (selectedSchemaPath) {
            const listed = new Set(availableSchemas.map(option => option.path));
            if (!listed.has(selectedSchemaPath) && fs.existsSync(selectedSchemaPath)) {
                availableSchemas.push({
                    path: selectedSchemaPath,
                    label: `Custom (${path.basename(selectedSchemaPath)})`
                });
            }
        }
        const schemaOptionsHtml = availableSchemas.length > 0
            ? availableSchemas.map(option => `
                <option value="${escapeHtml(option.path)}"${option.path === selectedSchemaPath ? ' selected' : ''}>
                    ${escapeHtml(option.label)}
                </option>
            `).join('')
            : `<option value="" disabled selected>No schemas found</option>`;

        const fileCioInfo = this.indexer.getFileCioHeaderInfo();
        const fileCioVersionText = fileCioInfo?.editorVersion || fileCioInfo?.swatRevision
            ? `v${fileCioInfo?.editorVersion || 'unknown'} / rev.${fileCioInfo?.swatRevision || 'unknown'}`
            : 'Unknown';

        const cachePath = this.selectedDataset ? path.join(this.selectedDataset, 'index.json') : undefined;
        const hasCachedIndex = cachePath ? fs.existsSync(cachePath) : false;
        const resolvedFileCioPath = this.selectedDataset ? resolveFileCioPath(this.selectedDataset) : null;
        const hasFileCio = Boolean(resolvedFileCioPath);
        const buildIndexLabel = hasCachedIndex ? 'Rebuild Index' : 'Build Index';
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
                // Use current directory if navigated into a subdirectory, otherwise use selected dataset
                const viewingDirectoryInputs = this.currentDirectoryInputs || this.selectedDataset;
                const viewingDirectoryOutputs = this.currentDirectoryOutputs || this.selectedDataset;
                const fileCioPath = resolvedFileCioPath ?? path.join(this.selectedDataset, 'file.cio');
                
                // Check if we're in a subdirectory for each section
                const isInSubdirectoryInputs = this.currentDirectoryInputs && this.currentDirectoryInputs !== this.selectedDataset;
                const isInSubdirectoryOutputs = this.currentDirectoryOutputs && this.currentDirectoryOutputs !== this.selectedDataset;
                
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
                        <div class="selected-window-actions">
                            <button class="action-button primary disabled" id="buildIndexBtn" disabled>
                                ${svgs.database}
                                ${buildIndexLabel}
                            </button>
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
                    // Read entries for inputs section
                    const entriesInputs = fs.existsSync(viewingDirectoryInputs) ? fs.readdirSync(viewingDirectoryInputs, { withFileTypes: true }) : [];
                    
                    // Read entries for outputs section
                    const entriesOutputs = fs.existsSync(viewingDirectoryOutputs) ? fs.readdirSync(viewingDirectoryOutputs, { withFileTypes: true }) : [];
                    
                    // Helper function to categorize file
                    const categorizeFile = (fileName: string): string => {
                        const ext = path.extname(fileName).toLowerCase();
                        const baseName = path.basename(fileName).toLowerCase();
                        
                        // Special case: wgn files are climate even if they have .txt extension
                        if (baseName.includes('wgn')) {
                            return 'climate';
                        }
                        
                        // Output files (anything .txt or .out)
                        if (ext === '.txt' || ext === '.out') {
                            return 'output';
                        }
                        
                        // Simulation Control
                        if (['.cio', '.cnt', '.sim', '.prt', '.bsn', '.cal'].includes(ext)) {
                            return 'simulation';
                        }
                        
                        // Climate
                        if (['.cli', '.pcp', '.tmp', '.slr', '.hmd', '.wnd'].includes(ext)) {
                            return 'climate';
                        }
                        
                        // Spatial Objects
                        if (['.hru', '.rtu', '.def', '.ele'].includes(ext)) {
                            return 'spatial';
                        }
                        
                        // Land Properties
                        if (['.sol', '.fld', '.sno'].includes(ext) || (ext === '.hyd' && baseName.includes('topo'))) {
                            return 'land';
                        }
                        
                        // Land Use & Management
                        if (['.lum', '.sch', '.dtl'].includes(ext) || baseName === 'plant.ini') {
                            return 'landuse';
                        }
                        
                        // Operations & Practices
                        if (['.ops'].includes(ext) || (ext === '.str' && baseName.includes('structural'))) {
                            return 'operations';
                        }
                        
                        // Water Bodies
                        if (['.res', '.wet'].includes(ext) || baseName.startsWith('initial.res') || baseName.startsWith('initial.wet')) {
                            return 'waterbodies';
                        }
                        
                        // Channels
                        if (['.cha'].includes(ext) || baseName.startsWith('initial.cha')) {
                            return 'channels';
                        }
                        
                        // Groundwater
                        if (['.aqu'].includes(ext) || baseName.startsWith('initial.aqu') || baseName.includes('gwflow')) {
                            return 'groundwater';
                        }
                        
                        // Connectivity
                        if (['.con', '.lin'].includes(ext)) {
                            return 'connectivity';
                        }
                        
                        // Initialization Files
                        if (baseName.startsWith('initial.') || baseName.includes('om_water.ini') || 
                            baseName.includes('pest_water.ini') || baseName.includes('salt_water.ini') || 
                            baseName.includes('-ini') || ext === '.ini') {
                            return 'initialization';
                        }
                        
                        // Databases
                        if (['.plt', '.frt', '.pst', '.pes', '.til', '.urb', '.sep'].includes(ext)) {
                            return 'databases';
                        }
                        
                        // Default to 'output' for files not matching any input category
                        return 'output';
                    };
                    
                    // Helper function to get categories contained in a directory
                    const getDirCategories = (dirPath: string): string[] => {
                        try {
                            const dirEntries = fs.readdirSync(dirPath, { withFileTypes: true });
                            const categories = new Set<string>();
                            
                            for (const entry of dirEntries) {
                                if (!entry.isDirectory()) {
                                    const cat = categorizeFile(entry.name);
                                    if (cat !== 'output') {
                                        categories.add(cat);
                                    }
                                }
                            }
                            
                            return Array.from(categories);
                        } catch (e) {
                            return [];
                        }
                    };
                    
                    // Get all subdirectories for inputs
                    const subdirsInputs = entriesInputs.filter(ent => ent.isDirectory());
                    
                    // Separate inputs and outputs (both should have subdirs at the top)
                    const inputEntries = [
                        ...subdirsInputs,  // Subdirectories at the top
                        ...entriesInputs.filter(ent => !ent.isDirectory() && categorizeFile(ent.name) !== 'output')
                    ];
                    
                    // Get all subdirectories for outputs
                    const subdirsOutputs = entriesOutputs.filter(ent => ent.isDirectory());
                    
                    const outputEntries = [
                        ...subdirsOutputs,  // Subdirectories at the top
                        ...entriesOutputs.filter(ent => !ent.isDirectory() && categorizeFile(ent.name) === 'output')
                    ];
                    
                    // Add back button if in subdirectory for inputs
                    let backButtonHtmlInputs = '';
                    if (isInSubdirectoryInputs) {
                        backButtonHtmlInputs = `
                            <div class="txt-item back-item" data-action="navigate-up" data-section="inputs">
                                ${svgs.folder}
                                <div class="recent-item-info">
                                    <div class="recent-item-name">.. (Up to parent directory)</div>
                                </div>
                            </div>
                        `;
                    }
                    
                    // Add back button if in subdirectory for outputs
                    let backButtonHtmlOutputs = '';
                    if (isInSubdirectoryOutputs) {
                        backButtonHtmlOutputs = `
                            <div class="txt-item back-item" data-action="navigate-up" data-section="outputs">
                                ${svgs.folder}
                                <div class="recent-item-info">
                                    <div class="recent-item-name">.. (Up to parent directory)</div>
                                </div>
                            </div>
                        `;
                    }
                    
                    // Generate HTML for inputs
                    const inputsHtml = inputEntries.map(ent => {
                        const full = path.join(viewingDirectoryInputs || '', ent.name);
                        const icon = ent.isDirectory() ? svgs.folder : svgs.file;
                        const ext = path.extname(ent.name).toLowerCase();
                        const category = ent.isDirectory() ? 'directory' : categorizeFile(ent.name);
                        const dirCategories = ent.isDirectory() ? getDirCategories(full).join(',') : '';
                        return `
                            <div class="txt-item" data-path="${escapeHtml(full)}" data-ext="${escapeHtml(ext)}" data-category="${escapeHtml(category)}" data-isdir="${ent.isDirectory()}" data-dir-categories="${escapeHtml(dirCategories)}" data-section="inputs">
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
                    
                    // Generate HTML for outputs (including subdirectories)
                    const outputsHtml = outputEntries.map(ent => {
                        const full = path.join(viewingDirectoryOutputs || '', ent.name);
                        const icon = ent.isDirectory() ? svgs.folder : svgs.file;
                        const ext = path.extname(ent.name).toLowerCase();
                        const category = ent.isDirectory() ? 'directory' : 'output';
                        return `
                            <div class="txt-item output-item" data-path="${escapeHtml(full)}" data-ext="${escapeHtml(ext)}" data-category="${escapeHtml(category)}" data-isdir="${ent.isDirectory()}" data-section="outputs">
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
                        
                        <!-- Inputs Section -->
                        <div class="dataset-section">
                            <div class="section-header collapsible" data-section="inputs">
                                ${svgs.chevronDown}
                                <span class="section-title">📥 Inputs</span>
                                <span class="badge" id="inputs-badge">${inputEntries.length}</span>
                            </div>
                            <div class="selected-window-body" id="inputs-content">
                                <div class="section-content" id="selected-files-content">
                                    ${backButtonHtmlInputs}
                                    ${inputsHtml}
                                </div>
                                <div class="filter-toolbar" id="selected-filter-toolbar">
                                    <label style="width: 100%; margin-bottom: 8px; font-weight: 600; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 6px;">
                                        <input type="checkbox" id="select-all-checkbox" checked> Select All
                                    </label>
                                    <label><input type="checkbox" id="filter-simulation" class="filter-checkbox" data-cat="simulation" checked> ⚙️ Simulation Control</label>
                                    <label><input type="checkbox" id="filter-climate" class="filter-checkbox" data-cat="climate" checked> 🌤️ Climate</label>
                                    <label><input type="checkbox" id="filter-spatial" class="filter-checkbox" data-cat="spatial" checked> 🗺️ Spatial Objects</label>
                                    <label><input type="checkbox" id="filter-land" class="filter-checkbox" data-cat="land" checked> 🏔️ Land Properties</label>
                                    <label><input type="checkbox" id="filter-landuse" class="filter-checkbox" data-cat="landuse" checked> 🌾 Land Use & Management</label>
                                    <label><input type="checkbox" id="filter-operations" class="filter-checkbox" data-cat="operations" checked> 🚜 Operations & Practices</label>
                                    <label><input type="checkbox" id="filter-waterbodies" class="filter-checkbox" data-cat="waterbodies" checked> 🏞️ Water Bodies</label>
                                    <label><input type="checkbox" id="filter-channels" class="filter-checkbox" data-cat="channels" checked> 〰️ Channels</label>
                                    <label><input type="checkbox" id="filter-groundwater" class="filter-checkbox" data-cat="groundwater" checked> 💧 Groundwater</label>
                                    <label><input type="checkbox" id="filter-connectivity" class="filter-checkbox" data-cat="connectivity" checked> 🔗 Connectivity</label>
                                    <label><input type="checkbox" id="filter-initialization" class="filter-checkbox" data-cat="initialization" checked> 🔢 Initialization Files</label>
                                    <label><input type="checkbox" id="filter-databases" class="filter-checkbox" data-cat="databases" checked> 📚 Databases</label>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Outputs Section -->
                        <div class="dataset-section">
                            <div class="section-header collapsible" data-section="outputs">
                                ${svgs.chevronDown}
                                <span class="section-title">📤 Outputs</span>
                                <span class="badge">${outputEntries.length}</span>
                            </div>
                            <div class="selected-window-body" id="outputs-content">
                                <div class="section-content" id="output-files-content">
                                    ${backButtonHtmlOutputs}
                                    ${outputsHtml}
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

        const recentDatasetsHtml = `<div class="section" id="recent-section">
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
                    <div class="drop-zone-hint${this.recentDatasets.length === 0 ? ' drop-zone-hint-empty' : ''}">
                        ${svgs.folder} Drop a dataset folder here to add it
                    </div>
                </div>
               </div>`;

        // --- Workdata / dataset-directory section ---
        const workspaceRootForHtml = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const hasWorkspaceOpen = hasWorkspace();

        // SWAT+ mode: CMake Tools installed + workspace open → use a configurable dataset directory
        // Inspector mode: no CMake → use workdata/ if available, but recent datasets are the primary list
        const swatPlusMode = cmakeAvailable && hasWorkspaceOpen;

        // Resolve the effective dataset directory via shared helper
        const effectiveDatasetDir = this._resolveDatasetDirectory();

        // Keep the legacy workdataDirForHtml for backward-compatible drop handling
        const workdataDirForHtml = effectiveDatasetDir;

        let workdataDatasets: string[] = [];
        if (effectiveDatasetDir && fs.existsSync(effectiveDatasetDir)) {
            try {
                workdataDatasets = fs.readdirSync(effectiveDatasetDir, { withFileTypes: true })
                    .filter(e => e.isDirectory())
                    .map(e => path.join(effectiveDatasetDir, e.name));
            } catch (e) { /* ignore */ }
        }

        // Environment-specific upload tip
        let uploadTip = '';
        if (env.type === 'codespaces-browser') {
            uploadTip = 'Codespaces (browser): right-click the dataset folder in the Explorer and choose <b>Upload &hellip;</b> to copy datasets from your machine.';
        } else if (env.type === 'codespaces-desktop') {
            uploadTip = 'Codespaces (desktop): drag folders into the dataset directory in the Explorer, or use <b>Upload Dataset</b> above.';
        } else if (env.type === 'remote-wsl') {
            uploadTip = 'WSL: paste a Windows path (e.g. <code>C:\\Users\\&hellip;</code>) via <b>Upload Dataset &rarr; Enter a path</b>, or copy files to the dataset folder.';
        } else if (env.type === 'remote-ssh') {
            uploadTip = 'Remote SSH: copy datasets to the dataset folder on the remote machine, then click Refresh.';
        } else {
            uploadTip = 'Drop a dataset folder below, or click <b>Upload Dataset</b> above to add it.';
        }

        const datasetDirLabel = effectiveDatasetDir
            ? (workspaceRootForHtml && effectiveDatasetDir.startsWith(workspaceRootForHtml)
                ? path.relative(workspaceRootForHtml, effectiveDatasetDir)
                : effectiveDatasetDir)
            : 'workdata';

        const noWorkspaceBanner = !hasWorkspaceOpen
            ? `<div class="no-workspace-banner">
                <span class="codicon codicon-warning"></span>
                <span>No workspace folder is open. <a href="#" id="openFolderLink">Open a folder</a> to use the dataset directory and dataset uploads.</span>
              </div>`
            : '';

        // WSL mount path button — shown in WSL mode when a dataset is selected
        const wslWinPath = (env.type === 'remote-wsl' && this.selectedDataset)
            ? wslPathToWindows(this.selectedDataset)
            : '';
        // Only render the WSL row when conversion produced a real Windows path
        const wslMountHtml = (wslWinPath && wslWinPath !== this.selectedDataset)
            ? `<div class="wsl-mount-row">
                <span class="wsl-mount-label" title="Windows path for this dataset (for WSL mounts)">
                    ${svgs.info} Windows path: <code>${escapeHtml(wslWinPath)}</code>
                </span>
                <button class="icon-button" id="copyWslPathBtn" data-winpath="${escapeHtml(wslWinPath)}" title="Copy Windows path to clipboard">
                    ${svgs.file}
                </button>
            </div>`
            : '';

        const workdataHtml = hasWorkspaceOpen ? `<div class="section" id="workdata-section">
            <div class="section-header collapsible" data-section="workdata">
                <span class="collapse-icon">${svgs.chevronDown}</span>
                ${svgs.folder}
                <span class="section-title" title="${escapeHtml(effectiveDatasetDir || rawDatasetDir)}">${swatPlusMode ? 'Dataset Folder' : 'Workdata Datasets'}</span>
                <span class="badge">${workdataDatasets.length}</span>
                ${swatPlusMode ? `<button class="icon-button" id="changeDatasetDirBtn" title="Change dataset folder" style="margin-left:auto">
                    ${svgs.folderOpened}
                </button>` : `<button class="icon-button" id="revealWorkdataBtn" title="Reveal dataset folder in Explorer" style="margin-left:auto">
                    ${svgs.folderOpened}
                </button>`}
                <button class="icon-button" id="refreshWorkdataBtn" title="Refresh dataset list">
                    ${svgs.refresh}
                </button>
            </div>
            <div class="section-content" id="workdata-content">
                ${swatPlusMode ? `<div class="dataset-dir-path" title="${escapeHtml(effectiveDatasetDir || datasetDirLabel)}">${escapeHtml(datasetDirLabel)}</div>` : ''}
                ${workdataDatasets.length === 0 ? '' : workdataDatasets.map(p => `
                    <div class="workdata-item" data-path="${escapeHtml(p)}" title="${escapeHtml(p)}" style="cursor:pointer">
                        ${svgs.folder}
                        <div class="recent-item-info">
                            <div class="recent-item-name">${escapeHtml(path.basename(p))}</div>
                            <div class="recent-item-path">${escapeHtml(p)}</div>
                        </div>
                    </div>
                `).join('')}
                <div class="workdata-drop-zone${workdataDatasets.length === 0 ? ' workdata-drop-zone-empty' : ''}" id="workdata-drop-zone">
                    ${svgs.cloudUpload}
                    <span>Drop a dataset folder here</span>
                </div>
                <div class="workdata-tip">${uploadTip}</div>
            </div>
        </div>` : '';

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

        #buildIndexBtn {
            background-color: #7c3aed;
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
            min-height: 50px; /* Ensure header doesn't get cut off */
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
            min-height: 32px; /* Ensure path section doesn't get cut off */
        }

        .selected-window-path-scroll .dataset-header-path {
            display: inline-block;
            min-width: 100%;
            white-space: nowrap;
        }

        .selected-window-actions {
            padding: 10px;
            background-color: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .selected-window-actions .action-button {
            width: 100%;
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
            min-height: 150px; /* Ensure minimum height for content visibility */
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
            max-height: 300px; /* Match outputs section default size */
            min-height: 100px; /* Ensure minimum height for file list visibility */
        }

        /* Recent height: flexible min/max to accommodate drop hint when empty */
        #recent-content {
            max-height: 136px; /* ~4 items, slightly smaller */
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

        .no-workspace-banner {
            display: flex;
            align-items: flex-start;
            gap: 6px;
            background: var(--vscode-inputValidation-warningBackground, rgba(255,204,0,0.15));
            border: 1px solid var(--vscode-inputValidation-warningBorder, rgba(255,204,0,0.5));
            border-radius: 4px;
            padding: 8px 10px;
            margin-bottom: 8px;
            font-size: 11px;
            color: var(--vscode-foreground);
            line-height: 1.5;
        }

        .no-workspace-banner .codicon {
            flex-shrink: 0;
            margin-top: 1px;
            color: var(--vscode-editorWarning-foreground, #ffcc00);
        }

        .no-workspace-banner a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
        }

        .no-workspace-banner a:hover {
            text-decoration: underline;
        }

        .no-workspace-banner code {
            font-family: var(--vscode-editor-font-family, monospace);
            background: var(--vscode-textCodeBlock-background);
            padding: 0 3px;
            border-radius: 3px;
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
            max-height: 250px; /* Increased from 200px for better checkbox visibility */
            overflow-y: auto; /* Add scrollbar when content exceeds max-height */
            overflow-x: hidden;
        }

        .filter-toolbar label {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            color: var(--vscode-foreground);
        }

        .schema-version {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .schema-version-inline {
            margin-top: 6px;
            padding-left: 4px;
        }

        .schema-version-label {
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .build-index-button {
            display: flex;
            align-items: center;
            gap: 10px;
            padding-left: 48px;
            position: relative;
        }

        .build-index-row {
            position: relative;
        }

        .build-index-icon {
            display: inline-flex;
            align-items: center;
            position: absolute;
            left: 14px;
        }

        .build-index-label {
            display: inline-flex;
            align-items: center;
        }

        .build-index-select {
            -webkit-appearance: none;
            -moz-appearance: none;
            appearance: none;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 0 22px 0 6px;
            font-size: 12px;
            width: 28px;
            height: 28px;
            position: absolute;
            top: 50%;
            left: 32px;
            transform: translateY(-50%);
            text-transform: none;
            background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23c5c5c5' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M6 9l6 6 6-6'/></svg>");
            background-repeat: no-repeat;
            background-position: center;
            cursor: pointer;
        }

        .build-index-select:hover {
            background-color: #f4f4f4;
        }

        .build-index-select:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }

        .build-index-button.disabled + .build-index-select,
        .build-index-select:disabled {
            opacity: 0.6;
            cursor: not-allowed;
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

        /* Dataset sections for Inputs and Outputs */
        .dataset-section {
            margin-bottom: 12px;
        }

        .dataset-section .section-header {
            background-color: var(--vscode-sideBarSectionHeader-background);
            cursor: pointer;
            user-select: none;
        }

        .dataset-section .section-header:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .dataset-section .section-header.collapsed + .selected-window-body {
            display: none;
        }

        .dataset-section .selected-window-body {
            border-left: 2px solid var(--vscode-panel-border);
            margin-left: 8px;
            padding-left: 0;
        }

        .output-item {
            opacity: 0.85;
        }

        .output-item:hover {
            opacity: 1;
        }

        #output-files-content {
            overflow-y: auto;
            padding-right: 6px;
            max-height: 300px;
            min-height: 100px; /* Ensure minimum height for output files visibility */
        }

        .back-item {
            background-color: var(--vscode-list-hoverBackground);
            font-weight: 600;
            border-bottom: 1px solid var(--vscode-panel-border);
            margin-bottom: 4px;
        }

        .back-item:hover {
            background-color: var(--vscode-list-activeSelectionBackground);
        }

        .section-path-info {
            padding: 6px 10px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            background-color: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            overflow-x: auto;
            white-space: nowrap;
        }

        /* Context menu styles */
        .context-menu {
            position: fixed;
            background-color: var(--vscode-menu-background);
            border: 1px solid var(--vscode-menu-border);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            z-index: 10000;
            min-width: 180px;
            border-radius: 4px;
            overflow: hidden;
        }

        .context-menu-item {
            padding: 8px 16px;
            cursor: pointer;
            font-size: 12px;
            color: var(--vscode-menu-foreground);
            transition: background-color 0.1s ease;
        }

        .context-menu-item:hover {
            background-color: var(--vscode-menu-selectionBackground);
            color: var(--vscode-menu-selectionForeground);
        }

        /* Environment indicator badge */
        .env-badge {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 5px 8px;
            margin-top: 8px;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            cursor: default;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .env-badge-label {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* Drag-and-drop styles for recent datasets */
        #recent-section.drag-over .section-content {
            background-color: var(--vscode-list-dropBackground, rgba(0, 120, 215, 0.1));
            border: 1px dashed var(--vscode-focusBorder);
            border-radius: 4px;
        }

        .drop-zone-hint {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 4px 8px;
            margin-top: 4px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            opacity: 0.6;
            border: 1px dashed var(--vscode-panel-border);
            border-radius: 4px;
            pointer-events: none;
        }

        .drop-zone-hint-empty {
            margin-top: 0;
            padding: 12px 8px;
        }

        #recent-content {
            min-height: 40px;
        }

        /* Workdata section */
        .workdata-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 10px;
            border-radius: 4px;
            cursor: pointer;
            transition: background-color 0.1s ease;
        }

        .workdata-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .workdata-drop-zone {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 8px;
            margin-top: 4px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            border: 1px dashed var(--vscode-panel-border);
            border-radius: 4px;
            transition: background-color 0.1s, border-color 0.1s;
        }

        .workdata-drop-zone-empty {
            padding: 14px 8px;
        }

        .workdata-drop-zone.drag-over,
        #workdata-section.drag-over .workdata-drop-zone {
            background-color: var(--vscode-list-dropBackground, rgba(0, 120, 215, 0.1));
            border-color: var(--vscode-focusBorder);
            border-style: solid;
        }

        .workdata-tip {
            margin-top: 6px;
            padding: 6px 8px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            background-color: var(--vscode-editor-infoBackground, rgba(0,120,215,0.06));
            border-left: 2px solid var(--vscode-editorInfo-foreground, #75beff);
            border-radius: 0 4px 4px 0;
            line-height: 1.5;
        }

        .workdata-tip code {
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 10px;
            background-color: var(--vscode-textCodeBlock-background);
            padding: 1px 3px;
            border-radius: 2px;
        }

        /* Dataset directory path label in SWAT+ mode */
        .dataset-dir-path {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            padding: 2px 8px 4px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* WSL mount path row */
        .wsl-mount-row {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 4px 8px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            background-color: var(--vscode-editor-infoBackground, rgba(0,120,215,0.06));
            border-left: 2px solid var(--vscode-editorInfo-foreground, #75beff);
            margin: 4px 0;
        }

        .wsl-mount-label {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .wsl-mount-label code {
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 10px;
            background-color: var(--vscode-textCodeBlock-background);
            padding: 1px 3px;
            border-radius: 2px;
        }
    </style>
</head>
<body>
    <div class="container">
        ${noWorkspaceBanner}
        <div class="actions">
            <div class="button-row">
                <button class="action-button secondary" id="selectDatasetBtn">
                    ${svgs.folderOpened}
                    Select Folder
                </button>
                ${cmakeAvailable ? `<button class="action-button secondary${!this.selectedDataset ? ' disabled' : ''}" id="launchDebugBtn" ${!this.selectedDataset ? 'disabled' : ''}>
                    ${svgs.debugPlay}
                    Debug
                </button>` : ''}
            </div>
            ${hasWorkspaceOpen ? `<button class="action-button secondary" id="uploadDatasetBtn" title="Upload or import a dataset into the workdata/ folder (Codespaces &amp; WSL)">
                ${svgs.cloudUpload}
                Upload Dataset
            </button>` : ''}
        </div>

        <div class="divider"></div>

        <div class="middle">
            ${swatPlusMode ? '' : recentDatasetsHtml}

            ${workdataHtml}

            <!-- Divider separating Dataset list from Selected dataset window -->
            <div class="divider" id="recent-divider" title="Recent / Selected separator"><div class="handle"></div></div>

            ${combinedHtml}
        </div>

        ${wslMountHtml}

        <!-- Build Index button placed outside selected dataset section -->
        <div class="build-index-section" id="build-index-section" style="display: ${this.selectedDataset ? 'block' : 'none'};">
            <div class="build-index-row">
                <button class="action-button primary build-index-button${hasFileCio ? '' : ' disabled'}" id="buildIndexBtn" style="width: 100%; margin-top: 12px;" ${hasFileCio ? '' : 'disabled'}>
                    <span class="build-index-icon">${svgs.database}</span>
                    <span class="build-index-label">${buildIndexLabel}</span>
                </button>
                <select id="schema-select" class="build-index-select"${availableSchemas.length === 0 ? ' disabled' : ''} aria-label="Schema version" title="Select schema version">
                    ${schemaOptionsHtml}
                </select>
            </div>
            ${hasCachedIndex ? `
                <div class="schema-version schema-version-inline">
                    <span class="schema-version-label">file.cio:</span>
                    <span>${escapeHtml(fileCioVersionText)}</span>
                </div>
            ` : ''}
        </div>

        <div class="help-text">
            ${swatPlusMode
                ? `Select a dataset from the <strong>${escapeHtml(datasetDirLabel)}/</strong> folder, or drop a folder into the Dataset Folder section. Use <strong>Debug</strong> to launch a SWAT+ debug session via CMake Tools.`
                : `Select a SWAT+ dataset folder to browse its inputs and outputs.
                    ${cmakeAvailable
                        ? 'Use <strong>Debug</strong> to launch a SWAT+ debug session via CMake Tools.'
                        : 'Install <strong>CMake Tools</strong> to enable debug session support.'}`
            }
        </div>

        <div class="env-badge" title="${escapeHtml(env.description)}">
            <span class="codicon codicon-${escapeHtml(env.icon)}"></span>
            <span class="env-badge-label">${escapeHtml(env.label)}</span>
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

            // Context menu helper
            function showContextMenu(event, items, x, y) {
                // Remove any existing context menu
                const existing = document.getElementById('custom-context-menu');
                if (existing) {
                    existing.remove();
                }
                
                const menu = document.createElement('div');
                menu.id = 'custom-context-menu';
                menu.className = 'context-menu';
                menu.style.left = x + 'px';
                menu.style.top = y + 'px';
                
                items.forEach(item => {
                    const menuItem = document.createElement('div');
                    menuItem.className = 'context-menu-item';
                    menuItem.textContent = item.label;
                    menuItem.addEventListener('click', () => {
                        item.action();
                        menu.remove();
                    });
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
                
                // Close menu on scroll
                document.addEventListener('scroll', () => {
                    menu.remove();
                }, { once: true });
            }

            // Safe lookup to avoid null errors in webview script
            const $ = id => document.getElementById(id);

            // Button click handlers (guarded)
            const selectBtn = $('selectDatasetBtn');
            if (selectBtn) selectBtn.addEventListener('click', () => {
                swatHost.postMessage({ type: 'selectDataset' });
            });

            // 'Select Dataset & Debug' button removed; no handler required.

            const launchBtn = $('launchDebugBtn');
            if (launchBtn) launchBtn.addEventListener('click', () => {
                swatHost.postMessage({ type: 'launchDebug' });
            });

            const uploadBtn = $('uploadDatasetBtn');
            if (uploadBtn) uploadBtn.addEventListener('click', () => {
                swatHost.postMessage({ type: 'uploadDataset' });
            });

            const openFolderLink = document.getElementById('openFolderLink');
            // openFolderLink only exists in the DOM when no workspace is open (rendered by noWorkspaceBanner)
            if (openFolderLink) openFolderLink.addEventListener('click', (e) => {
                e.preventDefault();
                swatHost.postMessage({ type: 'openFolder' });
            });

            const buildIndexBtn = $('buildIndexBtn');
            if (buildIndexBtn) buildIndexBtn.addEventListener('click', () => {
                swatHost.postMessage({ type: 'buildIndex' });
            });

            const loadIndexBtn = $('loadIndexBtn');
            if (loadIndexBtn) loadIndexBtn.addEventListener('click', () => {
                swatHost.postMessage({ type: 'loadIndex' });
            });

            const rebuildIndexBtn = $('rebuildIndexBtn');
            if (rebuildIndexBtn) rebuildIndexBtn.addEventListener('click', () => {
                swatHost.postMessage({ type: 'rebuildIndex' });
            });

            const schemaSelect = $('schema-select');
            if (schemaSelect) {
                schemaSelect.addEventListener('change', (event) => {
                    const target = event.target;
                    const value = target && target.value ? target.value : '';
                    swatHost.postMessage({ type: 'schemaSelectionChanged', path: value });
                });
                schemaSelect.addEventListener('click', (event) => {
                    event.stopPropagation();
                });
                schemaSelect.addEventListener('mousedown', (event) => {
                    event.stopPropagation();
                });
            }

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

            // Drag-and-drop helpers shared by both drop zones

            /**
             * Returns true when the dataTransfer contains file-like data.
             * Checks both 'Files' (Electron/OS file drag) and 'text/uri-list'
             * (present even when 'Files' is absent in VS Code webview sandboxes).
             */
            function hasDragFiles(dataTransfer) {
                if (!dataTransfer) { return false; }
                const types = Array.from(dataTransfer.types);
                return types.includes('Files') || types.includes('text/uri-list');
            }

            /**
             * Extracts an OS filesystem path from a drop event.
             *
             * Strategy (in order):
             *  1. file.path  — Electron extension, works in the main renderer but
             *                  NOT inside VS Code webview sandboxes.
             *  2. text/uri-list — standard; Electron DOES populate this even in
             *                     sandboxed webviews when the source is the OS/Explorer.
             *  3. Returns '' if neither method yields a path.
             */
            function getDroppedFsPath(e) {
                const dt = e.dataTransfer;
                if (!dt) { return ''; }
                // Method 1: Electron File.path (only works outside the webview sandbox)
                const files = dt.files;
                if (files && files.length > 0 && files[0].path) {
                    return files[0].path;
                }
                // Method 2: text/uri-list (works in most local Electron drag scenarios)
                try {
                    const uriList = dt.getData('text/uri-list');
                    if (uriList) {
                        const firstUri = uriList.split(/\r?\n/).find(line => line.trim() && !line.startsWith('#'));
                        if (firstUri) {
                            const url = new URL(firstUri.trim());
                            if (url.protocol === 'file:') {
                                let fsPath = decodeURIComponent(url.pathname);
                                // Windows paths arrive as /C:/Users/... — strip the leading slash
                                if (/^\/[A-Za-z]:\//.test(fsPath)) { fsPath = fsPath.slice(1); }
                                return fsPath;
                            }
                        }
                    }
                } catch (err) { /* invalid URI — ignore */ }
                return '';
            }

            // Drag-and-drop: allow dropping a folder onto the recent datasets section
            const recentSection = document.getElementById('recent-section');
            if (recentSection) {
                recentSection.addEventListener('dragover', (e) => {
                    if (!hasDragFiles(e.dataTransfer)) { return; }
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    recentSection.classList.add('drag-over');
                });
                recentSection.addEventListener('dragleave', (e) => {
                    const rt = e.relatedTarget;
                    if (!rt || !recentSection.contains(/** @type {Node} */ (rt))) {
                        recentSection.classList.remove('drag-over');
                    }
                });
                recentSection.addEventListener('drop', (e) => {
                    e.preventDefault();
                    recentSection.classList.remove('drag-over');
                    const filePath = getDroppedFsPath(e);
                    if (filePath) {
                        try { console.log('SWAT webview: drop dataset', filePath); } catch (err) {}
                        swatHost.postMessage({ type: 'dropDataset', path: filePath });
                    } else {
                        // Path not available (sandboxed / remote env) — open the folder picker
                        try { console.log('SWAT webview: drop — no path, falling back to folder picker'); } catch (err) {}
                        swatHost.postMessage({ type: 'selectDataset' });
                    }
                });
            }

            // Workdata section: click-to-select items
            document.querySelectorAll('.workdata-item').forEach(item => {
                item.addEventListener('click', () => {
                    const p = item.dataset.path;
                    if (p) {
                        try { console.log('SWAT webview: workdata-item clicked', p); } catch (e) {}
                        swatHost.postMessage({ type: 'selectWorkdataDataset', path: p });
                    }
                });
            });

            // Workdata refresh button
            const refreshWorkdataBtn = $('refreshWorkdataBtn');
            if (refreshWorkdataBtn) {
                refreshWorkdataBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    swatHost.postMessage({ type: 'refreshWorkdata' });
                });
            }

            // Workdata reveal button (inspector mode)
            const revealWorkdataBtn = $('revealWorkdataBtn');
            if (revealWorkdataBtn) {
                revealWorkdataBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    swatHost.postMessage({ type: 'revealWorkdataFolder' });
                });
            }

            // Change Dataset Directory button (SWAT+ mode)
            const changeDatasetDirBtn = $('changeDatasetDirBtn');
            if (changeDatasetDirBtn) {
                changeDatasetDirBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    swatHost.postMessage({ type: 'selectDatasetDirectory' });
                });
            }

            // WSL mount path copy button
            const copyWslPathBtn = $('copyWslPathBtn');
            if (copyWslPathBtn) {
                copyWslPathBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const winPath = copyWslPathBtn.dataset.winpath;
                    if (winPath) {
                        navigator.clipboard.writeText(winPath).then(() => {
                            try { console.log('SWAT webview: WSL Windows path copied', winPath); } catch (err) {}
                        }).catch((copyErr) => {
                            try { console.error('SWAT webview: clipboard copy failed', copyErr); } catch (err) {}
                            swatHost.postMessage({ type: 'showError', message: 'Could not copy to clipboard: ' + (copyErr instanceof Error ? copyErr.message : String(copyErr)) });
                        });
                    }
                });
            }

            // Drag-and-drop: workdata drop zone
            const workdataDropZone = $('workdata-drop-zone');
            const workdataSection = $('workdata-section');
            if (workdataDropZone && workdataSection) {
                workdataSection.addEventListener('dragover', (e) => {
                    if (!hasDragFiles(e.dataTransfer)) { return; }
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    workdataDropZone.classList.add('drag-over');
                });
                workdataSection.addEventListener('dragleave', (e) => {
                    const relatedTarget = e.relatedTarget;
                    if (!relatedTarget || !workdataSection.contains(/** @type {Node} */ (relatedTarget))) {
                        workdataDropZone.classList.remove('drag-over');
                    }
                });
                workdataSection.addEventListener('drop', (e) => {
                    e.preventDefault();
                    workdataDropZone.classList.remove('drag-over');
                    const filePath = getDroppedFsPath(e);
                    if (filePath) {
                        try { console.log('SWAT webview: workdata drop', filePath); } catch (err) {}
                        swatHost.postMessage({ type: 'dropDataset', path: filePath });
                    } else {
                        // Path not available (sandboxed / remote env) — open the folder picker
                        try { console.log('SWAT webview: workdata drop — no path, falling back to folder picker'); } catch (err) {}
                        swatHost.postMessage({ type: 'selectDataset' });
                    }
                });
            }

            // TXT explorer item handlers
            document.querySelectorAll('.txt-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    // Check if this is a back navigation item
                    if (item.dataset.action === 'navigate-up') {
                        const section = item.dataset.section || 'inputs';
                        try { console.log('SWAT webview: navigate-up clicked, section:', section); } catch (e) {}
                        swatHost.postMessage({ type: 'navigateUp', section: section });
                        return;
                    }
                    
                    const p = item.dataset.path;
                    const isDir = item.dataset.isdir === 'true';
                    const section = item.dataset.section || 'inputs';
                    
                    if (p) {
                        if (isDir) {
                            // Navigate into directory
                            try { console.log('SWAT webview: navigate to directory', p, 'section:', section); } catch (e) {}
                            swatHost.postMessage({ type: 'navigateToDirectory', path: p, section: section });
                        } else {
                            // Open file - pass section to distinguish inputs from outputs
                            try { console.log('SWAT webview: txt-item clicked', p, 'section:', section); } catch (e) {}
                            swatHost.postMessage({ type: 'openFile', path: p, section: section });
                        }
                    }
                });
                
                // Add context menu handler for input items
                item.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    
                    const p = item.dataset.path;
                    const isDir = item.dataset.isdir === 'true';
                    const section = item.dataset.section || 'inputs';
                    
                    // Only show context menu for input files (not directories or outputs)
                    if (p && !isDir && section === 'inputs') {
                        // Create and show context menu
                        showContextMenu(e, [
                            {
                                label: 'Open File in Editor',
                                action: () => {
                                    try { console.log('SWAT webview: open input in editor via context menu', p); } catch (e) {}
                                    swatHost.postMessage({ type: 'openInputInEditor', path: p });
                                }
                            },
                            {
                                label: 'View as Table (default)',
                                action: () => {
                                    try { console.log('SWAT webview: view as table via context menu', p); } catch (e) {}
                                    swatHost.postMessage({ type: 'openFile', path: p, section: section });
                                }
                            }
                        ], e.clientX, e.clientY);
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
                    if (closest && closest('#uploadDatasetBtn')) {
                        try { console.log('SWAT webview: delegated uploadDataset click'); } catch (e) {}
                        swatHost.postMessage({ type: 'uploadDataset' });
                        return;
                    }
                    if (closest && closest('#buildIndexBtn')) {
                        try { console.log('SWAT webview: delegated buildIndex click'); } catch (e) {}
                        swatHost.postMessage({ type: 'buildIndex' });
                        return;
                    }
                    if (closest && closest('#loadIndexBtn')) {
                        try { console.log('SWAT webview: delegated loadIndex click'); } catch (e) {}
                        swatHost.postMessage({ type: 'loadIndex' });
                        return;
                    }
                    if (closest && closest('#rebuildIndexBtn')) {
                        try { console.log('SWAT webview: delegated rebuildIndex click'); } catch (e) {}
                        swatHost.postMessage({ type: 'rebuildIndex' });
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
                    if (closest && closest('.workdata-item')) {
                        const container = tgt.closest('.workdata-item');
                        const path = container ? container.dataset.path : undefined;
                        try { console.log('SWAT webview: delegated workdata-item click', path); } catch (e) {}
                        if (path) swatHost.postMessage({ type: 'selectWorkdataDataset', path });
                        return;
                    }
                    if (closest && closest('#revealWorkdataBtn')) {
                        try { console.log('SWAT webview: delegated revealWorkdata click'); } catch (e) {}
                        swatHost.postMessage({ type: 'revealWorkdataFolder' });
                        return;
                    }
                    if (closest && closest('#refreshWorkdataBtn')) {
                        try { console.log('SWAT webview: delegated refreshWorkdata click'); } catch (e) {}
                        swatHost.postMessage({ type: 'refreshWorkdata' });
                        return;
                    }
                    if (closest && closest('.txt-item')) {
                        const container = tgt.closest('.txt-item');
                        
                        // Check if this is a back navigation item
                        if (container && container.dataset.action === 'navigate-up') {
                            const section = container.dataset.section || 'inputs';
                            try { console.log('SWAT webview: delegated navigate-up click, section:', section); } catch (e) {}
                            swatHost.postMessage({ type: 'navigateUp', section: section });
                            return;
                        }
                        
                        const p = container ? container.dataset.path : undefined;
                        const isDir = container && container.dataset.isdir === 'true';
                        const section = container ? container.dataset.section || 'inputs' : 'inputs';
                        
                        if (p) {
                            if (isDir) {
                                // Navigate into directory
                                try { console.log('SWAT webview: delegated navigate to directory', p, 'section:', section); } catch (e) {}
                                swatHost.postMessage({ type: 'navigateToDirectory', path: p, section: section });
                            } else {
                                // Open file - pass section to distinguish inputs from outputs
                                try { console.log('SWAT webview: delegated txt-item click', p, 'section:', section); } catch (e) {}
                                swatHost.postMessage({ type: 'openFile', path: p, section: section });
                            }
                        }
                        return;
                    }
                } catch (dd) {
                    try { console.error('SWAT delegated click error', dd); } catch (e) { }
                }
            });

            // Non-interactive divider between Recent and TXTINOUT: intentionally no click handler

            // Set initial heights: recent uses max-height from CSS, txt fills remaining
            function setInitialMiddleHeights() {
                const txtContentLocal = document.getElementById('selected-files-content');
                // Ensure files pane flexes naturally - clear any previously assigned height
                if (txtContentLocal) { try { txtContentLocal.style.height = ''; } catch (e) { } }
            }

            // Apply initial heights now and on resize
            setInitialMiddleHeights();
            window.addEventListener('resize', () => setInitialMiddleHeights());

            // Filter toolbar behavior: map files to categories and filter displayed rows
            (function setupFilterToolbar() {
                const checkboxes = Array.from(document.querySelectorAll('.filter-checkbox'));
                if (!checkboxes.length) {return;}

                function applyFilter() {
                    const activeCats = checkboxes.filter(cb => cb.checked).map(cb => cb.dataset.cat);
                    let visibleCount = 0;

                    document.querySelectorAll('.txt-item:not(.output-item):not(.back-item)').forEach(it => {
                        const item = it;
                        const category = item.dataset.category || '';
                        const isDir = item.dataset.isdir === 'true';
                        
                        let shouldShow = false;
                        
                        if (activeCats.length === 0) {
                            // No categories selected - hide all files
                            shouldShow = false;
                        } else if (isDir) {
                            // For directories, check if they contain files matching any active category
                            const dirCats = (item.dataset.dirCategories || '').split(',').filter(c => c);
                            if (dirCats.length === 0) {
                                // Empty directory or no input files - show it anyway
                                shouldShow = true;
                            } else {
                                // Show if directory contains files matching any active category
                                shouldShow = dirCats.some(cat => activeCats.includes(cat));
                            }
                        } else {
                            // For files - show if matches any active category
                            shouldShow = activeCats.includes(category);
                        }
                        
                        item.style.display = shouldShow ? '' : 'none';
                        if (shouldShow) {
                            visibleCount++;
                        }
                    });
                    
                    // Update the badge count
                    const badge = document.getElementById('inputs-badge');
                    if (badge) {
                        badge.textContent = String(visibleCount);
                    }
                }

                // Wire up events
                checkboxes.forEach(cb => {
                    cb.addEventListener('change', () => {
                        applyFilter();
                        updateSelectAllCheckbox();
                    });
                });

                // Select All checkbox handler
                const selectAllCheckbox = document.getElementById('select-all-checkbox');
                
                function updateSelectAllCheckbox() {
                    if (selectAllCheckbox) {
                        const allChecked = checkboxes.every(cb => cb.checked);
                        const noneChecked = checkboxes.every(cb => !cb.checked);
                        
                        selectAllCheckbox.checked = allChecked;
                        selectAllCheckbox.indeterminate = !allChecked && !noneChecked;
                    }
                }
                
                if (selectAllCheckbox) {
                    selectAllCheckbox.addEventListener('change', () => {
                        const shouldCheck = selectAllCheckbox.checked;
                        
                        // Set all checkboxes to match the select all checkbox
                        checkboxes.forEach(cb => {
                            cb.checked = shouldCheck;
                        });
                        
                        applyFilter();
                    });
                }

                // ensure starting state
                updateSelectAllCheckbox();
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
