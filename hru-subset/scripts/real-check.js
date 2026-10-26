// Drives the extension's runner modules against a real dataset, without VS Code.
//
//   npm run check:real -- --dataset <dir> --out-root <dir> [--exe <swatplus.exe>]
//                         [--hru-ids 1532,1538,3978] [--bad-id 99999] [--name keep3]
//
// The dataset is only read. Output folders are created under --out-root and are
// named tool_split_<name>; the failed-run folder is deleted again through the same
// deletePartialOutput the panel uses. Needs `npm run compile-tests` first.
//
// Besides the run itself it checks the two read-only modes the panel uses:
// --hru-table (the HRU picker's rows; spot checks are the 02070009 HRUs named
// below) and --plan (what the preview shows; it must equal what the run does and
// must not create a folder).

const fs = require('fs');
const path = require('path');

const out = path.resolve(__dirname, '..', 'out');
const { runProcess } = require(path.join(out, 'processRunner.js'));
const { probePython, pythonCandidateNames, resolvePython } = require(path.join(out, 'python.js'));
const { createSubset, deletePartialOutput, inspectHruRange, inspectHruTable, planSubset, ScriptError } = require(path.join(out, 'runner.js'));
const { checkOutputLocation, uniqueOutputPath } = require(path.join(out, 'paths.js'));
const { detectSubsetFolder, RESULT_FILE_NAME } = require(path.join(out, 'dataset.js'));
const { DEFAULT_OPTIONS } = require(path.join(out, 'options.js'));
const { expandHruIds, formatHruIds, validateHruIdText } = require(path.join(out, 'ids.js'));
const { formatHeadline, formatRange, formatSummaryLines } = require(path.join(out, 'summary.js'));

function argValue(name, fallback) {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const dataset = path.resolve(argValue('dataset', ''));
const outRoot = path.resolve(argValue('out-root', ''));
const exe = argValue('exe', undefined);
const hruText = argValue('hru-ids', '1532,1538,3978');
const badId = argValue('bad-id', '99999');
const name = argValue('name', 'keep3');
const expectedAdded = argValue('expect-added', '1802,2891,3634,4159').split(',').map(Number);

if (!argValue('dataset', '') || !argValue('out-root', '')) {
	console.error('Usage: node scripts/real-check.js --dataset <dir> --out-root <dir> [--exe <swatplus.exe>]');
	process.exit(2);
}

const scriptPath = path.resolve(__dirname, '..', 'python', 'hru_processor.py');
const failures = [];
const lines = [];

function check(label, ok, detail) {
	lines.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  [${detail}]` : ''}`);
	if (!ok) {
		failures.push(label);
	}
}

// Counts how many times the script (not a --version probe) is started.
const scriptRuns = [];
const countingRun = (command, args, options) => {
	if (args[0] === scriptPath) {
		scriptRuns.push({ command, args });
	}
	return runProcess(command, args, options);
};

// Read-only fingerprint of the dataset folder: proves the checks never wrote into it.
function fingerprint(dir) {
	let files = 0;
	let bytes = 0;
	let newest = 0;
	const walk = folder => {
		for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
			const full = path.join(folder, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else {
				const stat = fs.statSync(full);
				files++;
				bytes += stat.size;
				newest = Math.max(newest, stat.mtimeMs);
			}
		}
	};
	walk(dir);
	return `${files} files, ${bytes} bytes, newest ${new Date(newest).toISOString()}`;
}

async function main() {
	check('dataset exists and has file.cio', fs.existsSync(path.join(dataset, 'file.cio')), dataset);
	const before = fingerprint(dataset);
	lines.push(`dataset before: ${before}`);

	// Python: the same selection the command makes.
	const names = pythonCandidateNames({
		setting: undefined,
		env: process.env.SWATPLUS_PYTHON,
		platform: process.platform
	});
	const resolution = await resolvePython(names, runProcess);
	check('a usable Python was found', !!resolution.interpreter, resolution.interpreter
		? `${resolution.interpreter.command}: ${resolution.interpreter.version}` : 'none');
	for (const item of resolution.skipped) {
		lines.push(`  skipped ${item.command}: ${item.reason}`);
	}
	if (!resolution.interpreter) {
		return;
	}
	// On a machine whose python3 is the Store stub, show that the probe rejects it.
	if (process.platform === 'win32') {
		const stub = await probePython('python3', runProcess);
		lines.push(`  probe of "python3" on this machine: ${JSON.stringify(stub)}`);
	}
	const python = resolution.interpreter;
	const ctx = { scriptPath, python, run: countingRun };

	// HRU range.
	const range = await inspectHruRange(ctx, dataset);
	check('--hru-range --json answers', range.ok === true, formatRange(range));
	check('range script ran once', scriptRuns.length === 1, `runs=${scriptRuns.length}`);

	let notADataset;
	try {
		await inspectHruRange(ctx, outRoot);
	} catch (error) {
		notADataset = error;
	}
	check('a folder without file.cio gives the script\'s own error',
		notADataset instanceof ScriptError && /No file\.cio found/.test(notADataset.message),
		notADataset && notADataset.message);

	// The validation the input box does.
	check('ids validate inside the range', validateHruIdText(hruText, range.min_hru, range.max_hru) === undefined);
	check('the bad id is outside the range (the box would refuse it)',
		validateHruIdText(badId, range.min_hru, range.max_hru) !== undefined);

	// The HRU picker's table (--hru-table).
	const hruTable = await inspectHruTable(ctx, dataset);
	const byId = new Map(hruTable.rows.map(row => [row.id, row]));
	check('--hru-table --json lists every HRU', hruTable.ok === true && hruTable.rows.length === range.total_hrus, `${hruTable.rows.length} rows`);
	const urban = byId.get(1532);
	check('HRU 1532: urban urbn_cool, about 945.5 ha, ru1_020700090404, not a wetland',
		!!urban && urban.plant_community === 'urbn_cool' && Math.abs(urban.area_ha - 945.5) < 0.05
		&& urban.routing_unit === 'ru1_020700090404' && urban.wetland === false,
		urban && `${urban.plant_community}, ${urban.area_ha} ha, ${urban.routing_unit}, wetland=${urban.wetland}`);
	const wet1538 = byId.get(1538);
	check('HRU 1538: wetland that receives upstream water', !!wet1538 && wet1538.wetland === true && wet1538.receives_upstream === true,
		wet1538 && `${wet1538.wetland_name}, upstream=${wet1538.receives_upstream}`);
	const wet1802 = byId.get(1802);
	check('HRU 1802: wetland in ru2_020700090405', !!wet1802 && wet1802.wetland === true && wet1802.routing_unit === 'ru2_020700090405',
		wet1802 && `${wet1802.wetland_name}, ${wet1802.routing_unit}`);
	check('the table has a subbasin for every HRU (from ls_unit.def)',
		hruTable.rows.every(row => row.subbasin !== null) && hruTable.subbasin_sources.ls_unit === hruTable.rows.length,
		JSON.stringify(hruTable.subbasin_sources));

	// The preview (--plan): same result as the run, nothing written, even when --output-dir is given.
	const planOptions = { ...DEFAULT_OPTIONS, keepRouting: true };
	const plan = await planSubset(ctx, { datasetPath: dataset, hruIds: formatHruIds(expandHruIds(hruText)), options: planOptions });
	const planAdded = (plan.added_hru_ids || []).map(item => item.hru_id).sort((a, b) => a - b);
	check('--plan: the feeder HRUs are the expected ones', JSON.stringify(planAdded) === JSON.stringify(expectedAdded), planAdded.join(','));
	check('--plan: every added HRU has a reason', (plan.added_hru_ids || []).every(item => item.reason && item.reason.length > 0));
	const planProbe = path.join(path.resolve(outRoot), `tool_split_plan_probe_${process.pid}`);
	const planWithOutput = await runProcess(python.command, [
		scriptPath, '--dataset', dataset, '--hru-ids', hruText, '--keep-routing', '--plan', '--output-dir', planProbe, '--json'
	]);
	check('--plan with --output-dir does not create the folder', planWithOutput.code === 0 && !fs.existsSync(planProbe), planProbe);

	// Positive run.
	fs.mkdirSync(outRoot, { recursive: true });
	const output = uniqueOutputPath(path.join(outRoot, `tool_split_${name}`), fs.existsSync);
	const datasetFolders = [dataset, range.source_dir];
	check('output is outside the dataset', checkOutputLocation(output, datasetFolders) === undefined, output);
	check('the dataset is not mistaken for a subset', detectSubsetFolder(datasetFolders, fs.existsSync) === undefined);

	const options = { ...DEFAULT_OPTIONS, keepRouting: true };
	const runsBefore = scriptRuns.length;
	const run = await createSubset(
		ctx,
		{ datasetPath: dataset, hruIds: formatHruIds(expandHruIds(hruText)), outputDir: output, options },
		{ name: 'swat-hru-subset', version: 'real-check' }
	);
	check('subset script ran once', scriptRuns.length === runsBefore + 1);
	check('script reported ok', run.result.ok === true);
	check('output_dir is the folder asked for', path.resolve(run.result.output_dir) === path.resolve(output), run.result.output_dir);
	const added = (run.result.added_hru_ids || []).map(item => item.hru_id).sort((a, b) => a - b);
	check('added_hru_ids are the expected feeders', JSON.stringify(added) === JSON.stringify(expectedAdded), added.join(','));
	check('every added HRU has a reason', (run.result.added_hru_ids || []).every(item => item.reason && item.reason.length > 0));
	check('the plan and the run keep the same objects', JSON.stringify(plan.retained_counts) === JSON.stringify(run.result.retained_counts),
		`plan ${JSON.stringify(plan.retained_counts)} / run ${JSON.stringify(run.result.retained_counts)}`);
	check('the plan and the run add the same HRUs and apply the same workarounds',
		JSON.stringify(plan.added_hru_ids) === JSON.stringify(run.result.added_hru_ids)
		&& JSON.stringify(plan.workarounds_applied) === JSON.stringify(run.result.workarounds_applied));
	const applied = run.result.workarounds_applied || [];
	check('workarounds_applied has W1 and W2', applied.includes('W1') && applied.includes('W2'), applied.join(','));
	check('marker file written', fs.existsSync(path.join(output, RESULT_FILE_NAME)) && !run.resultFileError, run.resultFile);
	const marker = JSON.parse(fs.readFileSync(path.join(output, RESULT_FILE_NAME), 'utf8'));
	check('marker holds the script result', marker.ok === true && marker.tool && marker.tool.name === 'swat-hru-subset');
	check('output has file.cio and hru.con', fs.existsSync(path.join(output, 'file.cio')) && fs.existsSync(path.join(output, 'hru.con')));
	const detection = detectSubsetFolder([output], fs.existsSync);
	check('picking the output as a dataset is detected by the marker', detection && detection.how === 'marker');
	lines.push('', formatHeadline(run.result), ...formatSummaryLines(run.result).map(line => `  ${line}`), '');

	// Bad id: the script's own error, one run, no second interpreter.
	const badOutput = uniqueOutputPath(path.join(outRoot, `tool_split_bad${badId}`), fs.existsSync);
	const runsBeforeBad = scriptRuns.length;
	let badError;
	try {
		await createSubset(
			ctx,
			{ datasetPath: dataset, hruIds: badId, outputDir: badOutput, options },
			{ name: 'swat-hru-subset', version: 'real-check' }
		);
	} catch (error) {
		badError = error;
	}
	const badRuns = scriptRuns.slice(runsBeforeBad);
	check('bad id: the script\'s own "not found" error is shown',
		badError instanceof ScriptError && /not found in hru\.con/.test(badError.message), badError && badError.message);
	check('bad id: the script was started exactly once', badRuns.length === 1, `runs=${badRuns.length}`);
	check('bad id: with the interpreter chosen up front', badRuns.every(item => item.command === python.command));
	check('bad id: the error is not a "Python was not found" message',
		!!badError && !/python was not found/i.test(badError.message));
	const partial = fs.existsSync(badOutput);
	lines.push(`  bad id left a partial output folder: ${partial}`);
	if (partial) {
		check('partial output is deletable and deleted', deletePartialOutput(badOutput, false, datasetFolders) === true && !fs.existsSync(badOutput));
	}
	check('the good output survived the cleanup', fs.existsSync(path.join(output, 'file.cio')));

	// Optional: run SWAT+ in the output folder, as "Run SWAT+" does in a terminal.
	if (exe) {
		lines.push(`running ${exe} in ${output} ...`);
		const started = Date.now();
		const result = await runProcess(exe, [], { cwd: output, timeoutMs: 15 * 60 * 1000 });
		const seconds = ((Date.now() - started) / 1000).toFixed(1);
		fs.writeFileSync(path.join(outRoot, `tool_split_${name}_swat_stdout.log`), result.stdout + result.stderr);
		check('SWAT+ finished', !result.error && result.code === 0, `exit ${result.code}, ${seconds}s`);
		check('SWAT+ printed "Execution successfully completed"', /Execution successfully completed/.test(result.stdout + result.stderr));
	}

	const after = fingerprint(dataset);
	check('the dataset folder is unchanged', before === after, after);
}

main().catch(error => {
	lines.push(`FAIL  unexpected error: ${error && error.stack ? error.stack : error}`);
	failures.push('unexpected error');
}).finally(() => {
	console.log(lines.join('\n'));
	console.log(`\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} CHECK(S) FAILED: ${failures.join('; ')}`}`);
	process.exit(failures.length === 0 ? 0 : 1);
});
