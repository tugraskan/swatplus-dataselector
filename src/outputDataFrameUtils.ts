import * as fs from 'fs';
import * as path from 'path';

export type OutputParserKind = 'csv' | 'structured_text';

export interface ParsedOutputDataFrame {
    filePath: string;
    fileName: string;
    title: string;
    columns: string[];
    units: string[] | null;
    rows: string[][];
    totalRowCount: number;
    previewRowCount: number;
    truncated: boolean;
    parserKind: OutputParserKind;
}

interface StructuredColumnBoundary {
    label: string;
    start: number;
    end: number;
}

type StructuredParseMode = 'whitespace' | 'fixed_width';

export function parseOutputFileToDataFrame(filePath: string, maxPreviewRows = 2000): ParsedOutputDataFrame {
    const parserKind: OutputParserKind = path.extname(filePath).toLowerCase() === '.csv'
        ? 'csv'
        : 'structured_text';

    return parserKind === 'csv'
        ? parseCsvOutputFile(filePath, maxPreviewRows)
        : parseStructuredOutputFile(filePath, maxPreviewRows);
}

function parseCsvOutputFile(filePath: string, maxPreviewRows: number): ParsedOutputDataFrame {
    const lines = readNonEmptyLines(filePath);
    if (lines.length === 0) {
        throw new Error(`No readable rows found in ${path.basename(filePath)}.`);
    }

    const columns = splitCsvLine(lines[0]);
    const rows: string[][] = [];
    let totalRowCount = 0;

    for (const line of lines.slice(1)) {
        const tokens = normalizeRow(splitCsvLine(line), columns.length);
        totalRowCount += 1;
        if (rows.length < maxPreviewRows) {
            rows.push(tokens);
        }
    }

    return {
        filePath,
        fileName: path.basename(filePath),
        title: path.basename(filePath),
        columns,
        units: null,
        rows,
        totalRowCount,
        previewRowCount: rows.length,
        truncated: totalRowCount > rows.length,
        parserKind: 'csv'
    };
}

function parseStructuredOutputFile(filePath: string, maxPreviewRows: number): ParsedOutputDataFrame {
    const lines = readNonEmptyLines(filePath);
    if (lines.length < 2) {
        throw new Error(`Expected at least a title and header in ${path.basename(filePath)}.`);
    }

    const layout = resolveStructuredLayout(lines, filePath);
    const title = layout.title;
    const columns = layout.columns;
    if (columns.length === 0) {
        throw new Error(`Could not detect header columns in ${path.basename(filePath)}.`);
    }

    const rows: string[][] = [];
    let totalRowCount = 0;
    for (const line of lines.slice(layout.dataStartIndex)) {
        const trimmed = line.trim();
        if (!trimmed || isSeparatorLine(trimmed)) {
            continue;
        }

        totalRowCount += 1;
        if (rows.length < maxPreviewRows) {
            const whitespaceTokens = splitWhitespaceLine(trimmed);
            const rowTokens = whitespaceTokens.length >= columns.length
                ? whitespaceTokens
                : parseStructuredLine(line, layout.parseMode, layout.columnBoundaries);
            rows.push(normalizeRow(rowTokens, columns.length));
        }
    }

    return {
        filePath,
        fileName: path.basename(filePath),
        title,
        columns,
        units: layout.units,
        rows,
        totalRowCount,
        previewRowCount: rows.length,
        truncated: totalRowCount > rows.length,
        parserKind: 'structured_text'
    };
}

function readNonEmptyLines(filePath: string): string[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content
        .split(/\r?\n/)
        .map(line => line.replace(/\r$/, ''))
        .filter(line => line.trim().length > 0);
}

function splitWhitespaceLine(line: string): string[] {
    return line.trim().split(/\s+/).filter(Boolean);
}

function splitCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (char === '"') {
            if (inQuotes && line[index + 1] === '"') {
                current += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
            continue;
        }

        current += char;
    }

    values.push(current.trim());
    return values;
}

function normalizeRow(tokens: string[], columnCount: number): string[] {
    if (columnCount <= 0) {
        return tokens;
    }

    if (tokens.length < columnCount) {
        return [...tokens, ...new Array(columnCount - tokens.length).fill('')];
    }

    if (tokens.length > columnCount) {
        return [
            ...tokens.slice(0, columnCount - 1),
            tokens.slice(columnCount - 1).join(' ')
        ];
    }

    return tokens;
}

function resolveStructuredLayout(
    lines: string[],
    filePath: string
): {
    title: string;
    columns: string[];
    units: string[] | null;
    dataStartIndex: number;
    columnBoundaries: StructuredColumnBoundary[];
    parseMode: StructuredParseMode;
} {
    const headerIndex = findHeaderLineIndex(lines);
    if (headerIndex < 0) {
        throw new Error(`Could not detect header columns in ${path.basename(filePath)}.`);
    }

    const columnBoundaries = getStructuredColumnBoundaries(lines[headerIndex]);
    const columns = columnBoundaries.map(boundary => boundary.label);
    const titleLines = lines
        .slice(0, headerIndex)
        .map(line => line.trim())
        .filter(Boolean);
    const parseMode = shouldUseFixedWidthMode(lines, headerIndex, columns.length, columnBoundaries)
        ? 'fixed_width'
        : 'whitespace';

    let units: string[] | null = null;
    let dataStartIndex = headerIndex + 1;
    if (lines.length > headerIndex + 2) {
        const candidateUnits = parseStructuredLine(lines[headerIndex + 1], parseMode, columnBoundaries);
        const nextValues = parseStructuredLine(lines[headerIndex + 2], parseMode, columnBoundaries);
        if (looksLikeUnitsRow(candidateUnits, nextValues)) {
            units = candidateUnits;
            dataStartIndex = headerIndex + 2;
        }
    }

    return {
        title: titleLines.join(' ') || path.basename(filePath),
        columns,
        units,
        dataStartIndex,
        columnBoundaries,
        parseMode
    };
}

function findHeaderLineIndex(lines: string[]): number {
    const searchLimit = Math.min(lines.length - 1, 6);
    for (let index = 1; index <= searchLimit; index += 1) {
        const boundaries = getStructuredColumnBoundaries(lines[index]);
        const tokens = boundaries.map(boundary => boundary.label);
        if (!isHeaderCandidate(tokens, lines, index, boundaries)) {
            continue;
        }
        return index;
    }

    return lines.length > 1 ? 1 : -1;
}

function isHeaderCandidate(
    tokens: string[],
    lines: string[],
    index: number,
    boundaries: StructuredColumnBoundary[]
): boolean {
    if (tokens.length < 2 || numericLikeRatio(tokens) > 0.25 || looksLikeBannerLine(lines[index], tokens)) {
        return false;
    }

    const nextWhitespace = splitWhitespaceLine(lines[index + 1] ?? '');
    const nextNextWhitespace = splitWhitespaceLine(lines[index + 2] ?? '');
    const nextValues = splitLineByBoundaries(lines[index + 1] ?? '', boundaries);
    const nextNextValues = splitLineByBoundaries(lines[index + 2] ?? '', boundaries);

    if (nextWhitespace.length === tokens.length && looksLikeUnitsRow(nextWhitespace, nextNextWhitespace)) {
        return true;
    }

    if (looksLikeUnitsRow(nextValues, nextNextValues)) {
        return true;
    }

    if (nextWhitespace.length === tokens.length && looksLikeDataRow(nextWhitespace, tokens.length)) {
        return true;
    }

    return looksLikeDataRow(nextValues, tokens.length);
}

function looksLikeDataRow(tokens: string[], expectedColumnCount: number): boolean {
    if (tokens.length === 0) {
        return false;
    }

    const numericRatio = numericLikeRatio(tokens);
    if (tokens.length === expectedColumnCount && numericRatio >= 0.3) {
        return true;
    }

    return numericRatio >= 0.45 && tokens.length >= Math.max(2, Math.floor(expectedColumnCount * 0.6));
}

function numericLikeRatio(tokens: string[]): number {
    if (tokens.length === 0) {
        return 0;
    }

    let numericCount = 0;
    for (const token of tokens) {
        const cleaned = token.trim().replace(/,/g, '');
        if (!cleaned || cleaned === '-' || cleaned === '--' || cleaned.toLowerCase() === 'na' || cleaned.toLowerCase() === 'n/a') {
            continue;
        }

        if (!Number.isNaN(Number(cleaned))) {
            numericCount += 1;
        }
    }

    return numericCount / tokens.length;
}

function looksLikeUnitsRow(cells: string[], nextCells: string[]): boolean {
    if (cells.length === 0 || nextCells.length === 0) {
        return false;
    }

    const nonEmptyCells = cells.filter(cell => cell.trim().length > 0);
    if (nonEmptyCells.length === 0) {
        return false;
    }

    if (nonEmptyCells.every(cell => /^[-=]+$/.test(cell))) {
        return false;
    }

    const candidateRatio = numericLikeRatio(cells);
    const nextRatio = numericLikeRatio(nextCells);
    const hasUnitHints = nonEmptyCells.some(cell => /[a-zA-Z/%()]/.test(cell));
    const hasSparseBlanks = nonEmptyCells.length < cells.length;
    return candidateRatio <= 0.25
        && looksLikeDataRow(nextCells, cells.length)
        && (hasUnitHints || hasSparseBlanks)
        && (hasSparseBlanks || nextRatio >= candidateRatio);
}

function isSeparatorLine(line: string): boolean {
    return [...line].every(char => char === '-' || char === '=');
}

function shouldUseFixedWidthMode(
    lines: string[],
    headerIndex: number,
    columnCount: number,
    boundaries: StructuredColumnBoundary[]
): boolean {
    if (lines.length <= headerIndex + 2) {
        return false;
    }

    const unitsTokens = splitWhitespaceLine(lines[headerIndex + 1]);
    const nextTokens = splitWhitespaceLine(lines[headerIndex + 2]);
    if (unitsTokens.length === 0 || unitsTokens.length >= columnCount || !looksLikeDataRow(nextTokens, columnCount)) {
        return false;
    }

    return looksLikeUnitsRow(
        splitLineByBoundaries(lines[headerIndex + 1], boundaries),
        splitLineByBoundaries(lines[headerIndex + 2], boundaries)
    );
}

function parseStructuredLine(
    line: string,
    mode: StructuredParseMode,
    boundaries: StructuredColumnBoundary[]
): string[] {
    return mode === 'fixed_width'
        ? splitLineByBoundaries(line, boundaries)
        : splitWhitespaceLine(line);
}

function looksLikeBannerLine(line: string, tokens: string[]): boolean {
    return tokens.length <= 2 && /--.*--/.test(line);
}

function getStructuredColumnBoundaries(line: string): StructuredColumnBoundary[] {
    const matches = Array.from(line.matchAll(/\S+/g));
    return matches.map((match, index) => {
        const tokenStart = match.index ?? 0;
        const tokenEnd = tokenStart + match[0].length;
        const previousMatch = index > 0 ? matches[index - 1] : null;
        const nextMatch = index + 1 < matches.length ? matches[index + 1] : null;
        const previousEnd = previousMatch ? (previousMatch.index ?? 0) + previousMatch[0].length : 0;
        const nextStart = nextMatch ? (nextMatch.index ?? line.length) : line.length;

        return {
            label: match[0],
            start: index === 0 ? 0 : Math.floor((previousEnd + tokenStart) / 2),
            end: nextMatch ? Math.floor((tokenEnd + nextStart) / 2) : line.length
        };
    });
}

function splitLineByBoundaries(line: string, boundaries: StructuredColumnBoundary[]): string[] {
    if (boundaries.length === 0) {
        return splitWhitespaceLine(line);
    }

    return boundaries.map(boundary =>
        line.slice(boundary.start, Math.min(boundary.end, line.length)).trim()
    );
}
