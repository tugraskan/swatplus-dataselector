import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PanelController, PanelEnv } from '../controller';
import { RESULT_FILE_NAME } from '../dataset';
import { PanelViewState } from '../protocol';
import { DEFAULT_OPTIONS, SubsetOptions } from '../options';
import { RunnerContext } from '../runner';
import { RecordedCall, Responder, fakeProcess } from './fakeProcess';

const NOW = new Date(2026, 8, 5, 7, 8, 9);
const STAMP = '20260905_070809';

const RANGE_REPLY = { ok: true, source_dir: '', min_hru: 1, max_hru: 4222, total_hrus: 4222 };
const FEEDERS = [1802, 2891, 3634, 4159].map(id => ({ hru_id: id, reason: `channel for ${id} had only channel inflows` }));
const COUNTS = { hru: 7, ru: 7, res: 10, aqu: 6, sdc: 439, out: 7 };

interface Harness {
    controller: PanelController;
    posts: PanelViewState[];
    calls: RecordedCall[];
    root: string;
    dataset: string;
    last(): PanelViewState;
    store: Map<string, unknown>;
    log: string[];
    timers: Array<{ fn: () => void; ms: number; cancelled: boolean }>;
    flushTimers(): Promise<void>;
    dialogs: { folder: string[]; deleteAnswer: boolean; opened: string[]; revealed: string[]; picker: Array<{ datasetPath: string; initialIds: string }> };
    selector: { available: boolean; answer: unknown; failure?: Error };
    python: { ok: boolean; text: string };
    env: PanelEnv;
}

const settle = async () => {
    for (let index = 0; index < 4; index++) {
        await new Promise(resolve => setImmediate(resolve));
    }
};

function makeDataset(root: string, name = 'ds'): string {
    const dataset = path.join(root, name);
    fs.mkdirSync(dataset, { recursive: true });
    fs.writeFileSync(path.join(dataset, 'file.cio'), 'file.cio\n');
    return dataset;
}

function harness(respond?: Responder, extra: { store?: Map<string, unknown> } = {}): Harness {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hru-panel-'));
    const dataset = makeDataset(root);
    const posts: PanelViewState[] = [];
    const log: string[] = [];
    const timers: Harness['timers'] = [];
    const store = extra.store ?? new Map<string, unknown>();
    const dialogs: Harness['dialogs'] = { folder: [], deleteAnswer: true, opened: [], revealed: [], picker: [] };
    const selector: Harness['selector'] = { available: false, answer: undefined };
    const python = { ok: true, text: 'Python: Python 3.13.12 (py)' };

    const defaultRespond: Responder = call => {
        if (call.args.includes('--hru-range')) {
            return { stdout: JSON.stringify({ ...RANGE_REPLY, source_dir: call.args[call.args.indexOf('--dataset') + 1] }) };
        }
        if (call.args.includes('--plan')) {
            return {
                stdout: JSON.stringify({
                    ok: true, plan: true, source_dir: '', hru_ids: [1532, 1538, 3978], keep_routing: true,
                    retained_counts: COUNTS, added_hru_ids: FEEDERS, workarounds_applied: ['W1', 'W2'], warnings: []
                })
            };
        }
        const output = call.args[call.args.indexOf('--output-dir') + 1];
        fs.mkdirSync(output, { recursive: true });
        fs.writeFileSync(path.join(output, 'file.cio'), 'x');
        return {
            stdout: JSON.stringify({
                ok: true, source_dir: dataset, output_dir: output, hru_ids: [1532, 1538, 3978], keep_routing: true,
                retained_counts: COUNTS, added_hru_ids: FEEDERS, workarounds_applied: ['W1', 'W2'], warnings: []
            })
        };
    };
    const { run, calls } = fakeProcess(respond ?? defaultRespond);

    const env: PanelEnv = {
        isDirectory: p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } },
        isFile: p => { try { return fs.statSync(p).isFile(); } catch { return false; } },
        exists: p => fs.existsSync(p),
        realpath: p => { try { return fs.realpathSync.native(p); } catch { return undefined; } },
        now: () => NOW,
        getRunner: async signal => {
            if (!python.ok) {
                throw new Error(python.text);
            }
            const context: RunnerContext = {
                scriptPath: '/ext/python/hru_processor.py',
                python: { command: 'py', version: 'Python 3.13.12' },
                run,
                signal
            };
            return context;
        },
        pythonStatus: async () => ({ ...python }),
        selector: {
            isAvailable: async () => selector.available,
            getDataset: async () => {
                if (selector.failure) {
                    throw selector.failure;
                }
                return selector.answer;
            }
        },
        pickFolder: async () => dialogs.folder.shift(),
        confirmDelete: async () => dialogs.deleteAnswer,
        openFolder: async folder => { dialogs.opened.push(folder); },
        reveal: async folder => { dialogs.revealed.push(folder); },
        openPicker: args => { dialogs.picker.push(args); },
        showLog: () => undefined,
        log: text => { log.push(text); },
        clearLog: () => { log.length = 0; },
        store: {
            get: <T>(key: string) => store.get(key) as T | undefined,
            set: (key, value) => { store.set(key, JSON.parse(JSON.stringify(value))); }
        },
        schedule: (fn, ms) => {
            const timer = { fn, ms, cancelled: false };
            timers.push(timer);
            return () => { timer.cancelled = true; };
        },
        post: state => { posts.push(state); },
        tool: { name: 'swat-hru-subset', version: '0.2.0' }
    };

    const controller = new PanelController(env);
    return {
        controller, posts, calls, root, dataset, store, log, timers, dialogs, selector, python, env,
        last: () => posts[posts.length - 1],
        flushTimers: async () => {
            const due = timers.splice(0).filter(timer => !timer.cancelled);
            for (const timer of due) {
                timer.fn();
                await settle();
            }
        }
    };
}

const scriptCalls = (h: Harness, flag: string) => h.calls.filter(call => call.args.includes(flag));

async function withDataset(h: Harness, ids = '1532,1538,3978', options: Partial<SubsetOptions> = {}): Promise<void> {
    await h.controller.handle({ type: 'ready' });
    await h.controller.openDataset(h.dataset);
    await h.controller.handle({ type: 'options', options: { ...DEFAULT_OPTIONS, ...options } });
    await h.controller.handle({ type: 'ids', text: ids });
}

suite('Panel controller', () => {
    const roots: string[] = [];
    const make = (respond?: Responder, extra?: { store?: Map<string, unknown> }) => {
        const h = harness(respond, extra);
        roots.push(h.root);
        return h;
    };
    teardown(() => {
        for (const root of roots.splice(0)) {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    suite('the dataset', () => {
        test('opening a folder reads its range, shows it and proposes a sibling output folder', async () => {
            const h = make();
            await h.controller.handle({ type: 'ready' });
            await h.controller.openDataset(h.dataset);
            const state = h.last();
            assert.strictEqual(state.dataset.input, h.dataset);
            assert.strictEqual(state.dataset.rangeLine, 'HRUs 1–4222 (4222 total)');
            assert.strictEqual(state.dataset.error, undefined);
            assert.strictEqual(state.output.text, path.join(h.root, `ds_subset_${STAMP}`));
            assert.strictEqual(scriptCalls(h, '--hru-range').length, 1);
            assert.deepStrictEqual(state.options, DEFAULT_OPTIONS);
            assert.strictEqual(state.toolVersion, '0.2.0');
        });

        test('Browse picks a folder', async () => {
            const h = make();
            h.dialogs.folder.push(h.dataset);
            await h.controller.handle({ type: 'browseDataset' });
            assert.strictEqual(h.last().dataset.rangeLine, 'HRUs 1–4222 (4222 total)');
            // cancelling the dialog changes nothing
            await h.controller.handle({ type: 'browseDataset' });
            assert.strictEqual(h.last().dataset.input, h.dataset);
        });

        test('a typed path is checked before any script runs', async () => {
            const h = make();
            await h.controller.handle({ type: 'datasetInput', text: path.join(h.root, 'nowhere') });
            assert.match(h.last().dataset.error ?? '', /Folder not found/);
            fs.mkdirSync(path.join(h.root, 'empty'));
            await h.controller.handle({ type: 'datasetInput', text: path.join(h.root, 'empty') });
            assert.match(h.last().dataset.error ?? '', /No file\.cio/);
            assert.strictEqual(h.calls.length, 0);
            assert.strictEqual(h.last().canCreate, false);
        });

        test('the parent of a TxtInOut folder is accepted and the folder used is shown', async () => {
            let txtInOut = '';
            const h = make(() => ({ stdout: JSON.stringify({ ...RANGE_REPLY, source_dir: txtInOut, total_hrus: 10, max_hru: 10 }) }));
            const project = path.join(h.root, 'project');
            txtInOut = makeDataset(project, 'TxtInOut');
            await h.controller.openDataset(project);
            assert.strictEqual(h.last().dataset.resolvedFolder, txtInOut);
            assert.strictEqual(h.last().dataset.rangeLine, 'HRUs 1–10 (10 total)');
            // The script is given what was picked and resolves the folder itself.
            assert.strictEqual(h.calls[0].args[h.calls[0].args.indexOf('--dataset') + 1], project);
        });

        test("the script's own error is shown for a dataset it cannot read", async () => {
            const h = make(() => ({ code: 1, stdout: JSON.stringify({ ok: false, error: 'No ID column found in hru.con file.' }) }));
            await h.controller.openDataset(h.dataset);
            assert.strictEqual(h.last().dataset.error, 'No ID column found in hru.con file.');
            assert.strictEqual(h.last().dataset.rangeLine, undefined);
            assert.strictEqual(h.calls.length, 1);
        });

        test('a folder that is a subset made by this tool is used but flagged', async () => {
            const h = make();
            fs.writeFileSync(path.join(h.dataset, RESULT_FILE_NAME), '{}');
            await h.controller.openDataset(h.dataset);
            assert.match(h.last().dataset.warning ?? '', /looks like an HRU subset made by this tool/);
            assert.strictEqual(h.last().dataset.rangeLine, 'HRUs 1–4222 (4222 total)');
        });

        test('the old multi_ and solo_ names are flagged too', async () => {
            const h = make();
            const subset = makeDataset(h.root, 'multi_20260101_120000');
            await h.controller.openDataset(subset);
            assert.match(h.last().dataset.warning ?? '', /name looks like a subset/);
        });

        test('a normal dataset has no warning', async () => {
            const h = make();
            await h.controller.openDataset(h.dataset);
            assert.strictEqual(h.last().dataset.warning, undefined);
        });

        test('only the latest dataset counts when two are opened quickly', async () => {
            const h = make();
            const slowDataset = makeDataset(h.root, 'slow');
            let release!: () => void;
            const gate = new Promise<void>(resolve => { release = resolve; });
            const inner = h.env.getRunner;
            let asked = 0;
            h.env.getRunner = async signal => {
                if (++asked === 1) {
                    await gate;
                }
                return inner(signal);
            };
            const slow = h.controller.openDataset(slowDataset);
            await settle();
            await h.controller.openDataset(h.dataset);
            release();
            await slow;
            assert.strictEqual(h.last().dataset.input, h.dataset);
            assert.strictEqual(h.last().dataset.rangeLine, 'HRUs 1–4222 (4222 total)');
        });

        test('changing the dataset clears the old result', async () => {
            const h = make();
            await withDataset(h);
            await h.controller.handle({ type: 'create' });
            assert.strictEqual(h.last().run.kind, 'done');
            const other = makeDataset(h.root, 'other');
            await h.controller.openDataset(other);
            assert.strictEqual(h.last().run.kind, 'idle');
        });
    });

    suite('Dataset Selector', () => {
        test('the button shows only when the selector is there', async () => {
            const absent = make();
            await absent.controller.handle({ type: 'ready' });
            await settle();
            assert.strictEqual(absent.last().selectorAvailable, false);
            const present = make();
            present.selector.available = true;
            await present.controller.handle({ type: 'ready' });
            await settle();
            assert.strictEqual(present.last().selectorAvailable, true);
        });

        test("uses the selector's dataset", async () => {
            const h = make();
            h.selector.available = true;
            h.selector.answer = h.dataset;
            await h.controller.handle({ type: 'useSelectorDataset' });
            assert.strictEqual(h.last().dataset.input, h.dataset);
            assert.strictEqual(h.last().dataset.rangeLine, 'HRUs 1–4222 (4222 total)');
        });

        test('says so when the selector has no dataset selected, and keeps the current one', async () => {
            const h = make();
            await h.controller.openDataset(h.dataset);
            h.selector.answer = undefined;
            await h.controller.handle({ type: 'useSelectorDataset' });
            assert.match(h.last().dataset.note ?? '', /no dataset selected/);
            assert.strictEqual(h.last().dataset.input, h.dataset);
            assert.strictEqual(h.last().dataset.rangeLine, 'HRUs 1–4222 (4222 total)');
        });

        test('says why when the selector cannot be asked', async () => {
            const h = make();
            h.selector.failure = new Error('extension not found');
            await h.controller.handle({ type: 'useSelectorDataset' });
            assert.match(h.last().dataset.note ?? '', /Could not ask SWAT\+ Dataset Selector.*extension not found/);
        });
    });

    suite('HRU ids and options', () => {
        test('are checked as they are typed, against the range', async () => {
            const h = make();
            await h.controller.openDataset(h.dataset);
            await h.controller.handle({ type: 'ids', text: '1,,2' });
            assert.strictEqual(h.last().ids.error, 'Remove empty comma-separated entries.');
            await h.controller.handle({ type: 'ids', text: '4000-5000' });
            assert.match(h.last().ids.error ?? '', /outside the dataset's HRU range 1-4222/);
            await h.controller.handle({ type: 'ids', text: '1532,1538,3978' });
            assert.strictEqual(h.last().ids.error, undefined);
            assert.strictEqual(h.last().canCreate, true);
        });

        test('typing does not rewrite the box; only the picker does', async () => {
            const h = make();
            await h.controller.openDataset(h.dataset);
            const before = h.last().ids.revision;
            await h.controller.handle({ type: 'ids', text: '1-3' });
            assert.strictEqual(h.last().ids.revision, before);
            h.controller.applyPickedIds('1-3,7');
            assert.strictEqual(h.last().ids.text, '1-3,7');
            assert.strictEqual(h.last().ids.revision, before + 1);
        });

        test('create stays off until there are valid ids', async () => {
            const h = make();
            await h.controller.openDataset(h.dataset);
            assert.strictEqual(h.last().canCreate, false);
            await h.controller.handle({ type: 'create' });
            assert.strictEqual(scriptCalls(h, '--output-dir').length, 0);
        });

        test('options are sanitised and remembered', async () => {
            const h = make();
            await h.controller.handle({ type: 'ready' });
            await h.controller.handle({ type: 'options', options: { ...DEFAULT_OPTIONS, keepRouting: true, mainCompat: true } });
            assert.deepStrictEqual(h.last().options, { ...DEFAULT_OPTIONS, keepRouting: true, mainCompat: true });
            await h.controller.handle({ type: 'options', options: { keepRouting: 'yes' } as unknown as SubsetOptions });
            assert.deepStrictEqual(h.last().options, DEFAULT_OPTIONS);
        });

        test('the picker opens with the dataset and the current ids, only when there is a dataset', async () => {
            const h = make();
            await h.controller.handle({ type: 'pickHrus' });
            assert.strictEqual(h.dialogs.picker.length, 0);
            await withDataset(h, '5-9');
            await h.controller.handle({ type: 'pickHrus' });
            assert.deepStrictEqual(h.dialogs.picker, [{ datasetPath: h.dataset, initialIds: '5-9' }]);
        });
    });

    suite('preview (keep routing)', () => {
        test('is off, and asks the script nothing, while keep routing is off', async () => {
            const h = make();
            await withDataset(h);
            await h.flushTimers();
            assert.strictEqual(h.last().preview.kind, 'off');
            assert.strictEqual(scriptCalls(h, '--plan').length, 0);
        });

        test('waits for valid ids', async () => {
            const h = make();
            await h.controller.openDataset(h.dataset);
            await h.controller.handle({ type: 'options', options: { ...DEFAULT_OPTIONS, keepRouting: true } });
            const state = h.last();
            assert.strictEqual(state.preview.kind, 'waiting');
            assert.match(state.preview.kind === 'waiting' ? state.preview.reason : '', /Enter HRU IDs/);
            await h.flushTimers();
            assert.strictEqual(scriptCalls(h, '--plan').length, 0);
        });

        test('shows what will be kept and the feeder HRUs that will be added, with reasons', async () => {
            const h = make();
            await withDataset(h, '1532,1538,3978', { keepRouting: true });
            assert.strictEqual(h.last().preview.kind, 'waiting'); // debounce still running
            await h.flushTimers();
            const preview = h.last().preview;
            assert.strictEqual(preview.kind, 'ready');
            if (preview.kind === 'ready') {
                assert.strictEqual(preview.view.headline, 'Will keep 7 HRUs (4 feeder HRUs added)');
                assert.strictEqual(preview.view.kept, '7 HRUs, 7 routing units, 10 reservoirs, 6 aquifers, 439 channels (SWAT-DEG), 7 outlets');
                assert.deepStrictEqual(preview.view.added.map(item => item.hruId), [1802, 2891, 3634, 4159]);
                assert.match(preview.view.added[0].reason, /only channel inflows/);
                assert.deepStrictEqual(preview.view.workarounds, ['W1 (feeder HRUs added)', 'W2 (wetland file aligned)']);
            }
        });

        test('asks the script with --plan, the same switches and no output folder', async () => {
            const h = make();
            await withDataset(h, '1532,1538,3978', { keepRouting: true, feederHrus: false, mainCompat: true });
            await h.flushTimers();
            const [call] = scriptCalls(h, '--plan');
            assert.deepStrictEqual(call.args, [
                '/ext/python/hru_processor.py',
                '--dataset', h.dataset, '--hru-ids', '1532,1538,3978', '--plan',
                '--keep-routing', '--exact-hrus', '--main-compat', '--json'
            ]);
            assert.ok(!call.args.includes('--output-dir'));
        });

        test('typing again restarts the wait, so one plan is asked for, not one per key', async () => {
            const h = make();
            await withDataset(h, '1', { keepRouting: true });
            for (const text of ['15', '153', '1532']) {
                await h.controller.handle({ type: 'ids', text });
            }
            await h.flushTimers();
            assert.strictEqual(scriptCalls(h, '--plan').length, 1);
            assert.strictEqual(scriptCalls(h, '--plan')[0].args[scriptCalls(h, '--plan')[0].args.indexOf('--hru-ids') + 1], '1532');
        });

        test("shows the script's error when the plan fails", async () => {
            const h = make(call => {
                if (call.args.includes('--hru-range')) {
                    return { stdout: JSON.stringify({ ...RANGE_REPLY, source_dir: h.dataset }) };
                }
                return { code: 1, stdout: JSON.stringify({ ok: false, error: 'HRU ID(s) not found in hru.con: [4000]' }) };
            });
            await withDataset(h, '4000', { keepRouting: true });
            await h.flushTimers();
            assert.deepStrictEqual(h.last().preview, { kind: 'error', message: 'HRU ID(s) not found in hru.con: [4000]' });
        });

        test('the Refresh button asks again', async () => {
            const h = make();
            await withDataset(h, '1532', { keepRouting: true });
            await h.flushTimers();
            await h.controller.handle({ type: 'preview' });
            assert.strictEqual(scriptCalls(h, '--plan').length, 2);
        });

        test('changing an option replaces the preview', async () => {
            const h = make();
            await withDataset(h, '1532', { keepRouting: true });
            await h.flushTimers();
            await h.controller.handle({ type: 'options', options: { ...DEFAULT_OPTIONS, keepRouting: true, noOutputs: true } });
            assert.strictEqual(h.last().preview.kind, 'waiting');
            await h.flushTimers();
            assert.strictEqual(scriptCalls(h, '--plan').length, 2);
            assert.ok(scriptCalls(h, '--plan')[1].args.includes('--no-outputs'));
        });

        test('never creates the output folder', async () => {
            const h = make();
            await withDataset(h, '1532', { keepRouting: true });
            await h.flushTimers();
            assert.strictEqual(fs.existsSync(h.last().output.text), false);
        });
    });

    suite('output folder', () => {
        test('is a sibling of the dataset by default and can be edited', async () => {
            const h = make();
            await h.controller.openDataset(h.dataset);
            assert.strictEqual(path.dirname(h.last().output.text), h.root);
            const mine = path.join(h.root, 'my_subset');
            await h.controller.handle({ type: 'outputInput', text: mine });
            assert.strictEqual(h.last().output.text, mine);
            // A different dataset keeps the edited folder.
            await h.controller.openDataset(makeDataset(h.root, 'other'));
            assert.strictEqual(h.last().output.text, mine);
        });

        test('refuses a folder inside the dataset and turns Create off', async () => {
            const h = make();
            await withDataset(h);
            await h.controller.handle({ type: 'outputInput', text: path.join(h.dataset, 'multi') });
            assert.match(h.last().output.error ?? '', /must not be inside the dataset folder/);
            assert.strictEqual(h.last().canCreate, false);
            await h.controller.handle({ type: 'create' });
            assert.strictEqual(scriptCalls(h, '--output-dir').length, 0);
        });

        test('Browse creates a named subset folder inside the folder picked', async () => {
            const h = make();
            await h.controller.openDataset(h.dataset);
            const parent = path.join(h.root, 'results');
            fs.mkdirSync(parent);
            h.dialogs.folder.push(parent);
            await h.controller.handle({ type: 'browseOutput' });
            assert.strictEqual(h.last().output.text, path.join(parent, `ds_subset_${STAMP}`));
        });

        test('an existing folder gets a numbered sibling instead of being used', async () => {
            const h = make();
            await withDataset(h);
            const taken = path.join(h.root, 'taken');
            fs.mkdirSync(taken);
            await h.controller.handle({ type: 'outputInput', text: taken });
            assert.match(h.last().output.note ?? '', /taken already exists.*taken_2/);
            await h.controller.handle({ type: 'create' });
            const run = h.last().run;
            assert.strictEqual(run.kind, 'done');
            assert.strictEqual(run.kind === 'done' ? run.view.outputDir : '', path.join(h.root, 'taken_2'));
            assert.ok(fs.readdirSync(taken).length === 0, 'the existing folder is untouched');
        });
    });

    suite('creating the subset', () => {
        test('always passes --output-dir, never --overwrite or --run-swat, and writes the marker', async () => {
            const h = make();
            await withDataset(h, '1532,1538,3978', { keepRouting: true });
            await h.controller.handle({ type: 'create' });
            const [call] = scriptCalls(h, '--output-dir');
            const output = path.join(h.root, `ds_subset_${STAMP}`);
            assert.deepStrictEqual(call.args, [
                '/ext/python/hru_processor.py',
                '--dataset', h.dataset, '--hru-ids', '1532,1538,3978', '--output-dir', output,
                '--keep-routing', '--json'
            ]);
            assert.ok(!call.args.includes('--overwrite') && !call.args.includes('--run-swat'));
            assert.ok(fs.existsSync(path.join(output, RESULT_FILE_NAME)), 'hru_subset_result.json marker');
            const marker = JSON.parse(fs.readFileSync(path.join(output, RESULT_FILE_NAME), 'utf8'));
            assert.deepStrictEqual(marker.tool, { name: 'swat-hru-subset', version: '0.2.0' });
        });

        test('shows kept counts, the added HRUs and the workarounds that were applied', async () => {
            const h = make();
            await withDataset(h, '1532,1538,3978', { keepRouting: true });
            await h.controller.handle({ type: 'create' });
            const run = h.last().run;
            assert.strictEqual(run.kind, 'done');
            if (run.kind === 'done') {
                assert.strictEqual(run.view.headline, 'Created a subset with 7 HRUs (4 feeder HRUs added)');
                assert.strictEqual(run.view.requested, '3 picked + 4 feeder');
                assert.deepStrictEqual(run.view.added.map(item => item.hruId), [1802, 2891, 3634, 4159]);
                assert.deepStrictEqual(run.view.workarounds, ['W1 (feeder HRUs added)', 'W2 (wetland file aligned)']);
                assert.strictEqual(run.view.outputDir, path.join(h.root, `ds_subset_${STAMP}`));
            }
            assert.ok(h.log.join('').includes('Workarounds applied'));
        });

        test('Open Folder and Reveal act on the folder that was created', async () => {
            const h = make();
            await withDataset(h);
            await h.controller.handle({ type: 'create' });
            await h.controller.handle({ type: 'openFolder' });
            await h.controller.handle({ type: 'reveal' });
            const output = path.join(h.root, `ds_subset_${STAMP}`);
            assert.deepStrictEqual(h.dialogs.opened, [output]);
            assert.deepStrictEqual(h.dialogs.revealed, [output]);
        });

        test('the next default output name is new, so a second run does not need a numbered folder', async () => {
            const h = make();
            await withDataset(h);
            await h.controller.handle({ type: 'create' });
            assert.strictEqual(h.last().run.kind, 'done');
            assert.ok(h.last().output.revision > 0);
        });

        test('the boxes are locked while it runs and Cancel stops it', async () => {
            const h = make();
            const inner = h.env.getRunner;
            h.env.getRunner = async signal => {
                const context = await inner(signal);
                return {
                    ...context,
                    run: (command, args, options) => {
                        if (args.includes('--output-dir')) {
                            return new Promise(resolve => {
                                options?.signal?.addEventListener('abort', () => resolve({
                                    code: null, stdout: '', stderr: '',
                                    error: Object.assign(new Error('Cancelled'), { code: 'ABORT_ERR' })
                                }));
                            });
                        }
                        return context.run(command, args, options);
                    }
                };
            };
            await withDataset(h);
            const running = h.controller.handle({ type: 'create' });
            await settle();
            assert.strictEqual(h.last().busy, true);
            assert.strictEqual(h.last().run.kind, 'running');
            // Edits are ignored while it runs.
            await h.controller.handle({ type: 'ids', text: '1' });
            assert.strictEqual(h.last().ids.text, '1532,1538,3978');
            await h.controller.handle({ type: 'create' });
            await h.controller.handle({ type: 'cancel' });
            await running;
            const run = h.last().run;
            assert.strictEqual(run.kind, 'failed');
            assert.strictEqual(run.kind === 'failed' ? run.cancelled : false, true);
            assert.strictEqual(h.last().busy, false);
        });
    });

    suite('when the script fails', () => {
        const notFound = 'HRU ID(s) not found in hru.con: [4000]';

        test("shows the script's real error and the script is started once", async () => {
            const h = make(call => call.args.includes('--hru-range')
                ? { stdout: JSON.stringify({ ...RANGE_REPLY, source_dir: h.dataset }) }
                : { code: 1, stdout: JSON.stringify({ ok: false, error: notFound }) });
            await withDataset(h, '4000');
            await h.controller.handle({ type: 'create' });
            const run = h.last().run;
            assert.strictEqual(run.kind, 'failed');
            assert.strictEqual(run.kind === 'failed' ? run.message : '', notFound);
            assert.strictEqual(scriptCalls(h, '--output-dir').length, 1);
        });

        test('offers to delete a partly made folder, and deletes only that folder', async () => {
            const h = make(call => {
                if (call.args.includes('--hru-range')) {
                    return { stdout: JSON.stringify({ ...RANGE_REPLY, source_dir: h.dataset }) };
                }
                fs.mkdirSync(call.args[call.args.indexOf('--output-dir') + 1], { recursive: true });
                return { code: 1, stdout: JSON.stringify({ ok: false, error: notFound }) };
            });
            await withDataset(h, '4000');
            const output = h.last().output.text;
            await h.controller.handle({ type: 'create' });
            const failed = h.last().run;
            assert.strictEqual(failed.kind === 'failed' ? failed.partialOutput : undefined, output);

            h.dialogs.deleteAnswer = false;
            await h.controller.handle({ type: 'deletePartial' });
            assert.ok(fs.existsSync(output), 'declined: nothing deleted');

            h.dialogs.deleteAnswer = true;
            await h.controller.handle({ type: 'deletePartial' });
            assert.ok(!fs.existsSync(output));
            assert.ok(fs.existsSync(path.join(h.dataset, 'file.cio')), 'the dataset is untouched');
            const after = h.last().run;
            assert.strictEqual(after.kind === 'failed' ? after.partialOutput : 'x', undefined);
            assert.match(after.kind === 'failed' ? after.info ?? '' : '', /Deleted/);
        });

        test('no partial folder, no offer', async () => {
            const h = make(call => call.args.includes('--hru-range')
                ? { stdout: JSON.stringify({ ...RANGE_REPLY, source_dir: h.dataset }) }
                : { code: 1, stdout: JSON.stringify({ ok: false, error: notFound }) });
            await withDataset(h, '4000');
            await h.controller.handle({ type: 'create' });
            const run = h.last().run;
            assert.strictEqual(run.kind === 'failed' ? run.partialOutput : 'x', undefined);
        });
    });

    suite('Python', () => {
        test('a missing Python is shown and nothing runs', async () => {
            const h = make();
            h.python.ok = false;
            h.python.text = 'No usable Python 3.8+ was found. Tried:\n  py: not found';
            await h.controller.handle({ type: 'ready' });
            await settle();
            assert.strictEqual(h.last().python.ok, false);
            await h.controller.openDataset(h.dataset);
            assert.match(h.last().dataset.error ?? '', /No usable Python/);
            assert.strictEqual(h.last().canCreate, false);
            assert.strictEqual(h.last().canPick, false);
            await h.controller.handle({ type: 'pickHrus' });
            assert.strictEqual(h.dialogs.picker.length, 0);
        });

        test('refreshPython looks again after the setting changes', async () => {
            const h = make();
            h.python.ok = false;
            await h.controller.handle({ type: 'ready' });
            await settle();
            assert.strictEqual(h.last().python.ok, false);
            h.python.ok = true;
            await h.controller.refreshPython();
            assert.strictEqual(h.last().python.ok, true);
        });
    });

    suite('remembering', () => {
        test('the last dataset, ids and options come back in the same workspace', async () => {
            const store = new Map<string, unknown>();
            const first = make(undefined, { store });
            await withDataset(first, '1532,1538', { keepRouting: true, noOutputs: true });
            assert.ok(store.size > 0);

            const second = make(undefined, { store });
            await second.controller.handle({ type: 'ready' });
            const state = second.last();
            assert.strictEqual(state.dataset.input, first.dataset);
            assert.strictEqual(state.ids.text, '1532,1538');
            assert.deepStrictEqual(state.options, { ...DEFAULT_OPTIONS, keepRouting: true, noOutputs: true });
        });

        test('a remembered dataset that is gone is not opened', async () => {
            const store = new Map<string, unknown>([['panel', { dataset: path.join(os.tmpdir(), 'gone-' + Date.now()), ids: '1' }]]);
            const h = make(undefined, { store });
            await h.controller.handle({ type: 'ready' });
            assert.strictEqual(h.last().dataset.input, '');
            assert.strictEqual(h.calls.length, 0);
        });

        test('opening a folder from the Explorer wins over the remembered one', async () => {
            const store = new Map<string, unknown>();
            const first = make(undefined, { store });
            await withDataset(first);
            const second = make(undefined, { store });
            await second.controller.openDataset(second.dataset);
            await second.controller.handle({ type: 'ready' });
            assert.strictEqual(second.last().dataset.input, second.dataset);
        });
    });
});
