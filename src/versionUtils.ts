/**
 * SWAT+ version comparison helpers (vscode-free).
 *
 * The enriched documentation is generated against a specific SWAT+ source release
 * (e.g. 62.0.0). A dataset's `file.cio` header may report a different SWAT+
 * revision, in which case some column meanings/defaults may not match. These
 * helpers compare the two conservatively so callers can warn only on a real,
 * confident mismatch.
 */

export type VersionDrift = 'match' | 'minor-drift' | 'major-drift' | 'unknown';

export interface ParsedVersion {
    major: number;
    minor: number;
    patch: number;
}

/**
 * Parse a dotted version string into major/minor/patch. Leading non-digits are
 * ignored (e.g. "v62.0.0", "rev.61.5"). Returns undefined when no leading numeric
 * version can be found.
 */
export function parseSwatVersion(value: string | undefined | null): ParsedVersion | undefined {
    if (!value) {
        return undefined;
    }
    const match = value.match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (!match) {
        return undefined;
    }
    return {
        major: Number(match[1]),
        minor: match[2] !== undefined ? Number(match[2]) : 0,
        patch: match[3] !== undefined ? Number(match[3]) : 0,
    };
}

/**
 * Compare a dataset's SWAT+ version to the documentation's version.
 *
 * - `unknown` — either version is missing/unparseable (no warning warranted).
 * - `major-drift` — different major version (docs likely don't match).
 * - `minor-drift` — same major, different minor (docs mostly apply).
 * - `match` — same major.minor.
 *
 * Patch differences are treated as a match: they rarely change file layouts or
 * column semantics, so flagging them would be noise.
 */
export function compareSwatVersions(
    datasetVersion: string | undefined | null,
    docsVersion: string | undefined | null,
): VersionDrift {
    const a = parseSwatVersion(datasetVersion);
    const b = parseSwatVersion(docsVersion);
    if (!a || !b) {
        return 'unknown';
    }
    if (a.major !== b.major) {
        return 'major-drift';
    }
    if (a.minor !== b.minor) {
        return 'minor-drift';
    }
    return 'match';
}
