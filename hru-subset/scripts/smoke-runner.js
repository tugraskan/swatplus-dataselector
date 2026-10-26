// Runs inside the VS Code extension host (see smoke-vscode.js). VS Code calls
// run(); a rejection makes the window exit non-zero.

const fs = require('fs');
const path = require('path');

const lines = [];
const failures = [];

function check(label, ok, detail) {
	lines.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined && detail !== '' ? `  [${detail}]` : ''}`);
	if (!ok) {
		failures.push(label);
	}
}

async function waitFor(label, predicate, timeoutMs = 60000) {
	const started = Date.now();
	for (;;) {
		const value = await predicate();
		if (value) {
			return value;
		}
		if (Date.now() - started > timeoutMs) {
			throw new Error(`timed out after ${timeoutMs} ms waiting for: ${label}`);
		}
		await new Promise(resolve => setTimeout(resolve, 100));
	}
}

async function run() {
	const vscode = require('vscode');
	const dataset = process.env.HRU_SMOKE_DATASET;
	const outRoot = process.env.HRU_SMOKE_OUT_ROOT;
	const reportFile = process.env.HRU_SMOKE_REPORT;
	const hold = process.env.HRU_SMOKE_HOLD;
	try {
		const extension = vscode.extensions.getExtension('PbsandtDev.swat-hru-subset');
		check('the extension is loaded from the source tree', !!extension);
		const api = await extension.activate();
		check('the extension activates', extension.isActive);

		const commands = await vscode.commands.getCommands(true);
		check('commands are registered', commands.includes('swatHruSubset.createSubset') && commands.includes('swatHruSubset.createSubsetFromFolder'));
		check('there is no Run SWAT+ command', !commands.some(command => /swatHruSubset\..*run/i.test(command)));

		// 1. The sidebar panel opens and its script runs.
		await vscode.commands.executeCommand('swatHruSubset.createSubset');
		await waitFor('the panel webview to send "ready"', () => api.readyCount() > 0);
		check('the sidebar panel opened and its script started', api.readyCount() > 0);
		await waitFor('the panel to draw the first state', () => api.panelState() && api.renderedRevision() >= api.panelState().revision);
		check('the panel drew the first state', true, `revision ${api.renderedRevision()}`);
		check('Dataset Selector is not installed here, so its button stays hidden', api.panelState().selectorAvailable === false);

		// 2. The Explorer command fills in the dataset.
		await vscode.commands.executeCommand('swatHruSubset.createSubsetFromFolder', vscode.Uri.file(dataset));
		const state = await waitFor('the HRU range', () => {
			const current = api.panelState();
			return current && current.dataset.rangeLine ? current : undefined;
		});
		check('the Explorer command opens the panel with the dataset filled in', state.dataset.input === dataset, state.dataset.input);
		check('the range line is shown', state.dataset.rangeLine === 'HRUs 1–4222 (4222 total)', state.dataset.rangeLine);
		check('the default output is a sibling of the dataset', path.dirname(state.output.text) === path.dirname(dataset), state.output.text);
		await waitFor('the panel to draw the range', () => api.renderedRevision() >= api.panelState().revision);

		// 3. HRU ids, keep routing and the preview.
		await api.handle({ type: 'ids', text: '1532,1538,3978' });
		await api.handle({ type: 'options', options: { keepRouting: true, feederHrus: true, alignWetlands: true, mainCompat: false, noOutputs: false } });
		const preview = await waitFor('the preview', () => {
			const current = api.panelState();
			return current && current.preview.kind === 'ready' ? current.preview : undefined;
		}, 90000);
		check('the preview lists the four feeder HRUs', JSON.stringify(preview.view.added.map(item => item.hruId)) === '[1802,2891,3634,4159]', preview.view.headline);
		check('the preview counts match', preview.view.kept === '7 HRUs, 7 routing units, 10 reservoirs, 6 aquifers, 439 channels (SWAT-DEG), 7 outlets', preview.view.kept);
		check('the preview wrote no output folder', !fs.existsSync(api.panelState().output.text));
		await waitFor('the panel to draw the preview', () => api.renderedRevision() >= api.panelState().revision);

		// 4. The picker opens and renders the whole table.
		await api.handle({ type: 'pickHrus' });
		const rendered = await waitFor('the picker to render', () => api.pickerRendered(), 90000);
		check('the picker tab rendered every HRU', rendered.rows === 4222 && rendered.shown === 4222, JSON.stringify(rendered));
		const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs).map(tab => tab.label);
		check('the picker is an editor tab', tabs.some(label => label.startsWith('HRU Picker')), tabs.join(' | '));

		// 5. Create a real subset to a new folder, as the panel's Create button does.
		// A name that is free, so the check does not depend on an earlier run.
		let output = path.join(outRoot, 'tool_split_vscode_keep3');
		for (let suffix = 2; fs.existsSync(output); suffix++) {
			output = path.join(outRoot, `tool_split_vscode_keep3_${suffix}`);
		}
		await api.handle({ type: 'outputInput', text: output });
		check('the output folder is accepted', !api.panelState().output.error && api.panelState().canCreate);
		await api.handle({ type: 'create' });
		const finished = await waitFor('the run', () => {
			const current = api.panelState();
			return current && (current.run.kind === 'done' || current.run.kind === 'failed') ? current.run : undefined;
		}, 180000);
		check('the run finished', finished.kind === 'done', finished.kind === 'failed' ? finished.message : finished.view.headline);
		if (finished.kind === 'done') {
			check('the added HRUs match the preview', JSON.stringify(finished.view.added.map(item => item.hruId)) === JSON.stringify(preview.view.added.map(item => item.hruId)));
			check('the kept counts match the preview', finished.view.kept === preview.view.kept);
			check('the output folder is the one asked for', path.resolve(finished.view.outputDir) === path.resolve(output), finished.view.outputDir);
			check('hru_subset_result.json is written', fs.existsSync(path.join(output, 'hru_subset_result.json')));
		}
		await waitFor('the panel to draw the result', () => api.renderedRevision() >= api.panelState().revision);

		if (hold) {
			lines.push(`Holding the window open until ${hold} exists.`);
			fs.writeFileSync(reportFile, lines.join('\n'));
			await waitFor('the stop flag', () => fs.existsSync(hold), 15 * 60 * 1000);
		}
	} catch (error) {
		check(`unexpected error: ${error && error.stack ? error.stack : error}`, false);
	}
	lines.push(failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} CHECK(S) FAILED: ${failures.join('; ')}`);
	fs.writeFileSync(reportFile, lines.join('\n'));
	if (failures.length > 0) {
		throw new Error(`${failures.length} smoke check(s) failed`);
	}
}

module.exports = { run };
