/**
 * Headless SWAT+ dataset engine (vscode-free core).
 *
 * Phase 3 foundation: a query layer over a parsed dataset plus the enriched
 * input/output schemas. It answers the questions an agent (or a panel) needs —
 * "describe this entity", "what references it", "what does this column mean" —
 * and renders compact text, never raw JSON dumps.
 *
 * The engine reads an abstract {@link DatasetModel}, so it is independent of how
 * the dataset was parsed. The extension's `SwatIndexer` can back it directly (its
 * row/FK shapes match), and tests can back it with in-memory fixtures.
 */

import { EnrichedSchemaIndex, OutputSchemaIndex } from './enrichedSchemaCore';

/** A single indexed record from a SWAT+ input file. */
export interface EngineRow {
    table: string;
    file: string;
    line: number;
    pk: string;
    values: { [column: string]: string };
}

/** A foreign-key edge declared by the schema for a table's column. */
export interface FkEdge {
    column: string;
    targetTable: string;
    targetColumn: string;
}

/** An incoming reference: some row elsewhere points at a given (table, pk). */
export interface IncomingReference {
    fromTable: string;
    fromColumn: string;
    fromPk: string;
    fromFile: string;
    fromLine: number;
}

/**
 * The abstract dataset the engine reads. All name lookups are case-insensitive by
 * contract; implementations normalize keys.
 */
export interface DatasetModel {
    getRow(table: string, pk: string): EngineRow | undefined;
    getRows(table: string): EngineRow[];
    getForeignKeys(table: string): FkEdge[];
    getIncomingReferences(table: string, pk: string): IncomingReference[];
    getFileName(table: string): string | undefined;
    getTableForFile(file: string): string | undefined;
    /** All indexed table names, used to scan for value-based references. */
    getTableNames(): string[];
    /** Resolve a user-facing entity kind (e.g. "hru") to a table name. */
    resolveEntityTable(kind: string): string | undefined;
}

/**
 * Scan every table's foreign-key columns for rows whose value matches a target
 * entity, returning the references with the source row's pk populated.
 *
 * SWAT+ text files reference many objects by *name* even though the schema's FK
 * points at an `id` column, so an index that resolves strictly by id misses them.
 * This value-based scan recovers those name-pointer references (e.g. which HRUs
 * use a given soil). It complements — and is meant to be merged with — any
 * reference list the underlying index already provides.
 */
export function scanIncomingReferences(
    model: DatasetModel,
    table: string,
    pk: string,
): IncomingReference[] {
    const key = pk.toLowerCase();
    const refs: IncomingReference[] = [];
    for (const srcTable of model.getTableNames()) {
        const edges = model.getForeignKeys(srcTable).filter(e => e.targetTable === table);
        if (edges.length === 0) {
            continue;
        }
        for (const row of model.getRows(srcTable)) {
            for (const edge of edges) {
                const value = (row.values[edge.column] ?? '').trim().toLowerCase();
                if (value && value === key) {
                    refs.push({
                        fromTable: srcTable, fromColumn: edge.column, fromPk: row.pk,
                        fromFile: row.file, fromLine: row.line,
                    });
                }
            }
        }
    }
    return refs;
}

/** Merge two reference lists, de-duplicating by source file:line:column and
 * preferring the entry that carries a source row pk. */
export function mergeIncomingReferences(
    a: IncomingReference[],
    b: IncomingReference[],
): IncomingReference[] {
    const byKey = new Map<string, IncomingReference>();
    for (const ref of [...a, ...b]) {
        const key = `${ref.fromFile}:${ref.fromLine}:${ref.fromColumn}`;
        const existing = byKey.get(key);
        if (!existing || (!existing.fromPk && ref.fromPk)) {
            byKey.set(key, ref);
        }
    }
    return [...byKey.values()];
}

/** Documentation sources the engine draws on when rendering. */
export interface EngineDocs {
    input?: EnrichedSchemaIndex;
    output?: OutputSchemaIndex;
}

const NULL_VALUES = new Set(['', 'null', 'none', '0']);

function isNullish(value: string | undefined): boolean {
    return value === undefined || NULL_VALUES.has(value.trim().toLowerCase());
}

/**
 * Describe one entity: its identity, each column's value annotated with meaning
 * and units, and its resolved foreign-key relationships. This is the core of
 * "tell me about hru 81".
 */
export function describeEntity(
    model: DatasetModel,
    docs: EngineDocs,
    table: string,
    pk: string,
): string {
    const row = model.getRow(table, pk);
    const fileName = model.getFileName(table) ?? table;
    if (!row) {
        return `No record found for \`${pk}\` in \`${fileName}\`.`;
    }

    const lines: string[] = [];
    lines.push(`# ${fileName} — ${row.pk}`);
    const fileDoc = docs.input?.getFileDoc(fileName);
    if (fileDoc?.summary?.length) {
        lines.push('');
        lines.push(fileDoc.summary[0]);
    }
    lines.push('');
    lines.push(`_${fileName}:${row.line}_`);

    // Foreign-key relationships first — these are the "what is it connected to".
    const fkByColumn = new Map(model.getForeignKeys(table).map(fk => [fk.column.toLowerCase(), fk]));
    const relationships: string[] = [];
    const plainValues: string[] = [];

    for (const [column, value] of Object.entries(row.values)) {
        const colDoc = docs.input?.getColumnDoc(fileName, column);
        const meaning = colDoc?.description ? ` — ${colDoc.description}` : '';
        const units = colDoc?.units ? ` ${colDoc.units}` : '';
        const fk = fkByColumn.get(column.toLowerCase());

        if (fk && !isNullish(value)) {
            const targetFile = model.getFileName(fk.targetTable) ?? fk.targetTable;
            const targetRow = model.getRow(fk.targetTable, value);
            const targetDoc = docs.input?.getFileDoc(targetFile);
            const purpose = targetDoc?.summary?.[0];
            let entry = `- **${column}** → \`${value}\` in \`${targetFile}\``;
            if (!targetRow) {
                entry += ' ⚠ _(unresolved)_';
            }
            if (colDoc?.description) {
                entry += `\n  ${colDoc.description}`;
            } else if (purpose) {
                entry += `\n  ${purpose}`;
            }
            relationships.push(entry);
        } else if (!isNullish(value)) {
            plainValues.push(`- **${column}**: ${value}${units}${meaning}`);
        }
    }

    if (relationships.length > 0) {
        lines.push('');
        lines.push('## Connections');
        lines.push(...relationships);
    }
    if (plainValues.length > 0) {
        lines.push('');
        lines.push('## Values');
        lines.push(...plainValues);
    }

    // Incoming references — what points at this entity.
    const incoming = model.getIncomingReferences(table, row.pk);
    if (incoming.length > 0) {
        lines.push('');
        lines.push(`## Referenced by (${incoming.length})`);
        for (const ref of summarizeIncoming(incoming)) {
            lines.push(`- ${ref}`);
        }
    }

    return lines.join('\n');
}

/** Group incoming references by source table+column into compact counts. */
function summarizeIncoming(refs: IncomingReference[]): string[] {
    const groups = new Map<string, number>();
    for (const ref of refs) {
        const key = `\`${ref.fromTable}\`.${ref.fromColumn}`;
        groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    return [...groups.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([key, count]) => `${key} (${count})`);
}

/** List the rows that reference a given entity, as compact text. */
export function findReferences(
    model: DatasetModel,
    table: string,
    pk: string,
): string {
    const fileName = model.getFileName(table) ?? table;
    const row = model.getRow(table, pk);
    const displayPk = row?.pk ?? pk;
    const incoming = model.getIncomingReferences(table, displayPk);
    if (incoming.length === 0) {
        return `Nothing references \`${displayPk}\` in \`${fileName}\`.`;
    }
    const lines = [`# References to ${fileName} — ${displayPk} (${incoming.length})`, ''];
    for (const ref of incoming) {
        const fromFile = model.getFileName(ref.fromTable) ?? ref.fromTable;
        const rowPart = ref.fromPk ? ` of row \`${ref.fromPk}\`` : '';
        lines.push(`- \`${fromFile}\`:${ref.fromLine} — ${ref.fromColumn}${rowPart}`);
    }
    return lines.join('\n');
}

/**
 * Look up documentation for a file (input or output) and, optionally, a single
 * column. Works with no dataset loaded — it reads only the schemas.
 */
export function lookupDocs(
    docs: EngineDocs,
    file: string,
    column?: string,
): string {
    // Column-specific lookup.
    if (column) {
        const inputCol = docs.input?.getColumnDoc(file, column);
        if (inputCol) {
            const lines = [`# ${file} — ${column}`, ''];
            if (inputCol.description) {
                lines.push(inputCol.description);
            }
            const facts = factList([
                ['Units', inputCol.units],
                ['Type', inputCol.fortran_type],
                ['Default', inputCol.default],
            ]);
            if (facts) {
                lines.push('', facts);
            }
            if (inputCol.source_ref) {
                lines.push('', `_Source: ${inputCol.source_ref}_`);
            }
            return lines.join('\n');
        }
        const outputCol = docs.output?.getColumnDoc(file, column);
        if (outputCol) {
            const lines = [`# ${file} — ${column}`, ''];
            if (outputCol.description) {
                lines.push(outputCol.description);
            }
            const facts = factList([
                ['Units', outputCol.units],
                ['Field', outputCol.source_field],
            ]);
            if (facts) {
                lines.push('', facts);
            }
            return lines.join('\n');
        }
        return `No documentation for column \`${column}\` in \`${file}\`.`;
    }

    // File-level lookup.
    const inputFile = docs.input?.getFileDoc(file);
    if (inputFile) {
        const lines = [`# ${file}`, ''];
        if (inputFile.summary?.length) {
            lines.push(...inputFile.summary);
        }
        if (inputFile.reader_source) {
            lines.push('', `_Reader: ${inputFile.reader_source}_`);
        }
        return lines.join('\n');
    }
    const outputFile = docs.output?.getFileDoc(file);
    if (outputFile) {
        const lines = [`# ${file}`, ''];
        if (outputFile.summary) {
            lines.push(outputFile.summary);
        }
        if (outputFile.family) {
            lines.push('', `_Output family: ${outputFile.family}_`);
        }
        return lines.join('\n');
    }
    return `No documentation for \`${file}\`.`;
}

function factList(pairs: Array<[string, string | undefined]>): string {
    const facts = pairs
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `**${k}:** ${v}`);
    return facts.join(' · ');
}
