// Where the dataset comes from: a path typed or browsed, the folder an Explorer
// menu started from, or the dataset SWAT+ Dataset Selector has selected. No
// vscode import.

import { resolveTxtInOut } from './dataset';

/** SWAT+ Dataset Selector, which registers the command below. */
export const SELECTOR_EXTENSION_ID = 'PbsandtDev.swat-dataset-selector';
export const SELECTOR_COMMAND = 'swat-dataset-selector.getDatasetFolder';

/**
 * Whether to offer "Use Dataset Selector's dataset": when the command is
 * registered, or the extension is installed (its command appears once it has
 * activated, which asking for it does).
 */
export function selectorAvailable(state: { extensionInstalled: boolean; commandRegistered: boolean }): boolean {
    return state.extensionInstalled || state.commandRegistered;
}

export type SelectorAnswer = { path: string } | { message: string };

/** What came back from the command: a folder path, or nothing because no dataset is selected. */
export function interpretSelectorAnswer(answer: unknown): SelectorAnswer {
    if (typeof answer === 'string' && answer.trim()) {
        return { path: answer.trim() };
    }
    return { message: 'SWAT+ Dataset Selector has no dataset selected. Select one in its sidebar first.' };
}

/** The message for a command that could not be run (not installed, failed to activate). */
export function describeSelectorFailure(error: unknown): string {
    const detail = error instanceof Error ? error.message : String(error);
    return `Could not ask SWAT+ Dataset Selector for its dataset: ${detail}`;
}

/**
 * A path as the user typed or pasted it: trimmed, without the quotes Explorer's
 * "copy as path" adds. On Windows a lower-case drive letter (which is what
 * `Uri.fsPath` gives for a folder from the Explorer) is written as `C:`.
 */
export function normalizeDatasetInput(text: string, platform: NodeJS.Platform = process.platform): string {
    const trimmed = text.trim();
    const quoted = /^"(.*)"$/.exec(trimmed);
    const path = (quoted ? quoted[1] : trimmed).trim();
    return platform === 'win32' ? path.replace(/^[a-z]:/, drive => drive.toUpperCase()) : path;
}

export interface FileChecks {
    isDirectory(p: string): boolean;
    isFile(p: string): boolean;
}

export type DatasetCheck =
    | { ok: true; picked: string; txtInOut: string }
    | { ok: false; error: string };

/**
 * Whether `input` names a SWAT+ dataset: a folder with file.cio, or one whose
 * TxtInOut subfolder has it. The script still decides what it resolves to; this
 * lets the panel say what is wrong before it starts one.
 */
export function checkDatasetFolder(input: string, fs: FileChecks, platform: NodeJS.Platform = process.platform): DatasetCheck {
    const picked = normalizeDatasetInput(input, platform);
    if (!picked) {
        return { ok: false, error: 'Choose the dataset folder (the one with file.cio).' };
    }
    if (!fs.isDirectory(picked)) {
        return { ok: false, error: `Folder not found: ${picked}` };
    }
    const txtInOut = resolveTxtInOut(picked, fs.isFile, platform);
    if (!txtInOut) {
        return { ok: false, error: `No file.cio in ${picked} or in its TxtInOut subfolder.` };
    }
    return { ok: true, picked, txtInOut };
}
