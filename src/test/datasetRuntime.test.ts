import * as assert from 'assert';
import * as path from 'path';
import {
    DATASET_MARKER_FILES,
    PYTHON_CANDIDATES,
    RUN_FRAME_LIMIT,
    RunOutcome,
    describeDatasetProblem,
    parseRunFailure,
    resolvePython,
    summarizeRun,
} from '../mcp/datasetRuntime';

/** A `forrtl` crash as an ifx build with /traceback and /INCREMENTAL:NO prints it. */
const NAMED_CRASH = [
    ' reading from wx station file            Time  10:22:29',
    'forrtl: severe (408): fort: (11): Subscript #1 of the array OB has value 0 which is less than the lower bound of 1',
    '',
    'Image              PC                Routine            Line        Source             ',
    'swatplus-62.0.0-9  00007FF6E847E5D4  HYD_READ_CONNECT          338  hyd_read_connect.f90',
    'swatplus-62.0.0-9  00007FF6E8D9F646  HYD_CONNECT               128  hyd_connect.f90',
    'swatplus-62.0.0-9  00007FF6E95ABB6D  MAIN                       45  main.f90',
    'swatplus-62.0.0-9  00007FF6E991B5BB  Unknown               Unknown  Unknown',
    'KERNEL32.DLL       00007FFF953BCD87  Unknown               Unknown  Unknown',
].join('\r\n');

/** The same crash from a build that lost its traceback tables. */
const UNNAMED_CRASH = [
    'forrtl: severe (408): Subscript #1 of the array OB has value 0 which is less than the lower bound of 1',
    'Image              PC                Routine            Line        Source             ',
    'swatplus-62.0.0-9  00007FF6E847E5D4  Unknown               Unknown  Unknown',
    'swatplus-62.0.0-9  00007FF6E8D9F646  Unknown               Unknown  Unknown',
].join('\n');

function outcome(over: Partial<RunOutcome> = {}): RunOutcome {
    return {
        executable: 'C:/build/swatplus.exe',
        datasetDir: 'C:/work/TxtInOut',
        exitCode: 0,
        elapsedMs: 3200,
        stdout: '',
        stderr: '',
        ...over,
    };
}

suite('Dataset runtime - choosing an interpreter', () => {
    test('prefers python3 when it actually runs', () => {
        const found = resolvePython(command => command === 'python3');
        assert.strictEqual(found?.command, 'python3');
    });

    test('falls through to python when python3 is the Windows Store stub', () => {
        // The stub answers when spawned but exits non-zero, so the probe says
        // no. Assuming python3 was the original bug: on Windows the failure
        // looked like a broken indexer rather than a missing interpreter.
        const found = resolvePython(command => command === 'python');
        assert.strictEqual(found?.command, 'python');
    });

    test('carries the launcher version argument with the command', () => {
        // `py` without -3 would run whatever the launcher defaults to, which
        // may be a python 2 or an unrelated install.
        const found = resolvePython(command => command === 'py');
        assert.strictEqual(found?.command, 'py');
        assert.deepStrictEqual(found?.args, ['-3']);
    });

    test('reports nothing rather than guessing when none run', () => {
        assert.strictEqual(resolvePython(() => false), undefined);
    });

    test('every candidate is tried in a fixed order', () => {
        const tried: string[] = [];
        resolvePython(command => { tried.push(command); return false; });
        assert.deepStrictEqual(tried, PYTHON_CANDIDATES.map(c => c.command));
    });
});

suite('Dataset runtime - validating a dataset directory', () => {
    const isDir = () => true;

    test('a directory holding file.cio is a dataset', () => {
        const problem = describeDatasetProblem(
            '/work/TxtInOut',
            p => p === '/work/TxtInOut' || p.endsWith('file.cio'),
            isDir,
        );
        assert.strictEqual(problem, undefined);
    });

    test('any one marker file is enough', () => {
        for (const marker of DATASET_MARKER_FILES) {
            const problem = describeDatasetProblem(
                '/work/TxtInOut',
                p => p === '/work/TxtInOut' || p === path.join('/work/TxtInOut', marker),
                isDir,
            );
            assert.strictEqual(problem, undefined, marker);
        }
    });

    test('a missing directory says so, naming it', () => {
        const problem = describeDatasetProblem('/nope', () => false, isDir);
        assert.match(problem ?? '', /\/nope does not exist/);
    });

    test('a file is rejected with the reason someone would need', () => {
        const problem = describeDatasetProblem('/work/file.cio', () => true, () => false);
        assert.match(problem ?? '', /is a file/);
        assert.match(problem ?? '', /file\.cio/);
    });

    test('a folder with no marker names what was looked for', () => {
        // Almost always the parent folder or a results directory. Listing the
        // files that were missing is what makes that obvious.
        const problem = describeDatasetProblem(
            '/work',
            p => p === '/work',
            isDir,
        );
        assert.match(problem ?? '', /file\.cio/);
        assert.match(problem ?? '', /does not look like a SWAT\+ dataset/);
    });

    test('an empty path is refused before it touches the disk', () => {
        let touched = false;
        const problem = describeDatasetProblem('  ', () => { touched = true; return true; }, isDir);
        assert.match(problem ?? '', /no dataset path/);
        assert.strictEqual(touched, false);
    });
});

suite('Dataset runtime - reading a crash out of a run', () => {
    test('a named traceback yields routine and line per frame', () => {
        const failure = parseRunFailure(NAMED_CRASH);
        assert.ok(failure);
        assert.strictEqual(failure.unresolved, false);
        assert.strictEqual(failure.frames[0].routine, 'HYD_READ_CONNECT');
        assert.strictEqual(failure.frames[0].line, 338);
        assert.strictEqual(failure.frames[0].source, 'hyd_read_connect.f90');
        assert.strictEqual(failure.frames[2].routine, 'MAIN');
    });

    test('CRLF and a fort: prefix do not defeat the parse', () => {
        // Both are what the Intel runtime actually prints on Windows.
        const failure = parseRunFailure(NAMED_CRASH);
        assert.match(failure?.message ?? '', /fort: \(11\)/);
        assert.match(failure?.message ?? '', /^forrtl: severe \(408\)/);
    });

    test('Unknown columns become absent rather than a routine called Unknown', () => {
        const failure = parseRunFailure(NAMED_CRASH);
        const runtimeFrame = failure?.frames[3];
        assert.strictEqual(runtimeFrame?.routine, undefined);
        assert.strictEqual(runtimeFrame?.line, undefined);
    });

    test('a traceback with no names at all is flagged unresolved', () => {
        const failure = parseRunFailure(UNNAMED_CRASH);
        assert.strictEqual(failure?.unresolved, true);
        assert.strictEqual(failure?.frames.length, 2);
    });

    test('the last error is the one reported', () => {
        // A run that survived a warning and then died has two; the one that
        // killed it is the one worth reporting.
        const failure = parseRunFailure([
            'forrtl: warning (402): something survivable',
            'forrtl: severe (408): the one that killed it',
        ].join('\n'));
        assert.match(failure?.message ?? '', /the one that killed it/);
    });

    test('clean output carries no failure', () => {
        assert.strictEqual(parseRunFailure('Execution successfully completed'), undefined);
    });

    test('line 0 means no line, and the file survives it', () => {
        // ifx prints line 0 for an inlined or compiler-generated frame. Real
        // output from this project: `time_control.f90  0  COMMAND.void`.
        // Rendering that as file.f90:0 sends someone to a line that is not
        // there, but dropping the filename too would lose what it does say.
        const failure = parseRunFailure([
            'forrtl: severe (408): boom',
            'swatplus  00007FF6E8D9F646  COMMAND.void  0  time_control.f90',
        ].join('\n'));
        assert.strictEqual(failure?.frames[0].line, undefined);
        assert.strictEqual(failure?.frames[0].source, 'time_control.f90');

        const text = summarizeRun(outcome({ exitCode: 408, stdout: [
            'forrtl: severe (408): boom',
            'swatplus  00007FF6E8D9F646  COMMAND.void  0  time_control.f90',
        ].join('\n') }));
        assert.match(text, /time_control\.f90 in COMMAND\.void/);
        assert.doesNotMatch(text, /time_control\.f90:0/);
    });

    test('the table header is never read as a frame', () => {
        const failure = parseRunFailure(NAMED_CRASH);
        assert.ok(!failure?.frames.some(frame => frame.image === 'Image'));
    });
});

suite('Dataset runtime - reporting a run', () => {
    test('a crash leads with the forrtl line, not with the output', () => {
        // A SWAT+ run prints far more than fits in a tool result and almost
        // none of it matters once it has crashed. A reader seeing only the
        // first lines should already have the failing routine.
        const text = summarizeRun(outcome({ exitCode: 408, stdout: NAMED_CRASH }));
        const head = text.split('\n').slice(0, 5).join('\n');
        assert.match(head, /^forrtl: severe \(408\)/);
        assert.match(head, /hyd_read_connect\.f90:338 in HYD_READ_CONNECT/);
    });

    test('a successful run says so plainly', () => {
        const text = summarizeRun(outcome({ stdout: 'Execution successfully completed' }));
        assert.match(text, /finished normally in 3\.2s/);
    });

    test('a non-zero exit with no forrtl error is still reported', () => {
        const text = summarizeRun(outcome({ exitCode: 2, stdout: 'could not open input' }));
        assert.match(text, /exited with code 2/);
        assert.match(text, /without a forrtl error/);
    });

    test('a timeout is reported as a timeout, not as a crash', () => {
        const text = summarizeRun(outcome({
            exitCode: null, signal: 'SIGTERM', timedOut: true, elapsedMs: 900000,
        }));
        assert.match(text, /still going after 900\.0s and was stopped/);
    });

    test('an unnamed traceback blames the build, not the data', () => {
        // The distinction that matters: this is a build fix, and someone told
        // only "could not resolve" goes looking in the dataset instead.
        const text = summarizeRun(outcome({ exitCode: 408, stdout: UNNAMED_CRASH }));
        assert.match(text, /none named/);
        assert.match(text, /\/traceback/);
        assert.match(text, /INCREMENTAL:NO/);
    });

    test('the executable and dataset are always stated', () => {
        // Which binary ran against which folder is the first thing wrong when
        // a result is surprising.
        const text = summarizeRun(outcome({ stdout: 'fine' }));
        assert.match(text, /executable: C:\/build\/swatplus\.exe/);
        assert.match(text, /dataset:    C:\/work\/TxtInOut/);
    });

    test('a very long run output is trimmed, and says it was', () => {
        const text = summarizeRun(outcome({ stdout: 'x'.repeat(50000) }));
        assert.ok(text.length < 10000);
        assert.match(text, /earlier chars omitted/);
    });

    test('a deep traceback is capped and says how many it dropped', () => {
        // Addresses stay 16 hex digits wide: the row pattern caps there, and a
        // 17-digit fixture would silently parse as fewer frames than intended.
        const frames = Array.from({ length: RUN_FRAME_LIMIT + 5 }, (_, i) =>
            `swatplus  ${(0x7ff6e847e5d0 + i).toString(16).toUpperCase().padStart(16, '0')}`
            + `  ROUTINE_${i}  ${i + 1}  file_${i}.f90`);
        const text = summarizeRun(outcome({
            exitCode: 408,
            stdout: ['forrtl: severe (408): boom', ...frames].join('\n'),
        }));
        assert.match(text, /\.\.\. 5 more frame\(s\)/);
    });
});
