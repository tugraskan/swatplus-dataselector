import * as vscode from 'vscode';
import { SwatIndexer } from './indexer';

interface GraphEdgeSummary {
    sourceTable: string;
    targetTable: string;
    total: number;
    resolved: number;
    unresolved: number;
    columns: string[];
}

export class SwatDependencyGraphPanel {
    public static currentPanel: SwatDependencyGraphPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, private readonly indexer: SwatIndexer) {
        this.panel = panel;
        this.update();

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    public static createOrShow(indexer: SwatIndexer): void {
        const column = vscode.window.activeTextEditor?.viewColumn;

        if (SwatDependencyGraphPanel.currentPanel) {
            SwatDependencyGraphPanel.currentPanel.panel.reveal(column);
            SwatDependencyGraphPanel.currentPanel.update();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'swatDependencyGraph',
            'SWAT+ Dependency Graph',
            column ?? vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        SwatDependencyGraphPanel.currentPanel = new SwatDependencyGraphPanel(panel, indexer);
    }

    public dispose(): void {
        SwatDependencyGraphPanel.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }

    public refresh(): void {
        this.update();
    }

    private update(): void {
        this.panel.webview.html = this.getHtmlForWebview();
    }

    private getHtmlForWebview(): string {
        if (!this.indexer.isIndexBuilt()) {
            return `
                <html><body style="font-family: sans-serif; padding: 16px;">
                    <h2>SWAT+ Dependency Graph</h2>
                    <p>No index loaded. Build or load an index first.</p>
                </body></html>
            `;
        }

        const refs = this.indexer.getAllFKReferences();
        const stats = this.indexer.getIndexStats();
        const edges = new Map<string, GraphEdgeSummary>();

        for (const ref of refs) {
            const key = `${ref.sourceTable}->${ref.targetTable}`;
            if (!edges.has(key)) {
                edges.set(key, {
                    sourceTable: ref.sourceTable,
                    targetTable: ref.targetTable,
                    total: 0,
                    resolved: 0,
                    unresolved: 0,
                    columns: []
                });
            }

            const edge = edges.get(key)!;
            edge.total += 1;
            if (ref.resolved) {
                edge.resolved += 1;
            } else {
                edge.unresolved += 1;
            }
            if (!edge.columns.includes(ref.sourceColumn)) {
                edge.columns.push(ref.sourceColumn);
            }
        }

        const sortedEdges = Array.from(edges.values()).sort((a, b) => {
            if (b.total !== a.total) {
                return b.total - a.total;
            }
            return `${a.sourceTable}:${a.targetTable}`.localeCompare(`${b.sourceTable}:${b.targetTable}`);
        });

        const tableRows = sortedEdges.map(edge => {
            const unresolvedBadge = edge.unresolved > 0
                ? `<span class="warn">${edge.unresolved} unresolved</span>`
                : '<span class="ok">all resolved</span>';
            return `
                <tr>
                    <td><code>${this.escapeHtml(edge.sourceTable)}</code></td>
                    <td>→</td>
                    <td><code>${this.escapeHtml(edge.targetTable)}</code></td>
                    <td>${edge.total}</td>
                    <td>${edge.resolved}</td>
                    <td>${unresolvedBadge}</td>
                    <td>${this.escapeHtml(edge.columns.sort().join(', '))}</td>
                </tr>
            `;
        }).join('\n');

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>SWAT+ Dependency Graph</title>
                <style>
                    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; }
                    .stats { margin-bottom: 12px; padding: 10px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; }
                    .stats-grid { display: grid; grid-template-columns: repeat(5, minmax(120px, 1fr)); gap: 8px; }
                    .stat-card { background: var(--vscode-editor-background); padding: 8px; border-radius: 6px; border: 1px solid var(--vscode-panel-border); }
                    .stat-label { opacity: 0.8; font-size: 12px; }
                    .stat-value { font-size: 18px; font-weight: 700; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--vscode-panel-border); vertical-align: top; }
                    th { position: sticky; top: 0; background: var(--vscode-editor-background); }
                    code { font-family: var(--vscode-editor-font-family); }
                    .ok { color: var(--vscode-testing-iconPassed); }
                    .warn { color: var(--vscode-editorWarning-foreground); font-weight: 600; }
                </style>
            </head>
            <body>
                <h2>SWAT+ Dependency Graph</h2>
                <div class="stats">
                    <div class="stats-grid">
                        <div class="stat-card"><div class="stat-label">Tables</div><div class="stat-value">${stats.tableCount}</div></div>
                        <div class="stat-card"><div class="stat-label">Rows</div><div class="stat-value">${stats.rowCount}</div></div>
                        <div class="stat-card"><div class="stat-label">FKs</div><div class="stat-value">${stats.fkCount}</div></div>
                        <div class="stat-card"><div class="stat-label">Resolved</div><div class="stat-value">${stats.resolvedFkCount}</div></div>
                        <div class="stat-card"><div class="stat-label">Unresolved</div><div class="stat-value">${stats.unresolvedFkCount}</div></div>
                    </div>
                </div>
                <p>Edge list (source table → target table), sorted by reference volume.</p>
                <table>
                    <thead>
                        <tr>
                            <th>Source</th>
                            <th></th>
                            <th>Target</th>
                            <th>Total refs</th>
                            <th>Resolved</th>
                            <th>Status</th>
                            <th>Columns</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </body>
            </html>
        `;
    }

    private escapeHtml(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
