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
import { SwatFileFormatDiagnosticsProvider } from './fileFormatDiagnostics';
import { SwatFKDecorationProvider } from './fkDecorations';
import { SwatFKHoverProvider } from './fkHoverProvider';
import { EnrichedSchemaProvider, setSharedEnrichedSchema } from './enrichedSchema';
import { SwatDatasetEngine } from './datasetEngine';
import { compareSwatVersions } from './versionUtils';
import { registerSwatChatParticipant } from './chatParticipant';
import { SwatFKReferencesPanel } from './fkReferencesPanel';
import { SwatTableViewerPanel } from './tableViewerPanel';
import { SwatSingleTableViewerPanel } from './singleTableViewerPanel';
import { SchemaEditorPanel } from './schemaEditorPanel';
import { SwatDependencyGraphPanel } from './dependencyGraphPanel';
import { SwatOutputDataFramePanel } from './outputDataFramePanel';
import { normalizePathForComparison, pathStartsWith, resolveFileCioPath } from './pathUtils';
import { detectEnvironment, isCmakeToolsInstalled } from './environmentUtils';
import { generateOutputNotebooks } from './outputNotebookGenerator';
import { inspectHruRange, runHruProcessor, validateHruIdInput } from './hruProcessor';
import { isSelfWrittenFile } from './indexStalenessUtils';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	try {
		console.log('SWAT+ Dataset Selector extension is now active!');

	// Auto-open the SWAT+ Dataset sidebar panel when the extension activates
	vscode.commands.executeCommand('workbench.view.extension.swat-dataset-selector');

	// Initialize indexer and FK features
	const indexer = new SwatIndexer(context);
	const enrichedSchema = new EnrichedSchemaProvider(context);
	setSharedEnrichedSchema(enrichedSchema);
	const datasetEngine = new SwatDatasetEngine(indexer, enrichedSchema);
	registerSwatChatParticipant(context, indexer, datasetEngine);
	const hruProcessorOutput = vscode.window.createOutputChannel('SWAT+ HRU Processor');
	// Create and register the webview view provider
	const swatProvider = new SwatDatasetWebviewProvider(context, indexer);
	const webviewViewProvider = vscode.window.registerWebviewViewProvider(
		SwatDatasetWebviewProvider.viewType,
		swatProvider
	);
	const fkDefinitionProvider = new SwatFKDefinitionProvider(indexer);
	const fkHoverProvider = new SwatFKHoverProvider(indexer, enrichedSchema);
	const fkDiagnostics = new SwatFKDiagnosticsProvider(indexer, context);
	const filePointerDiagnostics = new SwatFilePointerDiagnosticsProvider(indexer, context);
	const fileFormatDiagnostics = new SwatFileFormatDiagnosticsProvider(indexer, context);
	const fkDecorations = new SwatFKDecorationProvider(indexer, context);

	// Status bar item showing which SWAT+ source version the enriched docs target.
	// Shown only once an index is active, so it stays out of unrelated projects.
	const docsVersionStatus = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Right, 90);
	context.subscriptions.push(docsVersionStatus);
	const showDocsVersion = (): void => {
		const version = enrichedSchema.getSwatplusVersion();
		if (!enrichedSchema.isAvailable() || !version) {
			return;
		}

		// Compare the docs version to the dataset's own SWAT+ revision (from the
		// file.cio header). Warn only on a confident mismatch.
		const header = indexer.getFileCioHeaderInfo();
		const datasetVersion = header?.swatRevision ?? header?.editorVersion;
		const drift = compareSwatVersions(datasetVersion, version);

		if (drift === 'major-drift' || drift === 'minor-drift') {
			docsVersionStatus.text = `$(warning) SWAT+ docs ${version}`;
			docsVersionStatus.tooltip =
				`Documentation targets SWAT+ ${version}, but this dataset reports ` +
				`${datasetVersion}. Some column meanings, units, or defaults may not match.`;
			docsVersionStatus.backgroundColor =
				new vscode.ThemeColor('statusBarItem.warningBackground');

			// One dismissable notice per dataset.
			const datasetKey = indexer.getDatasetPath() ?? 'unknown';
			const mementoKey = `swatplus.versionDriftDismissed:${datasetKey}`;
			if (!context.workspaceState.get<boolean>(mementoKey)) {
				vscode.window.showInformationMessage(
					`SWAT+ column documentation targets version ${version}, but this dataset ` +
					`reports ${datasetVersion}. Docs may not perfectly match your dataset.`,
					"Don't show again"
				).then(choice => {
					if (choice === "Don't show again") {
						context.workspaceState.update(mementoKey, true);
					}
				});
			}
		} else {
			docsVersionStatus.text = `$(book) SWAT+ docs ${version}`;
			docsVersionStatus.tooltip =
				`Column documentation sourced from SWAT+ ${version} (swatplus-doc-builder). ` +
				`Hover a column to see its meaning, units, and source.`;
			docsVersionStatus.backgroundColor = undefined;
		}
		docsVersionStatus.show();
	};

	const tryAutoLoadIndex = async (datasetPath: string): Promise<void> => {
		if (!indexer.hasIndexCache(datasetPath)) {
			indexer.clearActiveIndex();
			fkDiagnostics.updateDiagnostics();
			filePointerDiagnostics.updateDiagnostics();
			fileFormatDiagnostics.updateDiagnostics();
			fkDecorations.refresh();
			await updateSwatContextKeys();
			swatProvider.refresh();
			return;
		}

		const success = await indexer.loadIndexFromCache(datasetPath, { notifyIfIncompatible: false });
		if (success) {
			showDocsVersion();
			fkDiagnostics.updateDiagnostics();
			filePointerDiagnostics.updateDiagnostics();
			fileFormatDiagnostics.updateDiagnostics();
			fkDecorations.refresh();
		}
		await updateSwatContextKeys();
		swatProvider.refresh();
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

		// Find open documents that belong to this dataset
		const docs = vscode.workspace.textDocuments.filter(d => d.uri && d.uri.fsPath && pathStartsWith(d.uri.fsPath, datasetFolder));

		// Closing every editor for the dataset is not undoable, so confirm when there
		// is more than a trivial amount to lose. Unsaved work is called out explicitly.
		if (docs.length > 1) {
			const dirtyCount = docs.filter(d => d.isDirty).length;
			const detail = dirtyCount > 0
				? `${dirtyCount} of them ${dirtyCount === 1 ? 'has' : 'have'} unsaved changes.`
				: undefined;
			const confirm = await vscode.window.showWarningMessage(
				`Close all ${docs.length} open files for ${path.basename(datasetFolder)}?`,
				{ modal: true, detail },
				'Close All'
			);
			if (confirm !== 'Close All') {
				return;
			}
		}

		try {
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

		const indexingPrereqs = indexer.getIndexingPrerequisiteStatus(true);
		if (!indexingPrereqs.ready) {
			vscode.window.showWarningMessage(indexingPrereqs.message);
			return;
		}

		const success = await indexer.buildIndex(selectedPath);
		if (success) {
			showDocsVersion();
			// Update diagnostics and decorations
			fkDiagnostics.updateDiagnostics();
			filePointerDiagnostics.updateDiagnostics();
			fileFormatDiagnostics.updateDiagnostics();
			fkDecorations.refresh();
			await updateSwatContextKeys();
			swatProvider.refresh();
			await announceIndexBuilt();
		}
	});

	const getTxtInOutPath = (datasetPath: string): string => {
		const fileCioPath = resolveFileCioPath(datasetPath);
		return fileCioPath ? path.dirname(fileCioPath) : datasetPath;
	};

	const findDatasetExecutables = (datasetPath: string): string[] => {
		const txtInOutPath = getTxtInOutPath(datasetPath);
		if (!fs.existsSync(txtInOutPath)) {
			return [];
		}
		return fs.readdirSync(txtInOutPath, { withFileTypes: true })
			.filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.exe'))
			.map(entry => path.join(txtInOutPath, entry.name));
	};

	const pickSwatExecutable = async (datasetPath: string): Promise<string | undefined> => {
		const candidates = findDatasetExecutables(datasetPath);
		if (candidates.length === 1) {
			return candidates[0];
		}

		if (candidates.length > 1) {
			const pick = await vscode.window.showQuickPick(
				candidates.map(exePath => ({
					label: path.basename(exePath),
					description: exePath,
					exePath
				})),
				{
					title: 'SWAT+: Select Executable',
					placeHolder: 'Choose the SWAT+ executable to run with the HRU subset'
				}
			);
			return pick?.exePath;
		}

		const picked = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			filters: { 'Executable': ['exe'], 'All Files': ['*'] },
			openLabel: 'Select SWAT+ Executable',
			title: 'Select the SWAT+ executable to run with the HRU subset'
		});
		return picked?.[0]?.fsPath;
	};

	interface HruSubsetCommandOptions {
		hruIds?: string;
		keepRouting?: boolean;
		runSwat?: boolean;
	}

	const processHruSubset = async (options: HruSubsetCommandOptions = {}) => {
		const runSwat = options.runSwat === true;
		const selectedPath = swatProvider.getSelectedDataset();
		if (!selectedPath) {
			vscode.window.showWarningMessage('Please select a SWAT+ dataset folder first.');
			return;
		}

		let hruIds = options.hruIds?.trim();
		if (!hruIds) {
			let rangeHint = 'Enter a single HRU ID or ranges, for example: 1,4-6,10.';
			try {
				const range = await inspectHruRange(context, selectedPath, hruProcessorOutput);
				if (range.ok) {
					rangeHint = `Detected HRUs ${range.min_hru}-${range.max_hru} (${range.total_hrus} total). Enter IDs or ranges.`;
				}
			} catch (err) {
				hruProcessorOutput.appendLine(`Could not inspect HRU range: ${err instanceof Error ? err.message : String(err)}`);
			}

			const promptedHruIds = await vscode.window.showInputBox({
				title: runSwat ? 'SWAT+: Create HRU Subset and Run' : 'SWAT+: Create HRU Subset',
				prompt: rangeHint,
				placeHolder: '1,4-6,10',
				validateInput: value => validateHruIdInput(value)
			});
			if (promptedHruIds === undefined) {
				return;
			}
			hruIds = promptedHruIds.trim();
		} else {
			const validationError = validateHruIdInput(hruIds);
			if (validationError) {
				vscode.window.showWarningMessage(validationError);
				return;
			}
		}

		let keepRouting = options.keepRouting;
		if (keepRouting === undefined) {
			const routingPick = await vscode.window.showQuickPick(
				[
					{
						label: 'Isolate HRUs only',
						description: 'Keep selected HRUs and remove downstream routing objects.',
						keepRouting: false
					},
					{
						label: 'Keep downstream routing',
						description: 'Trace and retain connected routing objects.',
						keepRouting: true
					}
				],
				{
					title: 'SWAT+: HRU Subset Routing',
					placeHolder: 'Choose how the subset should handle routing'
				}
			);
			if (!routingPick) {
				return;
			}
			keepRouting = routingPick.keepRouting;
		}

		let executablePath: string | undefined;
		if (runSwat) {
			executablePath = await pickSwatExecutable(selectedPath);
			if (!executablePath) {
				return;
			}
		}

		hruProcessorOutput.clear();
		hruProcessorOutput.appendLine(`Selected dataset: ${selectedPath}`);
		hruProcessorOutput.appendLine(`HRU IDs: ${hruIds}`);
		hruProcessorOutput.appendLine(`Routing: ${keepRouting ? 'keep downstream routing' : 'isolate HRUs only'}`);

		try {
			const result = await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: runSwat ? 'Creating HRU subset and running SWAT+' : 'Creating HRU subset',
					cancellable: false
				},
				async progress => {
					progress.report({ message: 'Processing TxtInOut files...' });
					return runHruProcessor(
						context,
						{
							datasetPath: selectedPath,
							hruIds,
							keepRouting,
							runSwat,
							executablePath
						},
						hruProcessorOutput
					);
				}
			);

			swatProvider.setSelectedDataset(result.output_dir);
			await tryAutoLoadIndex(result.output_dir);

			const countSummary = result.retained_counts
				? Object.entries(result.retained_counts)
					.map(([key, value]) => `${key}: ${value}`)
					.join(', ')
				: `${result.hru_ids.length} HRU${result.hru_ids.length === 1 ? '' : 's'}`;
			const message = `HRU subset created: ${path.basename(result.output_dir)} (${countSummary}).`;
			const choice = await vscode.window.showInformationMessage(
				message,
				'Build Index',
				'Reveal Folder',
				'Show Log'
			);

			if (choice === 'Build Index') {
				await vscode.commands.executeCommand('swat-dataset-selector.buildIndex');
			} else if (choice === 'Reveal Folder') {
				await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(result.output_dir));
			} else if (choice === 'Show Log') {
				hruProcessorOutput.show();
			}
		} catch (err) {
			hruProcessorOutput.show();
			vscode.window.showErrorMessage(`HRU processor failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	const processHruSubsetCmd = vscode.commands.registerCommand('swat-dataset-selector.processHruSubset', async (options?: HruSubsetCommandOptions) => {
		await processHruSubset(options ?? {});
	});

	const processHruSubsetAndRunCmd = vscode.commands.registerCommand('swat-dataset-selector.processHruSubsetAndRun', async (options?: HruSubsetCommandOptions) => {
		await processHruSubset({ ...(options ?? {}), runSwat: true });
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

		// Collect missing FK target files
		const missingFkFileIssues = indexer.getMissingForeignKeyFileIssues();

		// Collect file format issues
		const fileFormatIssueList = indexer.getFileFormatIssues();

		const sortMapDesc = (input: Map<string, number>): Array<[string, number]> => {
			return Array.from(input.entries()).sort((a, b) => b[1] - a[1]);
		};

		const topUnresolvedTargets = sortMapDesc(unresolvedByTarget).slice(0, 25);
		const topUnresolvedSources = sortMapDesc(unresolvedBySourceColumn).slice(0, 25);
		const orphanSample = orphanRows.slice(0, 200);
		const filePointerSample = filePointerIssues.slice(0, 200);
		const missingFkFileSample = missingFkFileIssues.slice(0, 200);
		const fileFormatSample = fileFormatIssueList.slice(0, 200);

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
		lines.push(`- Missing foreign key target files: ${missingFkFileIssues.length}`);
		lines.push(`- File format issues: ${fileFormatIssueList.length}`);
		lines.push(`- Potential orphan rows (no inbound and no outbound refs): ${orphanRows.length}`);
		lines.push('');

		lines.push('## File format issues (sample, max 200)');
		lines.push('_Structural and data-type issues detected in SWAT+ input files._');
		if (fileFormatSample.length === 0) {
			lines.push('- None');
		} else {
			lines.push('| file | line | kind | message |');
			lines.push('|---|---:|---|---|');
			for (const issue of fileFormatSample) {
				const fileBase = path.basename(issue.file);
				const lineStr = issue.line > 0 ? `${issue.line}` : '—';
				lines.push(`| ${fileBase} | ${lineStr} | ${issue.kind} | ${issue.message} |`);
			}
			if (fileFormatIssueList.length > fileFormatSample.length) {
				lines.push('');
				lines.push(`_Only first ${fileFormatSample.length} issues shown._`);
			}
		}
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

		lines.push('## Missing foreign key target files (sample, max 200)');
		lines.push('_Unresolved foreign keys whose target file is not present in the dataset._');
		if (missingFkFileSample.length === 0) {
			lines.push('- None');
		} else {
			lines.push('| source file | line | source column | fk value | missing target file |');
			lines.push('|---|---:|---|---|---|');
			for (const issue of missingFkFileSample) {
				const sourceBase = path.basename(issue.sourceFile);
				lines.push(`| ${sourceBase} | ${issue.sourceLine} | ${issue.sourceColumn} | ${issue.fkValue} | ${issue.targetFile} |`);
			}
			if (missingFkFileIssues.length > missingFkFileSample.length) {
				lines.push('');
				lines.push(`_Only first ${missingFkFileSample.length} issues shown._`);
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

	// Command: Check Input Files - checks file pointers, missing FK target files, and file format issues
	const checkInputFiles = vscode.commands.registerCommand('swat-dataset-selector.checkInputFiles', async () => {
		if (!indexer.isIndexBuilt()) {
			vscode.window.showWarningMessage('No index available. Build or load an index first.');
			return;
		}

		// Collect both categories of issues and refresh diagnostics
		const pointerIssues = indexer.getFilePointerIssues();
		const missingFkFileIssues = indexer.getMissingForeignKeyFileIssues();
		const formatIssues = indexer.getFileFormatIssues();
		filePointerDiagnostics.updateDiagnostics();
		fileFormatDiagnostics.updateDiagnostics();

		const totalIssues = pointerIssues.length + missingFkFileIssues.length + formatIssues.length;

		if (totalIssues === 0) {
			vscode.window.showInformationMessage(
				'SWAT+ Input File Check: No issues found. ' +
				'All checked file pointers and foreign key target files exist, and all checked files are correctly formatted.'
			);
			return;
		}

		const parts: string[] = [];

		if (pointerIssues.length > 0) {
			// Group issues by missing file for a concise summary
			const missingFiles = new Map<string, number>();
			for (const issue of pointerIssues) {
				missingFiles.set(issue.referencedFile, (missingFiles.get(issue.referencedFile) || 0) + 1);
			}
			const summary = Array.from(missingFiles.entries())
				.sort((a, b) => b[1] - a[1])
				.slice(0, 5)
				.map(([file, count]) => `"${file}" (${count} ref${count !== 1 ? 's' : ''})`)
				.join(', ');
			const moreText = missingFiles.size > 5 ? ` +${missingFiles.size - 5} more` : '';
			parts.push(`${pointerIssues.length} missing file pointer${pointerIssues.length > 1 ? 's' : ''} (${summary}${moreText})`);
		}

		if (missingFkFileIssues.length > 0) {
			const missingTargetFiles = new Map<string, number>();
			for (const issue of missingFkFileIssues) {
				missingTargetFiles.set(issue.targetFile, (missingTargetFiles.get(issue.targetFile) || 0) + 1);
			}
			const summary = Array.from(missingTargetFiles.entries())
				.sort((a, b) => b[1] - a[1])
				.slice(0, 5)
				.map(([file, count]) => `"${file}" (${count} ref${count !== 1 ? 's' : ''})`)
				.join(', ');
			const moreText = missingTargetFiles.size > 5 ? ` +${missingTargetFiles.size - 5} more` : '';
			parts.push(`${missingFkFileIssues.length} missing foreign key target file${missingFkFileIssues.length > 1 ? 's' : ''} (${summary}${moreText})`);
		}

		if (formatIssues.length > 0) {
			parts.push(`${formatIssues.length} file format issue${formatIssues.length > 1 ? 's' : ''}`);
		}

		const message = `SWAT+ Input File Check: ${parts.join('; ')}. See the Problems panel for details.`;

		const choice = await vscode.window.showWarningMessage(message, 'Open Problems Panel');
		if (choice === 'Open Problems Panel') {
			vscode.commands.executeCommand('workbench.action.problems.focus');
		}
	});

	const generateOutputNotebooksCmd = vscode.commands.registerCommand('swat-dataset-selector.generateOutputNotebooks', async () => {
		const selectedPath = swatProvider.getSelectedDataset();
		if (!selectedPath) {
			vscode.window.showWarningMessage('No dataset folder selected. Please select a folder first.');
			return;
		}

		const result = generateOutputNotebooks(selectedPath, indexer.getSchema());
		if (result.notebookPaths.length === 0) {
			vscode.window.showWarningMessage('No output files were found to convert into notebooks.');
			return;
		}

		const notebookCount = result.notebookPaths.length;
		const message =
			`Generated ${notebookCount} output notebook${notebookCount === 1 ? '' : 's'} ` +
			`${result.indexNotebookPath ? 'and an index notebook ' : ''}in ${result.outputDir}.`;
		const openLabel = result.indexNotebookPath ? 'Open Index Notebook' : 'Open First Notebook';
		const choice = await vscode.window.showInformationMessage(
			message,
			openLabel,
			'Reveal Folder'
		);

		if (choice === openLabel) {
			const notebookUri = vscode.Uri.file(result.indexNotebookPath ?? result.notebookPaths[0]);
			try {
				const notebookDocument = await vscode.workspace.openNotebookDocument(notebookUri);
				await vscode.window.showNotebookDocument(notebookDocument, { preview: false });
			} catch {
				const textDocument = await vscode.workspace.openTextDocument(notebookUri);
				await vscode.window.showTextDocument(textDocument, { preview: false });
			}
		} else if (choice === 'Reveal Folder') {
			await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(result.outputDir));
		}
	});

	const openOutputAsDataFrameCmd = vscode.commands.registerCommand(
		'swat-dataset-selector.openOutputAsDataFrame',
		async (target?: vscode.Uri | string) => {
			const filePath = typeof target === 'string'
				? target
				: target?.fsPath ?? vscode.window.activeTextEditor?.document.uri.fsPath;

			if (!filePath) {
				vscode.window.showWarningMessage('No file was provided for DataFrame preview.');
				return;
			}

			if (!fs.existsSync(filePath)) {
				vscode.window.showWarningMessage(`File not found: ${filePath}`);
				return;
			}

			SwatOutputDataFramePanel.createOrShow(filePath);
		}
	);

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
			showDocsVersion();
			// Update diagnostics and decorations
			fkDiagnostics.updateDiagnostics();
			filePointerDiagnostics.updateDiagnostics();
			fileFormatDiagnostics.updateDiagnostics();
			fkDecorations.refresh();
			await updateSwatContextKeys();
			swatProvider.refresh();
			SwatTableViewerPanel.createOrShow(indexer);
			SwatSingleTableViewerPanel.createOrShow(indexer, 'file_cio');
		}
	});

	// Command: Rebuild Inputs Index
	const rebuildIndex = vscode.commands.registerCommand('swat-dataset-selector.rebuildIndex', async () => {
		const selectedPath = swatProvider.getSelectedDataset();
		if (!indexer.isIndexBuiltForDataset(selectedPath)) {
			vscode.window.showWarningMessage('No index exists yet. Use "Build Index" first.');
			return;
		}

		const indexingPrereqs = indexer.getIndexingPrerequisiteStatus(true);
		if (!indexingPrereqs.ready) {
			vscode.window.showWarningMessage(indexingPrereqs.message);
			return;
		}

		const success = await indexer.rebuildIndex();
		if (success) {
			showDocsVersion();
			// Update diagnostics and decorations
			fkDiagnostics.updateDiagnostics();
			filePointerDiagnostics.updateDiagnostics();
			fileFormatDiagnostics.updateDiagnostics();
			fkDecorations.refresh();
			await updateSwatContextKeys();
			// Clears the stale-index banner now that the index matches disk again.
			swatProvider.refresh();
			await announceIndexBuilt();
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

	// Command: Open schema editor for a given schema file path
	const editSchema = vscode.commands.registerCommand('swat-dataset-selector.editSchema', (schemaPath?: string) => {
		SchemaEditorPanel.createOrShow(context, schemaPath);
	});

	// Command: Describe an entity ("hru 81") using the headless dataset engine.
	const describeEntityCmd = vscode.commands.registerCommand('swat-dataset-selector.describeEntity', async () => {
		if (!indexer.isIndexBuilt()) {
			vscode.window.showWarningMessage('Build the inputs index first (SWAT+: Build Inputs Index).');
			return;
		}
		const input = await vscode.window.showInputBox({
			title: 'SWAT+: Describe Entity',
			prompt: 'Entity to describe — e.g. "hru 81", "aquifer 3", or "soils.sol clay_loam"',
			placeHolder: 'hru 81',
			ignoreFocusOut: true,
		});
		if (!input) {
			return;
		}
		// Split into a kind/file token and an id (the last whitespace-separated token).
		const parts = input.trim().split(/\s+/);
		if (parts.length < 2) {
			vscode.window.showWarningMessage('Provide both an entity kind and an id, e.g. "hru 81".');
			return;
		}
		const id = parts[parts.length - 1];
		const kind = parts.slice(0, -1).join(' ');
		const table = datasetEngine.resolveEntityTable(kind);
		if (!table) {
			vscode.window.showWarningMessage(`Could not resolve "${kind}" to a SWAT+ table or file.`);
			return;
		}
		const markdown = datasetEngine.describeEntity(table, id);
		const doc = await vscode.workspace.openTextDocument({ content: markdown, language: 'markdown' });
		await vscode.window.showTextDocument(doc, { preview: true });
		await vscode.commands.executeCommand('markdown.showPreview', doc.uri);
	});

	// Command: Structured search over the indexed dataset.
	const searchDatasetCmd = vscode.commands.registerCommand('swat-dataset-selector.searchDataset', async () => {
		if (!indexer.isIndexBuilt()) {
			vscode.window.showWarningMessage('Build the inputs index first (SWAT+: Build Inputs Index).');
			return;
		}
		const entity = await vscode.window.showInputBox({
			title: 'SWAT+: Search Dataset',
			prompt: 'Table to search — an entity kind (hru), file name (channel.cha), or table name',
			placeHolder: 'channel.cha',
			ignoreFocusOut: true,
		});
		if (!entity) { return; }
		const table = datasetEngine.resolveEntityTable(entity);
		if (!table) {
			vscode.window.showWarningMessage(`Could not resolve "${entity}" to a SWAT+ table or file.`);
			return;
		}

		const mode = await vscode.window.showQuickPick(
			[
				{ label: 'Filter by column', value: 'filter' },
				{ label: 'Find unreferenced (orphan) rows', value: 'orphans' },
			],
			{ title: 'Search mode', ignoreFocusOut: true }
		);
		if (!mode) { return; }

		let markdown: string;
		if (mode.value === 'orphans') {
			markdown = datasetEngine.findOrphans(table);
		} else {
			const columns = datasetEngine.getModel().getRows(table)[0]?.values ?? {};
			const columnNames = Object.keys(columns);
			if (columnNames.length === 0) {
				vscode.window.showWarningMessage(`No rows found in ${entity} to search.`);
				return;
			}
			const column = await vscode.window.showQuickPick(columnNames, { title: 'Column', ignoreFocusOut: true });
			if (!column) { return; }
			const operator = await vscode.window.showQuickPick(
				[
					{ label: 'equals', value: 'equals' as const },
					{ label: 'contains', value: 'contains' as const },
					{ label: '> (greater than)', value: 'gt' as const },
					{ label: '>= (at least)', value: 'gte' as const },
					{ label: '< (less than)', value: 'lt' as const },
					{ label: '<= (at most)', value: 'lte' as const },
					{ label: 'in (comma-separated list)', value: 'in' as const },
					{ label: 'is empty', value: 'is_empty' as const },
				],
				{ title: `Operator for "${column}"`, ignoreFocusOut: true }
			);
			if (!operator) { return; }
			let value: string | undefined;
			if (operator.value !== 'is_empty') {
				value = await vscode.window.showInputBox({
					title: `${column} ${operator.label}`,
					prompt: 'Value to match',
					ignoreFocusOut: true,
				});
				if (value === undefined) { return; }
			}
			markdown = datasetEngine.queryRows(table, [{ column, operator: operator.value, value }]);
		}

		const doc = await vscode.workspace.openTextDocument({ content: markdown, language: 'markdown' });
		await vscode.window.showTextDocument(doc, { preview: true });
		await vscode.commands.executeCommand('markdown.showPreview', doc.uri);
	});

	// Command: Reveal the configured dataset folder in the VS Code Explorer
	const revealWorkdataFolder = vscode.commands.registerCommand('swat-dataset-selector.revealWorkdataFolder', async () => {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspaceRoot) {
			const action = await vscode.window.showWarningMessage(
				'No workspace folder is open. Open a folder to use the dataset folder.',
				'Open Folder'
			);
			if (action === 'Open Folder') {
				await vscode.commands.executeCommand('vscode.openFolder');
			}
			return;
		}
		const datasetDir = swatProvider.getDatasetDirectory() ?? path.join(workspaceRoot, 'workdata');
		if (!fs.existsSync(datasetDir)) {
			fs.mkdirSync(datasetDir, { recursive: true });
		}
		await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(datasetDir));
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

	/**
	 * Report a finished index build and decide what to show afterwards.
	 *
	 * Force-opening both table viewers on every build takes over the editor area even
	 * when the user only wanted navigation to work again, so the behaviour is
	 * configurable and defaults to offering. The build summary and the offer share a
	 * single notification rather than stacking two toasts for one build.
	 */
	const announceIndexBuilt = async (): Promise<void> => {
		const mode = vscode.workspace
			.getConfiguration('swatplus')
			.get<string>('openTablesAfterIndex', 'prompt');

		const { tableCount, fkCount, unresolvedCount } = indexer.getIndexSummary();
		const summary = `Index built: ${tableCount} tables, ${fkCount} FK references`
			+ (unresolvedCount > 0 ? `, ${unresolvedCount} unresolved.` : '.');

		const reveal = () => {
			// Open the full table viewer first so file_cio is the last (active) tab
			SwatTableViewerPanel.createOrShow(indexer);
			SwatSingleTableViewerPanel.createOrShow(indexer, 'file_cio');
		};

		if (mode === 'always') {
			vscode.window.showInformationMessage(summary);
			reveal();
			return;
		}

		if (mode === 'never') {
			vscode.window.showInformationMessage(summary);
			return;
		}

		const choice = await vscode.window.showInformationMessage(summary, 'Open Tables');
		if (choice === 'Open Tables') {
			reveal();
		}
	};

	// --- Context keys ---------------------------------------------------------
	// Drive `when` clauses so the command palette only offers commands that can
	// actually run right now, instead of surfacing commands whose sole effect is
	// to warn "select a dataset first" / "build the index first".
	const updateSwatContextKeys = async (): Promise<void> => {
		const selectedDataset = swatProvider.getSelectedDataset();
		const hasDataset = Boolean(selectedDataset);
		const hasIndex = indexer.isIndexBuiltForDataset(selectedDataset);
		await vscode.commands.executeCommand('setContext', 'swatplus.hasDataset', hasDataset);
		await vscode.commands.executeCommand('setContext', 'swatplus.hasIndex', hasIndex);
	};

	// --- Dataset file watcher -------------------------------------------------
	// Watches the active dataset's TxtInOut folder so the sidebar listing reflects
	// files a SWAT+ run just wrote, and so the index is flagged stale when inputs
	// change underneath it instead of silently drifting out of sync.
	let datasetWatcher: vscode.FileSystemWatcher | undefined;
	let refreshTimer: NodeJS.Timeout | undefined;

	const scheduleSidebarRefresh = () => {
		// Debounce: a SWAT+ run writes many files in quick succession.
		if (refreshTimer) {
			clearTimeout(refreshTimer);
		}
		refreshTimer = setTimeout(() => {
			refreshTimer = undefined;
			swatProvider.refresh();
		}, 400);
	};

	const watchDataset = (datasetPath: string | undefined) => {
		datasetWatcher?.dispose();
		datasetWatcher = undefined;
		if (!datasetPath) {
			return;
		}

		const fileCioPath = resolveFileCioPath(datasetPath);
		const watchRoot = fileCioPath ? path.dirname(fileCioPath) : datasetPath;
		if (!fs.existsSync(watchRoot)) {
			return;
		}

		datasetWatcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(watchRoot, '**/*')
		);

		const onInputTouched = (uri: vscode.Uri) => {
			// index.json is written by the indexer itself — reacting to it would mark
			// the index stale immediately after every successful build, and would also
			// bounce the sidebar on each save.
			if (isSelfWrittenFile(uri.fsPath)) {
				return;
			}
			indexer.markIndexStale(uri.fsPath);
			scheduleSidebarRefresh();
		};

		datasetWatcher.onDidCreate(onInputTouched);
		datasetWatcher.onDidDelete(onInputTouched);
		datasetWatcher.onDidChange(onInputTouched);
		// Not pushed onto context.subscriptions: switching datasets replaces the
		// watcher, and accumulating one disposed entry per switch would grow that
		// array for the life of the session. The disposable registered below owns
		// whichever watcher is current at deactivation.
	};

	watchDataset(swatProvider.getSelectedDataset());
	// Seed the context keys for this session's initial state.
	void updateSwatContextKeys();

	context.subscriptions.push({
		dispose: () => {
			if (refreshTimer) {
				clearTimeout(refreshTimer);
			}
			datasetWatcher?.dispose();
		}
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
	swatProvider.setOnChangeCallback(dataset => {
		updateStatusBar(dataset);
		// Re-point the file watcher at the newly active dataset.
		watchDataset(dataset);
		void updateSwatContextKeys();
	});
	statusBarItem.show();

	// Command: Switch dataset — quick-pick combining recent datasets, dataset folder entries, and browse
	const switchDataset = vscode.commands.registerCommand('swat-dataset-selector.switchDataset', async () => {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		const datasetDir = workspaceRoot ? (swatProvider.getDatasetDirectory() ?? path.join(workspaceRoot, 'workdata')) : undefined;
		const datasetDirLabel = datasetDir
			? (workspaceRoot && datasetDir.startsWith(workspaceRoot)
				? path.relative(workspaceRoot, datasetDir)
				: datasetDir)
			: 'dataset folder';
		const env = detectEnvironment();

		interface SwitchOption extends vscode.QuickPickItem {
			action?: 'select' | 'browse';
			datasetPath?: string;
		}

		const items: SwitchOption[] = [];

		// Recent datasets
		const recentDatasets: string[] = context.globalState.get('recentDatasets', []);
		if (recentDatasets.length > 0) {
			items.push({ label: 'Recent datasets', kind: vscode.QuickPickItemKind.Separator });
			for (const d of recentDatasets.slice(0, 5)) {
				items.push({
					label: `$(history) ${path.basename(d)}`,
					description: d,
					action: 'select',
					datasetPath: d
				});
			}
		}

		// Dataset folder entries — only shown when a workspace is open
		if (datasetDir && fs.existsSync(datasetDir)) {
			const datasetDirs = fs.readdirSync(datasetDir, { withFileTypes: true })
				.filter(e => e.isDirectory())
				.map(e => path.join(datasetDir, e.name));
			if (datasetDirs.length > 0) {
				items.push({ label: `Dataset folder: ${datasetDirLabel}`, kind: vscode.QuickPickItemKind.Separator });
				for (const d of datasetDirs) {
					items.push({
						label: `$(folder) ${path.basename(d)}`,
						description: d,
						action: 'select',
						datasetPath: d
					});
				}
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

		const placeHolder = workspaceRoot
			? 'Select a SWAT+ dataset to activate'
			: 'No workspace open — dataset folder options unavailable';

		const chosen = await vscode.window.showQuickPick<SwitchOption>(items, {
			title: 'SWAT+: Switch Dataset',
			placeHolder
		});

		if (!chosen || !chosen.action) {
			return;
		}

		if (chosen.action === 'browse') {
			await vscode.commands.executeCommand('swat-dataset-selector.selectDataset');
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
		processHruSubsetCmd,
		processHruSubsetAndRunCmd,
		showDependencyGraph,
		runDataQualityPreflight,
		checkInputFiles,
		generateOutputNotebooksCmd,
		openOutputAsDataFrameCmd,
		loadIndex,
		rebuildIndex,
		showFKReferences,
		showTableViewer,
		exportIndexCmd,
		seedTestData,
		revealWorkdataFolder,
		useAsDataset,
		switchDataset,
		editSchema,
		describeEntityCmd,
		searchDatasetCmd,
		statusBarItem,
		hruProcessorOutput
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
