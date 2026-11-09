/**
 * `check_inputs`: the files `file.cio` names, judged against what SWAT+ reads.
 *
 * `check_dataset` judges `file.cio` itself and never opens the files its rows
 * name. This check opens each of them and, where the read layout is known,
 * walks the values on every data line against the fields SWAT+ reads. Input
 * tables are read list-directed, which fails in two different ways:
 *
 * - A line with fewer values than the read takes makes the read carry on into
 *   the next line, and every record after it is read shifted -- the failure
 *   `check_dataset` catches in `file.cio`, in the files where the model's data
 *   actually lives.
 * - A value that cannot be read as its field's type is a read error. SWAT+'s
 *   readers test only for end of file, so the run goes on: the record's later
 *   fields keep their code defaults and the next read starts on the next line.
 *   Nothing is reported, and the row count still looks right.
 *
 * `inputCrossChecks.ts` adds what no single line shows: decision-table actions
 * against the source that runs them, weather records against `time.sim`, and
 * crops that start dormant against what plants them.
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
import { InputSourceFacts, runCrossChecks } from './inputCrossChecks';

export const INPUT_PREFLIGHT_VERSION = 'dataselector-input-preflight/2';

/** Findings listed per file and in all; the counts always cover every row. */
export const MAX_FINDINGS_PER_FILE = 20;
export const MAX_FINDINGS = 200;
export const MAX_UNJUDGED_ROWS = 50;
/** Line numbers kept for rows that fail the same way. */
export const MAX_ISSUE_LINES = 5;

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

export const INPUT_FILE_OUTCOMES = ['match', 'short', 'bad_value', 'unchecked'] as const;
export type InputFileOutcome = typeof INPUT_FILE_OUTCOMES[number];

export const INPUT_ISSUE_KINDS = [
    // A value that cannot be read as its field's type: the read stops there.
    'bad_value',
    // A slash in a read position ends the read without an error.
    'slash_ends_read',
    // A decimal in an integer field: gfortran stops there, ifx reads on.
    'decimal_in_integer',
    // lum.dtl: the action's run branch reads a lookup dtbl_lum_read.f90 never makes.
    'action_never_mapped',
    // lum.dtl: no branch of actions.f90 runs the action.
    'action_never_run',
    // lum.dtl: the name the action looks up is not in its database.
    'option_not_in_database',
    'weather_ends_early',
    'rain_days_missing',
    'crop_never_planted',
    // The layouts judged are not those of the source that will run.
    'layouts_not_for_source',
] as const;
export type InputIssueKind = typeof INPUT_ISSUE_KINDS[number];

/** `error` makes the verdict `fail`; `warning` and `note` never do. */
export const INPUT_ISSUE_SEVERITIES = ['error', 'warning', 'note'] as const;
export type InputIssueSeverity = typeof INPUT_ISSUE_SEVERITIES[number];

export const INPUT_CHECK_NAMES = ['value_types', 'decision_tables', 'weather_coverage', 'plant_starts'] as const;
export type InputCheckName = typeof INPUT_CHECK_NAMES[number];

/** `not_applicable`: the dataset has nothing to check; `skipped` and `partial` rule out a pass. */
export const INPUT_CHECK_STATES = ['ran', 'partial', 'not_applicable', 'skipped'] as const;
export type InputCheckState = typeof INPUT_CHECK_STATES[number];

export const INPUT_PREFLIGHT_ERROR_CODES = [
    'no_dataset',
    'dataset_file_missing',
    'read_failed',
    'no_expectations',
] as const;
export type InputPreflightErrorCode = typeof INPUT_PREFLIGHT_ERROR_CODES[number];

export type InputFieldType = 'real' | 'integer' | 'character' | 'logical' | 'unknown';

/** One value of a record: what the read stores it in, and as what. */
export interface InputField {
    name: string;
    path: string | null;
    vartype: string | null;
    type: InputFieldType;
    /** Declared length of a character field: longer values are cut to it. */
    length: number | null;
}

/** What SWAT+ reads from one input file, for walking the values on its lines. */
export interface InputReadLayout {
    file: string;
    /** The statement that reads each record: `exco_db_read.f90:56`. */
    readAt: string;
    /** The values SWAT+ reads, in order, up to any run-time-sized group. */
    columns: string[];
    /** Each of `columns` as a field; `unknown` where the accepted reads disagree on its type. */
    fields: InputField[];
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

/** Where a variable SWAT+ compares against is read from. */
export interface InputColumnRef {
    file: string;
    index: number;
    /** False for a variable read from a line of another kind: its values are not one per row. */
    perRow: boolean;
}

export interface InputExpectations extends InputExpectationSource {
    /** Keyed by lower-case file name. */
    layouts: Map<string, InputReadLayout>;
    /** Keyed by lower-case Fortran path (`tilldb%tillnm`). */
    paths: Map<string, InputColumnRef>;
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
    /** Data lines whose read stops at a value it cannot take. They are not short: the next read starts on the next line. */
    bad_value_rows: number;
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

/** Something SWAT+ will do without saying so. Rows that fail the same way are one issue. */
export interface InputIssue {
    kind: InputIssueKind;
    severity: InputIssueSeverity;
    file: string;
    line: number | null;
    message: string;
    // Values a read stops at.
    rows?: number;
    lines?: number[];
    column?: number;
    field?: string;
    path?: string | null;
    vartype?: string | null;
    header?: string | null;
    value?: string;
    lost_columns?: string[];
    read_at?: string;
    // lum.dtl actions.
    action?: string;
    option?: string;
    database?: string;
    tables?: string[];
    tables_in_use?: string[];
    // Weather against time.sim.
    variable?: string;
    stations?: number;
    files?: number;
    files_ending_early?: number;
    last_record?: { year: number; day: number };
    sim_end?: { year: number; day: number };
    days_short?: number;
    missing_days?: number;
    total_days?: number;
    missing_share?: number;
    flagged_days?: number;
    days_before_records?: number;
    days_after_records?: number;
    gap_days?: number;
    // Crops nothing plants.
    crop?: string;
    community?: string;
    land_uses?: string[];
    schedules?: string[];
    hrus?: number;
}

/** One of the checks beyond counting values: whether it ran, and why not. */
export interface InputCheckRun {
    name: InputCheckName;
    state: InputCheckState;
    reason: string | null;
}

export interface InputPreflightCoverage {
    /**
     * True only when every named file was checked, every one of its data
     * lines judged, every check that applies ran, and the layouts are the
     * source's.
     */
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
     * `pass` only with complete coverage, no short row and no `error` issue;
     * `fail` whenever a short row or an `error` issue is found, coverage or
     * not; `inconclusive` otherwise. `error` means the check could not run at
     * all.
     */
    status: 'pass' | 'fail' | 'inconclusive' | 'error';
    summary: string;
    error: { code: InputPreflightErrorCode; message: string } | null;
    dataset: { dir: string | null; file_cio: CioFileIdentity | null };
    expectations: (InputExpectationSource & { path: string | null; sha256: string | null }) | null;
    /** The source tree the decision tables were judged against, with the bytes read. */
    source: {
        dir: string;
        commit: string | null;
        dtbl_lum_read: CioFileIdentity | null;
        actions: CioFileIdentity | null;
    } | null;
    coverage: InputPreflightCoverage;
    checks: InputCheckRun[];
    files: InputFileVerdict[];
    findings: InputFinding[];
    issues: InputIssue[];
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

/** A Fortran declaration as a field: `character(len=16)` is a character field of length 16. */
export function fieldOf(name: string, path: string | null, vartype: string | null): InputField {
    const declared = (vartype ?? '').trim().toLowerCase();
    const length = /^character\s*\(\s*(?:len\s*=\s*)?(\d+)\s*\)/.exec(declared);
    let type: InputFieldType = 'unknown';
    if (declared.startsWith('real') || declared.startsWith('double')) {
        type = 'real';
    } else if (declared.startsWith('integer')) {
        type = 'integer';
    } else if (declared.startsWith('character')) {
        type = 'character';
    } else if (declared.startsWith('logical')) {
        type = 'logical';
    }
    return { name, path, vartype, type, length: length ? Number(length[1]) : null };
}

function readLayout(
    file: string,
    readAt: string,
    columns: string[],
    fields: InputField[],
    widths: number[],
    skippedLines: number,
    rows: InputReadLayout['rows'],
): InputReadLayout {
    const accepted = widths.length > 0 ? widths : [columns.length];
    return {
        file,
        readAt,
        columns,
        fields,
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
    const paths = new Map<string, InputColumnRef>();
    for (const table of Object.values(tables)) {
        const layout = table?.swat_layout;
        if (table?.origin !== 'tamandua' || !layout) {
            continue;
        }
        const file = String(table.file_name);
        const columns: string[] = [];
        const fields: InputField[] = [];
        for (const column of table.columns ?? []) {
            if (column.read_by_swat === false || column.swat?.repeat) {
                break;
            }
            columns.push(String(column.name));
            const path = column.swat?.path ? String(column.swat.path) : null;
            fields.push(fieldOf(String(column.swat?.name ?? column.name), path, column.swat?.vartype ?? null));
            if (path && !paths.has(path.toLowerCase())) {
                paths.set(path.toLowerCase(), { file, index: columns.length - 1, perRow: true });
            }
        }
        const widths = Array.isArray(layout.record_widths) ? [...layout.record_widths].map(Number) : [];
        const rows = layout.rows === 'single' || layout.rows === 'sections' ? layout.rows : 'records';
        layouts.set(file.toLowerCase(), readLayout(
            file, String(layout.read_at ?? ''), columns, fields, widths, Number(table.data_starts_after ?? 0), rows,
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
        paths,
    };
}

/**
 * Layouts from Tamandua's `swatplus-layouts` (layout format 2), built from the
 * SWAT+ checkout that will read the dataset. Only complete layouts of SWAT+'s
 * own file names are used, as when the shipped schema is generated.
 */
export function expectationsFromLayouts(layoutsJson: any): InputExpectations {
    const layouts = new Map<string, InputReadLayout>();
    const paths = new Map<string, InputColumnRef>();
    for (const entry of Object.values<any>(layoutsJson?.files ?? {})) {
        const records: any[] = Array.isArray(entry?.records) ? entry.records : [];
        const main = records.find(record => record?.role === 'main');
        if (!entry?.filename_is_default || !main || !main.complete) {
            continue;
        }
        const accepted = records.filter(record => record?.role === 'main' || record?.role === 'alternative');
        const columns: string[] = [];
        const fields: InputField[] = [];
        for (const column of main.columns ?? []) {
            if (column?.repeat) {
                break;
            }
            const index = columns.length;
            columns.push(String(column.name));
            const field = fieldOf(String(column.name), column.path ? String(column.path) : null, column.vartype ?? null);
            // A value either accepted read can take is no error, so the type counts only if they agree.
            const types = new Set(accepted
                .map(record => (record.columns ?? [])[index])
                .filter(Boolean)
                .map((other: any) => fieldOf('', null, other.vartype ?? null).type));
            fields.push(types.size === 1 ? field : { ...field, type: 'unknown' });
        }
        for (const record of records) {
            (record.columns ?? []).forEach((column: any, index: number) => {
                const key = column?.path ? String(column.path).toLowerCase() : '';
                if (key && !paths.has(key)) {
                    paths.set(key, { file: String(entry.file), index, perRow: accepted.includes(record) });
                }
            });
        }
        const widths = [...new Set(accepted
            .filter(record => !(record.columns ?? []).some((column: any) => column?.repeat))
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
            file, String(main.at ?? ''), columns, fields, widths, Number(entry.data_starts_after ?? 0), rows,
        ));
    }
    const provenance = layoutsJson?.provenance ?? {};
    return {
        origin: 'layouts',
        swatplus: { commit: provenance.source_commit ?? null, describe: provenance.source_describe ?? null },
        layouts,
        paths,
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
// A comma or repeat count changes which field later values belong to; a slash ends the read.
const REMAPPED = /,|^\d+\*/;
// Forms ifx and gfortran both read as a real; 1.5+2 is 1.5e2. Everything else stops the read.
const REAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eEdDqQ][+-]?\d+|[+-]\d+)?$/;
const REAL_WORD = /^[+-]?(?:nan|inf|infinity)$/i;
const INTEGER = /^[+-]?\d+$/;

/** Rows of one file that fail at the same field: one thing to fix, however many rows. */
export interface StoppedRows {
    kind: 'bad_value' | 'slash_ends_read' | 'decimal_in_integer';
    /** Index into the layout's fields of the value that fails. */
    index: number;
    rows: number;
    lines: number[];
    value: string;
}

export interface FileJudgement {
    rowsChecked: number;
    shortRows: number;
    findings: InputFinding[];
    unjudged: InputUnjudgedRow[];
    /** Rows whose read stops early, and rows that read differently by compiler. */
    stopped: StoppedRows[];
    /** The file's own header line, for naming a column the way its author does. */
    header: string[];
}

function rejectsValue(token: string, field: InputField): 'bad_value' | 'decimal_in_integer' | null {
    if (field.type === 'real') {
        return REAL.test(token) || REAL_WORD.test(token) ? null : 'bad_value';
    }
    if (field.type === 'integer') {
        if (INTEGER.test(token)) {
            return null;
        }
        return REAL.test(token) ? 'decimal_in_integer' : 'bad_value';
    }
    return null;
}

/** Where the list-directed read of one line stops, and any integer field given a decimal. */
function walkValues(tokens: string[], fields: InputField[]) {
    let decimal: { index: number; value: string } | null = null;
    const count = Math.min(tokens.length, fields.length);
    for (let index = 0; index < count; index += 1) {
        const token = tokens[index];
        if (REMAPPED.test(token)) {
            break;
        }
        // The read takes what comes before a slash, then ends without an error.
        const slash = token.indexOf('/');
        const value = slash < 0 ? token : token.slice(0, slash);
        const rejected = value ? rejectsValue(value, fields[index]) : null;
        if (rejected === 'bad_value') {
            return { stop: { kind: rejected, index, value: token } as const, decimal };
        }
        if (rejected) {
            decimal ??= { index, value: token };
        }
        // In the last field only the rest of that value is lost, and SWAT+ reads no further anyway.
        if (slash >= 0 && (value === '' || index + 1 < fields.length)) {
            return { stop: { kind: 'slash_ends_read', index, value: token } as const, decimal };
        }
    }
    return { stop: null, decimal };
}

function tally(stopped: StoppedRows[], kind: StoppedRows['kind'], index: number, value: string, line: number): void {
    let group = stopped.find(item => item.kind === kind && item.index === index);
    if (!group) {
        group = { kind, index, rows: 0, lines: [], value };
        stopped.push(group);
    }
    group.rows += 1;
    if (group.lines.length < MAX_ISSUE_LINES) {
        group.lines.push(line);
    }
}

/**
 * Walk the values on every data line of one file against its layout. Blank
 * lines and `#` lines are skipped, as the editor's diagnostics skip them.
 *
 * A value that stops the read decides the line: the read never gets as far as
 * running out of values, so such a line is not short, however few it has.
 */
export function judgeFile(text: string, layout: InputReadLayout): FileJudgement {
    const lines = text.split(/\r?\n/);
    const header = layout.skippedLines > 0 ? (lines[layout.skippedLines - 1] ?? '').trim().split(/\s+/) : [];
    const judgement: FileJudgement = { rowsChecked: 0, shortRows: 0, findings: [], unjudged: [], stopped: [], header };
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
        const { stop, decimal } = walkValues(tokens, layout.fields);
        if (decimal) {
            tally(judgement.stopped, 'decimal_in_integer', decimal.index, decimal.value, index + 1);
        }
        if (stop) {
            judgement.rowsChecked += 1;
            tally(judgement.stopped, stop.kind, stop.index, stop.value, index + 1);
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
    /** The SWAT+ source that will run, when the caller named one. */
    source?: InputSourceFacts;
}

/** A dataset's settings that decide whether a field is used. */
interface DatasetSettings {
    /** A value in codes.bsn, by the variable it is read into. */
    code: (path: string) => string | null;
    named: (file: string) => boolean;
}

/** Fields SWAT+ uses only under one setting, so losing them is harmless without it. */
interface ConditionalFields {
    file: string;
    /** Tested against each lost field's Fortran path. */
    fields: RegExp;
    /** The setting as it stands here, as a label and value; `null`: unknown. */
    setting: (dataset: DatasetSettings) => string | null;
    matters: (setting: string) => boolean;
    when: string;
}

// plant_parm_read.f90 overwrites the residue fractions with constants unless cswat
// is 2, and reads pl_class only when nam1 is not 0. Only constituents.cs puts a
// pesticide in cs_db%pest_num, which is how a run reaches pestdb.
const CONDITIONAL_FIELDS: ConditionalFields[] = [
    {
        file: 'plants.plt', fields: /%res_part_fracs%/, when: 'carbon = 2',
        setting: ({ code }) => { const value = code('bsn_cc%cswat'); return value === null ? null : `carbon = ${value}`; },
        matters: setting => setting === 'carbon = 2',
    },
    {
        file: 'plants.plt', fields: /^pl_class$/, when: 'nam1 is not 0',
        setting: ({ code }) => { const value = code('bsn_cc%nam1'); return value === null ? null : `nam1 = ${value}`; },
        matters: setting => setting !== 'nam1 = 0',
    },
    {
        file: 'pesticide.pes', fields: /^pestdb%/, when: 'constituents.cs names pesticides',
        setting: ({ named }) => `constituents.cs is ${named('constituents.cs') ? '' : 'not '}named`,
        matters: setting => setting === 'constituents.cs is named',
    },
];

/** How much a read's lost fields matter here, and the words that say so. */
function lossEffect(file: string, lost: InputField[], dataset: DatasetSettings) {
    const entries = lost.map(field => CONDITIONAL_FIELDS.find(entry =>
        entry.file === file.toLowerCase() && entry.fields.test(field.path ?? field.name)));
    if (lost.length === 0 || entries.some(entry => !entry)) {
        return { severity: 'error' as InputIssueSeverity, text: '' };
    }
    let severity: InputIssueSeverity = 'note';
    const settings: string[] = [];
    for (const entry of new Set(entries as ConditionalFields[])) {
        const setting = entry.setting(dataset);
        if (setting === null) {
            severity = severity === 'error' ? severity : 'warning';
        } else if (entry.matters(setting)) {
            severity = 'error';
        }
        settings.push(`${entry.when} (here ${setting ?? 'unknown'})`);
    }
    return { severity, text: ` They matter only when ${settings.join(' or ')}.` };
}

function plural(count: number, one: string, many: string): string {
    return count === 1 ? one : many;
}

/** Rows that stop at one field, as one issue: the file, row, column, field and what is lost. */
function stoppedIssue(
    group: StoppedRows,
    layout: InputReadLayout,
    judged: FileJudgement,
    dataset: DatasetSettings,
): InputIssue {
    const field = layout.fields[group.index];
    const column = group.index + 1;
    const header = judged.header[group.index] ?? null;
    const first = group.lines[0];
    const who = group.rows === 1 ? `${layout.file} line ${first}` : `${group.rows} rows of ${layout.file} (first at line ${first})`;
    const at = `value ${column}${header ? ` (${header})` : ''}`;
    const shown = JSON.stringify(group.value);
    const example = group.rows === 1 ? shown : `such as ${shown}`;
    // A slash keeps the value before it.
    const keeps = group.kind === 'slash_ends_read' && !group.value.startsWith('/') ? 1 : 0;
    const lost = layout.fields.slice(group.index + keeps);
    const names = lost.map(item => item.name);
    const nameList = names.length > 6 ? `${names.slice(0, 6).join(', ')} and ${names.length - 6} more` : names.join(', ');
    const detail = {
        kind: group.kind,
        file: layout.file,
        line: first,
        rows: group.rows,
        lines: group.lines,
        column,
        field: field.name,
        path: field.path,
        vartype: field.vartype,
        header,
        value: group.value,
        lost_columns: names,
        read_at: layout.readAt,
    };
    if (group.kind === 'decimal_in_integer') {
        return {
            ...detail,
            severity: 'warning',
            message: `${who} ${plural(group.rows, 'has', 'have')} a decimal at ${at}: ${example} in the integer `
                + `${field.name} (${layout.readAt}). ifx reads on and keeps the whole part; gfortran stops the read `
                + `there, so ${nameList} keep their code defaults under gfortran only.`,
        };
    }
    const cause = group.kind === 'bad_value'
        ? `${example} cannot be read as the ${field.type} ${field.name}`
        : `the slash in ${example} ends the read`;
    const effect = lossEffect(layout.file, lost, dataset);
    return {
        ...detail,
        severity: effect.severity,
        message: `${who} ${plural(group.rows, 'stops', 'stop')} at ${at}: ${cause} (${layout.readAt}). `
            + (layout.rows === 'records' ? 'The rows stay in sync: the next read starts on the next line. ' : '')
            + `With no message, ${nameList} keep their code defaults.${effect.text}`,
    };
}

function sameCommit(left: string, right: string): boolean {
    const length = Math.min(left.length, right.length);
    return length >= 7 && left.slice(0, length).toLowerCase() === right.slice(0, length).toLowerCase();
}

/** The issue when the layouts are not those of the source that will run. */
function layoutsIssue(context: InputCheckContext): InputIssue | null {
    const running = context.source?.commit;
    const judged = context.expectations.swatplus.commit;
    if (!running || !judged || sameCommit(running, judged)) {
        return null;
    }
    return {
        kind: 'layouts_not_for_source',
        severity: 'warning',
        file: context.expectationFile.path ?? 'layouts',
        line: null,
        message: `The layouts are from ${versionLabel(context.expectations)}, not the source that will run `
            + `(${running.slice(0, 12)}): input files change shape between versions, so these verdicts may not hold. `
            + (context.source?.layoutsNote ? `${context.source.layoutsNote}. ` : '')
            + 'Pass layouts built from that source (swatplus-build, then swatplus-layouts).',
    };
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
    const issues: InputIssue[] = [];
    let unjudgedRows = 0;
    const cioFiles = namedFiles(cioText);

    const codes = cioFiles.find(item => item.file.toLowerCase() === 'codes.bsn');
    const codesFile = codes ? read(codes.file) : null;
    const dataset: DatasetSettings = {
        code: path => {
            const ref = context.expectations.paths.get(path);
            const layout = context.expectations.layouts.get('codes.bsn');
            if (!ref || !layout || codesFile?.kind !== 'text') {
                return null;
            }
            const row = codesFile.text.split(/\r?\n/).slice(layout.skippedLines).find(line => line.trim());
            return row?.trim().split(/\s+/)[ref.index] ?? null;
        },
        named: file => cioFiles.some(item => item.file.toLowerCase() === file),
    };

    for (const named of cioFiles) {
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
            bad_value_rows: 0,
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
        verdict.bad_value_rows = judgement.stopped
            .filter(group => group.kind !== 'decimal_in_integer')
            .reduce((sum, group) => sum + group.rows, 0);
        verdict.outcome = judgement.shortRows > 0 ? 'short' : verdict.bad_value_rows > 0 ? 'bad_value' : 'match';
        issues.push(...judgement.stopped.map(group => stoppedIssue(group, layout, judgement, dataset)));
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
    const cross = runCrossChecks(cioFiles, read, context);
    issues.push(...cross.issues);
    const checks: InputCheckRun[] = [{ name: 'value_types', state: 'ran', reason: null }, ...cross.checks];
    const mismatch = layoutsIssue(context);
    if (mismatch) {
        issues.push(mismatch);
    }
    const order = INPUT_ISSUE_SEVERITIES;
    issues.sort((left, right) => order.indexOf(left.severity) - order.indexOf(right.severity));
    const checked = files.filter(item => item.outcome !== 'unchecked');
    const unfinished = checks.some(item => item.state === 'skipped' || item.state === 'partial');
    const complete = checked.length === files.length && unjudgedRows === 0 && !unfinished && !mismatch;
    const short = files.filter(item => item.outcome === 'short');
    const failing = short.length > 0 || issues.some(item => item.severity === 'error');
    const status: InputPreflight['status'] = failing ? 'fail' : complete ? 'pass' : 'inconclusive';
    const source = context.source;
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
        source: source ? {
            dir: source.dir,
            commit: source.commit,
            dtbl_lum_read: source.dtblLumRead?.identity ?? null,
            actions: source.actions?.identity ?? null,
        } : null,
        coverage: {
            complete,
            named_files: files.length,
            checked_files: checked.length,
            unchecked_files: files.length - checked.length,
            unjudged_rows: unjudgedRows,
            unjudged,
        },
        checks,
        files,
        findings,
        issues: issues.slice(0, MAX_FINDINGS),
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
    const stopped = result.files.filter(item => item.bad_value_rows > 0);
    if (stopped.length) {
        parts.push(`${stopped.length} with values that stop the read: `
            + stopped.map(item => `${item.file} (${item.bad_value_rows})`).join(', '));
    }
    const count = (severity: InputIssueSeverity) => result.issues.filter(item => item.severity === severity).length;
    if (result.issues.length) {
        parts.push(`issues: ${count('error')} error(s), ${count('warning')} warning(s), ${count('note')} note(s)`);
    }
    const unrun = result.checks.filter(item => item.state === 'skipped' || item.state === 'partial');
    if (unrun.length) {
        parts.push(`not fully run: ${unrun.map(item => item.name).join(', ')}`);
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
        source: null,
        coverage: {
            complete: false,
            named_files: 0,
            checked_files: 0,
            unchecked_files: 0,
            unjudged_rows: 0,
            unjudged: [],
        },
        checks: [],
        files: [],
        findings: [],
        issues: [],
    };
}

/** The text form: the verdict, each short row and issue, and what was not checked. */
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
    for (const item of result.issues) {
        lines.push(`- ${item.severity}: ${item.message}`);
    }
    for (const item of result.checks) {
        if (item.state === 'skipped' || item.state === 'partial') {
            lines.push(`- ${item.name} ${item.state === 'skipped' ? 'did not run' : 'ran in part'}: ${item.reason}`);
        }
    }
    if (result.status !== 'pass') {
        lines.push('A pass needs every named file checked, every data line counted and every check that applies run; '
            + 'files with no read layout, and lines with quotes, commas or repeat counts, are not judged.');
    }
    return lines.join('\n');
}
