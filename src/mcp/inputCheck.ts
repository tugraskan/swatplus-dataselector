/**
 * `check_inputs`: the files `file.cio` names, judged against what SWAT+ reads.
 *
 * `check_dataset` judges `file.cio` itself and never opens the files its rows
 * name. This check opens each of them and, where the read layout is known,
 * counts the values on every data line. SWAT+ reads its input tables
 * list-directed, so a line with fewer values than the read statement takes
 * makes the read carry on into the next line, and every record after it is
 * read shifted -- the failure `check_dataset` catches in `file.cio`, in the
 * files where the model's data actually lives.
 *
 * The layouts come from one SWAT+ source, named in the result: a Tamandua
 * `swatplus-layouts` file built from the checkout that will read the dataset,
 * or by default the schema shipped with this server. Files that change shape
 * between SWAT+ versions are judged by that version's reader only, so a caller
 * compares `expectations.swatplus` with the source it actually runs.
 *
 * Pure: the server reads the files and passes their text in.
 */

import { CioFileIdentity, parseCioRows } from './cioCheck';

export const INPUT_PREFLIGHT_VERSION = 'dataselector-input-preflight/1';

/** Findings listed per file and in all; the counts always cover every row. */
export const MAX_FINDINGS_PER_FILE = 20;
export const MAX_FINDINGS = 200;
export const MAX_UNJUDGED_ROWS = 50;

export const INPUT_UNCHECKED_REASONS = [
    // Named on a file.cio row but not in the dataset.
    'missing',
    'unreadable',
    // No complete read layout for this file name in the expectations.
    'no_layout',
    // SWAT+ reads lines of different kinds (print.prt), so a per-line count means nothing.
    'sections',
] as const;
export type InputUncheckedReason = typeof INPUT_UNCHECKED_REASONS[number];

export const INPUT_UNJUDGED_REASONS = [
    // A quoted value may hold spaces, so whitespace does not count its values.
    'quoted_values',
    // A comma, slash or repeat count (3*0.) changes what list-directed input counts.
    'list_directed_syntax',
] as const;
export type InputUnjudgedReason = typeof INPUT_UNJUDGED_REASONS[number];

export const INPUT_FILE_OUTCOMES = ['match', 'short', 'unchecked'] as const;
export type InputFileOutcome = typeof INPUT_FILE_OUTCOMES[number];

export const INPUT_PREFLIGHT_ERROR_CODES = [
    'no_dataset',
    'dataset_file_missing',
    'read_failed',
    'no_expectations',
] as const;
export type InputPreflightErrorCode = typeof INPUT_PREFLIGHT_ERROR_CODES[number];

/** What SWAT+ reads from one input file, for counting the values on its lines. */
export interface InputReadLayout {
    file: string;
    /** The statement that reads each record: `exco_db_read.f90:56`. */
    readAt: string;
    /** The values SWAT+ reads, in order, up to any run-time-sized group. */
    columns: string[];
    /** The fewest values a record may have: the smallest accepted width. */
    needed: number;
    /** Lines SWAT+ skips before data. */
    skippedLines: number;
    /**
     * `records`: every data line is a record; `single`: only the first data
     * line is read; `sections`: lines of different kinds or nested records
     * (print.prt, management.sch), where a per-line count means nothing.
     */
    rows: 'records' | 'single' | 'sections';
}

export interface InputExpectationSource {
    origin: 'layouts' | 'schema';
    swatplus: { commit: string | null; describe: string | null };
}

export interface InputExpectations extends InputExpectationSource {
    /** Keyed by lower-case file name. */
    layouts: Map<string, InputReadLayout>;
}

export interface InputFileVerdict {
    /** The file.cio section that names the file, and the file.cio line. */
    label: string;
    cio_line: number;
    file: string;
    outcome: InputFileOutcome;
    reason: InputUncheckedReason | null;
    identity: CioFileIdentity | null;
    read_at: string | null;
    needed: number | null;
    /** Data lines whose value count was judged. */
    rows_checked: number;
    /** Data lines whose value count could not be judged (see `coverage.unjudged`). */
    rows_unjudged: number;
    short_rows: number;
}

export interface InputFinding {
    file: string;
    line: number;
    /** True when no line follows, so the read reaches the end of the file instead of the next line. */
    at_end: boolean;
    found: number;
    needed: number;
    missing_columns: string[];
    read_at: string;
    message: string;
}

export interface InputUnjudgedRow {
    file: string;
    line: number;
    reason: InputUnjudgedReason;
}

export interface InputPreflightCoverage {
    /** True only when every named file was checked and every one of its data lines judged. */
    complete: boolean;
    named_files: number;
    checked_files: number;
    unchecked_files: number;
    unjudged_rows: number;
    unjudged: InputUnjudgedRow[];
}

/** The structured result of `check_inputs`. */
export interface InputPreflight {
    check_version: typeof INPUT_PREFLIGHT_VERSION;
    /**
     * `pass` only with complete coverage and no short row; `fail` whenever a
     * short row is found, coverage or not; `inconclusive` otherwise. `error`
     * means the check could not run at all.
     */
    status: 'pass' | 'fail' | 'inconclusive' | 'error';
    summary: string;
    error: { code: InputPreflightErrorCode; message: string } | null;
    dataset: { dir: string | null; file_cio: CioFileIdentity | null };
    expectations: (InputExpectationSource & { path: string | null; sha256: string | null }) | null;
    coverage: InputPreflightCoverage;
    files: InputFileVerdict[];
    findings: InputFinding[];
}

export interface NamedFile {
    label: string;
    file: string;
    line: number;
}

/** Every distinct file a file.cio row names, in file order; `null` names none. */
export function namedFiles(cioText: string): NamedFile[] {
    const seen = new Set<string>();
    const named: NamedFile[] = [];
    for (const row of parseCioRows(cioText)) {
        for (const value of row.values) {
            const key = value.toLowerCase();
            if (key === 'null' || seen.has(key)) {
                continue;
            }
            seen.add(key);
            named.push({ label: row.label, file: value, line: row.line });
        }
    }
    return named;
}

function readLayout(
    file: string,
    readAt: string,
    columns: string[],
    widths: number[],
    skippedLines: number,
    rows: InputReadLayout['rows'],
): InputReadLayout {
    const accepted = widths.length > 0 ? widths : [columns.length];
    return {
        file,
        readAt,
        columns,
        needed: Math.min(...accepted, columns.length || Infinity),
        skippedLines,
        rows,
    };
}

/**
 * Layouts from the schema this server ships (`swatplus-generated-schema.json`):
 * its tables built from SWAT+ source (`origin: "tamandua"`).
 */
export function expectationsFromSchema(schema: any): InputExpectations {
    const tables: Record<string, any> = schema?.tables ?? {};
    const layouts = new Map<string, InputReadLayout>();
    for (const table of Object.values(tables)) {
        const layout = table?.swat_layout;
        if (table?.origin !== 'tamandua' || !layout) {
            continue;
        }
        const columns: string[] = [];
        for (const column of table.columns ?? []) {
            if (column.read_by_swat === false || column.swat?.repeat) {
                break;
            }
            columns.push(String(column.name));
        }
        const widths = Array.isArray(layout.record_widths) ? [...layout.record_widths].map(Number) : [];
        const rows = layout.rows === 'single' || layout.rows === 'sections' ? layout.rows : 'records';
        const file = String(table.file_name);
        layouts.set(file.toLowerCase(), readLayout(
            file, String(layout.read_at ?? ''), columns, widths, Number(table.data_starts_after ?? 0), rows,
        ));
    }
    const swatplus = schema?.generated_from?.swatplus ?? {};
    return {
        origin: 'schema',
        swatplus: {
            commit: swatplus.commit ?? schema?.source?.commit ?? null,
            describe: swatplus.describe ?? schema?.source?.generated_on ?? null,
        },
        layouts,
    };
}

/**
 * Layouts from Tamandua's `swatplus-layouts` (layout format 2), built from the
 * SWAT+ checkout that will read the dataset. Only complete layouts of SWAT+'s
 * own file names are used, as when the shipped schema is generated.
 */
export function expectationsFromLayouts(layoutsJson: any): InputExpectations {
    const layouts = new Map<string, InputReadLayout>();
    for (const entry of Object.values<any>(layoutsJson?.files ?? {})) {
        const records: any[] = Array.isArray(entry?.records) ? entry.records : [];
        const main = records.find(record => record?.role === 'main');
        if (!entry?.filename_is_default || !main || !main.complete) {
            continue;
        }
        const columns: string[] = [];
        for (const column of main.columns ?? []) {
            if (column?.repeat) {
                break;
            }
            columns.push(String(column.name));
        }
        const widths = [...new Set(records
            .filter(record => (record?.role === 'main' || record?.role === 'alternative')
                && !(record.columns ?? []).some((column: any) => column?.repeat))
            .map(record => (record.columns ?? []).length))].sort((a, b) => a - b);
        let rows: InputReadLayout['rows'];
        // Lines of another kind, or records nested under each main one, are
        // not one record per line.
        if (records.some(record => record?.role !== 'main' && record?.role !== 'alternative')) {
            rows = 'sections';
        } else {
            rows = (main.loops ?? []).some((loop: string) => loop !== 'do') ? 'records' : 'single';
        }
        const file = String(entry.file);
        layouts.set(file.toLowerCase(), readLayout(
            file, String(main.at ?? ''), columns, widths, Number(entry.data_starts_after ?? 0), rows,
        ));
    }
    const provenance = layoutsJson?.provenance ?? {};
    return {
        origin: 'layouts',
        swatplus: { commit: provenance.source_commit ?? null, describe: provenance.source_describe ?? null },
        layouts,
    };
}

/** Either format: a Tamandua layouts file or a generated schema. */
export function expectationsFrom(json: any): InputExpectations | undefined {
    if (json && typeof json === 'object' && json.files && json.layout_format !== undefined) {
        return expectationsFromLayouts(json);
    }
    if (json && typeof json === 'object' && json.tables) {
        return expectationsFromSchema(json);
    }
    return undefined;
}

const QUOTE = /['"]/;
const UNCOUNTED = /[,/]|^\d+\*/;

export interface FileJudgement {
    rowsChecked: number;
    shortRows: number;
    findings: InputFinding[];
    unjudged: InputUnjudgedRow[];
}

/**
 * Count the values on every data line of one file against its layout. Blank
 * lines and `#` lines are skipped, as the editor's diagnostics skip them.
 */
export function judgeFile(text: string, layout: InputReadLayout): FileJudgement {
    const lines = text.split(/\r?\n/);
    const judgement: FileJudgement = { rowsChecked: 0, shortRows: 0, findings: [], unjudged: [] };
    let firstData = true;
    for (let index = layout.skippedLines; index < lines.length; index += 1) {
        const line = lines[index].trim();
        if (!line || line.startsWith('#')) {
            continue;
        }
        if (layout.rows === 'single' && !firstData) {
            break;
        }
        firstData = false;
        const tokens = line.split(/\s+/);
        if (QUOTE.test(line)) {
            judgement.unjudged.push({ file: layout.file, line: index + 1, reason: 'quoted_values' });
            continue;
        }
        if (tokens.length >= layout.needed) {
            judgement.rowsChecked += 1;
            continue;
        }
        if (tokens.some(token => UNCOUNTED.test(token))) {
            judgement.unjudged.push({ file: layout.file, line: index + 1, reason: 'list_directed_syntax' });
            continue;
        }
        judgement.rowsChecked += 1;
        judgement.shortRows += 1;
        if (judgement.findings.length < MAX_FINDINGS_PER_FILE) {
            const missing = layout.columns.slice(tokens.length, layout.needed);
            // SWAT+ reads on through any following line, comment-like or not.
            const atEnd = !lines.slice(index + 1).some(rest => rest.trim().length > 0);
            judgement.findings.push({
                file: layout.file,
                line: index + 1,
                at_end: atEnd,
                found: tokens.length,
                needed: layout.needed,
                missing_columns: missing,
                read_at: layout.readAt,
                message: `${layout.file} line ${index + 1} has ${tokens.length} value`
                    + `${tokens.length === 1 ? '' : 's'}; SWAT+ reads ${layout.needed} per record `
                    + `(${layout.readAt}), so `
                    + (atEnd ? 'the read reaches the end of the file' : 'it reads on into the next line')
                    + (missing.length ? ` for ${missing.join(', ')}` : ''),
            });
        }
    }
    return judgement;
}

/** One named file as the server found it: its text, or why it has none. */
export type DatasetFile =
    | { kind: 'text'; text: string; identity: CioFileIdentity }
    | { kind: 'missing' }
    | { kind: 'unreadable'; message: string };

export interface InputCheckContext {
    datasetDir: string;
    fileCio: CioFileIdentity;
    expectations: InputExpectations;
    expectationFile: { path: string | null; sha256: string | null };
}

function versionLabel(source: InputExpectationSource): string {
    const { describe, commit } = source.swatplus;
    const parts = [describe ? `SWAT+ ${describe}` : 'SWAT+', commit ? `(${commit.slice(0, 12)})` : null];
    return parts.filter(Boolean).join(' ');
}

/** Judge every file `file.cio` names. `read` returns a file's text by its file.cio name. */
export function preflightInputs(
    cioText: string,
    read: (file: string) => DatasetFile,
    context: InputCheckContext,
): InputPreflight {
    const files: InputFileVerdict[] = [];
    const findings: InputFinding[] = [];
    const unjudged: InputUnjudgedRow[] = [];
    let unjudgedRows = 0;
    for (const named of namedFiles(cioText)) {
        const verdict: InputFileVerdict = {
            label: named.label,
            cio_line: named.line,
            file: named.file,
            outcome: 'unchecked',
            reason: null,
            identity: null,
            read_at: null,
            needed: null,
            rows_checked: 0,
            rows_unjudged: 0,
            short_rows: 0,
        };
        files.push(verdict);
        const layout = context.expectations.layouts.get(named.file.toLowerCase());
        const found = read(named.file);
        if (found.kind === 'missing') {
            verdict.reason = 'missing';
            continue;
        }
        if (found.kind === 'unreadable') {
            verdict.reason = 'unreadable';
            continue;
        }
        verdict.identity = found.identity;
        if (!layout) {
            verdict.reason = 'no_layout';
            continue;
        }
        verdict.read_at = layout.readAt;
        verdict.needed = layout.needed;
        if (layout.rows === 'sections') {
            verdict.reason = 'sections';
            continue;
        }
        const judgement = judgeFile(found.text, layout);
        verdict.outcome = judgement.shortRows > 0 ? 'short' : 'match';
        verdict.rows_checked = judgement.rowsChecked;
        verdict.rows_unjudged = judgement.unjudged.length;
        verdict.short_rows = judgement.shortRows;
        unjudgedRows += judgement.unjudged.length;
        for (const row of judgement.unjudged) {
            if (unjudged.length < MAX_UNJUDGED_ROWS) {
                unjudged.push(row);
            }
        }
        for (const item of judgement.findings) {
            if (findings.length < MAX_FINDINGS) {
                findings.push(item);
            }
        }
    }
    const checked = files.filter(item => item.outcome !== 'unchecked');
    const complete = checked.length === files.length && unjudgedRows === 0;
    const short = files.filter(item => item.outcome === 'short');
    const status: InputPreflight['status'] = short.length > 0 ? 'fail' : complete ? 'pass' : 'inconclusive';
    const result: InputPreflight = {
        check_version: INPUT_PREFLIGHT_VERSION,
        status,
        summary: '',
        error: null,
        dataset: { dir: context.datasetDir, file_cio: context.fileCio },
        expectations: {
            origin: context.expectations.origin,
            swatplus: context.expectations.swatplus,
            path: context.expectationFile.path,
            sha256: context.expectationFile.sha256,
        },
        coverage: {
            complete,
            named_files: files.length,
            checked_files: checked.length,
            unchecked_files: files.length - checked.length,
            unjudged_rows: unjudgedRows,
            unjudged,
        },
        files,
        findings,
    };
    result.summary = summarize(result);
    return result;
}

function summarize(result: InputPreflight): string {
    const { coverage } = result;
    const against = result.expectations ? ` against ${versionLabel(result.expectations)}` : '';
    const head = `${coverage.checked_files} of ${coverage.named_files} files named on file.cio rows checked${against}`;
    const short = result.files.filter(item => item.outcome === 'short');
    const parts = [head];
    if (short.length) {
        parts.push(`${short.length} with rows short of values: `
            + short.map(item => `${item.file} (${item.short_rows})`).join(', '));
    } else if (coverage.checked_files) {
        parts.push('no checked row is short of values');
    }
    if (coverage.unchecked_files) {
        const reasons = new Map<string, number>();
        for (const item of result.files) {
            if (item.reason) {
                reasons.set(item.reason, (reasons.get(item.reason) ?? 0) + 1);
            }
        }
        parts.push(`not checked: ${coverage.unchecked_files} (`
            + [...reasons].map(([reason, count]) => `${reason} ${count}`).join(', ') + ')');
    }
    if (coverage.unjudged_rows) {
        parts.push(`${coverage.unjudged_rows} row(s) could not be counted`);
    }
    return parts.join('; ') + '.';
}

export function inputPreflightError(
    code: InputPreflightErrorCode,
    message: string,
    datasetDir: string | null,
    fileCio: CioFileIdentity | null = null,
): InputPreflight {
    return {
        check_version: INPUT_PREFLIGHT_VERSION,
        status: 'error',
        summary: message,
        error: { code, message },
        dataset: { dir: datasetDir, file_cio: fileCio },
        expectations: null,
        coverage: {
            complete: false,
            named_files: 0,
            checked_files: 0,
            unchecked_files: 0,
            unjudged_rows: 0,
            unjudged: [],
        },
        files: [],
        findings: [],
    };
}

/** The text form: the verdict, each short row, and what was not checked. */
export function describeInputPreflight(result: InputPreflight): string {
    if (result.status === 'error') {
        return result.summary;
    }
    const lines = [result.summary];
    if (result.status === 'pass') {
        lines.push('Every file named on file.cio was checked: no data line is short of the values SWAT+ reads.');
    }
    for (const item of result.findings) {
        lines.push(`- ${item.message}`);
    }
    const listed = result.findings.length;
    const total = result.files.reduce((sum, item) => sum + item.short_rows, 0);
    if (total > listed) {
        lines.push(`- ... and ${total - listed} more short row(s)`);
    }
    if (result.status !== 'pass') {
        lines.push('A pass needs every named file checked and every data line counted; '
            + 'files with no read layout, and lines with quotes, commas, slashes or repeat counts, are not judged.');
    }
    return lines.join('\n');
}
