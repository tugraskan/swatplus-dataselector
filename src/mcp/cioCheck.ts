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

const SHORT_ROW_ADVICE =
    'Add the missing value to that row -- "null" where the dataset ' +
    'genuinely has no such file, or the filename otherwise, with ' +
    'the file itself present alongside.';

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
    lines.push(SHORT_ROW_ADVICE);
    return lines;
}

function bufferedShortLines(errors: readonly CioPreflightFinding[]): string[] {
    const lines = [
        `${errors.length} row(s) in file.cio have fewer values than any read the ` +
            'code makes of them. The code takes each of these lines whole and ' +
            'reads its values from that copy, so a short line does not spill into ' +
            'the next one; every read of it fails instead.',
        '',
    ];
    for (const item of errors) {
        lines.push(`  ${item.message}`);
        for (const field of item.missing_fields) {
            lines.push(
                `      missing: ${field.name}` +
                    (field.fallback ? ` (the code's default is "${field.fallback}")` : '')
            );
        }
    }
    lines.push('');
    lines.push(SHORT_ROW_ADVICE);
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
 * - `buffered`: `read (107,'(A)',...) <buffer>`, then one or more
 *   `read (<buffer>,*,...) name, <items>`. Exactly one line, whose values are
 *   then read list-directed from that copy of it. A short line cannot reach
 *   the next one: the read of the buffer fails instead, and the code tries
 *   its next form, if it has one. Each form is one of {@link CioRead.forms}.
 * - `whole_record`: `read (107,'(A)',...) <buffer>`, or a call that does
 *   only that with unit 107. Exactly one line, taken as text, so it can be
 *   neither short nor shift anything.
 * - `unrecognized`: any other form. How many lines it takes is unknown, so
 *   nothing after it can be placed.
 */
export const CIO_READ_KINDS = ['list_directed', 'buffered', 'whole_record', 'unrecognized'] as const;
export type CioReadKind = typeof CIO_READ_KINDS[number];

/** Why part of the check could not be done. Each one makes coverage incomplete. */
export const CIO_GAP_REASONS = [
    // The shape of readcio_read.f90.
    'no_title_read',
    'no_row_reads',
    'unrecognized_read',
    'whole_record_not_trailing',
    'unrecognized_buffer_read',
    'unrecognized_call',
    // A row whose value count input_file_module.f90 does not give.
    'undeclared_variable',
    'undeclared_type',
    'undeclared_field',
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
    'fallback_form',
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

/** One read the code makes of a buffered line, and the fields it fills. */
export interface CioReadForm {
    /** 1-based line of `read (<buffer>,*,...)` in `readcio_read.f90`. */
    sourceLine: number;
    fields: CioField[];
}

/** One read of a `file.cio` line, in the order the code makes it. */
export interface CioRead {
    /** 1-based position among the lines after the title. */
    position: number;
    kind: CioReadKind;
    /**
     * What is read into: `in_basin`, a whole-record read's buffer, or the call
     * that reads the line.
     */
    variable: string;
    /** 1-based line of the statement that takes the line, in `readcio_read.f90`. */
    sourceLine: number;
    /**
     * A list-directed or buffered read whose fields resolved. For a buffered
     * read these are the fields of its first form.
     */
    expectation?: CioExpectation;
    /**
     * A buffered read's forms, in the order the code tries them: the first is
     * what it reads the line as, each later one runs only when the one before
     * it fails.
     */
    forms?: CioReadForm[];
    /** A buffered read whose last form is followed by `if (<iostat> /= 0) exit`. */
    exitsOnFailure?: boolean;
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

/** One statement of free-form Fortran, without comments. */
interface FortranStatement {
    /** 1-based line the statement starts on. */
    line: number;
    code: string;
    /** How many `if ... then`, `do` and `select` blocks it runs inside. */
    depth: number;
}

const OPENS_BLOCK = /^(?:\w+\s*:\s*)?(?:if\s*\(.*\)\s*then|do\b|select\s*(?:case|type)\b)/i;
const CLOSES_BLOCK = /^(?:end\s*(?:if|do|select)|enddo|endif)\b/i;
/** Where one routine's statements end and another's begin. */
const SCOPE_BOUNDARY = /^(?:contains\b|end\s*(?:subroutine|function|program|module)\b|end$|(?:(?:recursive|pure|elemental|impure|module)\s+)*(?:subroutine|function)\s+\w+)/i;

/**
 * The source as statements. A statement continued with `&` is one statement,
 * on the line it starts on, so a read whose item list runs over two lines is
 * read whole rather than cut off.
 */
function fortranStatements(source: string): FortranStatement[] {
    const statements: FortranStatement[] = [];
    const lines = source.split(/\r?\n/);
    let pending: FortranStatement | undefined;
    for (let index = 0; index < lines.length; index += 1) {
        let code = stripFortranComment(lines[index]);
        if (pending) {
            if (code.trim() === '') {
                // A comment or blank line among continuation lines.
                continue;
            }
            code = code.replace(/^\s*&/, '');
        }
        const continued = /&\s*$/.test(code);
        code = code.replace(/&\s*$/, '');
        if (pending) {
            pending.code += ' ' + code;
        } else {
            pending = { line: index + 1, code, depth: 0 };
        }
        if (!continued) {
            statements.push(pending);
            pending = undefined;
        }
    }
    if (pending) {
        statements.push(pending);
    }

    let depth = 0;
    for (const statement of statements) {
        const code = statement.code.trim();
        if (CLOSES_BLOCK.test(code)) {
            depth = Math.max(0, depth - 1);
        }
        statement.depth = depth;
        if (OPENS_BLOCK.test(code)) {
            depth += 1;
        }
    }
    return statements;
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

/** `a, b(1, 2), "c,d"` -> `a`, `b(1, 2)`, `"c,d"`. */
function splitTopLevel(text: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let quote = '';
    let start = 0;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
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
        } else if (char === ',' && depth === 0) {
            parts.push(text.slice(start, index).trim());
            start = index + 1;
        }
    }
    parts.push(text.slice(start).trim());
    return parts.filter((part, index) => part !== '' || index < parts.length - 1);
}

interface ReadStatement {
    kind: 'read';
    line: number;
    /** Index of its statement in {@link fortranStatements}. */
    statement: number;
    /** Offset in the statement, to keep two on one line in order. */
    offset: number;
    /** The control list without spaces, lower-cased: `107,*,iostat=eof`. */
    control: string;
    /** What is read from, lower-cased: `107`, or a buffer's name. */
    unit: string;
    /** What is read into, as written. */
    items: string;
    /** Whether `read` starts the statement rather than following an `if (...)`. */
    leading: boolean;
}

interface CallStatement {
    kind: 'call';
    line: number;
    statement: number;
    offset: number;
    name: string;
    /** The actual arguments, as written. */
    args: string[];
    leading: boolean;
}

/** Every `read` and `call` in a statement, in the order they appear. */
function transfersIn(statement: FortranStatement, index: number): (ReadStatement | CallStatement)[] {
    const { code, line } = statement;
    const found: (ReadStatement | CallStatement)[] = [];
    for (const match of code.matchAll(/\bread\s*\(/gi)) {
        const start = match.index ?? 0;
        const open = start + match[0].length;
        const close = closingParenthesis(code, open);
        // An unclosed control list keeps an unusable item list, which makes
        // it unrecognised rather than unseen.
        const control = code
            .slice(open, close < 0 ? undefined : close)
            .replace(/\s+/g, '')
            .toLowerCase();
        found.push({
            kind: 'read',
            line,
            statement: index,
            offset: start,
            control,
            unit: /^(?:unit=)?(\w*)/.exec(control)?.[1] ?? '',
            items: close < 0 ? '&' : code.slice(close + 1).trim(),
            leading: code.slice(0, start).trim() === '',
        });
    }
    for (const match of code.matchAll(/\bcall\s+(\w+)\s*\(/gi)) {
        const start = match.index ?? 0;
        const open = start + match[0].length;
        const close = closingParenthesis(code, open);
        found.push({
            kind: 'call',
            line,
            statement: index,
            offset: start,
            name: match[1],
            args: splitTopLevel(code.slice(open, close < 0 ? undefined : close)),
            leading: code.slice(0, start).trim() === '',
        });
    }
    return found.sort((a, b) => a.offset - b.offset);
}

const LIST_DIRECTED_CONTROL = /^107,\*(?:,iostat=\w+)?$/;
const WHOLE_RECORD_CONTROL = /^107,(?:fmt=)?(['"])\(a\)\1(?:,iostat=\w+)?$/;

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `if (<iostat> /= 0) <then | exit>`, the test that sends a failed read on. */
function failureTest(iostat: string, then: 'then' | 'exit'): RegExp {
    return new RegExp(
        `^if\\s*\\(\\s*${escapeRegExp(iostat)}\\s*(?:/=|\\.ne\\.)\\s*0\\s*\\)\\s*${then}$`, 'i');
}

type TypeResolution =
    | { typeName: string; shape: CioTypeShape }
    | { reason: CioGapReason; detail: string };

function resolveType(
    variable: string,
    variables: Map<string, string>,
    shapes: Map<string, CioTypeShape>
): TypeResolution {
    const typeName = variables.get(variable);
    const shape = typeName ? shapes.get(typeName) : undefined;
    if (!typeName) {
        return {
            reason: 'undeclared_variable',
            detail: `${variable} is not declared as a derived type in input_file_module.f90`,
        };
    }
    if (!shape) {
        return {
            reason: 'undeclared_type',
            detail: `${variable} is a ${typeName}, and no plain \`type ${typeName}\` block declares it`,
        };
    }
    return { typeName, shape };
}

/** The fields a whole derived type takes, or why they cannot be counted. */
function wholeTypeFields(
    typeName: string,
    shape: CioTypeShape
): { fields: CioField[] } | { reason: CioGapReason; detail: string } {
    if (shape.unsupported.length > 0) {
        return {
            reason: 'unsupported_declaration',
            detail: `type ${typeName} has a line this check does not count: "${shape.unsupported[0]}"`,
        };
    }
    if (shape.fields.length === 0) {
        return { reason: 'no_fields', detail: `type ${typeName} declares no character fields` };
    }
    return { fields: shape.fields };
}

function resolveRow(
    position: number,
    variable: string,
    sourceLine: number,
    variables: Map<string, string>,
    shapes: Map<string, CioTypeShape>
): CioRead {
    const read: CioRead = { position, kind: 'list_directed', variable, sourceLine };
    const type = resolveType(variable, variables, shapes);
    if ('reason' in type) {
        read.unresolved = type;
        return read;
    }
    const fields = wholeTypeFields(type.typeName, type.shape);
    if ('reason' in fields) {
        read.unresolved = fields;
    } else {
        read.expectation = { variable, typeName: type.typeName, fields: fields.fields };
    }
    return read;
}

type FormResolution =
    | { variable: string; typeName: string; fields: CioField[] }
    | { unresolved: { reason: CioGapReason; detail: string }; variable: string }
    | { unrecognized: string };

/**
 * What one read of a buffer fills, after its leading `name`: one variable,
 * whole (`in_basin`) or field by field (`in_basin%codes_bas, ...`).
 */
function resolveForm(
    items: string,
    variables: Map<string, string>,
    shapes: Map<string, CioTypeShape>
): FormResolution {
    let variable: string | undefined;
    let typeName = '';
    const fields: CioField[] = [];
    for (const item of splitTopLevel(items).map((part) => part.replace(/\s+/g, ''))) {
        const parts = /^(\w+)(?:%(\w+))?$/.exec(item);
        if (!parts) {
            return { unrecognized: `"${item}" is not a variable or one of its fields` };
        }
        if (variable !== undefined && parts[1].toLowerCase() !== variable.toLowerCase()) {
            return { unrecognized: `it reads into both ${variable} and ${parts[1]}` };
        }
        variable = parts[1];
        const type = resolveType(variable, variables, shapes);
        if ('reason' in type) {
            return { unresolved: type, variable };
        }
        typeName = type.typeName;
        const component = parts[2];
        if (component === undefined) {
            const whole = wholeTypeFields(type.typeName, type.shape);
            if ('reason' in whole) {
                return { unresolved: whole, variable };
            }
            fields.push(...whole.fields);
            continue;
        }
        const field = type.shape.fields.find((candidate) =>
            candidate.name.toLowerCase() === component.toLowerCase());
        if (field) {
            fields.push(field);
            continue;
        }
        const named = new RegExp(`\\b${escapeRegExp(component)}\\b`, 'i');
        const odd = type.shape.unsupported.find((line) => named.test(line));
        return {
            variable,
            unresolved: odd
                ? {
                    reason: 'unsupported_declaration',
                    detail: `type ${type.typeName} declares ${component} in a form this check does not count: "${odd}"`,
                }
                : {
                    reason: 'undeclared_field',
                    detail: `type ${type.typeName} declares no field ${component}`,
                },
        };
    }
    if (variable === undefined) {
        return { unrecognized: 'it reads nothing after name' };
    }
    return { variable, typeName, fields };
}

/** A line read whole into a buffer, and the reads of that buffer after it. */
interface OpenBuffer {
    read: CioRead;
    /** The buffer's name, lower-cased. */
    name: string;
    statement: number;
    depth: number;
    forms: { line: number; statement: number; iostat: string | null; items: string }[];
    /** Why the reads of the buffer are not modelled, once known. */
    problem?: string;
    /** Line of the first statement that may change the buffer after it is read. */
    changedAt?: number;
}

/**
 * Why `call <name>(..., 107, ...)` is not one whole-line read, or null when it is.
 *
 * Recognised only when the routine is contained in the same file and its one
 * use of the unit is a `read (<unit>,'(A)',...) <variable>` that every call
 * reaches once: nothing before it can skip or repeat it (no `if`, `do`,
 * `select`, `return`, `exit`, `cycle`, `go to`, `stop` or `call`), and the
 * unit is used for nothing else.
 */
function notOneWholeLine(statements: FortranStatement[], call: CallStatement, unitArg: number): string | null {
    const header = new RegExp(
        `^(?:(?:recursive|pure|elemental|impure|module)\\s+)*subroutine\\s+${escapeRegExp(call.name)}\\s*(?:\\(([^)]*)\\))?\\s*$`, 'i');
    const start = statements.findIndex((statement) => header.test(statement.code.trim()));
    if (start < 0) {
        return `readcio_read.f90 does not contain subroutine ${call.name}`;
    }
    const dummies = (header.exec(statements[start].code.trim())?.[1] ?? '')
        .split(',').map((dummy) => dummy.trim().toLowerCase());
    const keyword = /^(\w+)\s*=/.exec(call.args[unitArg])?.[1]?.toLowerCase();
    const unit = keyword ?? dummies[unitArg];
    if (!unit || !dummies.includes(unit)) {
        return `unit 107 does not reach one of ${call.name}'s arguments`;
    }
    const uses = new RegExp(`\\b${escapeRegExp(unit)}\\b`, 'i');
    const wholeLine = new RegExp(`^${escapeRegExp(unit)},(?:fmt=)?(['"])\\(a\\)\\1(?:,iostat=\\w+)?$`);
    const control = /^(?:\w+\s*:\s*)?(?:if|do|select|return|exit|cycle|go\s*to|stop|call|where|forall)\b/i;
    let reads = 0;
    let controlFlowBefore = false;
    for (let index = start + 1; index < statements.length; index += 1) {
        const code = statements[index].code.trim();
        if (/^end(?:\s*subroutine\b|$)/i.test(code)) {
            break;
        }
        if (uses.test(code)) {
            const transfers = transfersIn(statements[index], index);
            const read = transfers.length === 1 && transfers[0].kind === 'read' ? transfers[0] : undefined;
            if (code.includes('::')) {
                // Its declaration.
            } else if (read && read.unit === unit && read.leading
                && wholeLine.test(read.control) && /^\w+$/.test(read.items)) {
                reads += 1;
                if (controlFlowBefore) {
                    return `${call.name} can skip or repeat its read of the unit (line ${statements[index].line})`;
                }
            } else {
                return `${call.name} uses the unit other than in one whole-line read (line ${statements[index].line})`;
            }
        }
        if (reads === 0 && control.test(code)) {
            controlFlowBefore = true;
        }
    }
    return reads === 1 ? null : `${call.name} reads the unit ${reads} times`;
}

/**
 * Every read of `file.cio`, each at a fixed position.
 *
 * Unlike {@link buildExpectations}, nothing is dropped: a row whose type does
 * not resolve keeps its place, unresolved, so the rows after it are still
 * compared with what the code reads into them.
 *
 * A line read whole into a buffer and then read list-directed from it --
 * the way SWAT+ reads the basin row so that an older two-value row still
 * reads -- is one `buffered` read. Each read of the buffer is a form: the
 * first is what the code reads the line as, and a later one counts only as
 * the fallback it is, run when the one before it fails. Any other use of
 * the buffer is not guessed at.
 */
export function buildCioLayout(readcioSource: string, moduleSource: string): CioLayout {
    const shapes = parseInputTypeShapes(moduleSource);
    const variables = parseVariableTypes(moduleSource);
    const statements = fortranStatements(readcioSource);
    const layout: CioLayout = { reads: [] };
    const seen = new Set<string>();
    // Set once a read repeats: the read loop coming round again, as in
    // parseReadOrder. Until then a line read again into the same buffer is
    // another line, as SWAT+ reads line_buffer for the basin row and again
    // for the output path.
    let repeating = false;
    let buffer: OpenBuffer | undefined;
    const lastLineInto = new Map<string, OpenBuffer>();

    const unrecognized = (read: CioRead, reason: CioGapReason, detail: string) => {
        read.kind = 'unrecognized';
        delete read.expectation;
        delete read.unresolved;
        delete read.forms;
        delete read.exitsOnFailure;
        read.unsupported = { reason, detail };
    };

    const closeBuffer = () => {
        const open = buffer;
        buffer = undefined;
        if (!open || (open.forms.length === 0 && !open.problem)) {
            // Read whole and used some other way: a whole-record read.
            return;
        }
        const { read } = open;
        if (open.problem) {
            unrecognized(read, 'unrecognized_buffer_read', open.problem);
            return;
        }
        const resolved = open.forms.map((form) => resolveForm(form.items, variables, shapes));
        const odd = resolved.findIndex((form) => 'unrecognized' in form);
        if (odd >= 0) {
            const why = (resolved[odd] as { unrecognized: string }).unrecognized;
            unrecognized(read, 'unrecognized_buffer_read',
                `the read of ${open.name} at line ${open.forms[odd].line} is not counted: ${why}`);
            return;
        }
        const named = resolved as Exclude<FormResolution, { unrecognized: string }>[];
        const variable = named[0].variable;
        const other = named.findIndex((form) => form.variable.toLowerCase() !== variable.toLowerCase());
        if (other >= 0) {
            unrecognized(read, 'unrecognized_buffer_read',
                `the reads of ${open.name} fill ${variable} at line ${open.forms[0].line} ` +
                    `and ${named[other].variable} at line ${open.forms[other].line}`);
            return;
        }
        read.kind = 'buffered';
        read.variable = variable;
        const gap = named.find((form) => 'unresolved' in form);
        if (gap && 'unresolved' in gap) {
            read.unresolved = gap.unresolved;
            return;
        }
        const forms = named as { variable: string; typeName: string; fields: CioField[] }[];
        read.forms = forms.map((form, index) => ({
            sourceLine: open.forms[index].line,
            fields: form.fields,
        }));
        read.expectation = { variable, typeName: forms[0].typeName, fields: forms[0].fields };
        const last = open.forms[open.forms.length - 1];
        const after = statements[last.statement + 1]?.code.trim() ?? '';
        read.exitsOnFailure = last.iostat !== null && failureTest(last.iostat, 'exit').test(after);
    };

    const readOfBuffer = (read: ReadStatement) => {
        if (repeating) {
            return;
        }
        if (!buffer || buffer.name !== read.unit) {
            // Read after later lines of file.cio were taken: not modelled.
            const earlier = lastLineInto.get(read.unit);
            if (earlier && earlier.read.kind !== 'unrecognized') {
                unrecognized(earlier.read, 'unrecognized_buffer_read',
                    `${read.unit} is read at line ${read.line}, after the code has read further lines of file.cio`);
            }
            return;
        }
        const open = buffer;
        if (open.problem) {
            return;
        }
        const form = new RegExp(`^${escapeRegExp(open.name)},\\*(?:,iostat=(\\w+))?$`).exec(read.control);
        const items = /^name\s*,\s*(.+)$/i.exec(read.items);
        const at = `the read of ${open.name} at line ${read.line}`;
        if (open.changedAt !== undefined) {
            open.problem = `${open.name} may be changed at line ${open.changedAt}, before ${at}`;
        } else if (!form) {
            open.problem = `${at} is not a list-directed read of the whole buffer`;
        } else if (!read.leading) {
            open.problem = `${at} is inside another statement`;
        } else if (!items) {
            open.problem = `${at} does not read name and then the row's values`;
        } else if (open.forms.length === 0) {
            if (statements[read.statement].depth !== open.depth) {
                open.problem = `${at} is inside a block that the line read at line ${open.read.sourceLine} is not`;
            }
        } else {
            const previous = open.forms[open.forms.length - 1];
            const guard = statements[read.statement - 1]?.code.trim() ?? '';
            if (previous.iostat === null || !failureTest(previous.iostat, 'then').test(guard)) {
                open.problem = `${at} does not run only when the read at line ${previous.line} fails`;
            }
        }
        if (!open.problem && form && items) {
            open.forms.push({
                line: read.line,
                statement: read.statement,
                iostat: form[1] ?? null,
                items: items[1],
            });
        }
    };

    const readOf107 = (statement: FortranStatement, read: ReadStatement) => {
        closeBuffer();
        const key = `${read.control}|${read.items.replace(/\s+/g, '').toLowerCase()}`;
        const first = seen.size === 0;
        const single = /^(\w+)$/.exec(read.items);
        const wholeLine = read.leading && WHOLE_RECORD_CONTROL.test(read.control) && single;
        if (seen.has(key) && (repeating || !wholeLine)) {
            repeating = true;
            return;
        }
        seen.add(key);

        if (first && read.leading && read.control === '107,*' && single) {
            layout.titleLine = read.line;
            return;
        }
        const position = layout.reads.length + 1;
        const row = /^name\s*,\s*(\w+)$/i.exec(read.items);
        if (read.leading && LIST_DIRECTED_CONTROL.test(read.control) && row) {
            layout.reads.push(resolveRow(position, row[1], read.line, variables, shapes));
        } else if (wholeLine && single) {
            const whole: CioRead = { position, kind: 'whole_record', variable: single[1], sourceLine: read.line };
            layout.reads.push(whole);
            buffer = {
                read: whole,
                name: single[1].toLowerCase(),
                statement: read.statement,
                depth: statement.depth,
                forms: [],
            };
            lastLineInto.set(buffer.name, buffer);
        } else {
            layout.reads.push({
                position,
                kind: 'unrecognized',
                variable: read.items,
                sourceLine: read.line,
                unsupported: {
                    reason: 'unrecognized_read',
                    detail: `read (${read.control}) ${read.items}` +
                        (read.leading ? '' : ' (inside another statement)'),
                },
            });
        }
    };

    const callWith107 = (call: CallStatement, unitArg: number) => {
        closeBuffer();
        const text = `${call.name}(${call.args.join(', ')})`;
        const key = `call|${text.replace(/\s+/g, '').toLowerCase()}`;
        if (seen.has(key)) {
            repeating = true;
            return;
        }
        seen.add(key);
        const position = layout.reads.length + 1;
        const why = call.leading
            ? notOneWholeLine(statements, call, unitArg)
            : 'the call is inside another statement';
        if (why === null) {
            layout.reads.push({ position, kind: 'whole_record', variable: text, sourceLine: call.line });
        } else {
            layout.reads.push({
                position,
                kind: 'unrecognized',
                variable: text,
                sourceLine: call.line,
                unsupported: {
                    reason: 'unrecognized_call',
                    detail: `call ${text} passes unit 107 to a routine this check does not follow: ${why}`,
                },
            });
        }
    };

    statements.forEach((statement, index) => {
        const code = statement.code.trim();
        if (SCOPE_BOUNDARY.test(code)) {
            closeBuffer();
        }
        const transfers = transfersIn(statement, index);
        for (const transfer of transfers) {
            if (transfer.kind === 'read') {
                if (transfer.unit === '107') {
                    readOf107(statement, transfer);
                } else if (lastLineInto.has(transfer.unit)) {
                    readOfBuffer(transfer);
                } else if (buffer && new RegExp(`\\b${escapeRegExp(buffer.name)}\\b`, 'i').test(transfer.items)) {
                    buffer.changedAt ??= transfer.line;
                }
            } else {
                const unitArg = transfer.args.findIndex((arg) => /^(?:\w+=)?107$/.test(arg.replace(/\s+/g, '')));
                if (unitArg >= 0) {
                    callWith107(transfer, unitArg);
                } else if (buffer && transfer.args.some((arg) =>
                    new RegExp(`\\b${escapeRegExp(buffer!.name)}\\b`, 'i').test(arg))) {
                    buffer.changedAt ??= transfer.line;
                }
            }
        }
        if (buffer && transfers.length === 0
            && new RegExp(`^${escapeRegExp(buffer.name)}\\s*(?:\\([^)]*\\))?\\s*=(?!=)`, 'i').test(code)) {
            buffer.changedAt ??= statement.line;
        }
    });
    closeBuffer();

    // A whole-record read takes the next line and its content is not judged.
    // After the last row that is harmless; before a row, the code may use
    // that line in a way this check does not see, so it is not placed.
    const lastRow = Math.max(
        0,
        ...layout.reads.filter(isRowRead).map((read) => read.position)
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

/** A read whose values the check counts: a row of `file.cio`. */
function isRowRead(read: { kind: CioReadKind } | { read_kind: CioReadKind }): boolean {
    const kind = 'kind' in read ? read.kind : read.read_kind;
    return kind === 'list_directed' || kind === 'buffered';
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
    /** True only when every row could be judged. */
    complete: boolean;
    /**
     * Rows whose values the code reads list-directed, from file.cio or from a
     * buffered copy of the line: the ones this check judges.
     */
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
    /**
     * Values the read takes. For a buffered read, those of the form that took
     * the row, or of its first form when none did.
     */
    expected: number | null;
    /** The row's first token. Diagnostic only: the code reads it and discards it. */
    label: string | null;
    line: number | null;
    found: number | null;
    outcome: CioSectionOutcome;
    /**
     * For a buffered read, which of its forms took the row: 1 for the first,
     * which is what the code reads the line as, 2 or more for a fallback (a
     * `fallback_form` note says which). Null when no form took it, and for
     * every other kind of read.
     */
    form: number | null;
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

function missingFields(fields: readonly CioField[]): CioPreflightFinding['missing_fields'] {
    return fields.map((field) => ({ name: field.name, fallback: field.fallback ?? null }));
}

/** The one line a buffered read takes, blank or not. A blank line has no label. */
function bufferedRow(text: string, line: number): CioRow {
    const tokens = text.trim().split(/\s+/).filter(Boolean);
    return { label: tokens[0] ?? '', values: tokens.slice(1), line };
}

/**
 * Judges the line a buffered read takes. Each form takes the line when it
 * has at least as many values as the form reads, so the form that takes it
 * is the first one, in the code's order, that it has enough values for.
 *
 * Returns true when no form takes it and the code then stops reading
 * `file.cio`, so nothing after it is read at all.
 */
function judgeBuffered(
    read: CioRead,
    forms: readonly CioReadForm[],
    row: CioRow,
    section: CioPreflightSection,
    findings: CioPreflightFinding[],
    assumed: boolean
): boolean {
    const [first] = forms;
    const found = row.values.length;
    const name = row.label || null;
    const at = (form: CioReadForm) => `readcio_read.f90:${form.sourceLine}`;
    const details = {
        position: read.position,
        line: row.line,
        label: name,
        variable: read.variable,
        type_name: read.expectation?.typeName ?? null,
        expected: first.fields.length,
        found,
        position_assumed: assumed,
    };
    const taken = row.label === '' ? -1 : forms.findIndex((form) => form.fields.length <= found);
    if (taken < 0) {
        section.outcome = 'short';
        const fallbacks = forms.slice(1).map((form) => form.fields.length);
        const or = fallbacks.length > 0
            ? ` (or ${fallbacks.join(' or ')} in the code's fallback read${fallbacks.length > 1 ? 's' : ''})`
            : '';
        const what = row.label === ''
            ? `line ${row.line} is blank where the code reads ${read.variable}, which takes ${first.fields.length} value(s)${or}`
            : `line ${row.line}: ${row.label} expects ${first.fields.length} value(s)${or}, found ${found}`;
        const then = read.exitsOnFailure
            ? '; every read of it fails and readcio_read stops reading file.cio there, ' +
                'so every section after it keeps the code\'s default'
            : '; every read the code makes of it fails';
        findings.push(finding('short_row', 'error', what + then, {
            ...details,
            missing_fields: missingFields(first.fields.slice(found)),
        }));
        return read.exitsOnFailure === true;
    }
    const form = forms[taken];
    section.form = taken + 1;
    section.expected = form.fields.length;
    section.outcome = found > form.fields.length ? 'surplus' : 'match';
    if (taken > 0) {
        const kept = first.fields.filter((field) =>
            !form.fields.some((other) => other.name === field.name));
        const named = kept.map((field) => field.name + (field.fallback ? ` ("${field.fallback}")` : ''));
        findings.push(finding('fallback_form', 'note',
            `line ${row.line}: ${row.label} has ${found} value(s), so the code reads it with its ` +
                `fallback read (${at(form)}) rather than its first (${at(first)})` +
                (kept.length > 0
                    ? `; ${named.join(', ')} keep${kept.length === 1 ? 's' : ''} the code's default`
                    : ''), {
                ...details,
                expected: form.fields.length,
                missing_fields: missingFields(kept),
            }));
    }
    if (found > form.fields.length) {
        findings.push(finding('surplus_values', 'note',
            `line ${row.line}: ${row.label} reads ${form.fields.length}, has ${found}`,
            { ...details, expected: form.fields.length }));
    }
    return false;
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
    const rowReads = layout.reads.filter(isRowRead);
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
            form: null,
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
        // A whole-record or buffered read takes the very next line, blank or
        // not; a list-directed one skips blank lines to the next row.
        const nextLine = lastLine + 1 <= records.length ? lastLine + 1 : null;
        if (read.kind === 'whole_record') {
            if (nextLine !== null) {
                lastLine = nextLine;
                section.line = nextLine;
                section.label = records[nextLine - 1].trim().split(/\s+/)[0] || null;
            }
            section.outcome = 'unjudged';
            unjudged.push({ position: read.position, variable: read.variable, source_line: read.sourceLine, line: nextLine });
            continue;
        }

        const row: CioRow | undefined = read.kind === 'buffered'
            ? nextLine === null ? undefined : bufferedRow(records[nextLine - 1], nextLine)
            : rows.find((candidate) => candidate.line > lastLine);
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
        lastLine = row.line;
        section.label = row.label || null;
        section.line = row.line;
        section.found = row.values.length;
        // A buffered read takes exactly its own line, so a row it cannot count
        // moves nothing after it.
        const certain = read.kind === 'buffered';

        if ([row.label, ...row.values].some((token) => UNCOUNTED_SYNTAX.test(token))) {
            section.outcome = 'uncounted';
            unsupported.push(gap('dataset', 'uncounted_syntax',
                `line ${row.line} uses list-directed syntax (a comma, slash, quote or repeat count) ` +
                    'that this check does not count', { position: read.position, variable: read.variable, line: row.line }));
            assumed ||= !certain;
            continue;
        }
        if (!expectation) {
            section.outcome = 'unresolved';
            assumed ||= !certain;
            continue;
        }
        if (read.kind === 'buffered' && read.forms) {
            if (judgeBuffered(read, read.forms, row, section, findings, assumed)) {
                // The code reads nothing more, so nothing after it is placed.
                placed = false;
            }
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
                    missing_fields: missingFields(expectation.fields.slice(found)),
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

    const counted = sections.filter(isRowRead);
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
    const buffered = new Set(result.sections
        .filter((section) => section.read_kind === 'buffered')
        .map((section) => section.position));
    const emptyBody = [...of('empty_file'), ...of('no_rows')][0];
    const short = of('short_row').filter((item) => !buffered.has(item.position ?? 0)).map(asCioFinding);
    const shortBuffered = of('short_row').filter((item) => buffered.has(item.position ?? 0));
    const missing = of('missing_section');
    const surplus = of('surplus_values').map(asCioFinding);
    const fallback = of('fallback_form');
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
    if (shortBuffered.length > 0) {
        if (lines.length > 0) {
            lines.push('');
        }
        lines.push(...bufferedShortLines(shortBuffered));
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
    if (fallback.length > 0) {
        lines.push('');
        lines.push(
            `${fallback.length} row(s) are read by the code's fallback form. This is ` +
                'harmless: the code reads the line again with fewer values, as it ' +
                'reads a file.cio written for an older SWAT+, and the fields that ' +
                'form does not read keep the code\'s defaults.'
        );
        lines.push(...fallback.map((item) => `  ${item.message}`));
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
