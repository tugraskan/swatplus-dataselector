// What the panel can and cannot do with the values in its boxes. Pure
// functions over plain values; no vscode import.

import * as path from 'path';
import { validateHruIdText } from './ids';
import type { SubsetOptions } from './options';
import { canonicalPath, checkOutputLocation, uniqueOutputPath } from './paths';

function pathApi(platform: NodeJS.Platform): typeof path.posix {
    return platform === 'win32' ? path.win32 : path.posix;
}

export interface IdsCheck {
    /** Shown under the box; undefined when the text is fine or nothing was typed yet. */
    error?: string;
    /** The text can be passed to the script. */
    valid: boolean;
}

/**
 * HRU IDs against the dataset's range. Nothing typed is not an error to show
 * (the panel opens empty) but is not valid either.
 */
export function checkIds(text: string, range: { min: number; max: number } | undefined): IdsCheck {
    if (!text.trim()) {
        return { valid: false };
    }
    const error = validateHruIdText(text, range?.min, range?.max);
    return error ? { error, valid: false } : { valid: true };
}

export interface OutputCheck {
    error?: string;
    note?: string;
    /** The folder to create: the typed one, or the first free numbered sibling of it. */
    folder?: string;
}

export interface OutputEnv {
    exists(p: string): boolean;
    realpath(p: string): string | undefined;
    platform?: NodeJS.Platform;
}

/**
 * Whether the subset may be created at `text`. It must be an absolute path, not
 * the dataset or inside it (links resolved), not a folder that contains the
 * dataset. A folder that already exists is not refused: the run uses the first
 * free `_2`, `_3`, ... beside it, so the script never overwrites and never picks
 * a name of its own.
 */
export function checkOutputFolder(text: string, datasetFolders: readonly string[], env: OutputEnv): OutputCheck {
    const platform = env.platform ?? process.platform;
    const api = pathApi(platform);
    const typed = text.trim();
    if (!typed) {
        return { error: 'Choose where to create the subset.' };
    }
    if (!api.isAbsolute(typed)) {
        return { error: 'Use a full path, for example next to the dataset folder.' };
    }

    const folder = uniqueOutputPath(api.resolve(typed), env.exists);
    if (datasetFolders.length > 0) {
        const refusal = checkOutputLocation(folder, datasetFolders, platform)
            ?? checkOutputLocation(
                canonicalPath(folder, env.realpath, platform),
                datasetFolders.map(item => canonicalPath(item, env.realpath, platform)),
                platform
            );
        if (refusal) {
            return { error: refusal };
        }
    }
    const note = folder !== api.resolve(typed)
        ? `${api.basename(typed)} already exists; the subset will be created as ${api.basename(folder)}.`
        : undefined;
    return { folder, note };
}

export interface Readiness {
    canPick: boolean;
    canPreview: boolean;
    canCreate: boolean;
}

/** Which buttons are live, from the checks above. */
export function readiness(input: {
    datasetReady: boolean;
    pythonOk: boolean;
    idsValid: boolean;
    outputOk: boolean;
    options: SubsetOptions;
    busy: boolean;
}): Readiness {
    const ready = input.datasetReady && input.pythonOk && !input.busy;
    return {
        canPick: ready,
        canPreview: ready && input.idsValid && input.options.keepRouting,
        canCreate: ready && input.idsValid && input.outputOk
    };
}

/** Why Preview has nothing to show yet, for the hint in the preview area. */
export function previewWaitingReason(input: { datasetReady: boolean; idsText: string; idsValid: boolean }): string {
    if (!input.datasetReady) {
        return 'Choose a dataset to preview what will be kept.';
    }
    if (!input.idsText.trim()) {
        return 'Enter HRU IDs to preview what will be kept.';
    }
    if (!input.idsValid) {
        return 'Fix the HRU IDs to preview what will be kept.';
    }
    return 'Updating the preview…';
}

/**
 * Two requests with the same key give the same plan, so a finished preview is
 * kept instead of asked for again. The output folder is not part of it.
 */
export function planKey(datasetPath: string, hruIds: string, options: SubsetOptions): string {
    return JSON.stringify([datasetPath, hruIds, options.keepRouting, options.feederHrus, options.alignWetlands, options.mainCompat, options.noOutputs]);
}
