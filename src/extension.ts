// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { SwatDatasetWebviewProvider } from './swatWebviewProvider';

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

	// Command to show dataset info
	const showDatasetInfo = vscode.commands.registerCommand('swat-dataset-selector.showDatasetInfo', async (datasetPath: string) => {
		vscode.window.showInformationMessage(`Current dataset: ${datasetPath}`);
	});

	context.subscriptions.push(
		webviewViewProvider,
		selectDataset,
		selectAndDebug,
		launchWithSelected,
		datasetFolderProvider,
		selectRecentDataset,
		showDatasetInfo
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
