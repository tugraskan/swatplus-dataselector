/**
 * Checks a dataset's `file.cio` against what the code actually reads.
 *
 * The failure this catches, and why it is worth catching: `readcio_read`
 * reads each row of `file.cio` into a derived type with list-directed input,
 * and list-directed input *spans records* to satisfy its item list. A row one
 * value short therefore does not fail -- it silently consumes the first token
 * of the next line to fill the gap, and every row after that is read shifted
 * by one. The symptom surfaces far away and looks like something else: a
 * dataset predating `carbon.bsn` ended up with `in_con%hru_con` set to "null",
 * so `inquire` reported the HRU connect file missing, the loop bounds stayed
 * at their default 0, and the run died indexing `ob(0)` three subroutines
 * later with a subscript error naming an array nobody had touched.
 *
 * Nothing in that traceback points at `file.cio`. This does, before the model
 * runs at all.
 *
 * Expectations come from the Fortran source rather than from a reference
 * dataset, which is the whole point. A reference `file.cio` is only correct
 * for the version it was copied from, so on an older branch it would report
 * confident nonsense in both directions. `input_file_module.f90` is the truth
 * for whatever source tree is checked out: an older branch declares
 * `input_basin` with two fields, and a two-value row there is then correct and
 * passes. The check follows the code instead of a snapshot of it.
 *
 * `swatplus-facts.json` carries the same field lists and would serve equally
 * well, but it is a generated artefact that can lag the tree it describes.
 * The declaring source cannot.
 *
 * Pure text handling, so every rule below is testable without a dataset or a
 * source checkout.
 */

/** One field of a `file.cio` row's derived type. */
export interface CioField {
    name: string;
    /** The filename the code defaults to, when it declares one. */
    fallback?: string;
}

/** What the code expects one `file.cio` row to contain. */
export interface CioExpectation {
    /** The module variable read into, e.g. `in_basin`. */
    variable: string;
    /** Its derived type, e.g. `input_basin`. */
    typeName: string;
    fields: CioField[];
}

/**
 * The order `readcio_read` reads rows in.
 *
 * Anchored on `name, <variable>` because that is the shape of every row read:
 * the leading `name` takes the row label and the rest fills one derived type.
 * The title line is read as a bare `titldum` and so does not match, which is
 * what keeps it out of the row order.
 */
export function parseReadOrder(readcioSource: string): string[] {
    const pattern =
        /read\s*\(\s*107\s*,\s*\*\s*,\s*iostat\s*=\s*\w+\s*\)\s*name\s*,\s*(\w+)/gi;
    const order: string[] = [];
    for (const match of readcioSource.matchAll(pattern)) {
        // The read loop runs several passes over the same statements; the row
        // order is one pass of it, so a repeat is the loop coming round again
        // rather than another row.
        if (!order.includes(match[1])) {
            order.push(match[1]);
        }
    }
    return order;
}

/** Every `type ... end type` block in the module, with its fields. */
export function parseInputTypes(moduleSource: string): Map<string, CioField[]> {
    const types = new Map<string, CioField[]>();
    const blocks = moduleSource.matchAll(
        /^[ \t]*type\s+(\w+)\s*$([\s\S]*?)^[ \t]*end\s+type\b/gim
    );
    for (const block of blocks) {
        const fields: CioField[] = [];
        for (const line of block[2].split(/\r?\n/)) {
            // Only declarations count. A comment line inside the block, which
            // this module has plenty of, must not become a phantom field and
            // shift every count by one.
            const declaration =
                /^\s*character\s*\(\s*len\s*=\s*\d+\s*\)\s*::\s*(\w+)\s*(?:=\s*["']([^"']*)["'])?/i.exec(
                    line.replace(/!.*$/, '')
                );
            if (declaration) {
                fields.push({
                    name: declaration[1],
                    fallback: declaration[2] || undefined,
                });
            }
        }
        types.set(block[1], fields);
    }
    return types;
}

/** `type (input_basin) :: in_basin` -> `in_basin` is an `input_basin`. */
export function parseVariableTypes(moduleSource: string): Map<string, string> {
    const map = new Map<string, string>();
    for (const match of moduleSource.matchAll(
        /^[ \t]*type\s*\(\s*(\w+)\s*\)\s*::\s*(\w+)/gim
    )) {
        map.set(match[2], match[1]);
    }
    return map;
}

/**
 * Joins the three source facts into one expectation per row, in read order.
 *
 * A row whose type does not resolve is left out, so the rows after it line up
 * against the wrong expectations. That is fine for reading the findings, not
 * for a verdict: {@link preflightCio} keeps every position instead.
 */
export function buildExpectations(
    readcioSource: string,
    moduleSource: string
): CioExpectation[] {
    const order = parseReadOrder(readcioSource);
    const types = parseInputTypes(moduleSource);
    const variables = parseVariableTypes(moduleSource);

    const expectations: CioExpectation[] = [];
    for (const variable of order) {
        const typeName = variables.get(variable);
        const fields = typeName ? types.get(typeName) : undefined;
        if (!typeName || !fields || fields.length === 0) {
            // A row read into something this module does not declare is not
            // something to guess about; leaving it out means it is not checked
            // rather than checked wrongly.
            continue;
        }
        expectations.push({ variable, typeName, fields });
    }
    return expectations;
}

/** One row of `file.cio`, as written. */
export interface CioRow {
    label: string;
    values: string[];
    /** 1-based line in the file, for pointing someone at it. */
    line: number;
}

/**
 * Splits `file.cio` into labelled rows.
 *
 * The first line is a title (`file.cio: AMES`), not a row. Every row after it
 * is whitespace-separated: the first token names the section and the rest are
 * the filenames read into the derived type.
 */
export function parseCioRows(text: string): CioRow[] {
    const rows: CioRow[] = [];
    const lines = text.split(/\r?\n/);
    for (let index = 1; index < lines.length; index += 1) {
        const tokens = lines[index].trim().split(/\s+/).filter(Boolean);
        if (tokens.length === 0) {
            continue;
        }
        rows.push({
            label: tokens[0],
            values: tokens.slice(1),
            line: index + 1,
        });
    }
    return rows;
}

/**
 * How a row differs from what the code reads.
 *
 * The two are not the same kind of problem and must not be reported as
 * though they were. A short row corrupts every row after it. A long one is
 * ignored: list-directed input stops once its item list is satisfied and the
 * rest of the record is skipped. Treating both as errors would teach whoever
 * reads this to ignore the output, which is worse than not checking.
 */
export type CioSeverity = 'error' | 'note';

export interface CioFinding {
    severity: CioSeverity;
    row: string;
    line: number;
    expected: number;
    found: number;
    /** Fields the row does not reach, for a short row. */
    missing: CioField[];
    typeName: string;
}

export function checkCio(
    rows: readonly CioRow[],
    expectations: readonly CioExpectation[]
): CioFinding[] {
    const findings: CioFinding[] = [];
    const limit = Math.min(rows.length, expectations.length);
    for (let index = 0; index < limit; index += 1) {
        const row = rows[index];
        const expectation = expectations[index];
        const expected = expectation.fields.length;
        const found = row.values.length;
        if (found === expected) {
            continue;
        }
        findings.push({
            severity: found < expected ? 'error' : 'note',
            row: row.label,
            line: row.line,
            expected,
            found,
            missing: found < expected ? expectation.fields.slice(found) : [],
            typeName: expectation.typeName,
        });
    }
    return findings;
}

export interface CioCheckContext {
    datasetDir: string;
    /** Source tree the expectations were read from. */
    sourceDir: string;
}

const CLEAN_HEADLINE =
    'file.cio matches what the code reads; no row is short of values.';

function shortRowLines(errors: readonly CioFinding[]): string[] {
    const lines = [
        `${errors.length} row(s) in file.cio are short of values. This ` +
            'breaks the run, and not where it looks: list-directed input ' +
            'spans records to fill its item list, so a short row consumes ' +
            'the start of the next line and every row after it is read ' +
            'shifted by one. The failure surfaces later, usually as a ' +
            'subscript error in a routine that has nothing to do with it.',
        '',
    ];
    for (const finding of errors) {
        lines.push(
            `  line ${finding.line}: ${finding.row} expects ` +
                `${finding.expected} value(s), found ${finding.found}`
        );
        for (const field of finding.missing) {
            lines.push(
                `      missing: ${field.name}` +
                    (field.fallback ? ` (the code's default is "${field.fallback}")` : '')
            );
        }
    }
    lines.push('');
    lines.push(
        'Add the missing value to that row -- "null" where the dataset ' +
            'genuinely has no such file, or the filename otherwise, with ' +
            'the file itself present alongside.'
    );
    return lines;
}

function surplusLines(notes: readonly CioFinding[]): string[] {
    const lines = [
        `${notes.length} row(s) carry more values than the code reads. ` +
            'This is harmless: list-directed input stops once its list is ' +
            'satisfied and ignores the rest of the record. It usually ' +
            'means the dataset is newer than this source tree.',
    ];
    for (const finding of notes) {
        lines.push(
            `  line ${finding.line}: ${finding.row} reads ` +
                `${finding.expected}, has ${finding.found}`
        );
    }
    return lines;
}

/** Renders the check, leading with anything that will actually break a run. */
export function describeCioCheck(
    findings: readonly CioFinding[],
    context: CioCheckContext
): string {
    const errors = findings.filter((finding) => finding.severity === 'error');
    const notes = findings.filter((finding) => finding.severity === 'note');
    const lines = errors.length === 0 ? [CLEAN_HEADLINE] : shortRowLines(errors);
    if (notes.length > 0) {
        lines.push('', ...surplusLines(notes));
    }
    lines.push('');
    lines.push(`dataset: ${context.datasetDir}`);
    lines.push(`expectations read from: ${context.sourceDir}`);
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// The structured preflight
//
// Everything above answers "which rows are short?" for someone reading the
// result. A run gate needs more: it must tell "nothing is wrong" from "not
// everything could be checked". So the result below gives every read a fixed
// position, says which positions it could judge, and never infers a pass from
// an empty list of findings.
// ---------------------------------------------------------------------------

/** Changes whenever a field of {@link CioPreflight} changes meaning. */
export const CIO_PREFLIGHT_VERSION = 'dataselector-cio-preflight/1';

/**
 * How one read of unit 107 takes lines from `file.cio`.
 *
 * - `list_directed`: `read (107,*,...) name, <variable>`. One row whose
 *   values fill a derived type; a short row spans into the next line.
 * - `whole_record`: `read (107,'(A)',...) <buffer>`. Exactly one line, taken
 *   as text, so it can be neither short nor shift anything.
 * - `unrecognized`: any other form. How many lines it takes is unknown, so
 *   nothing after it can be placed.
 */
export type CioReadKind = 'list_directed' | 'whole_record' | 'unrecognized';

/** Why part of the check could not be done. Each one makes coverage incomplete. */
export const CIO_GAP_REASONS = [
    // The shape of readcio_read.f90.
    'no_title_read',
    'no_row_reads',
    'unrecognized_read',
    'whole_record_not_trailing',
    // A list-directed row whose value count input_file_module.f90 does not give.
    'undeclared_variable',
    'undeclared_type',
    'unsupported_declaration',
    'no_fields',
    // file.cio content this check does not count.
    'blank_first_line',
    'uncounted_syntax',
] as const;
export type CioGapReason = typeof CIO_GAP_REASONS[number];

export const CIO_FINDING_KINDS = [
    'empty_file',
    'no_rows',
    'short_row',
    'missing_section',
    'surplus_values',
    'extra_row',
] as const;
export type CioFindingKind = typeof CIO_FINDING_KINDS[number];

export const CIO_SECTION_OUTCOMES = [
    // Judged.
    'match',
    'short',
    'surplus',
    'missing',
    // Not judged, and each says why.
    'unresolved',
    'uncounted',
    'unjudged',
    'unrecognized',
    'not_checked',
] as const;
export type CioSectionOutcome = typeof CIO_SECTION_OUTCOMES[number];

export const CIO_PREFLIGHT_ERROR_CODES = [
    'no_dataset',
    'no_source',
    'dataset_file_missing',
    'source_file_missing',
    'read_failed',
] as const;
export type CioPreflightErrorCode = typeof CIO_PREFLIGHT_ERROR_CODES[number];

/** One read of a `file.cio` line, in the order the code makes it. */
export interface CioRead {
    /** 1-based position among the lines after the title. */
    position: number;
    kind: CioReadKind;
    /** What is read into: `in_basin`, or a whole-record read's buffer. */
    variable: string;
    /** 1-based line of the statement in `readcio_read.f90`. */
    sourceLine: number;
    /** A list-directed read whose type resolved. */
    expectation?: CioExpectation;
    /** A list-directed read whose value count could not be read. */
    unresolved?: { reason: CioGapReason; detail: string };
    /** A read this check does not model. */
    unsupported?: { reason: CioGapReason; detail: string };
}

export interface CioLayout {
    /** Line of the title read in `readcio_read.f90`, when one was recognised. */
    titleLine?: number;
    reads: CioRead[];
}

/** A type block, with anything in it that is not a plain field declaration. */
export interface CioTypeShape {
    fields: CioField[];
    /** Lines other than `character(len=N) :: name [= "default"]`. */
    unsupported: string[];
}

/** A Fortran line without its trailing `!` comment; a `!` in a string stays. */
function stripFortranComment(line: string): string {
    let quote = '';
    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (quote) {
            if (char === quote) {
                quote = '';
            }
        } else if (char === '"' || char === "'") {
            quote = char;
        } else if (char === '!') {
            return line.slice(0, index);
        }
    }
    return line;
}

/**
 * Every type block, with its fields and anything that is not one.
 *
 * {@link parseInputTypes} reads the fields; this also keeps the lines it would
 * skip. A declaration of another kind (an integer, two names on one line, a
 * `character*25`) changes the value count, so a type that has one is
 * reported unresolved rather than counted short.
 */
export function parseInputTypeShapes(moduleSource: string): Map<string, CioTypeShape> {
    const shapes = new Map<string, CioTypeShape>();
    const blocks = moduleSource.matchAll(
        /^[ \t]*type\s+(\w+)\s*(?:!.*)?$([\s\S]*?)^[ \t]*end\s+type\b/gim
    );
    for (const block of blocks) {
        const shape: CioTypeShape = { fields: [], unsupported: [] };
        for (const line of block[2].split(/\r?\n/)) {
            const code = stripFortranComment(line).trim();
            if (!code) {
                continue;
            }
            const declaration =
                /^character\s*\(\s*len\s*=\s*\d+\s*\)\s*::\s*(\w+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'))?$/i.exec(
                    code
                );
            if (declaration) {
                shape.fields.push({
                    name: declaration[1],
                    fallback: (declaration[2] ?? declaration[3]) || undefined,
                });
            } else {
                shape.unsupported.push(code);
            }
        }
        shapes.set(block[1], shape);
    }
    return shapes;
}

interface ReadStatement {
    line: number;
    /** The control list without spaces, lower-cased: `107,*,iostat=eof`. */
    control: string;
    /** What is read into, as written. */
    items: string;
    /** Whether `read` starts the statement rather than following an `if (...)`. */
    leading: boolean;
}

/** Index of the parenthesis closing the one opened before `from`, or -1. */
function closingParenthesis(code: string, from: number): number {
    let depth = 1;
    let quote = '';
    for (let index = from; index < code.length; index += 1) {
        const char = code[index];
        if (quote) {
            if (char === quote) {
                quote = '';
            }
        } else if (char === '"' || char === "'") {
            quote = char;
        } else if (char === '(') {
            depth += 1;
        } else if (char === ')') {
            depth -= 1;
            if (depth === 0) {
                return index;
            }
        }
    }
    return -1;
}

/** Every `read` of unit 107, in source order, comments excluded. */
function unit107Reads(readcioSource: string): ReadStatement[] {
    const statements: ReadStatement[] = [];
    readcioSource.split(/\r?\n/).forEach((raw, index) => {
        const code = stripFortranComment(raw);
        for (const match of code.matchAll(/\bread\s*\(/gi)) {
            const start = match.index ?? 0;
            const open = start + match[0].length;
            const close = closingParenthesis(code, open);
            // An unclosed control list continues on the next line; keeping it
            // with an unusable item list makes it unrecognised, not unseen.
            const control = code
                .slice(open, close < 0 ? undefined : close)
                .replace(/\s+/g, '')
                .toLowerCase();
            if (!/^(?:unit=)?107(?:,|$)/.test(control)) {
                continue;
            }
            statements.push({
                line: index + 1,
                control,
                items: close < 0 ? '&' : code.slice(close + 1).trim(),
                leading: code.slice(0, start).trim() === '',
            });
        }
    });
    return statements;
}

const LIST_DIRECTED_CONTROL = /^107,\*(?:,iostat=\w+)?$/;
const WHOLE_RECORD_CONTROL = /^107,(?:fmt=)?(['"])\(a\)\1(?:,iostat=\w+)?$/;

function resolveRow(
    position: number,
    variable: string,
    sourceLine: number,
    variables: Map<string, string>,
    shapes: Map<string, CioTypeShape>
): CioRead {
    const read: CioRead = { position, kind: 'list_directed', variable, sourceLine };
    const typeName = variables.get(variable);
    const shape = typeName ? shapes.get(typeName) : undefined;
    if (!typeName) {
        read.unresolved = {
            reason: 'undeclared_variable',
            detail: `${variable} is not declared as a derived type in input_file_module.f90`,
        };
    } else if (!shape) {
        read.unresolved = {
            reason: 'undeclared_type',
            detail: `${variable} is a ${typeName}, and no plain \`type ${typeName}\` block declares it`,
        };
    } else if (shape.unsupported.length > 0) {
        read.unresolved = {
            reason: 'unsupported_declaration',
            detail: `type ${typeName} has a line this check does not count: "${shape.unsupported[0]}"`,
        };
    } else if (shape.fields.length === 0) {
        read.unresolved = {
            reason: 'no_fields',
            detail: `type ${typeName} declares no character fields`,
        };
    } else {
        read.expectation = { variable, typeName, fields: shape.fields };
    }
    return read;
}

/**
 * Every read of `file.cio`, each at a fixed position.
 *
 * Unlike {@link buildExpectations}, nothing is dropped: a row whose type does
 * not resolve keeps its place, unresolved, so the rows after it are still
 * compared with what the code reads into them.
 */
export function buildCioLayout(readcioSource: string, moduleSource: string): CioLayout {
    const shapes = parseInputTypeShapes(moduleSource);
    const variables = parseVariableTypes(moduleSource);
    const layout: CioLayout = { reads: [] };
    const seen = new Set<string>();

    for (const statement of unit107Reads(readcioSource)) {
        const key = `${statement.control}|${statement.items.replace(/\s+/g, '').toLowerCase()}`;
        const first = seen.size === 0;
        if (seen.has(key)) {
            // The read loop coming round again, as in parseReadOrder.
            continue;
        }
        seen.add(key);

        const single = /^(\w+)$/.exec(statement.items);
        if (first && statement.leading && statement.control === '107,*' && single) {
            layout.titleLine = statement.line;
            continue;
        }
        const position = layout.reads.length + 1;
        const row = /^name\s*,\s*(\w+)$/i.exec(statement.items);
        if (statement.leading && LIST_DIRECTED_CONTROL.test(statement.control) && row) {
            layout.reads.push(resolveRow(position, row[1], statement.line, variables, shapes));
        } else if (statement.leading && WHOLE_RECORD_CONTROL.test(statement.control) && single) {
            layout.reads.push({
                position,
                kind: 'whole_record',
                variable: single[1],
                sourceLine: statement.line,
            });
        } else {
            layout.reads.push({
                position,
                kind: 'unrecognized',
                variable: statement.items,
                sourceLine: statement.line,
                unsupported: {
                    reason: 'unrecognized_read',
                    detail: `read (${statement.control}) ${statement.items}` +
                        (statement.leading ? '' : ' (inside another statement)'),
                },
            });
        }
    }

    // A whole-record read takes the next line even when it is blank, where a
    // list-directed read skips blank lines. Before a list-directed read that
    // difference could move every row after it, so only a trailing one is
    // placed.
    const lastRow = Math.max(
        0,
        ...layout.reads.filter((read) => read.kind === 'list_directed').map((read) => read.position)
    );
    for (const read of layout.reads) {
        if (read.kind === 'whole_record' && read.position < lastRow) {
            read.kind = 'unrecognized';
            read.unsupported = {
                reason: 'whole_record_not_trailing',
                detail: `${read.variable} is read whole before later rows, which this check does not place`,
            };
        }
    }
    return layout;
}

export interface CioFileIdentity {
    /** Absolute path as read. */
    path: string;
    sha256: string;
    bytes: number;
}

export interface CioPreflightIdentity {
    dataset: { dir: string | null; file_cio: CioFileIdentity | null };
    source: {
        dir: string | null;
        readcio_read: CioFileIdentity | null;
        input_file_module: CioFileIdentity | null;
    };
}

/** Part of the check that could not be done. */
export interface CioCoverageGap {
    /** `source` gaps are in readcio_read.f90 or input_file_module.f90; `dataset` ones in file.cio. */
    where: 'source' | 'dataset';
    reason: CioGapReason;
    position: number | null;
    variable: string | null;
    /** 1-based line: in readcio_read.f90 for `source`, in file.cio for `dataset`. */
    line: number | null;
    detail: string;
}

/** A whole-record read: its position counts, its content is not judged. */
export interface CioUnjudgedRead {
    position: number;
    variable: string;
    source_line: number;
    /** The file.cio line it takes, or null when the file has ended. */
    line: number | null;
}

export interface CioPreflightCoverage {
    /** True only when every list-directed row could be judged. */
    complete: boolean;
    /** Rows the code reads list-directed: the ones this check judges. */
    expected_sections: number;
    /** Of those, rows whose value count the source gives. */
    resolved_sections: number;
    /** Of those, rows compared with file.cio (matching, short, surplus or missing). */
    checked_sections: number;
    /** Non-blank lines after the title in file.cio. */
    observed_sections: number;
    unresolved: CioCoverageGap[];
    unsupported: CioCoverageGap[];
    unjudged: CioUnjudgedRead[];
}

export interface CioPreflightSection {
    position: number;
    variable: string;
    read_kind: CioReadKind;
    source_line: number;
    type_name: string | null;
    expected: number | null;
    /** The row's first token. Diagnostic only: the code reads it and discards it. */
    label: string | null;
    line: number | null;
    found: number | null;
    outcome: CioSectionOutcome;
}

export interface CioPreflightFinding {
    kind: CioFindingKind;
    severity: CioSeverity;
    position: number | null;
    line: number | null;
    label: string | null;
    variable: string | null;
    type_name: string | null;
    expected: number | null;
    found: number | null;
    missing_fields: { name: string; fallback: string | null }[];
    /**
     * True when an earlier row could not be counted, so this position assumes
     * that row took exactly one line. A failure still stands -- either this
     * row or that one is short -- but its location may be the earlier one.
     */
    position_assumed: boolean;
    message: string;
}

/** The structured result of `check_dataset`. */
export interface CioPreflight extends CioPreflightIdentity {
    check_version: typeof CIO_PREFLIGHT_VERSION;
    /**
     * `pass` only with complete coverage and no error; `fail` whenever an
     * error is established, coverage or not; `inconclusive` otherwise.
     * `error` means the check could not run at all.
     */
    status: 'pass' | 'fail' | 'inconclusive' | 'error';
    summary: string;
    error: { code: CioPreflightErrorCode; message: string } | null;
    coverage: CioPreflightCoverage;
    sections: CioPreflightSection[];
    findings: CioPreflightFinding[];
}

const NO_IDENTITY: CioPreflightIdentity = {
    dataset: { dir: null, file_cio: null },
    source: { dir: null, readcio_read: null, input_file_module: null },
};

/** Characters that make list-directed input count values differently from whitespace. */
const UNCOUNTED_SYNTAX = /[,\/'"]|^\d+\*/;

function finding(
    kind: CioFindingKind,
    severity: CioSeverity,
    message: string,
    details: Partial<Omit<CioPreflightFinding, 'kind' | 'severity' | 'message'>> = {}
): CioPreflightFinding {
    return {
        kind,
        severity,
        position: null,
        line: null,
        label: null,
        variable: null,
        type_name: null,
        expected: null,
        found: null,
        missing_fields: [],
        position_assumed: false,
        ...details,
        message,
    };
}

function gap(
    where: CioCoverageGap['where'],
    reason: CioGapReason,
    detail: string,
    at: Partial<Pick<CioCoverageGap, 'position' | 'variable' | 'line'>> = {}
): CioCoverageGap {
    return { where, reason, position: null, variable: null, line: null, ...at, detail };
}

/**
 * Judges `file.cio` against every read the code makes, position by position.
 *
 * A row is judged only where its position is known. An unresolved or
 * uncountable row keeps its place and the rows after it are still judged,
 * flagged `position_assumed`; an unrecognised read stops placement entirely.
 */
export function preflightCio(
    cioText: string,
    readcioSource: string,
    moduleSource: string,
    identity: CioPreflightIdentity = NO_IDENTITY
): CioPreflight {
    const layout = buildCioLayout(readcioSource, moduleSource);
    const rows = parseCioRows(cioText);
    const records = cioText.split(/\r?\n/);
    if (records.length > 0 && records[records.length - 1] === '') {
        records.pop();
    }
    const rowReads = layout.reads.filter((read) => read.kind === 'list_directed');
    const unresolved: CioCoverageGap[] = [];
    const unsupported: CioCoverageGap[] = [];
    const unjudged: CioUnjudgedRead[] = [];
    const sections: CioPreflightSection[] = [];
    const findings: CioPreflightFinding[] = [];

    if (layout.titleLine === undefined) {
        unsupported.push(gap('source', 'no_title_read',
            'readcio_read.f90 reads no title line before its rows, so line 1 of file.cio cannot be placed'));
    }
    if (rowReads.length === 0) {
        unsupported.push(gap('source', 'no_row_reads',
            'readcio_read.f90 reads no row as `name, <derived type>`'));
    }
    for (const read of layout.reads) {
        if (read.unresolved) {
            unresolved.push(gap('source', read.unresolved.reason, read.unresolved.detail,
                { position: read.position, variable: read.variable, line: read.sourceLine }));
        }
        if (read.unsupported) {
            unsupported.push(gap('source', read.unsupported.reason, read.unsupported.detail,
                { position: read.position, variable: read.variable, line: read.sourceLine }));
        }
    }

    const empty = cioText.trim() === '';
    const readsAnything = layout.titleLine !== undefined || layout.reads.length > 0;
    if (empty && readsAnything) {
        findings.push(finding('empty_file', 'error', 'file.cio is empty'));
    } else if (!empty && rows.length === 0 && rowReads.length > 0) {
        findings.push(finding('no_rows', 'error', 'file.cio has a title line and no rows', { line: 1 }));
    }
    const bodyMissing = findings.length > 0;
    if (!empty && records[0].trim() === '') {
        unsupported.push(gap('dataset', 'blank_first_line',
            'line 1 of file.cio is blank, so where the title read ends is not certain', { line: 1 }));
    }

    let placed = layout.titleLine !== undefined && (empty || records[0].trim() !== '');
    let assumed = false;
    let rowIndex = 0;
    let lastLine = 1;
    for (const read of layout.reads) {
        const expectation = read.expectation;
        const section: CioPreflightSection = {
            position: read.position,
            variable: read.variable,
            read_kind: read.kind,
            source_line: read.sourceLine,
            type_name: expectation?.typeName ?? null,
            expected: expectation?.fields.length ?? null,
            label: null,
            line: null,
            found: null,
            outcome: 'not_checked',
        };
        sections.push(section);
        if (!placed) {
            continue;
        }
        if (read.kind === 'unrecognized') {
            section.outcome = 'unrecognized';
            placed = false;
            continue;
        }
        if (read.kind === 'whole_record') {
            const line = lastLine + 1 <= records.length ? lastLine + 1 : null;
            if (line !== null) {
                lastLine = line;
                section.line = line;
                section.label = records[line - 1].trim().split(/\s+/)[0] || null;
            }
            section.outcome = 'unjudged';
            unjudged.push({ position: read.position, variable: read.variable, source_line: read.sourceLine, line });
            continue;
        }

        const row = rows[rowIndex];
        if (!row) {
            section.outcome = 'missing';
            if (!bodyMissing) {
                findings.push(finding('missing_section', 'error',
                    `file.cio ends before the row the code reads into ${read.variable}`, {
                        position: read.position,
                        variable: read.variable,
                        type_name: section.type_name,
                        expected: section.expected,
                        missing_fields: (expectation?.fields ?? []).map((field) => ({
                            name: field.name,
                            fallback: field.fallback ?? null,
                        })),
                        position_assumed: assumed,
                    }));
            }
            continue;
        }
        rowIndex += 1;
        lastLine = row.line;
        section.label = row.label;
        section.line = row.line;
        section.found = row.values.length;

        if ([row.label, ...row.values].some((token) => UNCOUNTED_SYNTAX.test(token))) {
            section.outcome = 'uncounted';
            unsupported.push(gap('dataset', 'uncounted_syntax',
                `line ${row.line} uses list-directed syntax (a comma, slash, quote or repeat count) ` +
                    'that this check does not count', { position: read.position, variable: read.variable, line: row.line }));
            assumed = true;
            continue;
        }
        if (!expectation) {
            section.outcome = 'unresolved';
            assumed = true;
            continue;
        }

        const expected = expectation.fields.length;
        const found = row.values.length;
        const details = {
            position: read.position,
            line: row.line,
            label: row.label,
            variable: read.variable,
            type_name: expectation.typeName,
            expected,
            found,
            position_assumed: assumed,
        };
        if (found === expected) {
            section.outcome = 'match';
        } else if (found < expected) {
            section.outcome = 'short';
            findings.push(finding('short_row', 'error',
                `line ${row.line}: ${row.label} expects ${expected} value(s), found ${found}`, {
                    ...details,
                    missing_fields: expectation.fields.slice(found).map((field) => ({
                        name: field.name,
                        fallback: field.fallback ?? null,
                    })),
                }));
        } else {
            section.outcome = 'surplus';
            findings.push(finding('surplus_values', 'note',
                `line ${row.line}: ${row.label} reads ${expected}, has ${found}`, details));
        }
    }

    if (placed && rowReads.length > 0) {
        for (const row of rows.filter((candidate) => candidate.line > lastLine)) {
            findings.push(finding('extra_row', 'note',
                `line ${row.line}: ${row.label} comes after everything the code reads`,
                { line: row.line, label: row.label, found: row.values.length }));
        }
    }

    const counted = sections.filter((section) => section.read_kind === 'list_directed');
    const coverage: CioPreflightCoverage = {
        complete: unresolved.length === 0 && unsupported.length === 0 && rowReads.length > 0,
        expected_sections: rowReads.length,
        resolved_sections: rowReads.filter((read) => read.expectation).length,
        checked_sections: counted.filter((section) =>
            ['match', 'short', 'surplus', 'missing'].includes(section.outcome)).length,
        observed_sections: rows.length,
        unresolved,
        unsupported,
        unjudged,
    };
    const errors = findings.filter((item) => item.severity === 'error');
    const status = errors.length > 0 ? 'fail' : coverage.complete ? 'pass' : 'inconclusive';
    return {
        check_version: CIO_PREFLIGHT_VERSION,
        status,
        summary: summarize(status, coverage, errors),
        error: null,
        ...identity,
        coverage,
        sections,
        findings,
    };
}

function summarize(
    status: CioPreflight['status'],
    coverage: CioPreflightCoverage,
    errors: readonly CioPreflightFinding[]
): string {
    const of = `${coverage.checked_sections} of ${coverage.expected_sections} section(s) checked`;
    if (status === 'pass') {
        return `pass: ${of}; every row has the values the code reads.`;
    }
    if (status === 'fail') {
        const counts = new Map<string, number>();
        for (const error of errors) {
            counts.set(error.kind, (counts.get(error.kind) ?? 0) + 1);
        }
        const parts = [...counts].map(([kind, count]) => `${count} ${kind.replace(/_/g, ' ')}`);
        return `fail: ${parts.join(', ')}; ${of}.`;
    }
    const gaps = coverage.unresolved.length + coverage.unsupported.length;
    return `inconclusive: ${gaps} coverage gap(s); ${of}, none short.`;
}

/** A result for a check that could not run, in the same shape as one that did. */
export function cioPreflightError(
    code: CioPreflightErrorCode,
    message: string,
    identity: CioPreflightIdentity = NO_IDENTITY
): CioPreflight {
    return {
        check_version: CIO_PREFLIGHT_VERSION,
        status: 'error',
        summary: `error: ${message.split('\n')[0]}`,
        error: { code, message },
        ...identity,
        coverage: {
            complete: false,
            expected_sections: 0,
            resolved_sections: 0,
            checked_sections: 0,
            observed_sections: 0,
            unresolved: [],
            unsupported: [],
            unjudged: [],
        },
        sections: [],
        findings: [],
    };
}

function asCioFinding(item: CioPreflightFinding): CioFinding {
    return {
        severity: item.severity,
        row: item.label ?? '',
        line: item.line ?? 0,
        expected: item.expected ?? 0,
        found: item.found ?? 0,
        missing: item.missing_fields.map((field) => ({
            name: field.name,
            fallback: field.fallback ?? undefined,
        })),
        typeName: item.type_name ?? '',
    };
}

function gapLine(item: CioCoverageGap): string {
    const at = item.where === 'dataset'
        ? (item.line !== null ? `file.cio line ${item.line}` : 'file.cio')
        : item.position !== null
            ? `section ${item.position} (${item.variable}, readcio_read.f90:${item.line})`
            : 'source';
    return `  ${at}: ${item.detail}`;
}

/**
 * Renders the structured result as the text `check_dataset` has always
 * returned. Where the old check could say the same thing, the words are
 * unchanged; a result the old check could not express gets its own
 * headline, and never the clean one.
 */
export function describeCioPreflight(result: CioPreflight): string {
    if (result.error) {
        return result.error.message;
    }
    const of = (kind: CioFindingKind) => result.findings.filter((item) => item.kind === kind);
    const emptyBody = [...of('empty_file'), ...of('no_rows')][0];
    const short = of('short_row').map(asCioFinding);
    const missing = of('missing_section');
    const surplus = of('surplus_values').map(asCioFinding);
    const extra = of('extra_row');
    const { coverage } = result;
    const gaps = [...coverage.unresolved, ...coverage.unsupported];
    const lines: string[] = [];

    if (emptyBody) {
        lines.push(
            `${emptyBody.message}. The code reads a title line and then ` +
                `${coverage.expected_sections} row(s), so an empty file.cio ` +
                'cannot pass: nothing in it says which files the run reads.'
        );
    }
    if (short.length > 0) {
        lines.push(...shortRowLines(short));
    }
    if (missing.length > 0) {
        if (lines.length > 0) {
            lines.push('');
        }
        lines.push(
            `file.cio ends before the code has read all of it: ${missing.length} ` +
                'section(s) have no row, so what the code does at end of file ' +
                'decides which files they use, not the dataset.'
        );
        lines.push('');
        for (const item of missing) {
            lines.push(
                `  section ${item.position}: no row for ${item.variable}` +
                    (item.type_name ? ` (${item.type_name}, ${item.expected} value(s))` : '')
            );
        }
    }
    if (lines.length === 0) {
        if (result.status === 'pass') {
            lines.push(CLEAN_HEADLINE);
        } else if (coverage.expected_sections === 0) {
            lines.push(
                `Read no row expectations from ${result.source.dir}. The check needs ` +
                    'readcio_read.f90 to read rows as `name, <derived type>`; if that ' +
                    'has changed shape, this needs updating rather than trusting.'
            );
        } else {
            lines.push(
                'file.cio could not be checked completely, so this is not a pass. ' +
                    `${coverage.checked_sections} of ${coverage.expected_sections} ` +
                    'section(s) were checked and none is short; the rest could not ' +
                    'be judged:'
            );
        }
    } else if (gaps.length > 0) {
        lines.push('');
        lines.push('Not everything could be checked either:');
    }
    if (gaps.length > 0 && coverage.expected_sections > 0) {
        lines.push(...gaps.slice(0, 12).map(gapLine));
        if (gaps.length > 12) {
            lines.push(`  ... and ${gaps.length - 12} more`);
        }
        if (result.findings.some((item) => item.position_assumed)) {
            lines.push(
                'Rows after one that could not be counted are judged as though ' +
                    'it took exactly one line.'
            );
        }
    }

    if (surplus.length > 0) {
        lines.push('', ...surplusLines(surplus));
    }
    if (extra.length > 0) {
        lines.push('');
        lines.push(
            `${extra.length} row(s) come after everything the code reads. The ` +
                'code never reaches them, which is harmless, though it can mean ' +
                'the dataset is newer than this source tree.'
        );
        lines.push(...extra.map((item) => `  ${item.message}`));
    }
    if (coverage.unjudged.length > 0) {
        lines.push('');
        lines.push(
            `${coverage.unjudged.length} line(s) the code reads whole, as text, ` +
                'are not judged:'
        );
        for (const item of coverage.unjudged) {
            lines.push(
                `  section ${item.position} (${item.variable}, readcio_read.f90:${item.source_line}): ` +
                    (item.line === null ? 'file.cio has no such line' : `line ${item.line}`)
            );
        }
    }

    lines.push('');
    lines.push(`dataset: ${result.dataset.dir}`);
    lines.push(`expectations read from: ${result.source.dir}`);
    return lines.join('\n');
}
