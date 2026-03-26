// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SwatDatasetWebviewProvider } from './swatWebviewProvider';
import { SwatIndexer } from './indexer';
import { SwatFKDefinitionProvider } from './fkDefinitionProvider';
import { SwatFKDiagnosticsProvider } from './fkDiagnostics';
import { SwatFilePointerDiagnosticsProvider } from './filePointerDiagnostics';
import { SwatFKDecorationProvider } from './fkDecorations';
import { SwatFKHoverProvider } from './fkHoverProvider';
import { SwatFKReferencesPanel } from './fkReferencesPanel';
import { SwatTableViewerPanel } from './tableViewerPanel';
import { SwatSingleTableViewerPanel } from './singleTableViewerPanel';
import { SchemaEditorPanel } from './schemaEditorPanel';
import { SwatDependencyGraphPanel } from './dependencyGraphPanel';
import { normalizePathForComparison, pathStartsWith } from './pathUtils';
import { detectEnvironment, hasWorkspace, isCmakeToolsInstalled, resolvePathForEnvironment } from './environmentUtils';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	try {
		console.log('SWAT+ Dataset Selector extension is now active!');

	// Auto-open the SWAT+ Dataset sidebar panel when the extension activates
	vscode.commands.executeCommand('workbench.view.extension.swat-dataset-selector');

	// Initialize indexer and FK features
	const indexer = new SwatIndexer(context);
	// Create and register the webview view provider
	const swatProvider = new SwatDatasetWebviewProvider(context, indexer);
	const webviewViewProvider = vscode.window.registerWebviewViewProvider(
		SwatDatasetWebviewProvider.viewType,
		swatProvider
	);
	const fkDefinitionProvider = new SwatFKDefinitionProvider(indexer);
	const fkHoverProvider = new SwatFKHoverProvider(indexer);
	const fkDiagnostics = new SwatFKDiagnosticsProvider(indexer, context);
	const filePointerDiagnostics = new SwatFilePointerDiagnosticsProvider(indexer, context);
	const fkDecorations = new SwatFKDecorationProvider(indexer, context);

	const tryAutoLoadIndex = async (datasetPath: string): Promise<void> => {
		if (!indexer.hasIndexCache(datasetPath)) {
			return;
		}

		const success = await indexer.loadIndexFromCache(datasetPath);
		if (success) {
			fkDiagnostics.updateDiagnostics();
			filePointerDiagnostics.updateDiagnostics();
			fkDecorations.refresh();
		}
	};

	// Register FK definition provider for SWAT+ files
	// Use a more flexible document selector that matches all files in TxtInOut
	// and all SWAT+ file extensions found in the schema and documentation
	const swatFileExtensions = [
		// Common input files
		'hru', 'hyd', 'sol', 'lum', 'ini', 'sno', 'plt', 'dtl', 'fld', 'sch',
		'aqu', 'cha', 'res', 'bsn', 'cli', 'prt', 'ops', 'pst', 'sft', 'cal',
		'cio', 'cnt', 'sim', 'wet', 'str', 'sep', 'frt', 'til', 'urb',
		// Data and configuration files
		'aa', 'act', 'allo', 'alt', 'auto', 'base', 'code', 'col', 'conc', 'cond',
		'cs', 'dat', 'days', 'def', 'del', 'dr', 'ele', 'elem', 'exc', 'file',
		'grid', 'hmd', 'hrus', 'int', 'item', 'lin', 'locs', 'lsus', 'mon', 'mtl',
		'ob', 'op', 'out', 'pcp', 'pth', 'rec', 'road', 'rtu', 'slr', 'slt',
		'src', 'sta', 'tmp', 'txt', 'val', 'wnd', 'wro', 'yr', 'zone',
		// Pesticide and path files
		'pes', 'con'
	];
	const documentSelectors = [
		{ pattern: '**/TxtInOut/**' },
		{ pattern: '**/TxtInOut/*' },
		// Register for all SWAT+ file extensions
		...swatFileExtensions.map(ext => ({ scheme: 'file' as const, pattern: `**/*.${ext}` }))
	];
	const definitionProviderDisposable = vscode.languages.registerDefinitionProvider(
		documentSelectors,
		fkDefinitionProvider
	);

	// Register FK hover provider
	const hoverProviderDisposable = vscode.languages.registerHoverProvider(
		documentSelectors,
		fkHoverProvider
	);

	// Command to select dataset folder
	const selectDataset = vscode.commands.registerCommand('swat-dataset-selector.selectDataset', async () => {
		const result = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			openLabel: 'Select SWAT+ Dataset Folder',
			title: 'Select SWAT+ Dataset Folder'
		});

		if (result && result.length > 0) {
			const selectedPath = result[0].fsPath;
			swatProvider.setSelectedDataset(selectedPath);
			vscode.window.showInformationMessage(`SWAT+ Dataset folder selected: ${selectedPath}`);
			await tryAutoLoadIndex(selectedPath);
		}
	});

	// Command to select dataset and launch debug
	const selectAndDebug = vscode.commands.registerCommand('swat-dataset-selector.selectAndDebug', async () => {
		const result = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			openLabel: 'Select SWAT+ Dataset Folder',
			title: 'Select SWAT+ Dataset Folder'
		});

		if (!result || result.length === 0) {
			vscode.window.showWarningMessage('No dataset folder selected.');
			return;
		}

		const selectedPath = result[0].fsPath;
		swatProvider.setSelectedDataset(selectedPath);
		vscode.window.showInformationMessage(`Selected dataset: ${selectedPath}`);
		await tryAutoLoadIndex(selectedPath);

		await launchDebugSession(selectedPath);
	});

	// Command to launch debug with previously selected folder
	const launchWithSelected = vscode.commands.registerCommand('swat-dataset-selector.launchDebug', async () => {
		const selectedPath = swatProvider.getSelectedDataset();
		if (!selectedPath) {
			vscode.window.showWarningMessage('No dataset folder selected. Please select a folder first.');
			return;
		}

		await launchDebugSession(selectedPath);
	});

	// Variable resolver for launch.json
	const datasetFolderProvider = vscode.commands.registerCommand('swat-dataset-selector.getDatasetFolder', () => {
		return swatProvider.getSelectedDataset() || undefined;
	});

	// Command to select a recent dataset
	const selectRecentDataset = vscode.commands.registerCommand('swat-dataset-selector.selectRecentDataset', async (datasetPath: string) => {
		swatProvider.setSelectedDataset(datasetPath);
		vscode.window.showInformationMessage(`SWAT+ Dataset folder selected: ${datasetPath}`);
		await tryAutoLoadIndex(datasetPath);
	});

	// Command to show dataset info
	const showDatasetInfo = vscode.commands.registerCommand('swat-dataset-selector.showDatasetInfo', async (datasetPath: string) => {
		vscode.window.showInformationMessage(`Current dataset: ${datasetPath}`);
	});

	// Command to open a file from the webview explorer
	const openFile = vscode.commands.registerCommand('swat-dataset-selector.openFile', async (filePath: string) => {
		if (!filePath || typeof filePath !== 'string') {
			return;
		}
		try {
			const doc = await vscode.workspace.openTextDocument(filePath);
			await vscode.window.showTextDocument(doc, { preview: false });
		} catch (err) {
			console.error('Failed to open file', err);
			vscode.window.showErrorMessage('Failed to open file: ' + (err instanceof Error ? err.message : String(err)));
		}
	});

	// Command to close a specific open file (if open)
	const closeFile = vscode.commands.registerCommand('swat-dataset-selector.closeFile', async (filePath: string) => {
		if (!filePath || typeof filePath !== 'string') {
			return;
		}
		try {
			// Find if the document is open
			const normalizedPath = normalizePathForComparison(filePath);
			const doc = vscode.workspace.textDocuments.find(d => normalizePathForComparison(d.uri.fsPath || d.fileName) === normalizedPath);
			if (!doc) {
				return;
			}
			// Reveal the document without taking focus, then close active editor
			await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });
			await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
		} catch (err) {
			console.error('Failed to close file', err);
		}
	});

	// Command to close all open editors whose path starts with the given dataset folder
	const closeAllDatasetFiles = vscode.commands.registerCommand('swat-dataset-selector.closeAllDatasetFiles', async (datasetFolder: string | undefined) => {
		if (!datasetFolder) {
			return;
		}
		try {
			// Find open documents that belong to this dataset
			const docs = vscode.workspace.textDocuments.filter(d => d.uri && d.uri.fsPath && pathStartsWith(d.uri.fsPath, datasetFolder));
			for (const doc of docs) {
				try {
					await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });
					await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
				} catch (inner) {
					console.error('Error closing document', doc.uri.fsPath, inner);
				}
			}
		} catch (err) {
			console.error('Failed to close dataset files', err);
		}

		SwatTableViewerPanel.closeAll();
		SwatSingleTableViewerPanel.closeAll();
	});

	// Command: Build Inputs Index (builds or rebuilds)
	const buildIndex = vscode.commands.registerCommand('swat-dataset-selector.buildIndex', async () => {
		const selectedPath = swatProvider.getSelectedDataset();
		if (!selectedPath) {
			vscode.window.showWarningMessage('Please select a SWAT+ dataset folder first.');
			return;
		}

		const success = await indexer.buildIndex(selectedPath);
		if (success) {
			// Update diagnostics and decorations
			fkDiagnostics.updateDiagnostics();
			filePointerDiagnostics.updateDiagnostics();
			fkDecorations.refresh();
			// Open the full table viewer first so file_cio is the last (active) tab
			SwatTableViewerPanel.createOrShow(indexer);
			// Automatically open file_cio table after successful index build
			SwatSingleTableViewerPanel.createOrShow(indexer, 'file_cio');
		}
	});

	const showDependencyGraph = vscode.commands.registerCommand('swat-dataset-selector.showDependencyGraph', async () => {
		if (!indexer.isIndexBuilt()) {
			vscode.window.showWarningMessage('No index available. Build or load an index first.');
			return;
		}

		SwatDependencyGraphPanel.createOrShow(indexer);
	});

	const runDataQualityPreflight = vscode.commands.registerCommand('swat-dataset-selector.runDataQualityPreflight', async () => {
		if (!indexer.isIndexBuilt()) {
			vscode.window.showWarningMessage('No index available. Build or load an index first.');
			return;
		}

		const stats = indexer.getIndexStats();
		const allRefs = indexer.getAllFKReferences();
		const unresolvedRefs = allRefs.filter(ref => !ref.resolved);
		const unresolvedByTarget = new Map<string, number>();
		const unresolvedBySourceColumn = new Map<string, number>();

		for (const ref of unresolvedRefs) {
			const targetKey = `${ref.targetTable}.${ref.targetColumn}`;
			unresolvedByTarget.set(targetKey, (unresolvedByTarget.get(targetKey) || 0) + 1);
			const sourceKey = `${ref.sourceTable}.${ref.sourceColumn}`;
			unresolvedBySourceColumn.set(sourceKey, (unresolvedBySourceColumn.get(sourceKey) || 0) + 1);
		}

		const tableData = indexer.getIndexData();
		const outboundByRow = new Map<string, number>();
		for (const ref of allRefs) {
			const rowKey = `${ref.sourceTable}:${ref.sourceFile}:${ref.sourceLine}`;
			outboundByRow.set(rowKey, (outboundByRow.get(rowKey) || 0) + 1);
		}

		const orphanRows: Array<{ table: string; file: string; line: number; pk: string }> = [];
		for (const [tableName, rows] of tableData.entries()) {
			for (const row of rows.values()) {
				const inbound = indexer.getReferencesToRow(tableName, row.pkValue).length;
				const outbound = outboundByRow.get(`${tableName}:${row.file}:${row.lineNumber}`) || 0;
				if (inbound === 0 && outbound === 0) {
					orphanRows.push({ table: tableName, file: row.file, line: row.lineNumber, pk: row.pkValue });
				}
			}
		}

		orphanRows.sort((a, b) => {
			if (a.table !== b.table) {
				return a.table.localeCompare(b.table);
			}
			return a.line - b.line;
		});

		// Collect file pointer issues
		const filePointerIssues = indexer.getFilePointerIssues();

		const sortMapDesc = (input: Map<string, number>): Array<[string, number]> => {
			return Array.from(input.entries()).sort((a, b) => b[1] - a[1]);
		};

		const topUnresolvedTargets = sortMapDesc(unresolvedByTarget).slice(0, 25);
		const topUnresolvedSources = sortMapDesc(unresolvedBySourceColumn).slice(0, 25);
		const orphanSample = orphanRows.slice(0, 200);
		const filePointerSample = filePointerIssues.slice(0, 200);

		const selectedPath = indexer.getDatasetPath();
		const outputDir = selectedPath || context.extensionPath;
		const outPath = path.join(outputDir, 'data-quality-preflight.md');

		const lines: string[] = [];
		lines.push('# SWAT+ Data Quality Preflight Report');
		lines.push('');
		lines.push(`Generated: ${new Date().toISOString()}`);
		lines.push(`Dataset: ${selectedPath || '(unknown)'}`);
		lines.push('');
		lines.push('## Summary');
		lines.push(`- Tables indexed: ${stats.tableCount}`);
		lines.push(`- Rows indexed: ${stats.rowCount}`);
		lines.push(`- Foreign key references: ${stats.fkCount}`);
		lines.push(`- Resolved references: ${stats.resolvedFkCount}`);
		lines.push(`- Unresolved references: ${stats.unresolvedFkCount}`);
		lines.push(`- Missing file pointers: ${filePointerIssues.length}`);
		lines.push(`- Potential orphan rows (no inbound and no outbound refs): ${orphanRows.length}`);
		lines.push('');

		lines.push('## Missing file pointers (sample, max 200)');
		lines.push('_File pointer columns that reference files which do not exist in the dataset folder._');
		if (filePointerSample.length === 0) {
			lines.push('- None');
		} else {
			lines.push('| source file | line | column | missing file |');
			lines.push('|---|---:|---|---|');
			for (const issue of filePointerSample) {
				const sourceBase = path.basename(issue.sourceFile);
				lines.push(`| ${sourceBase} | ${issue.sourceLine} | ${issue.sourceColumn} | ${issue.referencedFile} |`);
			}
			if (filePointerIssues.length > filePointerSample.length) {
				lines.push('');
				lines.push(`_Only first ${filePointerSample.length} issues shown._`);
			}
		}
		lines.push('');

		lines.push('## Top unresolved targets');
		if (topUnresolvedTargets.length === 0) {
			lines.push('- None');
		} else {
			for (const [target, count] of topUnresolvedTargets) {
				lines.push(`- ${target}: ${count}`);
			}
		}
		lines.push('');

		lines.push('## Top unresolved source columns');
		if (topUnresolvedSources.length === 0) {
			lines.push('- None');
		} else {
			for (const [source, count] of topUnresolvedSources) {
				lines.push(`- ${source}: ${count}`);
			}
		}
		lines.push('');

		lines.push('## Potential orphan rows (sample, max 200)');
		if (orphanSample.length === 0) {
			lines.push('- None');
		} else {
			lines.push('| table | pk | file | line |');
			lines.push('|---|---|---|---:|');
			for (const row of orphanSample) {
				lines.push(`| ${row.table} | ${row.pk} | ${row.file} | ${row.line} |`);
			}
			if (orphanRows.length > orphanSample.length) {
				lines.push('');
				lines.push(`_Only first ${orphanSample.length} rows shown._`);
			}
		}

		fs.writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf-8');

		const doc = await vscode.workspace.openTextDocument(outPath);
		await vscode.window.showTextDocument(doc, { preview: false });
		vscode.window.showInformationMessage(`Data quality preflight report created: ${outPath}`);
	});

	// Command: Check Input Files - dedicated file pointer checker
	const checkInputFiles = vscode.commands.registerCommand('swat-dataset-selector.checkInputFiles', async () => {
		if (!indexer.isIndexBuilt()) {
			vscode.window.showWarningMessage('No index available. Build or load an index first.');
			return;
		}

		const issues = indexer.getFilePointerIssues();

		// Refresh diagnostics so the Problems panel reflects the latest state
		filePointerDiagnostics.updateDiagnostics();

		if (issues.length === 0) {
			vscode.window.showInformationMessage('SWAT+ Input File Check: No missing file pointers found. All referenced files exist.');
			return;
		}

		// Group issues by missing file for a concise summary
		const missingFiles = new Map<string, number>();
		for (const issue of issues) {
			missingFiles.set(issue.referencedFile, (missingFiles.get(issue.referencedFile) || 0) + 1);
		}

		const summary = Array.from(missingFiles.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10)
			.map(([file, count]) => `"${file}" (${count} reference${count > 1 ? 's' : ''})`)
			.join(', ');

		const moreText = missingFiles.size > 10 ? ` and ${missingFiles.size - 10} more` : '';
		const message = `SWAT+ Input File Check: ${issues.length} missing file pointer${issues.length > 1 ? 's' : ''} found. ` +
			`Missing: ${summary}${moreText}. See the Problems panel for details.`;

		const choice = await vscode.window.showWarningMessage(message, 'Open Problems Panel');
		if (choice === 'Open Problems Panel') {
			vscode.commands.executeCommand('workbench.action.problems.focus');
		}
	});

	// Command: Load cached index
	const loadIndex = vscode.commands.registerCommand('swat-dataset-selector.loadIndex', async () => {
		const selectedPath = swatProvider.getSelectedDataset();
		if (!selectedPath) {
			vscode.window.showWarningMessage('No dataset folder selected. Please select a folder first.');
			return;
		}

		if (!indexer.hasIndexCache(selectedPath)) {
			vscode.window.showWarningMessage('No cached index found in the selected dataset.');
			return;
		}

		const success = await indexer.loadIndexFromCache(selectedPath);
		if (success) {
			// Update diagnostics and decorations
			fkDiagnostics.updateDiagnostics();
			filePointerDiagnostics.updateDiagnostics();
			fkDecorations.refresh();
			SwatTableViewerPanel.createOrShow(indexer);
			SwatSingleTableViewerPanel.createOrShow(indexer, 'file_cio');
		}
	});

	// Command: Rebuild Inputs Index
	const rebuildIndex = vscode.commands.registerCommand('swat-dataset-selector.rebuildIndex', async () => {
		if (!indexer.isIndexBuilt()) {
			vscode.window.showWarningMessage('No index exists yet. Use "Build Index" first.');
			return;
		}

		const success = await indexer.rebuildIndex();
		if (success) {
			// Update diagnostics and decorations
			fkDiagnostics.updateDiagnostics();
			filePointerDiagnostics.updateDiagnostics();
			fkDecorations.refresh();
			// Open the full table viewer first so file_cio is the last (active) tab
			SwatTableViewerPanel.createOrShow(indexer);
			// Automatically open file_cio table after successful index rebuild
			SwatSingleTableViewerPanel.createOrShow(indexer, 'file_cio');
		}
	});

	// Command: Show FK References Panel
	const showFKReferences = vscode.commands.registerCommand('swat-dataset-selector.showFKReferences', () => {
		SwatFKReferencesPanel.createOrShow(indexer);
	});

	// Command: Show table viewer
	const showTableViewer = vscode.commands.registerCommand('swat-dataset-selector.showTableViewer', (filePath?: string) => {
		// If a file path is provided, open the single table viewer for that specific file
		if (filePath && typeof filePath === 'string') {
			const resolvedFileName = filePath.includes('/') || filePath.includes('\\')
				? path.basename(filePath)
				: filePath;
			let tableName = indexer.getTableNameFromFile(resolvedFileName);
			if (!tableName) {
				const tableNameFromFile = resolvedFileName.replace(/\./g, '_');
				if (indexer.isTableIndexed(tableNameFromFile)) {
					tableName = tableNameFromFile;
				}
			}
			if (tableName) {
				SwatSingleTableViewerPanel.createOrShow(indexer, tableName);
			} else {
				vscode.window.showWarningMessage(`Could not find table for file: ${resolvedFileName}`);
			}
		} else {
			// Otherwise, show the all-tables viewer
			SwatTableViewerPanel.createOrShow(indexer);
		}
	});

	// Command: Export index to JSON file for inspection
	const exportIndexCmd = vscode.commands.registerCommand('swat-dataset-selector.exportIndex', async () => {
		if (!indexer.isIndexBuilt()) {
			vscode.window.showWarningMessage('Index has not been built yet. Run Build Inputs Index first.');
			return;
		}

		const outFile = await indexer.exportIndexToFile();
		if (outFile) {
			try {
				const doc = await vscode.workspace.openTextDocument(outFile);
				await vscode.window.showTextDocument(doc, { preview: false });
				vscode.window.showInformationMessage(`Index exported: ${outFile}`);
			} catch (err) {
				vscode.window.showInformationMessage(`Index exported to ${outFile} (could not open automatically)`);
			}
		} else {
			vscode.window.showErrorMessage('Failed to export index. See Output for details.');
		}
	});

	// Debug helper: seed test data so the webview shows content for troubleshooting
	const seedTestData = vscode.commands.registerCommand('swat-dataset-selector.seedTestData', async () => {
		try {
			// create a couple fake dataset paths (they don't need to exist)
			const demo1 = `${vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 'C:/workspace' }/data/test_dataset_1`;
			const demo2 = `${vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 'C:/workspace' }/data/test_dataset_2`;
			swatProvider.setSelectedDataset(demo1);
			// directly update recent list in storage so UI shows multiple entries
			context.globalState.update('recentDatasets', [demo1, demo2]);
			swatProvider.setSelectedDataset(demo1);
			vscode.window.showInformationMessage('SWAT+ Dataset test data seeded');
		} catch (err) {
			console.error('Failed to seed test data', err);
			vscode.window.showErrorMessage('Failed to seed test data: ' + (err instanceof Error ? err.message : String(err)));
		}
	});

	// Command: Copy a dataset from another location into workdata/
	const uploadDataset = vscode.commands.registerCommand('swat-dataset-selector.uploadDataset', async () => {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspaceRoot) {
			const action = await vscode.window.showWarningMessage(
				'No workspace folder is open. Open a folder first to use the workdata/ directory.',
				'Open Folder'
			);
			if (action === 'Open Folder') {
				await vscode.commands.executeCommand('vscode.openFolder');
			}
			return;
		}

		const workdataDir = path.join(workspaceRoot, 'workdata');
		if (!fs.existsSync(workdataDir)) {
			fs.mkdirSync(workdataDir, { recursive: true });
		}

		const source = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			openLabel: 'Copy Dataset Here',
			title: 'Select SWAT+ Dataset Folder to Copy into workdata/'
		});
		if (!source || source.length === 0) {
			return;
		}

		const sourcePath = source[0].fsPath;
		const folderName = path.basename(sourcePath);
		const targetPath = path.join(workdataDir, folderName);

		if (fs.existsSync(targetPath)) {
			const confirm = await vscode.window.showWarningMessage(
				`Folder "${folderName}" already exists in workdata/. Overwrite?`,
				{ modal: true },
				'Overwrite'
			);
			if (confirm !== 'Overwrite') {
				return;
			}
		}

		try {
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Copying "${folderName}" to workdata/...`,
					cancellable: false
				},
				async () => {
					fs.cpSync(sourcePath, targetPath, { recursive: true });
				}
			);
			swatProvider.setSelectedDataset(targetPath);
			vscode.window.showInformationMessage(`Dataset "${folderName}" copied to workdata/ and selected.`);
			await tryAutoLoadIndex(targetPath);
		} catch (err) {
			vscode.window.showErrorMessage('Failed to copy dataset: ' + (err instanceof Error ? err.message : String(err)));
		}
	});

	// Command: Open schema editor for a given schema file path
	const editSchema = vscode.commands.registerCommand('swat-dataset-selector.editSchema', (schemaPath?: string) => {
		SchemaEditorPanel.createOrShow(context, schemaPath);
	});

	// Command: Reveal workdata/ folder in the VS Code Explorer
	const revealWorkdataFolder = vscode.commands.registerCommand('swat-dataset-selector.revealWorkdataFolder', async () => {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspaceRoot) {
			const action = await vscode.window.showWarningMessage(
				'No workspace folder is open. Open a folder to use workdata/.',
				'Open Folder'
			);
			if (action === 'Open Folder') {
				await vscode.commands.executeCommand('vscode.openFolder');
			}
			return;
		}
		const workdataDir = path.join(workspaceRoot, 'workdata');
		if (!fs.existsSync(workdataDir)) {
			fs.mkdirSync(workdataDir, { recursive: true });
		}
		await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(workdataDir));
	});

	// Command: Use a folder from the Explorer context menu as the active SWAT+ dataset
	const useAsDataset = vscode.commands.registerCommand('swat-dataset-selector.useAsDataset', async (uri: vscode.Uri) => {
		const folderPath = uri?.fsPath;
		if (!folderPath) {
			vscode.window.showWarningMessage('No folder selected.');
			return;
		}
		swatProvider.setSelectedDataset(folderPath);
		vscode.window.showInformationMessage(`SWAT+ Dataset: ${path.basename(folderPath)}`);
		await tryAutoLoadIndex(folderPath);
	});

	// Status bar item — always visible, shows the active dataset name
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
	statusBarItem.command = 'swat-dataset-selector.switchDataset';
	const updateStatusBar = (dataset: string | undefined) => {
		if (dataset) {
			statusBarItem.text = `$(folder) ${path.basename(dataset)}`;
			statusBarItem.tooltip = `SWAT+ active dataset: ${dataset}\nClick to switch`;
		} else {
			statusBarItem.text = `$(folder) No SWAT+ dataset`;
			statusBarItem.tooltip = 'Click to select a SWAT+ dataset';
		}
	};
	updateStatusBar(swatProvider.getSelectedDataset());
	swatProvider.setOnChangeCallback(updateStatusBar);
	statusBarItem.show();

	// Command: Switch dataset — quick-pick combining workdata/, recent datasets, and browse
	const switchDataset = vscode.commands.registerCommand('swat-dataset-selector.switchDataset', async () => {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		const workdataDir = workspaceRoot ? path.join(workspaceRoot, 'workdata') : undefined;
		const env = detectEnvironment();

		interface SwitchOption extends vscode.QuickPickItem {
			action?: 'select' | 'browse' | 'upload';
			datasetPath?: string;
		}

		const items: SwitchOption[] = [];

		// Workdata datasets — only shown when a workspace is open
		if (workdataDir && fs.existsSync(workdataDir)) {
			const workdataDirs = fs.readdirSync(workdataDir, { withFileTypes: true })
				.filter(e => e.isDirectory())
				.map(e => path.join(workdataDir!, e.name));
			if (workdataDirs.length > 0) {
				items.push({ label: 'workdata/ datasets', kind: vscode.QuickPickItemKind.Separator });
				for (const d of workdataDirs) {
					items.push({
						label: `$(folder) ${path.basename(d)}`,
						description: d,
						action: 'select',
						datasetPath: d
					});
				}
			}
		}

		// Recent datasets (deduplicated against workdata entries already listed)
		const recentDatasets: string[] = context.globalState.get('recentDatasets', []);
		const workdataEntries = new Set(items.filter(i => i.datasetPath).map(i => i.datasetPath!));
		const recentFiltered = recentDatasets.filter(d => !workdataEntries.has(d));
		if (recentFiltered.length > 0) {
			items.push({ label: 'Recent datasets', kind: vscode.QuickPickItemKind.Separator });
			for (const d of recentFiltered.slice(0, 5)) {
				items.push({
					label: `$(history) ${path.basename(d)}`,
					description: d,
					action: 'select',
					datasetPath: d
				});
			}
		}

		// Footer actions
		items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });

		// "Browse" is unavailable in browser UIs (no native file picker)
		if (!env.isBrowserUI) {
			items.push({
				label: '$(folder-opened) Browse for folder...',
				description: 'Open a folder picker',
				action: 'browse'
			});
		}

		items.push({
			label: '$(cloud-upload) Upload / import dataset...',
			description: workspaceRoot
				? 'Copy a dataset into workdata/ or select by path'
				: 'Select or enter a dataset path (open a workspace to enable workdata/ options)',
			action: 'upload'
		});

		const placeHolder = workspaceRoot
			? 'Select a SWAT+ dataset to activate'
			: 'No workspace open — workdata/ options unavailable';

		const chosen = await vscode.window.showQuickPick<SwitchOption>(items, {
			title: 'SWAT+: Switch Dataset',
			placeHolder
		});

		if (!chosen || !chosen.action) {
			return;
		}

		if (chosen.action === 'browse') {
			await vscode.commands.executeCommand('swat-dataset-selector.selectDataset');
		} else if (chosen.action === 'upload') {
			await vscode.commands.executeCommand('swat-dataset-selector.uploadDataset');
		} else if (chosen.action === 'select' && chosen.datasetPath) {
			swatProvider.setSelectedDataset(chosen.datasetPath);
			await tryAutoLoadIndex(chosen.datasetPath);
		}
	});

	context.subscriptions.push(
		webviewViewProvider,
		definitionProviderDisposable,
		hoverProviderDisposable,
		selectDataset,
		selectAndDebug,
		launchWithSelected,
		datasetFolderProvider,
		selectRecentDataset,
		showDatasetInfo,
		openFile,
		closeFile,
		closeAllDatasetFiles,
		buildIndex,
		showDependencyGraph,
		runDataQualityPreflight,
		checkInputFiles,
		loadIndex,
		rebuildIndex,
		showFKReferences,
		showTableViewer,
		exportIndexCmd,
		seedTestData,
		uploadDataset,
		revealWorkdataFolder,
		useAsDataset,
		switchDataset,
		editSchema,
		statusBarItem
	);
	} catch (err) {
		console.error('SWAT+ Dataset Selector activation error', err);
		try {
			vscode.window.showErrorMessage('SWAT+ Dataset Selector activation failed: ' + (err instanceof Error ? err.message : String(err)));
		} catch (e) {
			console.error('Failed to show activation error message', e);
		}
	}

}

async function launchDebugSession(datasetFolder: string) {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

	if (!workspaceFolder) {
		vscode.window.showErrorMessage('No workspace folder found. Open a folder containing your SWAT+ CMake project first.');
		return;
	}

	// Guard: CMake Tools must be installed for the debug launch to work
	if (!isCmakeToolsInstalled()) {
		const action = await vscode.window.showErrorMessage(
			'Debug requires the CMake Tools extension. Install it to launch SWAT+ debug sessions.',
			'Install CMake Tools'
		);
		if (action === 'Install CMake Tools') {
			await vscode.commands.executeCommand('workbench.extensions.search', 'ms-vscode.cmake-tools');
		}
		return;
	}

	// Start debugging with dynamic configuration
	const success = await vscode.debug.startDebugging(workspaceFolder, {
		name: 'SWAT+ Debug with Dataset',
		type: 'cppdbg',
		request: 'launch',
		program: '${command:cmake.launchTargetPath}',
		args: [],
		stopAtEntry: false,
		cwd: datasetFolder,
		environment: [
			{
				name: 'PATH',
				value: '${env:PATH}:${command:cmake.getLaunchTargetDirectory}'
			},
			{
				name: 'OTHER_VALUE',
				value: 'Something something'
			}
		],
		externalConsole: false,
		MIMode: 'gdb',
		setupCommands: [
			{
				description: 'Enable pretty-printing for gdb',
				text: '-enable-pretty-printing',
				ignoreFailures: true
			}
		]
	});

	if (success) {
		vscode.window.showInformationMessage(`Debug session started with dataset: ${datasetFolder}`);
	} else {
		vscode.window.showErrorMessage('Failed to start debug session. Make sure CMake Tools is configured and a build target is selected.');
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
