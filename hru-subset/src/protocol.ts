// The messages between the extension and its two webviews, and the state the
// panel shows. Types only (plus two small constants), so the webview bundles and
// the extension host can both import it. No vscode import.

import type { SubsetOptions } from './options';
import type { ResultView, SummaryView, HruTable } from './summary';

/** What the preview area under the HRU IDs shows (keep routing only). */
export type PreviewState =
    /** Keep routing is off: nothing to preview. */
    | { kind: 'off' }
    /** Not enough to ask the script yet; `reason` says what is missing. */
    | { kind: 'waiting'; reason: string }
    | { kind: 'loading' }
    | { kind: 'ready'; view: SummaryView }
    | { kind: 'error'; message: string };

export type RunState =
    | { kind: 'idle' }
    | { kind: 'running' }
    | { kind: 'done'; view: ResultView; note?: string }
    /** `message` is the script's own error. `partialOutput` is a folder this run left behind. */
    | { kind: 'failed'; message: string; cancelled?: boolean; partialOutput?: string; info?: string };

export interface PanelViewState {
    /** Increases with every post; the webview ignores anything older than what it has drawn. */
    revision: number;
    toolVersion: string;
    python: { ok: boolean; text: string };
    dataset: {
        /** The text of the box. The webview sets it only when `inputRevision` changed. */
        input: string;
        inputRevision: number;
        loading: boolean;
        /** Why the folder cannot be used (not a dataset, the script's error, no Python). */
        error?: string;
        /** The folder is a subset made by this tool. */
        warning?: string;
        /** Muted note: e.g. "Dataset Selector has no dataset selected." */
        note?: string;
        /** The TxtInOut folder the script resolved, when it differs from what was typed. */
        resolvedFolder?: string;
        /** "HRUs 1–4222 (4222 total)" */
        rangeLine?: string;
    };
    selectorAvailable: boolean;
    ids: { text: string; revision: number; error?: string };
    options: SubsetOptions;
    output: { text: string; revision: number; error?: string; note?: string };
    preview: PreviewState;
    run: RunState;
    canPick: boolean;
    canPreview: boolean;
    canCreate: boolean;
    busy: boolean;
}

/** Webview -> extension, from the sidebar panel. */
export type PanelMessage =
    | { type: 'ready' }
    | { type: 'browseDataset' }
    | { type: 'useSelectorDataset' }
    | { type: 'datasetInput'; text: string }
    | { type: 'ids'; text: string }
    | { type: 'options'; options: SubsetOptions }
    | { type: 'outputInput'; text: string }
    | { type: 'browseOutput' }
    | { type: 'pickHrus' }
    | { type: 'preview' }
    | { type: 'create' }
    | { type: 'cancel' }
    | { type: 'openFolder' }
    | { type: 'reveal' }
    | { type: 'deletePartial' }
    | { type: 'showLog' }
    | { type: 'dismissResult' }
    /** The webview has drawn this revision of the state. Used by the smoke test; changes nothing. */
    | { type: 'rendered'; revision: number };

/** Extension -> sidebar panel. */
export type PanelOutbound = { type: 'state'; state: PanelViewState };

/** Extension -> picker tab. */
export type PickerOutbound =
    | { type: 'loading'; datasetPath: string }
    | { type: 'table'; table: HruTable; initialIds: string; datasetPath: string }
    | { type: 'error'; message: string }
    /** The IDs box changed elsewhere; the selection follows. */
    | { type: 'selection'; ids: string };

/** Picker tab -> extension. */
export type PickerInbound =
    | { type: 'ready' }
    | { type: 'useSelection'; ids: string }
    /** Reported once the table is on screen; the extension host uses it in the smoke test. */
    | { type: 'rendered'; rows: number; shown: number };

export function isPanelMessage(value: unknown): value is PanelMessage {
    if (!value || typeof value !== 'object' || typeof (value as { type?: unknown }).type !== 'string') {
        return false;
    }
    const message = value as Record<string, unknown>;
    switch (message['type']) {
        case 'datasetInput':
        case 'ids':
        case 'outputInput':
            return typeof message['text'] === 'string';
        case 'options':
            return typeof message['options'] === 'object' && message['options'] !== null;
        case 'rendered':
            return typeof message['revision'] === 'number';
        case 'ready':
        case 'browseDataset':
        case 'useSelectorDataset':
        case 'browseOutput':
        case 'pickHrus':
        case 'preview':
        case 'create':
        case 'cancel':
        case 'openFolder':
        case 'reveal':
        case 'deletePartial':
        case 'showLog':
        case 'dismissResult':
            return true;
        default:
            return false;
    }
}

export function isPickerInbound(value: unknown): value is PickerInbound {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const message = value as Record<string, unknown>;
    switch (message['type']) {
        case 'ready':
            return true;
        case 'useSelection':
            return typeof message['ids'] === 'string';
        case 'rendered':
            return typeof message['rows'] === 'number' && typeof message['shown'] === 'number';
        default:
            return false;
    }
}
