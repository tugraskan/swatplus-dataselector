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

/** Joins the three source facts into one expectation per row, in read order. */
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

/** Renders the check, leading with anything that will actually break a run. */
export function describeCioCheck(
    findings: readonly CioFinding[],
    context: CioCheckContext
): string {
    const errors = findings.filter((finding) => finding.severity === 'error');
    const notes = findings.filter((finding) => finding.severity === 'note');
    const lines: string[] = [];

    if (errors.length === 0) {
        lines.push(
            'file.cio matches what the code reads; no row is short of values.'
        );
    } else {
        lines.push(
            `${errors.length} row(s) in file.cio are short of values. This ` +
                'breaks the run, and not where it looks: list-directed input ' +
                'spans records to fill its item list, so a short row consumes ' +
                'the start of the next line and every row after it is read ' +
                'shifted by one. The failure surfaces later, usually as a ' +
                'subscript error in a routine that has nothing to do with it.'
        );
        lines.push('');
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
    }

    if (notes.length > 0) {
        lines.push('');
        lines.push(
            `${notes.length} row(s) carry more values than the code reads. ` +
                'This is harmless: list-directed input stops once its list is ' +
                'satisfied and ignores the rest of the record. It usually ' +
                'means the dataset is newer than this source tree.'
        );
        for (const finding of notes) {
            lines.push(
                `  line ${finding.line}: ${finding.row} reads ` +
                    `${finding.expected}, has ${finding.found}`
            );
        }
    }

    lines.push('');
    lines.push(`dataset: ${context.datasetDir}`);
    lines.push(`expectations read from: ${context.sourceDir}`);
    return lines.join('\n');
}
