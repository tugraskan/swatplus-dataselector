import type { FileFormatIssueKind, SchemaColumn, SchemaTable } from './indexer';

type HeaderIssueKind = Extract<FileFormatIssueKind, 'missing_header_line' | 'header_column_mismatch'>;

const HEADER_ALIASES_BY_FILE: Record<string, Record<string, string>> = {
    'calibration.cal': {
        name: 'cal_parm',
        chg_type: 'chg_typ',
        val: 'chg_val',
        lyr1: 'soil_lyr1',
        lyr2: 'soil_lyr2',
        year1: 'yr1',
        year2: 'yr2'
    },
    'codes.sft': {
        landscape_yn: 'landscape',
        hyd_yn: 'hyd',
        plnt_yn: 'plnt',
        sed_yn: 'sed',
        nut_yn: 'nut',
        ch_sed_yn: 'ch_sed',
        ch_nut_yn: 'ch_nut',
        res_yn: 'res'
    }
};

const VALID_BOOLEAN_LITERALS = new Set(['0', '1', 'y', 'n', 'yes', 'no', 'true', 'false']);

export interface HeaderLineAnalysis {
    kind: HeaderIssueKind | null;
    actualHeaders: string[];
    normalizedHeaders: string[];
    expectedHeaders: string[];
    matchedExpectedCount: number;
}

export interface ValidationLayout {
    headerLineIdx: number;
    dataStartLineIdx: number;
    headerAnalysis: HeaderLineAnalysis | null;
    columnPositions: Map<string, number>;
}

interface FileMetadataShape {
    file_metadata?: {
        [fileName: string]: {
            primary_keys?: string[];
        }
    };
}

/**
 * Distinguish between a genuinely wrong header and a missing header where the
 * first data row has shifted into the header slot.
 */
export function analyzeHeaderLine(
    rawLine: string | undefined,
    physicalColumns: SchemaColumn[],
    nullValues: Iterable<string>,
    fileName?: string
): HeaderLineAnalysis {
    const trimmed = rawLine?.trim() ?? '';
    const expectedHeaders = physicalColumns.map(c => c.name.toLowerCase());

    if (!trimmed) {
        return {
            kind: 'missing_header_line',
            actualHeaders: [],
            normalizedHeaders: [],
            expectedHeaders,
            matchedExpectedCount: 0
        };
    }

    const actualHeaders = trimmed.split(/\s+/);
    const normalizedHeaders = actualHeaders.map(h => normalizeHeaderToken(fileName, h));
    const actualLower = new Set(normalizedHeaders);
    const missing = expectedHeaders.filter(e => !actualLower.has(e));
    const matchedExpectedCount = expectedHeaders.length - missing.length;

    if (expectedHeaders.length === 0 || missing.length <= expectedHeaders.length / 2) {
        return {
            kind: null,
            actualHeaders,
            normalizedHeaders,
            expectedHeaders,
            matchedExpectedCount
        };
    }

    if (matchedExpectedCount === 0 && looksLikeDataRow(trimmed, physicalColumns, nullValues)) {
        return {
            kind: 'missing_header_line',
            actualHeaders,
            normalizedHeaders,
            expectedHeaders,
            matchedExpectedCount
        };
    }

    return {
        kind: 'header_column_mismatch',
        actualHeaders,
        normalizedHeaders,
        expectedHeaders,
        matchedExpectedCount
    };
}

export function resolveValidationLayout(
    rawLines: string[],
    table: SchemaTable,
    physicalColumns: SchemaColumn[],
    nullValues: Iterable<string>
): ValidationLayout {
    let headerLineIdx = table.data_starts_after - 1;
    let dataStartLineIdx = table.data_starts_after;
    let headerAnalysis: HeaderLineAnalysis | null = null;

    const columnPositions = new Map<string, number>(
        physicalColumns.map((column, idx) => [column.name, idx])
    );

    if (table.has_header_line && headerLineIdx >= 0 && headerLineIdx < rawLines.length) {
        let resolvedHeaderLineIdx = headerLineIdx;
        let resolvedHeaderAnalysis = analyzeHeaderLine(
            rawLines[headerLineIdx],
            physicalColumns,
            nullValues,
            table.file_name
        );

        if (isStandaloneCountLine(rawLines[headerLineIdx])) {
            const shiftedHeaderLineIdx = headerLineIdx + 1;
            if (shiftedHeaderLineIdx < rawLines.length) {
                const shiftedHeaderAnalysis = analyzeHeaderLine(
                    rawLines[shiftedHeaderLineIdx],
                    physicalColumns,
                    nullValues,
                    table.file_name
                );

                if (shiftedHeaderAnalysis.matchedExpectedCount > resolvedHeaderAnalysis.matchedExpectedCount) {
                    resolvedHeaderLineIdx = shiftedHeaderLineIdx;
                    resolvedHeaderAnalysis = shiftedHeaderAnalysis;
                }
            }
        }

        headerLineIdx = resolvedHeaderLineIdx;
        dataStartLineIdx = resolvedHeaderLineIdx + 1;
        headerAnalysis = resolvedHeaderAnalysis;

        if (headerAnalysis.matchedExpectedCount > 0) {
            const headerPositions = getHeaderColumnPositions(rawLines[headerLineIdx], table.file_name);
            for (const column of physicalColumns) {
                const position = headerPositions.get(column.name);
                if (position !== undefined) {
                    columnPositions.set(column.name, position);
                }
            }
        }
    }

    return {
        headerLineIdx,
        dataStartLineIdx,
        headerAnalysis,
        columnPositions
    };
}

function looksLikeDataRow(
    rawLine: string,
    physicalColumns: SchemaColumn[],
    nullValues: Iterable<string>
): boolean {
    const values = rawLine.trim().split(/\s+/);
    if (values.length === 0) {
        return false;
    }

    const nullSet = new Set(Array.from(nullValues, v => v.toLowerCase()));
    let typedChecks = 0;
    let typedMatches = 0;

    physicalColumns.forEach((col, idx) => {
        const raw = values[idx];
        if (!raw) {
            return;
        }

        const lowered = raw.toLowerCase();

        if (col.type === 'IntegerField' || col.type === 'PrimaryKeyField') {
            typedChecks++;
            if (nullSet.has(lowered)) {
                typedMatches++;
                return;
            }

            const num = Number(raw);
            if (Number.isFinite(num) && Number.isInteger(num)) {
                typedMatches++;
            }
            return;
        }

        if (col.type === 'DoubleField') {
            typedChecks++;
            if (nullSet.has(lowered)) {
                typedMatches++;
                return;
            }

            if (Number.isFinite(Number(raw))) {
                typedMatches++;
            }
            return;
        }

        if (col.type === 'BooleanField') {
            typedChecks++;
            if (isAcceptedBooleanLiteral(raw, nullSet)) {
                typedMatches++;
            }
        }
    });

    if (typedChecks >= 2 && typedMatches >= Math.max(2, Math.ceil(typedChecks * 0.6))) {
        return true;
    }

    const tailValues = values.slice(1);
    if (tailValues.length < 2) {
        return false;
    }

    const numericLikeCount = tailValues.filter(value => {
        const lowered = value.toLowerCase();
        return nullSet.has(lowered) || Number.isFinite(Number(value));
    }).length;

    return numericLikeCount >= Math.max(2, Math.ceil(tailValues.length * 0.6));
}

/**
 * Some SWAT+ files physically include an `id` column even though the schema
 * exposes it as an AutoField. Keep those columns for positional validation so
 * later fields do not shift left during format checks.
 */
export function getPhysicalColumnsForValidation(
    table: SchemaTable,
    metadata: FileMetadataShape | null | undefined
): SchemaColumn[] {
    const filePrimaryKeys = metadata?.file_metadata?.[table.file_name]?.primary_keys ?? [];
    const includeAutoFields = filePrimaryKeys.includes('id');

    return table.columns.filter(column => includeAutoFields || column.type !== 'AutoField');
}

function normalizeHeaderToken(fileName: string | undefined, token: string): string {
    const normalizedToken = token.toLowerCase();
    if (!fileName) {
        return normalizedToken;
    }

    const aliases = HEADER_ALIASES_BY_FILE[fileName.toLowerCase()];
    return aliases?.[normalizedToken] ?? normalizedToken;
}

function getHeaderColumnPositions(rawLine: string | undefined, fileName?: string): Map<string, number> {
    const positions = new Map<string, number>();
    const headers = rawLine?.trim().split(/\s+/).filter(Boolean) ?? [];

    headers.forEach((header, idx) => {
        const normalizedHeader = normalizeHeaderToken(fileName, header);
        if (!positions.has(normalizedHeader)) {
            positions.set(normalizedHeader, idx);
        }
    });

    return positions;
}

function isStandaloneCountLine(rawLine: string | undefined): boolean {
    const trimmed = rawLine?.trim() ?? '';
    return /^\d+$/.test(trimmed);
}

export function isAcceptedBooleanLiteral(rawValue: string, nullValues: Iterable<string>): boolean {
    const lowered = rawValue.toLowerCase();
    const nullSet = nullValues instanceof Set
        ? nullValues
        : new Set(Array.from(nullValues, value => value.toLowerCase()));

    return nullSet.has(lowered) || VALID_BOOLEAN_LITERALS.has(lowered);
}
