// HRU id text such as "1,4-6,10": parsing and validation. No vscode import, so
// unit tests can load it.

export interface IdRange {
    start: number;
    end: number;
}

export type ParsedIds =
    | { ok: true; ranges: IdRange[] }
    | { ok: false; error: string };

const DIGITS = /^\d+$/;

/**
 * Splits "1,4-6,10" into ranges without expanding them, so a typo such as
 * 1-99999999999 is rejected by the bounds check before anything is allocated.
 * The format matches `parse_filter_ids` in hru_processor.py, except that empty
 * entries ("1,,2") are an error here instead of being skipped.
 */
export function parseHruIdRanges(text: string): ParsedIds {
    if (!text.trim()) {
        return { ok: false, error: 'Enter at least one HRU ID.' };
    }

    const ranges: IdRange[] = [];
    for (const part of text.split(',')) {
        const entry = part.trim();
        if (!entry) {
            return { ok: false, error: 'Remove empty comma-separated entries.' };
        }

        const pieces = entry.split('-').map(piece => piece.trim());
        if (pieces.length > 2 || pieces.some(piece => !DIGITS.test(piece))) {
            return {
                ok: false,
                error: pieces.length === 1 ? `Invalid HRU ID: ${entry}` : `Invalid range: ${entry}`
            };
        }

        const start = Number(pieces[0]);
        const end = Number(pieces[pieces.length - 1]);
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
            return { ok: false, error: `Number too large: ${entry}` };
        }
        if (start <= 0 || end <= 0) {
            return { ok: false, error: `HRU IDs must be positive integers: ${entry}` };
        }
        if (start > end) {
            return { ok: false, error: `Range start must be <= end: ${entry}` };
        }
        ranges.push({ start, end });
    }
    return { ok: true, ranges };
}

/**
 * Why `text` cannot be used, or undefined when it can. With `min`/`max` (from
 * `--hru-range`) every id must lie inside them. That is only a bounds check:
 * the numbers between min and max need not all exist, and hru_processor.py
 * reports the ones that do not.
 */
export function validateHruIdText(text: string, min?: number, max?: number): string | undefined {
    const parsed = parseHruIdRanges(text);
    if (!parsed.ok) {
        return parsed.error;
    }
    if (min === undefined || max === undefined) {
        return undefined;
    }
    for (const range of parsed.ranges) {
        if (range.start < min || range.end > max) {
            const shown = range.start === range.end ? `${range.start}` : `${range.start}-${range.end}`;
            return `${shown} is outside the dataset's HRU range ${min}-${max}.`;
        }
    }
    return undefined;
}

/** The sorted, de-duplicated ids. Throws on text `validateHruIdText` rejects. */
export function expandHruIds(text: string): number[] {
    const parsed = parseHruIdRanges(text);
    if (!parsed.ok) {
        throw new Error(parsed.error);
    }
    const ids = new Set<number>();
    for (const range of parsed.ranges) {
        for (let id = range.start; id <= range.end; id++) {
            ids.add(id);
        }
    }
    return Array.from(ids).sort((a, b) => a - b);
}

/** Ids as the compact text hru_processor.py takes: [1,4,5,6,10] -> "1,4-6,10". */
export function formatHruIds(ids: readonly number[]): string {
    const sorted = Array.from(new Set(ids)).sort((a, b) => a - b);
    const parts: string[] = [];
    let index = 0;
    while (index < sorted.length) {
        let last = index;
        while (last + 1 < sorted.length && sorted[last + 1] === sorted[last] + 1) {
            last++;
        }
        parts.push(last > index ? `${sorted[index]}-${sorted[last]}` : `${sorted[index]}`);
        index = last + 1;
    }
    return parts.join(',');
}
