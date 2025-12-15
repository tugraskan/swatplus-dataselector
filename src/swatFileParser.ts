/**
 * Configuration and utilities for SWAT+ file parsing
 */

/**
 * SWAT+ file extensions supported for navigation
 */
export const SWAT_FILE_EXTENSIONS = [
    'hru', 'hyd', 'fld', 'sol', 'lum', 'ini', 'wet', 'sno', 
    'plt', 'dtl', 'con', 'cha', 'res', 'aqu', 'rtu', 'ele',
    'rec', 'bsn', 'cal', 'def', 'ops', 'sch', 'til', 'frt',
    'cli', 'pcp', 'tmp', 'wnd', 'prt', 'sim'
];

/**
 * Maximum number of fields to display in hover preview
 */
export const MAX_HOVER_FIELDS = 5;

/**
 * Parse a whitespace-delimited line into tokens with their positions
 * @param line The text line to parse
 * @returns Array of tokens with start and end positions
 */
export function parseLineTokens(line: string): Array<{ value: string, start: number, end: number }> {
    const tokens: Array<{ value: string, start: number, end: number }> = [];
    let currentToken = '';
    let tokenStart = -1;
    let inWhitespace = true;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const isWhitespace = /\s/.test(char);

        if (isWhitespace) {
            if (!inWhitespace && currentToken.length > 0) {
                // End of token
                tokens.push({
                    value: currentToken,
                    start: tokenStart,
                    end: i
                });
                currentToken = '';
                tokenStart = -1;
            }
            inWhitespace = true;
        } else {
            if (inWhitespace) {
                // Start of new token
                tokenStart = i;
            }
            currentToken += char;
            inWhitespace = false;
        }
    }

    // Handle last token if line doesn't end with whitespace
    if (currentToken.length > 0 && tokenStart >= 0) {
        tokens.push({
            value: currentToken,
            start: tokenStart,
            end: line.length
        });
    }

    return tokens;
}

/**
 * Find the token at a specific character position
 * @param tokens Array of tokens with positions
 * @param position Character position in the line
 * @returns Token and its index, or undefined if not found
 */
export function findTokenAtPosition(
    tokens: Array<{ value: string, start: number, end: number }>,
    position: number
): { token: { value: string, start: number, end: number }, index: number } | undefined {
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (position >= token.start && position < token.end) {
            return { token, index: i };
        }
    }
    return undefined;
}

/**
 * Find the header line in a SWAT+ file
 * @param lines All lines from the file
 * @param maxLinesToCheck Maximum number of lines to check from the start
 * @returns Index of the header line, or -1 if not found
 */
export function findHeaderLine(lines: string[], maxLinesToCheck: number = 5): number {
    for (let i = 0; i < Math.min(maxLinesToCheck, lines.length); i++) {
        const trimmed = lines[i].trim();
        // Skip empty lines and comment lines (starting with #)
        if (trimmed.length > 0 && !trimmed.startsWith('#')) {
            return i;
        }
    }
    return -1;
}
