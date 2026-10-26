import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_OPTIONS } from '../options';
import {
    createSubset,
    deletePartialOutput,
    inspectHruRange,
    RunnerContext,
    runScriptJson,
    ScriptError,
    whyNotDeletable
} from '../runner';
import { RecordedCall, Responder, fakeProcess } from './fakeProcess';

const NOT_FOUND = 'HRU ID(s) not found in hru.con: [99999]';

function context(respond: Responder, extra: Partial<RunnerContext> = {}): { ctx: RunnerContext; calls: RecordedCall[] } {
    const { run, calls } = fakeProcess(respond);
    return {
        ctx: { scriptPath: '/ext/python/hru_processor.py', python: { command: 'py', version: 'Python 3.13.12' }, run, ...extra },
        calls
    };
}

async function rejection(promise: Promise<unknown>): Promise<ScriptError> {
    try {
        await promise;
    } catch (error) {
        assert.ok(error instanceof ScriptError, `expected ScriptError, got ${String(error)}`);
        return error;
    }
    throw new Error('expected the promise to reject');
}

suite('Running the script', () => {
    test('a script error is reported as it is and the script is not run again', async () => {
        // The Dataset Selector bug: after this exit-1 it tried python, then python3 (the Store stub).
        const { ctx, calls } = context(() => ({
            code: 1,
            stdout: JSON.stringify({ ok: false, error: NOT_FOUND })
        }));
        const error = await rejection(runScriptJson(ctx, ['--dataset', 'D', '--hru-ids', '99999']));
        assert.strictEqual(error.message, NOT_FOUND);
        assert.strictEqual(error.details.exitCode, 1);
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].command, 'py');
    });

    test('runs the script with --json appended', async () => {
        const { ctx, calls } = context(() => ({ stdout: '{"ok": true}' }));
        await runScriptJson(ctx, ['--dataset', 'D', '--hru-range']);
        assert.deepStrictEqual(calls[0].args, ['/ext/python/hru_processor.py', '--dataset', 'D', '--hru-range', '--json']);
    });

    test('an exit code of 0 with ok:false is still an error', async () => {
        const { ctx } = context(() => ({ stdout: JSON.stringify({ ok: false, error: 'nope' }) }));
        assert.strictEqual((await rejection(runScriptJson(ctx, []))).message, 'nope');
    });

    test('with no JSON, the end of stderr is the error', async () => {
        const traceback = ['Traceback (most recent call last):', '  File "x.py", line 1', 'MemoryError'].join('\n');
        const { ctx, calls } = context(() => ({ code: 1, stderr: traceback }));
        const error = await rejection(runScriptJson(ctx, []));
        assert.strictEqual(error.message, traceback);
        assert.strictEqual(calls.length, 1);
    });

    test('a silent failure still says something', async () => {
        const { ctx } = context(() => ({ code: 3 }));
        assert.strictEqual(
            (await rejection(runScriptJson(ctx, []))).message,
            'The script exited with code 3 and printed nothing.'
        );
    });

    test('exit 0 with unparseable output is an error', async () => {
        const { ctx } = context(() => ({ stdout: 'not json', stderr: 'warning: x' }));
        const error = await rejection(runScriptJson(ctx, []));
        assert.ok(error.message.startsWith('The script exited normally but printed no JSON.'));
        assert.ok(error.message.includes('warning: x'));
    });

    test('an interpreter that cannot start is not retried either', async () => {
        const { ctx, calls } = context(() => undefined);
        const error = await rejection(runScriptJson(ctx, []));
        assert.ok(error.message.startsWith('Could not run py:'), error.message);
        assert.strictEqual(calls.length, 1);
    });

    test('cancelling is reported as cancelled', async () => {
        const { ctx } = context(() => ({
            code: null,
            error: Object.assign(new Error('Cancelled'), { code: 'ABORT_ERR' })
        }));
        const error = await rejection(runScriptJson(ctx, []));
        assert.strictEqual(error.cancelled, true);
        assert.strictEqual(error.message, 'Cancelled.');
    });

    test('passes the log callback and abort signal on', async () => {
        const controller = new AbortController();
        const logged: string[] = [];
        const { ctx, calls } = context(
            call => {
                call.options?.onStderr?.('Working copy created\n');
                return { stdout: '{"ok": true}' };
            },
            { signal: controller.signal, onLog: text => logged.push(text) }
        );
        await runScriptJson(ctx, []);
        assert.strictEqual(calls[0].options?.signal, controller.signal);
        assert.deepStrictEqual(logged, ['Working copy created\n']);
    });

    test('reads the HRU range', async () => {
        const range = { ok: true, source_dir: 'D', min_hru: 1, max_hru: 4000, total_hrus: 4000 };
        const { ctx, calls } = context(() => ({ stdout: JSON.stringify(range) }));
        assert.deepStrictEqual(await inspectHruRange(ctx, 'D'), range);
        assert.deepStrictEqual(calls[0].args.slice(1), ['--dataset', 'D', '--hru-range', '--json']);
    });
});

suite('Creating a subset', () => {
    let work: string;
    setup(() => {
        work = fs.mkdtempSync(path.join(os.tmpdir(), 'hru-subset-test-'));
    });
    teardown(() => {
        fs.rmSync(work, { recursive: true, force: true });
    });

    const tool = { name: 'swat-hru-subset', version: '0.1.0' };

    test('always passes --output-dir and writes the marker file with the result', async () => {
        const output = path.join(work, 'out');
        fs.mkdirSync(output);
        const scriptResult = {
            ok: true, source_dir: 'D', output_dir: output, hru_ids: [1532], keep_routing: true,
            retained_counts: { hru: 1 }, added_hru_ids: [], workarounds_applied: ['W2']
        };
        const { ctx, calls } = context(() => ({ stdout: JSON.stringify(scriptResult) }));

        const run = await createSubset(
            ctx,
            { datasetPath: 'D', hruIds: '1532', outputDir: output, options: { ...DEFAULT_OPTIONS, keepRouting: true } },
            tool
        );

        const args = calls[0].args;
        assert.strictEqual(args[args.indexOf('--output-dir') + 1], output);
        assert.ok(args.includes('--json') && args.includes('--keep-routing'));
        assert.ok(!args.includes('--overwrite') && !args.includes('--run-swat'));
        assert.strictEqual(run.resultFile, path.join(output, 'hru_subset_result.json'));
        assert.strictEqual(run.resultFileError, undefined);

        const written = JSON.parse(fs.readFileSync(run.resultFile, 'utf8'));
        assert.deepStrictEqual(written.tool, tool);
        assert.strictEqual(written.ok, true);
        assert.deepStrictEqual(written.hru_ids, [1532]);
        assert.deepStrictEqual(written.workarounds_applied, ['W2']);
        assert.ok(!Number.isNaN(Date.parse(written.created_at)));
    });

    test('a marker that cannot be written does not hide the result', async () => {
        const missing = path.join(work, 'never-created');
        const { ctx } = context(() => ({
            stdout: JSON.stringify({ ok: true, source_dir: 'D', output_dir: missing, hru_ids: [1], keep_routing: false })
        }));
        const run = await createSubset(
            ctx,
            { datasetPath: 'D', hruIds: '1', outputDir: missing, options: DEFAULT_OPTIONS },
            tool
        );
        assert.strictEqual(run.result.output_dir, missing);
        assert.ok(run.resultFileError);
    });

    test('a failed run throws the script error and writes nothing', async () => {
        const output = path.join(work, 'out');
        const { ctx, calls } = context(() => ({
            code: 1,
            stdout: JSON.stringify({ ok: false, error: NOT_FOUND })
        }));
        const error = await rejection(createSubset(
            ctx,
            { datasetPath: 'D', hruIds: '99999', outputDir: output, options: DEFAULT_OPTIONS },
            tool
        ));
        assert.strictEqual(error.message, NOT_FOUND);
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(fs.existsSync(output), false);
    });
});

suite('Deleting a partial output', () => {
    let work: string;
    let dataset: string;
    setup(() => {
        work = fs.mkdtempSync(path.join(os.tmpdir(), 'hru-subset-test-'));
        dataset = path.join(work, 'dataset');
        fs.mkdirSync(dataset);
        fs.writeFileSync(path.join(dataset, 'file.cio'), 'x');
    });
    teardown(() => {
        fs.rmSync(work, { recursive: true, force: true });
    });

    test('deletes the folder the run created, and only that', () => {
        const output = path.join(work, 'dataset_subset_1');
        const sibling = path.join(work, 'dataset_subset_2');
        for (const folder of [output, sibling]) {
            fs.mkdirSync(folder);
            fs.writeFileSync(path.join(folder, 'hru.con'), 'x');
        }
        assert.strictEqual(deletePartialOutput(output, false, [dataset]), true);
        assert.strictEqual(fs.existsSync(output), false);
        assert.strictEqual(fs.existsSync(path.join(sibling, 'hru.con')), true);
        assert.strictEqual(fs.existsSync(path.join(dataset, 'file.cio')), true);
    });

    test('returns false when the script failed before creating anything', () => {
        assert.strictEqual(deletePartialOutput(path.join(work, 'nothing'), false, [dataset]), false);
    });

    test('refuses a folder that existed before the run', () => {
        const output = path.join(work, 'mine');
        fs.mkdirSync(output);
        fs.writeFileSync(path.join(output, 'precious.txt'), 'x');
        assert.throws(() => deletePartialOutput(output, true, [dataset]), /existed before the run/);
        assert.strictEqual(fs.existsSync(path.join(output, 'precious.txt')), true);
    });

    test('refuses the dataset, a folder inside it and a folder around it', () => {
        const inside = path.join(dataset, 'multi_20260905_070809');
        fs.mkdirSync(inside);
        assert.throws(() => deletePartialOutput(dataset, false, [dataset]), /overlaps the dataset/);
        assert.throws(() => deletePartialOutput(inside, false, [dataset]), /overlaps the dataset/);
        assert.throws(() => deletePartialOutput(work, false, [dataset]), /overlaps the dataset/);
        assert.strictEqual(fs.existsSync(path.join(dataset, 'file.cio')), true);
    });

    test('refuses a filesystem root', () => {
        assert.strictEqual(whyNotDeletable(path.parse(work).root, false, [dataset]), 'it is a filesystem root');
    });

    test('refuses a file', () => {
        const file = path.join(work, 'a-file');
        fs.writeFileSync(file, 'x');
        assert.throws(() => deletePartialOutput(file, false, [dataset]), /not a plain folder/);
        assert.strictEqual(fs.existsSync(file), true);
    });
});
