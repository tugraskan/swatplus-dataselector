// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { SwatDatasetWebviewProvider } from './swatWebviewProvider';
import { SwatDatabaseHelper } from './swatDatabaseHelper';
import { SwatDefinitionProvider } from './swatDefinitionProvider';
import { SwatHoverProvider } from './swatHoverProvider';
import { SwatCodeLensProvider } from './swatCodeLensProvider';
import { SwatDatabaseBrowserProvider } from './swatDatabaseBrowserProvider';
import { SwatCodeActionProvider } from './swatCodeActionProvider';
import { SWAT_FILE_EXTENSIONS } from './swatFileParser';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	console.log('SWAT+ Dataset Selector extension is now active!');

	// Create and register the webview view provider
	const swatProvider = new SwatDatasetWebviewProvider(context);
	const webviewViewProvider = vscode.window.registerWebviewViewProvider(
		SwatDatasetWebviewProvider.viewType,
		swatProvider
	);

	// Create database helper and language providers for SWAT+ file navigation
	const dbHelper = new SwatDatabaseHelper();
	const getSelectedDataset = () => swatProvider.getSelectedDataset();

	// Create database browser provider
	const browserProvider = new SwatDatabaseBrowserProvider(context, dbHelper, getSelectedDataset);

	// Register Definition Provider, Hover Provider, CodeLens Provider, and Code Action Provider for SWAT+ files
	const definitionProvider = new SwatDefinitionProvider(dbHelper, getSelectedDataset);
	const hoverProvider = new SwatHoverProvider(dbHelper, getSelectedDataset);
	const codeLensProvider = new SwatCodeLensProvider(dbHelper, getSelectedDataset);
	const codeActionProvider = new SwatCodeActionProvider(dbHelper, getSelectedDataset, browserProvider);

	const definitionProviderDisposables = SWAT_FILE_EXTENSIONS.map(ext => {
		const selector = { scheme: 'file', pattern: `**/*.${ext}` };
		return [
			vscode.languages.registerDefinitionProvider(selector, definitionProvider),
			vscode.languages.registerHoverProvider(selector, hoverProvider),
			vscode.languages.registerCodeLensProvider(selector, codeLensProvider),
			vscode.languages.registerCodeActionsProvider(selector, codeActionProvider)
		];
	}).flat();

	// Command to open database browser for a specific table and record
	const openDatabaseBrowser = vscode.commands.registerCommand('swat-dataset-selector.openDatabaseBrowser', 
		async (tableName: string, recordName?: string) => {
			await browserProvider.openTable(tableName, recordName);
		}
	);

	// Command to open database browser for hru_data_hru table
	const openHruDataBrowser = vscode.commands.registerCommand('swat-dataset-selector.openHruDataBrowser', 
		async () => {
			await browserProvider.openTable('hru_data_hru');
		}
	);

	// Command to select dataset folder
	const selectDataset = vscode.commands.registerCommand('swat-dataset-selector.selectDataset', async () => {
		const result = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			openLabel: 'Select SWAT+ Dataset Folder',
			title: 'Select SWAT+ Dataset Folder for Debugging'
		});

		if (result && result.length > 0) {
			const selectedPath = result[0].fsPath;
			swatProvider.setSelectedDataset(selectedPath);
			vscode.window.showInformationMessage(`SWAT+ Dataset folder selected: ${selectedPath}`);
		}
	});

	// Command to select dataset and launch debug
	const selectAndDebug = vscode.commands.registerCommand('swat-dataset-selector.selectAndDebug', async () => {
		// First, select the dataset folder
		const result = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			openLabel: 'Select SWAT+ Dataset Folder',
			title: 'Select SWAT+ Dataset Folder for Debugging'
		});

		if (!result || result.length === 0) {
			vscode.window.showWarningMessage('No dataset folder selected.');
			return;
		}

		const selectedPath = result[0].fsPath;
		swatProvider.setSelectedDataset(selectedPath);
		vscode.window.showInformationMessage(`Selected dataset: ${selectedPath}`);

		// Launch debug session with the selected folder
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
	});

	// Command to set selected database (called from webview when user selects a DB file)
	const setSelectedDatabase = vscode.commands.registerCommand('swat-dataset-selector.setSelectedDatabase', async (dbPath: string) => {
		if (!dbPath || typeof dbPath !== 'string') return;
		try {
			swatProvider.setSelectedDataset(path.dirname(dbPath));
			swatProvider.setSelectedDatabase(dbPath);
			vscode.window.showInformationMessage(`Selected database: ${dbPath}`);
			// Auto-open the DB using the viewer (mimic Explorer behavior)
			try {
				await vscode.commands.executeCommand('swat-dataset-selector.openDbWithViewer', dbPath);
			} catch (openErr) {
				console.warn('Auto-open DB failed', openErr);
			}
		} catch (err) {
			console.error('Failed to set selected database', err);
		}
	});

	// Command to import SWAT+ text files into a project database using the bundled python script
	const importTextFiles = vscode.commands.registerCommand('swat-dataset-selector.importTextFiles', async () => {
		const selected = swatProvider.getSelectedDataset();
		if (!selected) {
			vscode.window.showWarningMessage('No dataset selected. Please select a dataset folder first.');
			return;
		}

		// Path to the standalone python script inside the extension (development mode)
		const scriptPath = path.join(context.extensionPath, 'src', 'python-scripts', 'swatplus_api_standalone.py');
		// Build arguments for the import_text_files action. Use project DB file inside the dataset folder by default.
		const projectDb = path.join(selected, 'project.db');
		// Use underscore-style option names to match the standalone script's argparse definitions
		const args = [scriptPath, 'import_text_files', '--txtinout_dir', selected, '--project_db_file', projectDb];

		await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Importing SWAT+ text files', cancellable: false }, () => {
			return new Promise<void>((resolve) => {
				try {
					const py = 'python';
					const proc = cp.spawn(py, args, { cwd: context.extensionPath, shell: false });

					proc.stdout.on('data', d => console.log('[swat-import]', d.toString()));
					proc.stderr.on('data', d => console.error('[swat-import]', d.toString()));
					proc.on('close', code => {
						if (code === 0) {
							vscode.window.showInformationMessage('SWAT+ import completed successfully.');
						} else {
							vscode.window.showErrorMessage(`SWAT+ import failed (exit ${code}). See output for details.`);
						}
						resolve();
					});
					proc.on('error', err => {
						vscode.window.showErrorMessage('Failed to start Python process: ' + String(err));
						resolve();
					});
				} catch (err) {
					console.error('Error running import', err);
					vscode.window.showErrorMessage('Error running import: ' + (err instanceof Error ? err.message : String(err)));
					resolve();
				}
			});
		});
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
			const fileExt = filePath.toLowerCase().split('.').pop();
			
			// Handle database files specially
			if (fileExt === 'db' || fileExt === 'sqlite' || fileExt === 'sqlite3') {
				// Try to open with a SQLite viewer extension
				const uri = vscode.Uri.file(filePath);
				
				// Try common SQLite viewer extensions
				try {
					// Try qwtel.sqlite-viewer first (mentioned in README)
					await vscode.commands.executeCommand('sqlite-viewer.open', uri);
					return;
				} catch (e1) {
					try {
						// Try alexcvzz.vscode-sqlite
						await vscode.commands.executeCommand('sqlite.open', uri);
						return;
					} catch (e2) {
						// If no SQLite viewer is available, show helpful message
						const choice = await vscode.window.showInformationMessage(
							'To view SQLite database files, please install a SQLite viewer extension.',
							'Install qwtel.sqlite-viewer',
							'Copy Path'
						);
						
						if (choice === 'Install qwtel.sqlite-viewer') {
							await vscode.commands.executeCommand('workbench.extensions.installExtension', 'qwtel.sqlite-viewer');
						} else if (choice === 'Copy Path') {
							await vscode.env.clipboard.writeText(filePath);
							vscode.window.showInformationMessage('Database path copied to clipboard');
						}
						return;
					}
				}
			}
			
			// For text files, open normally
			const doc = await vscode.workspace.openTextDocument(filePath);
			await vscode.window.showTextDocument(doc, { preview: false });
		} catch (err) {
			console.error('Failed to open file', err);
			vscode.window.showErrorMessage('Failed to open file: ' + (err instanceof Error ? err.message : String(err)));
		}
	});

	// Command to open a DB explicitly with a SQLite viewer (prefer viewer over text editor)
	const openDbWithViewer = vscode.commands.registerCommand('swat-dataset-selector.openDbWithViewer', async (filePath: string) => {
		if (!filePath || typeof filePath !== 'string') {
			return;
		}
		try {
			const uri = vscode.Uri.file(filePath);
			// Try common viewer commands in order
			const tryCommands = ['sqlite-viewer.open', 'sqlite.open', 'sqltools.openDatabase', 'sqltools.open'];
			for (const cmd of tryCommands) {
				try {
					await vscode.commands.executeCommand(cmd, uri);
					return;
				} catch (e) {
					// ignore and try next
				}
			}

			// Try to find installed extensions with known custom editor ids
			const editorMap: { [id: string]: string } = {
				'qwtel.sqlite-viewer': 'qwtel.sqlite-viewer.viewer',
				'alexcvzz.vscode-sqlite': 'alexcvzz.vscode-sqlite.openEditor'
			};
			// Try to open with VS Code's default editor first (mimics Explorer behavior)
			try {
				await vscode.commands.executeCommand('vscode.open', uri);
				return;
			} catch (e) {
				// ignore and continue to try specific editors
			}
			for (const extId of Object.keys(editorMap)) {
				if (vscode.extensions.getExtension(extId)) {
					try {
						await vscode.commands.executeCommand('vscode.openWith', uri, editorMap[extId]);
						return;
					} catch (e) {
						// ignore
					}
				}
			}

			// Last resort: prompt to install a SQLite viewer or copy path
			const choice = await vscode.window.showInformationMessage(
				'To view SQLite database files, please install a SQLite viewer extension.',
				'Install qwtel.sqlite-viewer',
				'Copy Path'
			);
			if (choice === 'Install qwtel.sqlite-viewer') {
				await vscode.commands.executeCommand('workbench.extensions.installExtension', 'qwtel.sqlite-viewer');
			} else if (choice === 'Copy Path') {
				await vscode.env.clipboard.writeText(filePath);
				vscode.window.showInformationMessage('Database path copied to clipboard');
			}
		} catch (err) {
			console.error('Failed to open DB with viewer', err);
			vscode.window.showErrorMessage('Failed to open DB: ' + (err instanceof Error ? err.message : String(err)));
		}
	});

	// Command to close a specific open file (if open)
	const closeFile = vscode.commands.registerCommand('swat-dataset-selector.closeFile', async (filePath: string) => {
		if (!filePath || typeof filePath !== 'string') {
			return;
		}
		try {
			// Find if the document is open
			const doc = vscode.workspace.textDocuments.find(d => d.fileName === filePath || d.uri.fsPath === filePath);
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
			const docs = vscode.workspace.textDocuments.filter(d => d.uri && d.uri.fsPath && d.uri.fsPath.startsWith(datasetFolder));
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

	context.subscriptions.push(
		webviewViewProvider,
		...definitionProviderDisposables,
		selectDataset,
		selectAndDebug,
		launchWithSelected,
		datasetFolderProvider,
		selectRecentDataset,
		setSelectedDatabase,
		importTextFiles,
		showDatasetInfo
		,openFile
		,openDbWithViewer
		,closeFile
		,closeAllDatasetFiles
		,seedTestData
		,openDatabaseBrowser
		,openHruDataBrowser
	);
}

async function launchDebugSession(datasetFolder: string) {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	
	if (!workspaceFolder) {
		vscode.window.showErrorMessage('No workspace folder found.');
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
		vscode.window.showErrorMessage('Failed to start debug session. Make sure CMake Tools is configured properly.');
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
