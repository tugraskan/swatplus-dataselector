// The logic behind the sidebar panel: what is in each box, what the script said,
// which buttons are live. The panel webview only draws the state this produces
// and sends back what the user did. Everything the controller touches outside
// itself (files, dialogs, the script, Dataset Selector) comes in through
// `PanelEnv`, so the tests drive it with fakes. No vscode import.

import * as path from 'path';
import { describeSubsetDetection, detectSubsetFolder } from './dataset';
import { checkDatasetFolder, describeSelectorFailure, interpretSelectorAnswer } from './datasetSource';
import { expandHruIds, formatHruIds } from './ids';
import { DEFAULT_OPTIONS, sanitizeOptions, SubsetOptions } from './options';
import { checkIds, checkOutputFolder, planKey, previewWaitingReason, readiness } from './panelState';
import { defaultOutputPath, outputPathInside } from './paths';
import type { PanelMessage, PanelViewState, PreviewState, RunState } from './protocol';
import { createSubset, deletePartialOutput, inspectHruRange, planSubset, RunnerContext, ScriptError } from './runner';
import { describePlan, describeResult, formatRangeLine, formatSummaryLines, HruRange } from './summary';

export interface PanelEnv {
    isDirectory(p: string): boolean;
    isFile(p: string): boolean;
    exists(p: string): boolean;
    realpath(p: string): string | undefined;
    now(): Date;
    platform?: NodeJS.Platform;
    /**
     * The script and the one interpreter to run it with, found on first use. Rejects with an Error whose
     * message says what was tried when there is no usable Python.
     */
    getRunner(signal?: AbortSignal): Promise<RunnerContext>;
    pythonStatus(): Promise<{ ok: boolean; text: string }>;
    selector: {
        isAvailable(): Promise<boolean>;
        /** The folder SWAT+ Dataset Selector has selected; rejects when it cannot be asked. */
        getDataset(): Promise<unknown>;
    };
    pickFolder(options: { title: string; openLabel: string; defaultPath?: string }): Promise<string | undefined>;
    confirmDelete(folder: string): Promise<boolean>;
    openFolder(folder: string): Promise<void>;
    reveal(folder: string): Promise<void>;
    openPicker(args: { datasetPath: string; initialIds: string }): void;
    showLog(): void;
    /** Appends text as it is (the script's stderr arrives in chunks); lines end with a newline. */
    log(text: string): void;
    clearLog(): void;
    store: { get<T>(key: string): T | undefined; set(key: string, value: unknown): void };
    /** Runs `fn` after `ms`; returns a function that cancels it. */
    schedule(fn: () => void, ms: number): () => void;
    post(state: PanelViewState): void;
    tool: { name: string; version: string };
}

interface DatasetInfo {
    /** What the user picked; passed to the script as --dataset. */
    picked: string;
    /** picked and the TxtInOut folder the script resolved, without duplicates. */
    folders: string[];
    range: HruRange;
}

interface StoredState {
    dataset?: string;
    ids?: string;
    options?: unknown;
}

const STORE_KEY = 'panel';
const PREVIEW_DELAY_MS = 600;

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function unique(items: string[]): string[] {
    return Array.from(new Set(items));
}

export class PanelController {
    private revision = 0;
    private initialised = false;

    private datasetInput = '';
    private datasetInputRevision = 0;
    private datasetSeq = 0;
    private loading = false;
    private datasetError?: string;
    private datasetWarning?: string;
    private datasetNote?: string;
    private dataset?: DatasetInfo;

    private idsText = '';
    private idsRevision = 0;
    private options: SubsetOptions = { ...DEFAULT_OPTIONS };

    private outputText = '';
    private outputRevision = 0;
    private outputEdited = false;

    private preview: PreviewState = { kind: 'off' };
    private previewKey?: string;
    private previewAbort?: AbortController;
    private cancelPreviewTimer?: () => void;

    private run: RunState = { kind: 'idle' };
    private runAbort?: AbortController;
    private lastOutput?: { folder: string; datasetFolders: string[] };

    private selectorAvailable = false;
    private python: { ok: boolean; text: string } = { ok: true, text: '' };

    constructor(private readonly env: PanelEnv) {}

    // ---- entry points ------------------------------------------------------------

    /** Reads the stored options and checks what is available, once. `restore` also reopens the last dataset. */
    private async init(restore: boolean): Promise<void> {
        if (this.initialised) {
            return;
        }
        this.initialised = true;
        const stored = this.env.store.get<StoredState>(STORE_KEY);
        this.options = sanitizeOptions(stored?.options);
        this.emit();

        this.env.selector.isAvailable().then(available => {
            this.selectorAvailable = available;
            this.emit();
        }, () => undefined);
        this.env.pythonStatus().then(status => {
            this.python = status;
            this.emit();
        }, () => undefined);

        if (restore && stored?.dataset && this.env.isDirectory(stored.dataset)) {
            await this.setDataset(stored.dataset);
            if (stored.ids && this.dataset && this.idsText === '') {
                this.setIds(stored.ids, true);
            }
        }
    }

    /** The panel is on screen: restore the last session (once) and send the state. */
    async start(): Promise<void> {
        await this.init(true);
        this.emit();
    }

    /** Called when the Python setting changes: look for an interpreter again. */
    async refreshPython(): Promise<void> {
        this.python = await this.env.pythonStatus();
        this.emit();
    }

    /** Called by the commands: open the panel on this folder. */
    async openDataset(folder: string): Promise<void> {
        await this.init(false);
        if (!this.busy) {
            await this.setDataset(folder);
        }
    }

    /** The picker's "Use selection": the text goes into the IDs box. */
    applyPickedIds(text: string): void {
        if (!this.busy) {
            this.setIds(text, true);
        }
    }

    /** What the picker starts with, and whether it can be opened at all. */
    pickerArgs(): { datasetPath: string; initialIds: string } | undefined {
        return this.dataset ? { datasetPath: this.dataset.picked, initialIds: this.idsText } : undefined;
    }

    private get busy(): boolean {
        return this.run.kind === 'running';
    }

    async handle(message: PanelMessage): Promise<void> {
        // While the script runs the boxes are locked; only Cancel and the log work.
        if (this.busy && message.type !== 'cancel' && message.type !== 'showLog' && message.type !== 'ready' && message.type !== 'rendered') {
            return;
        }
        switch (message.type) {
            case 'ready':
                await this.start();
                return;
            case 'browseDataset': {
                const picked = await this.env.pickFolder({
                    title: 'SWAT+ HRU Subset: select the SWAT+ dataset folder (the one with file.cio)',
                    openLabel: 'Use as Dataset',
                    defaultPath: this.dataset?.picked
                });
                if (picked) {
                    await this.setDataset(picked);
                }
                return;
            }
            case 'useSelectorDataset':
                await this.useSelectorDataset();
                return;
            case 'datasetInput':
                if (message.text.trim() !== this.datasetInput.trim()) {
                    await this.setDataset(message.text);
                }
                return;
            case 'ids':
                this.setIds(message.text, false);
                return;
            case 'options':
                this.setOptions(sanitizeOptions(message.options));
                return;
            case 'outputInput':
                this.outputText = message.text;
                this.outputEdited = true;
                this.persist();
                this.emit();
                return;
            case 'browseOutput':
                await this.browseOutput();
                return;
            case 'pickHrus': {
                const args = this.pickerArgs();
                if (args && this.python.ok) {
                    this.env.openPicker(args);
                }
                return;
            }
            case 'preview':
                this.cancelPreviewTimer?.();
                await this.runPreview(true);
                return;
            case 'create':
                await this.create();
                return;
            case 'cancel':
                this.runAbort?.abort();
                return;
            case 'openFolder':
                if (this.run.kind === 'done') {
                    await this.env.openFolder(this.run.view.outputDir);
                }
                return;
            case 'reveal':
                if (this.run.kind === 'done') {
                    await this.env.reveal(this.run.view.outputDir);
                }
                return;
            case 'deletePartial':
                await this.deletePartial();
                return;
            case 'showLog':
                this.env.showLog();
                return;
            case 'rendered':
                return;
            case 'dismissResult':
                if (this.run.kind !== 'running') {
                    this.run = { kind: 'idle' };
                    this.emit();
                }
                return;
        }
    }

    // ---- state ---------------------------------------------------------------------

    view(): PanelViewState {
        return { revision: ++this.revision, ...this.compute() };
    }

    private compute(): Omit<PanelViewState, 'revision'> {
        const range = this.dataset ? { min: this.dataset.range.min_hru, max: this.dataset.range.max_hru } : undefined;
        const idsCheck = checkIds(this.idsText, range);
        const outputCheck = this.checkOutput();
        const busy = this.busy;
        const ready = readiness({
            datasetReady: this.dataset !== undefined,
            pythonOk: this.python.ok,
            idsValid: idsCheck.valid,
            outputOk: !outputCheck.error,
            options: this.options,
            busy
        });
        return {
            toolVersion: this.env.tool.version,
            python: this.python,
            dataset: {
                input: this.datasetInput,
                inputRevision: this.datasetInputRevision,
                loading: this.loading,
                error: this.datasetError,
                warning: this.datasetWarning,
                note: this.datasetNote,
                resolvedFolder: this.dataset && this.dataset.folders.length > 1 ? this.dataset.folders[1] : undefined,
                rangeLine: this.dataset ? formatRangeLine(this.dataset.range) : undefined
            },
            selectorAvailable: this.selectorAvailable,
            ids: { text: this.idsText, revision: this.idsRevision, error: idsCheck.error },
            options: { ...this.options },
            output: { text: this.outputText, revision: this.outputRevision, error: outputCheck.error, note: outputCheck.note },
            preview: this.previewState(idsCheck.valid, ready.canPreview),
            run: this.run,
            canPick: ready.canPick,
            canPreview: ready.canPreview,
            canCreate: ready.canCreate,
            busy
        };
    }

    private previewState(idsValid: boolean, canPreview: boolean): PreviewState {
        if (!this.options.keepRouting) {
            return { kind: 'off' };
        }
        if (this.preview.kind === 'off') {
            // Everything is in place and the debounce timer is running, or something is missing.
            return {
                kind: 'waiting',
                reason: canPreview
                    ? 'Updating the preview…'
                    : previewWaitingReason({ datasetReady: this.dataset !== undefined, idsText: this.idsText, idsValid })
            };
        }
        return this.preview;
    }

    private logLine(text: string): void {
        this.env.log(`${text}
`);
    }

    private emit(): void {
        this.env.post(this.view());
    }

    private persist(): void {
        const state: StoredState = { dataset: this.dataset?.picked, ids: this.idsText, options: this.options };
        this.env.store.set(STORE_KEY, state);
    }

    private checkOutput() {
        return checkOutputFolder(this.outputText, this.dataset?.folders ?? [], {
            exists: this.env.exists,
            realpath: this.env.realpath,
            platform: this.env.platform
        });
    }

    // ---- dataset -------------------------------------------------------------------

    private async useSelectorDataset(): Promise<void> {
        let answer;
        try {
            answer = interpretSelectorAnswer(await this.env.selector.getDataset());
        } catch (error) {
            answer = { message: describeSelectorFailure(error) };
        }
        if ('path' in answer) {
            await this.setDataset(answer.path);
        } else {
            this.datasetNote = answer.message;
            this.emit();
        }
    }

    private async setDataset(input: string): Promise<void> {
        const seq = ++this.datasetSeq;
        this.cancelPreview();
        this.datasetInput = input;
        this.datasetInputRevision++;
        this.dataset = undefined;
        this.datasetError = undefined;
        this.datasetWarning = undefined;
        this.datasetNote = undefined;
        this.run = { kind: 'idle' };
        this.preview = { kind: 'off' };
        this.previewKey = undefined;
        this.loading = true;
        this.emit();

        const check = checkDatasetFolder(input, this.env, this.env.platform);
        if (!check.ok) {
            this.loading = false;
            this.datasetError = check.error;
            this.emit();
            return;
        }
        this.datasetInput = check.picked;
        this.datasetInputRevision++;

        const detection = detectSubsetFolder(unique([check.picked, check.txtInOut]), this.env.exists);
        let range: HruRange;
        try {
            const context = await this.env.getRunner();
            range = await inspectHruRange(context, check.picked);
        } catch (error) {
            if (seq !== this.datasetSeq) {
                return;
            }
            this.loading = false;
            this.datasetError = errorMessage(error);
            this.logLine(`${check.picked}: ${this.datasetError}`);
            this.emit();
            return;
        }
        if (seq !== this.datasetSeq) {
            return;
        }

        this.dataset = { picked: check.picked, folders: unique([check.picked, range.source_dir]), range };
        this.datasetWarning = detection ? describeSubsetDetection(detection) : undefined;
        this.loading = false;
        if (!this.outputEdited) {
            this.useDefaultOutput();
        }
        this.persist();
        this.emit();
        this.schedulePreview();
    }

    private useDefaultOutput(): void {
        if (!this.dataset) {
            return;
        }
        this.outputText = defaultOutputPath(this.dataset.picked, this.env.now(), this.env.platform);
        this.outputRevision++;
    }

    private async browseOutput(): Promise<void> {
        if (!this.dataset) {
            return;
        }
        const api = (this.env.platform ?? process.platform) === 'win32' ? path.win32 : path.posix;
        const parent = await this.env.pickFolder({
            title: 'SWAT+ HRU Subset: folder to create the subset in',
            openLabel: 'Create Subset Here',
            defaultPath: api.dirname(api.resolve(this.dataset.picked))
        });
        if (!parent) {
            return;
        }
        this.outputText = outputPathInside(parent, this.dataset.picked, this.env.now(), this.env.platform);
        this.outputRevision++;
        this.outputEdited = true;
        this.persist();
        this.emit();
    }

    // ---- ids and options -----------------------------------------------------------

    private setIds(text: string, fromHost: boolean): void {
        this.idsText = text;
        if (fromHost) {
            this.idsRevision++;
        }
        this.persist();
        this.afterPlanInputsChanged();
    }

    private setOptions(options: SubsetOptions): void {
        this.options = options;
        this.persist();
        this.afterPlanInputsChanged();
    }

    private afterPlanInputsChanged(): void {
        this.cancelPreview();
        this.preview = { kind: 'off' };
        this.previewKey = undefined;
        this.emit();
        this.schedulePreview();
    }

    // ---- preview -------------------------------------------------------------------

    private cancelPreview(): void {
        this.cancelPreviewTimer?.();
        this.cancelPreviewTimer = undefined;
        this.previewAbort?.abort();
        this.previewAbort = undefined;
    }

    private schedulePreview(): void {
        this.cancelPreviewTimer?.();
        this.cancelPreviewTimer = undefined;
        if (!this.compute().canPreview) {
            return;
        }
        this.cancelPreviewTimer = this.env.schedule(() => {
            this.cancelPreviewTimer = undefined;
            void this.runPreview(false);
        }, PREVIEW_DELAY_MS);
    }

    private async runPreview(force: boolean): Promise<void> {
        if (!this.compute().canPreview || !this.dataset) {
            return;
        }
        const hruIds = formatHruIds(expandHruIds(this.idsText));
        const key = planKey(this.dataset.picked, hruIds, this.options);
        if (!force && this.previewKey === key && this.preview.kind === 'ready') {
            return;
        }

        this.previewAbort?.abort();
        const abort = new AbortController();
        this.previewAbort = abort;
        this.previewKey = key;
        this.preview = { kind: 'loading' };
        this.emit();
        try {
            const context = await this.env.getRunner(abort.signal);
            const plan = await planSubset(context, { datasetPath: this.dataset.picked, hruIds, options: this.options });
            if (abort.signal.aborted) {
                return;
            }
            this.preview = { kind: 'ready', view: describePlan(plan) };
        } catch (error) {
            if (abort.signal.aborted || (error instanceof ScriptError && error.cancelled)) {
                return;
            }
            this.preview = { kind: 'error', message: errorMessage(error) };
        }
        this.emit();
    }

    // ---- create --------------------------------------------------------------------

    private async create(): Promise<void> {
        if (!this.compute().canCreate || !this.dataset) {
            return;
        }
        const output = this.checkOutput();
        if (output.error || !output.folder) {
            this.emit();
            return;
        }
        const dataset = this.dataset;
        const folder = output.folder;
        if (folder !== this.outputText.trim()) {
            this.outputText = folder;
            this.outputRevision++;
        }
        const hruIds = formatHruIds(expandHruIds(this.idsText));

        this.cancelPreview();
        this.run = { kind: 'running' };
        const abort = new AbortController();
        this.runAbort = abort;
        this.env.clearLog();
        this.logLine(`Dataset: ${dataset.picked}`);
        this.logLine(`HRU IDs: ${hruIds}`);
        this.logLine(`Options: ${JSON.stringify(this.options)}`);
        this.logLine(`Output: ${folder}`);
        this.emit();

        try {
            const context = { ...(await this.env.getRunner(abort.signal)), onLog: (text: string) => this.env.log(text) };
            const run = await createSubset(
                context,
                { datasetPath: dataset.picked, hruIds, outputDir: folder, options: this.options },
                this.env.tool
            );
            for (const line of formatSummaryLines(run.result)) {
                this.logLine(line);
            }
            const note = run.resultFileError
                ? `Could not write ${run.resultFile}: ${run.resultFileError}`
                : `Result file: ${run.resultFile}`;
            this.logLine(note);
            this.lastOutput = { folder: run.result.output_dir, datasetFolders: dataset.folders };
            this.run = { kind: 'done', view: describeResult(run.result), note };
            if (!this.outputEdited) {
                this.useDefaultOutput();
            }
        } catch (error) {
            const cancelled = error instanceof ScriptError && error.cancelled;
            const message = cancelled ? 'The run was cancelled.' : errorMessage(error);
            this.logLine(message);
            const partial = this.env.exists(folder) ? folder : undefined;
            this.lastOutput = partial ? { folder: partial, datasetFolders: dataset.folders } : undefined;
            this.run = { kind: 'failed', message, cancelled, partialOutput: partial };
        } finally {
            this.runAbort = undefined;
        }
        this.emit();
    }

    private async deletePartial(): Promise<void> {
        if (this.run.kind !== 'failed' || !this.run.partialOutput || !this.lastOutput) {
            return;
        }
        const { folder, datasetFolders } = this.lastOutput;
        if (!(await this.env.confirmDelete(folder))) {
            return;
        }
        try {
            // Only a folder this run created gets here: create() chose a path that did not exist.
            const removed = deletePartialOutput(folder, false, datasetFolders);
            this.logLine(removed ? `Deleted ${folder}` : `${folder} was already gone.`);
            this.run = { ...this.run, partialOutput: undefined, info: removed ? `Deleted ${folder}.` : `${folder} was already gone.` };
        } catch (error) {
            this.run = { ...this.run, info: errorMessage(error) };
        }
        this.lastOutput = undefined;
        this.emit();
    }
}
