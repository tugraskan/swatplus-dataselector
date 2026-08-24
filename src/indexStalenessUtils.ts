/**
 * Pure helpers for index staleness tracking.
 *
 * The dataset file watcher fires for every write under the TxtInOut folder, which
 * during a SWAT+ run means hundreds of output files. These helpers decide which of
 * those writes actually invalidate the inputs index, and how to describe the result
 * in the sidebar banner. They are kept free of the `vscode` API so they can be unit
 * tested without an extension host.
 */

/** Maximum number of changed file names retained for display. */
export const MAX_TRACKED_STALE_FILES = 50;

/** Files written by the extension itself, which must never mark the index stale. */
const SELF_WRITTEN_FILES = new Set(['index.json']);

export interface StaleDecisionContext {
    /** Whether an index currently exists — nothing is stale before a first build. */
    indexBuilt: boolean;
    /** Resolves a file path to an indexed table name, or undefined when not indexed. */
    isIndexedFile: (filePath: string) => boolean;
    /** True for generated output files that must not invalidate the inputs index. */
    isOutputFile?: (filePath: string) => boolean;
}

/** Extract the lowercase base name of a path using either separator. */
export function baseName(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/');
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

/** True when a file write is the extension persisting its own index cache. */
export function isSelfWrittenFile(filePath: string): boolean {
    return SELF_WRITTEN_FILES.has(baseName(filePath).toLowerCase());
}

/**
 * Decide whether a changed file should mark the inputs index stale.
 *
 * Only files that are part of the built index count: output files (`*.txt`, `*.csv`
 * produced by a run) and the extension's own `index.json` are ignored, so a finished
 * simulation does not leave the banner permanently lit.
 */
export function shouldMarkStale(changedFile: string, context: StaleDecisionContext): boolean {
    if (!context.indexBuilt) {
        return false;
    }
    if (isSelfWrittenFile(changedFile)) {
        return false;
    }
    if (context.isOutputFile?.(changedFile)) {
        return false;
    }
    return context.isIndexedFile(changedFile);
}

/** True when an indexed file was deleted or modified after a cache was created. */
export function isFileChangedSince(cacheCreatedAt: string, modifiedAtMs: number | undefined): boolean {
    const cacheTime = Date.parse(cacheCreatedAt);
    if (Number.isNaN(cacheTime) || modifiedAtMs === undefined) {
        return true;
    }
    return modifiedAtMs > cacheTime;
}

/**
 * Coarse "how long ago" label for the index build time, shown in the health strip.
 * Deliberately low precision: the useful question is "is this minutes or days old",
 * not the exact second.
 */
export function formatRelativeAge(builtAtIso: string | undefined, now: Date = new Date()): string {
    if (!builtAtIso) {
        return 'unknown';
    }
    const builtAt = new Date(builtAtIso);
    const elapsedMs = now.getTime() - builtAt.getTime();
    if (Number.isNaN(elapsedMs)) {
        return 'unknown';
    }
    // Clock skew or a future timestamp reads as fresh rather than negative.
    if (elapsedMs < 60_000) {
        return 'just now';
    }

    const minutes = Math.floor(elapsedMs / 60_000);
    if (minutes < 60) {
        return `${minutes}m ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours}h ago`;
    }
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

/**
 * Human-readable summary of which files went stale, for the sidebar banner.
 * Long lists are truncated so the banner stays a single readable line.
 */
export function formatStaleSummary(files: string[]): string {
    if (files.length === 0) {
        return 'Input files changed on disk.';
    }
    if (files.length <= 3) {
        return `Changed: ${files.join(', ')}.`;
    }
    return `Changed: ${files.slice(0, 3).join(', ')} and ${files.length - 3} more.`;
}
