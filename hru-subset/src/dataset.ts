// Recognising the dataset folder the user picked. No vscode import.

import * as path from 'path';

/** Written into every output folder by this extension; its presence marks a subset. */
export const RESULT_FILE_NAME = 'hru_subset_result.json';

function pathApi(platform: NodeJS.Platform): typeof path.posix {
    return platform === 'win32' ? path.win32 : path.posix;
}

/**
 * The TxtInOut folder for a picked folder: itself when it holds file.cio, else
 * its TxtInOut subfolder when that does. Mirrors `resolve_txtinout_dir` in
 * hru_processor.py, which is what finally decides; this only lets the checks
 * before the first script run look at the right folder.
 */
export function resolveTxtInOut(
    picked: string,
    isFile: (p: string) => boolean,
    platform: NodeJS.Platform = process.platform
): string | undefined {
    const api = pathApi(platform);
    if (isFile(api.join(picked, 'file.cio'))) {
        return picked;
    }
    const nested = api.join(picked, 'TxtInOut');
    if (isFile(api.join(nested, 'file.cio'))) {
        return nested;
    }
    return undefined;
}

// Names of subsets made by the script itself (solo_<id>, multi_<stamp>, with the
// _<n> / _<stamp> suffix its unique-name logic can add) and by this extension.
const SUBSET_NAME_PATTERNS = [
    /^solo_\d+(_\d{8}_\d{6}(_\d+)?)?$/i,
    /^multi_\d{8}_\d{6}(_\d{8}_\d{6})?(_\d+)?$/i,
    /_subset_\d{8}_\d{6}(_\d+)?$/i
];

export function looksLikeSubsetName(folderName: string): boolean {
    return SUBSET_NAME_PATTERNS.some(pattern => pattern.test(folderName));
}

export interface SubsetDetection {
    folder: string;
    /** 'marker': holds hru_subset_result.json. 'name': named like a subset. */
    how: 'marker' | 'name';
}

/**
 * Whether the picked folder (or the TxtInOut it resolves to) is a subset this
 * tool made. The marker file is the reliable check; the name is the fallback for
 * subsets from before the marker existed, including Dataset Selector's.
 */
export function detectSubsetFolder(
    folders: readonly string[],
    exists: (p: string) => boolean,
    platform: NodeJS.Platform = process.platform
): SubsetDetection | undefined {
    const api = pathApi(platform);
    for (const folder of folders) {
        if (exists(api.join(folder, RESULT_FILE_NAME))) {
            return { folder, how: 'marker' };
        }
    }
    for (const folder of folders) {
        if (looksLikeSubsetName(api.basename(folder))) {
            return { folder, how: 'name' };
        }
    }
    return undefined;
}

export function describeSubsetDetection(detection: SubsetDetection): string {
    const why = detection.how === 'marker'
        ? `it contains ${RESULT_FILE_NAME}, which this tool writes into every subset it makes`
        : 'its name looks like a subset (solo_<id>, multi_<timestamp> or <name>_subset_<timestamp>)';
    return `"${detection.folder}" looks like an HRU subset made by this tool: ${why}. `
        + 'Its HRUs are renumbered from 1, so the IDs of the original dataset do not apply to it.';
}
