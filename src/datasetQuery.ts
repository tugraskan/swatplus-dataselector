/**
 * Structured dataset query (vscode-free).
 *
 * Predicate evaluation over indexed rows, plus orphan detection. The operator
 * semantics mirror the output explorer's filter builder
 * (`src/outputDataFramePanel.ts`) so inputs and outputs behave identically:
 * numeric-aware equality/comparison, case-insensitive contains, list membership.
 *
 * Results are always bounded so a query over a large dataset stays usable and
 * agent responses stay compact.
 */

import { DatasetModel, EngineRow } from './datasetEngineCore';

export type QueryOperator =
    | 'equals' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'is_empty';

export interface Predicate {
    column: string;
    operator: QueryOperator;
    value?: string;
    /** Negate the predicate result (NOT). */
    negate?: boolean;
}

export interface QueryOptions {
    /** Combine multiple predicates with all (AND) or any (OR). Default 'all'. */
    match?: 'all' | 'any';
    /** Maximum rows to return. Default 100. */
    limit?: number;
}

export interface QueryResult {
    rows: EngineRow[];
    total: number;      // total matches before the limit
    truncated: boolean; // true when total > returned rows
}

const DEFAULT_LIMIT = 100;

/** Parse a numeric value, stripping thousands separators. Null when non-numeric. */
export function toNumber(value: string | undefined): number | null {
    const cleaned = String(value ?? '').trim().replace(/,/g, '');
    if (!cleaned) {
        return null;
    }
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
}

/** Numeric-aware equality: compare as numbers when both parse, else as text. */
export function valuesEqual(left: string, right: string): boolean {
    const ln = toNumber(left);
    const rn = toNumber(right);
    if (ln !== null && rn !== null) {
        return ln === rn;
    }
    return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function splitListValues(value: string): string[] {
    return value.split(/[,;]+/).map(v => v.trim()).filter(Boolean);
}

/** Evaluate a single operator against a cell value. */
export function matchValue(cellValue: string, operator: QueryOperator, rawValue: string): boolean {
    const cell = cellValue ?? '';
    const query = String(rawValue ?? '').trim();
    switch (operator) {
        case 'is_empty':
            return cell.trim() === '';
        case 'contains':
            return cell.toLowerCase().includes(query.toLowerCase());
        case 'equals':
            return valuesEqual(cell, query);
        case 'in':
            return splitListValues(query).some(option => valuesEqual(cell, option));
        default: {
            const left = toNumber(cell);
            const right = toNumber(query);
            if (left === null || right === null) {
                return false;
            }
            if (operator === 'gt') { return left > right; }
            if (operator === 'gte') { return left >= right; }
            if (operator === 'lt') { return left < right; }
            if (operator === 'lte') { return left <= right; }
            return false;
        }
    }
}

/** Evaluate one predicate against a row (honoring `negate`). */
export function evaluatePredicate(row: EngineRow, predicate: Predicate): boolean {
    const cell = row.values[predicate.column] ?? '';
    const matched = matchValue(cell, predicate.operator, predicate.value ?? '');
    return predicate.negate ? !matched : matched;
}

/** Rows in a table matching the predicates, bounded by `limit`. */
export function queryRows(
    model: DatasetModel,
    table: string,
    predicates: Predicate[],
    options: QueryOptions = {},
): QueryResult {
    const match = options.match ?? 'all';
    const limit = options.limit ?? DEFAULT_LIMIT;
    const rows = model.getRows(table);

    const matches = rows.filter(row => {
        if (predicates.length === 0) {
            return true;
        }
        return match === 'any'
            ? predicates.some(p => evaluatePredicate(row, p))
            : predicates.every(p => evaluatePredicate(row, p));
    });

    return {
        rows: matches.slice(0, limit),
        total: matches.length,
        truncated: matches.length > limit,
    };
}

/** Rows nothing references — candidates for unused/dead data. */
export function findOrphans(
    model: DatasetModel,
    table: string,
    options: { limit?: number } = {},
): QueryResult {
    const limit = options.limit ?? DEFAULT_LIMIT;
    const orphans = model.getRows(table).filter(
        row => model.getIncomingReferences(table, row.pk).length === 0);
    return {
        rows: orphans.slice(0, limit),
        total: orphans.length,
        truncated: orphans.length > limit,
    };
}

/** Render a query result as compact markdown (pk + a few columns). */
export function renderQueryResult(
    result: QueryResult,
    fileName: string,
    heading: string,
    columns?: string[],
): string {
    if (result.total === 0) {
        return `No rows in \`${fileName}\` match ${heading}.`;
    }
    const shown = result.truncated
        ? `${result.rows.length} of ${result.total}`
        : `${result.total}`;
    const lines = [`# ${fileName}: ${shown} ${heading}`, ''];

    // Pick columns to display: requested, else pk + first few of the first row.
    const first = result.rows[0];
    const cols = columns && columns.length > 0
        ? columns
        : Object.keys(first.values).slice(0, 5);

    lines.push(`| line | ${cols.join(' | ')} |`);
    lines.push(`|---|${cols.map(() => '---').join('|')}|`);
    for (const row of result.rows) {
        const cells = cols.map(c => (row.values[c] ?? '').replace(/\|/g, '\\|'));
        lines.push(`| ${row.line} | ${cells.join(' | ')} |`);
    }
    if (result.truncated) {
        lines.push('', `_Showing the first ${result.rows.length}; refine the query to narrow results._`);
    }
    return lines.join('\n');
}
