import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class SwatDatasetProvider implements vscode.TreeDataProvider<SwatTreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<SwatTreeItem | undefined | null | void> = new vscode.EventEmitter<SwatTreeItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<SwatTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

	private selectedDataset: string | undefined;
	private recentDatasets: string[] = [];

	constructor(private context: vscode.ExtensionContext) {
		// Load recent datasets from storage
		this.recentDatasets = this.context.globalState.get('recentDatasets', []);
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: SwatTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: SwatTreeItem): Thenable<SwatTreeItem[]> {
		if (!element) {
			// Root level items
			const items: SwatTreeItem[] = [];

			// Add selected dataset section
			if (this.selectedDataset) {
				items.push(new SwatTreeItem(
					`Selected: ${path.basename(this.selectedDataset)}`,
					this.selectedDataset,
					vscode.TreeItemCollapsibleState.None,
					'selectedDataset',
					{
						command: 'swat-dataset-selector.showDatasetInfo',
						title: 'Show Info',
						arguments: [this.selectedDataset]
					}
				));
			}

			// Add action buttons
			items.push(new SwatTreeItem(
				'Select Dataset Folder',
				'',
				vscode.TreeItemCollapsibleState.None,
				'selectButton',
				{
					command: 'swat-dataset-selector.selectDataset',
					title: 'Select Dataset'
				}
			));

			items.push(new SwatTreeItem(
				'Select and Debug',
				'',
				vscode.TreeItemCollapsibleState.None,
				'debugButton',
				{
					command: 'swat-dataset-selector.selectAndDebug',
					title: 'Select and Debug'
				}
			));

			if (this.selectedDataset) {
				items.push(new SwatTreeItem(
					'Debug with Selected',
					'',
					vscode.TreeItemCollapsibleState.None,
					'launchButton',
					{
						command: 'swat-dataset-selector.launchDebug',
						title: 'Launch Debug'
					}
				));
			}

			// Add recent datasets section
			if (this.recentDatasets.length > 0) {
				items.push(new SwatTreeItem(
					'Recent Datasets',
					'',
					vscode.TreeItemCollapsibleState.Expanded,
					'recentSection'
				));
			}

			return Promise.resolve(items);
		} else if (element.contextValue === 'recentSection') {
			// Show recent datasets
			return Promise.resolve(
				this.recentDatasets.slice(0, 5).map(dataset => 
					new SwatTreeItem(
						path.basename(dataset),
						dataset,
						vscode.TreeItemCollapsibleState.None,
						'recentDataset',
						{
							command: 'swat-dataset-selector.selectRecentDataset',
							title: 'Select Recent Dataset',
							arguments: [dataset]
						}
					)
				)
			);
		}

		return Promise.resolve([]);
	}

	setSelectedDataset(dataset: string) {
		this.selectedDataset = dataset;
		
		// Add to recent datasets
		this.recentDatasets = [dataset, ...this.recentDatasets.filter(d => d !== dataset)].slice(0, 10);
		this.context.globalState.update('recentDatasets', this.recentDatasets);
		
		this.refresh();
	}

	getSelectedDataset(): string | undefined {
		return this.selectedDataset;
	}
}

class SwatTreeItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly datasetPath: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly contextValue: string,
		command?: vscode.Command
	) {
		super(label, collapsibleState);
		this.command = command;
		this.tooltip = datasetPath || label;

		// Set icons based on context
		if (contextValue === 'selectedDataset') {
			this.iconPath = new vscode.ThemeIcon('folder-active');
		} else if (contextValue === 'selectButton') {
			this.iconPath = new vscode.ThemeIcon('folder-opened');
		} else if (contextValue === 'debugButton') {
			this.iconPath = new vscode.ThemeIcon('debug-start');
		} else if (contextValue === 'launchButton') {
			this.iconPath = new vscode.ThemeIcon('debug-alt');
		} else if (contextValue === 'recentDataset') {
			this.iconPath = new vscode.ThemeIcon('folder');
		} else if (contextValue === 'recentSection') {
			this.iconPath = new vscode.ThemeIcon('history');
		}
	}
}
