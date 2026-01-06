/**
 * SWAT+ FK References Panel
 * 
 * Provides a webview panel that lists all FK references and file pointers
 * with clickable links to navigate to source and target locations.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { SwatIndexer } from './indexer';

export class SwatFKReferencesPanel {
    public static currentPanel: SwatFKReferencesPanel | undefined;
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
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'navigateToSource':
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
        if (SwatFKReferencesPanel.currentPanel) {
            SwatFKReferencesPanel.currentPanel._panel.reveal(column);
            SwatFKReferencesPanel.currentPanel._update();
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'swatFKReferences',
            'SWAT+ FK References',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        SwatFKReferencesPanel.currentPanel = new SwatFKReferencesPanel(panel, indexer);
    }

    public dispose() {
        SwatFKReferencesPanel.currentPanel = undefined;

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
        this._panel.title = 'SWAT+ FK References';
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        if (!this.indexer.isIndexBuilt()) {
            return this._getNoIndexHtml();
        }

        const allRefs = this.indexer.getAllFKReferences();
        const stats = this.indexer.getIndexStats();
        const fileCioData = this.indexer.getFileCioData();

        // Group references by source file
        const refsByFile = new Map<string, typeof allRefs>();
        for (const ref of allRefs) {
            const fileName = path.basename(ref.sourceFile);
            if (!refsByFile.has(fileName)) {
                refsByFile.set(fileName, []);
            }
            refsByFile.get(fileName)!.push(ref);
        }

        // Sort files alphabetically
        const sortedFiles = Array.from(refsByFile.keys()).sort();

        let refsHtml = '';
        for (const fileName of sortedFiles) {
            const refs = refsByFile.get(fileName)!;
            const resolvedCount = refs.filter(r => r.resolved).length;
            const unresolvedCount = refs.length - resolvedCount;

            refsHtml += `
                <div class="file-section">
                    <h3 class="file-header" onclick="toggleSection('${fileName}')">
                        <span class="toggle-icon">▼</span>
                        ${fileName}
                        <span class="badge">${refs.length} references</span>
                        ${unresolvedCount > 0 ? `<span class="badge-warning">${unresolvedCount} unresolved</span>` : ''}
                    </h3>
                    <div id="${fileName}" class="file-content">
                        <table class="refs-table">
                            <thead>
                                <tr>
                                    <th>Line</th>
                                    <th>Column</th>
                                    <th>Value</th>
                                    <th>Target File</th>
                                    <th>Target</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
            `;

            for (const ref of refs) {
                const targetFileName = this.indexer.getFileNameForTable(ref.targetTable) || ref.targetTable;
                const statusClass = ref.resolved ? 'resolved' : 'unresolved';
                const statusText = ref.resolved ? '✓ Found' : '✗ Not found';
                const targetLink = ref.resolved && ref.targetRow
                    ? `<a href="#" onclick="navigateToTarget('${ref.targetRow.file}', ${ref.targetRow.lineNumber})">${ref.fkValue}</a>`
                    : ref.fkValue;

                refsHtml += `
                    <tr class="${statusClass}">
                        <td><a href="#" onclick="navigateToSource('${ref.sourceFile}', ${ref.sourceLine})">${ref.sourceLine}</a></td>
                        <td>${ref.sourceColumn}</td>
                        <td><code>${ref.fkValue}</code></td>
                        <td>${targetFileName}</td>
                        <td>${targetLink}</td>
                        <td class="status-${statusClass}">${statusText}</td>
                    </tr>
                `;
            }

            refsHtml += `
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        // Add file.cio references section
        let fileCioHtml = '';
        if (fileCioData.size > 0) {
            const totalFiles = this.indexer.getAllFileCioReferences().length;
            fileCioHtml = `
                <div class="file-section">
                    <h3 class="file-header" onclick="toggleSection('file.cio-refs')">
                        <span class="toggle-icon">▼</span>
                        file.cio File References
                        <span class="badge">${fileCioData.size} classifications, ${totalFiles} files</span>
                    </h3>
                    <div id="file.cio-refs" class="file-content">
                        <table class="refs-table">
                            <thead>
                                <tr>
                                    <th>Classification</th>
                                    <th>Files</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
            `;

            const sortedClassifications = Array.from(fileCioData.keys()).sort();
            for (const classification of sortedClassifications) {
                const data = fileCioData.get(classification)!;
                const fileList = data.files.map((file, idx) => {
                    if (data.isDefault[idx]) {
                        return `<span class="null-value">${file}</span>`;
                    }
                    const purpose = this.indexer.getFilePurpose(file) || '';
                    const tooltip = purpose ? `title="${purpose}"` : '';
                    return `<code ${tooltip}>${file}</code>`;
                }).join(' ');
                
                const customizedCount = data.files.filter((_, idx) => !data.isDefault[idx]).length;
                const totalCount = data.files.length;
                const statusText = customizedCount === totalCount 
                    ? `${customizedCount} files` 
                    : `${customizedCount}/${totalCount} customized`;
                
                fileCioHtml += `
                    <tr>
                        <td><strong>${classification}</strong></td>
                        <td>${fileList}</td>
                        <td>${statusText}</td>
                    </tr>
                `;
            }

            fileCioHtml += `
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SWAT+ FK References</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            padding: 20px;
        }
        h1 {
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 10px;
        }
        .stats {
            display: flex;
            gap: 20px;
            margin: 20px 0;
            flex-wrap: wrap;
        }
        .stat-card {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 15px;
            min-width: 150px;
        }
        .stat-value {
            font-size: 24px;
            font-weight: bold;
            color: var(--vscode-charts-blue);
        }
        .stat-label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 5px;
        }
        .file-section {
            margin: 20px 0;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            overflow: hidden;
        }
        .file-header {
            background: var(--vscode-editor-background);
            padding: 12px 15px;
            margin: 0;
            cursor: pointer;
            user-select: none;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .file-header:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .toggle-icon {
            transition: transform 0.2s;
        }
        .collapsed .toggle-icon {
            transform: rotate(-90deg);
        }
        .badge {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
            margin-left: auto;
        }
        .badge-warning {
            background: var(--vscode-editorWarning-foreground);
            color: var(--vscode-editor-background);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
            margin-left: 5px;
        }
        .file-content {
            padding: 15px;
            overflow-x: auto;
        }
        .refs-table {
            width: 100%;
            border-collapse: collapse;
        }
        .refs-table th {
            text-align: left;
            padding: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
            font-weight: bold;
        }
        .refs-table td {
            padding: 6px 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .refs-table tr.resolved {
            background: transparent;
        }
        .refs-table tr.unresolved {
            background: var(--vscode-inputValidation-warningBackground);
        }
        .status-resolved {
            color: var(--vscode-testing-iconPassed);
        }
        .status-unresolved {
            color: var(--vscode-editorWarning-foreground);
        }
        a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        code {
            background: var(--vscode-textCodeBlock-background);
            padding: 2px 4px;
            border-radius: 2px;
            font-family: var(--vscode-editor-font-family);
        }
        .null-value {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            opacity: 0.7;
        }
        .no-index {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <h1>SWAT+ Foreign Key References</h1>
    
    <div class="stats">
        <div class="stat-card">
            <div class="stat-value">${stats.tableCount}</div>
            <div class="stat-label">Tables Indexed</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${stats.fkCount}</div>
            <div class="stat-label">Total FK References</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${stats.resolvedFkCount}</div>
            <div class="stat-label">Resolved</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" style="color: var(--vscode-editorWarning-foreground)">${stats.unresolvedFkCount}</div>
            <div class="stat-label">Unresolved</div>
        </div>
    </div>

    ${fileCioHtml}
    ${refsHtml}

    <script>
        const vscode = acquireVsCodeApi();

        function toggleSection(id) {
            const content = document.getElementById(id);
            const header = content.previousElementSibling;
            if (content.style.display === 'none') {
                content.style.display = 'block';
                header.classList.remove('collapsed');
            } else {
                content.style.display = 'none';
                header.classList.add('collapsed');
            }
        }

        function navigateToSource(file, line) {
            vscode.postMessage({
                command: 'navigateToSource',
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
    </script>
</body>
</html>`;
    }

    private _getNoIndexHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SWAT+ FK References</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            padding: 20px;
        }
        .no-index {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }
        .no-index h2 {
            margin-bottom: 10px;
        }
    </style>
</head>
<body>
    <div class="no-index">
        <h2>No Index Built</h2>
        <p>Please build the SWAT+ inputs index first.</p>
        <p>Use the command: <strong>SWAT+: Build Inputs Index</strong></p>
    </div>
</body>
</html>`;
    }
}
