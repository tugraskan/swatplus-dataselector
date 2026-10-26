// Starts a real VS Code window with this extension loaded from the source tree
// and drives it through scripts/smoke-runner.js (which runs inside the extension
// host): the panel opens, reads a dataset, previews, the HRU picker opens and
// renders every HRU, and a subset is created. Needs `npm run compile` first.
//
//   node scripts/smoke-vscode.js --dataset <dir> --out-root <dir> [--code <Code.exe>] [--hold <flag file>]
//
// --hold keeps the window open after the checks, until the given file exists,
// so the window can be looked at (or screenshotted). The dataset is only read; the subset goes
// to <out-root>/tool_split_vscode_keep3. The window uses a throw-away user-data and extensions
// folder, so nothing of yours (settings, installed extensions) is touched or loaded.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function argValue(name, fallback) {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const dataset = argValue('dataset');
const outRoot = argValue('out-root');
if (!dataset || !outRoot) {
	console.error('Usage: node scripts/smoke-vscode.js --dataset <dir> --out-root <dir> [--code <Code.exe>] [--hold <flag file>]');
	process.exit(2);
}

function findCode() {
	const explicit = argValue('code', process.env.VSCODE_EXE);
	if (explicit) {
		return explicit;
	}
	const candidates = [
		process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe'),
		'C:\\Program Files\\Microsoft VS Code\\Code.exe',
		'/usr/share/code/code',
		'/Applications/Visual Studio Code.app/Contents/MacOS/Electron'
	].filter(Boolean);
	return candidates.find(candidate => fs.existsSync(candidate));
}

const code = findCode();
if (!code) {
	console.error('VS Code not found. Pass --code <path to Code.exe> or set VSCODE_EXE.');
	process.exit(2);
}

const root = path.resolve(__dirname, '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'hru-smoke-'));
const workspace = path.join(work, 'workspace');
fs.mkdirSync(workspace);
fs.mkdirSync(path.resolve(outRoot), { recursive: true });
const reportFile = path.join(work, 'report.json');

const args = [
	workspace,
	`--extensionDevelopmentPath=${root}`,
	`--extensionTestsPath=${path.join(__dirname, 'smoke-runner.js')}`,
	`--user-data-dir=${path.join(work, 'user-data')}`,
	`--extensions-dir=${path.join(work, 'extensions')}`,
	'--disable-workspace-trust',
	'--skip-welcome',
	'--skip-release-notes',
	'--disable-updates'
];

console.log(`Starting ${code}`);
const child = spawn(code, args, {
	stdio: 'inherit',
	env: {
		...process.env,
		HRU_SMOKE_DATASET: path.resolve(dataset),
		HRU_SMOKE_OUT_ROOT: path.resolve(outRoot),
		HRU_SMOKE_REPORT: reportFile,
		HRU_SMOKE_HOLD: argValue('hold') ? path.resolve(argValue('hold')) : ''
	}
});
child.on('exit', status => {
	let report = '';
	try {
		report = fs.readFileSync(reportFile, 'utf8');
	} catch {
		report = '(no report written)';
	}
	console.log(report);
	console.log(`VS Code exited with ${status}. Work folder: ${work}`);
	process.exit(status === 0 ? 0 : 1);
});
